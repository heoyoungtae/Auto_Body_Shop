// 내 차 수첩 3단계: 사진으로 상담·예약 요청, 수리 이력 확인서.
// 상담 요청은 이름·전화·차량을 다시 묻지 않고 정비소 '상담 일지'(F-01-01)에 '고객용 화면' 경로로 바로 들어간다(회신 기한은 정책값).
// 수리 이력 확인서는 출고한 우리 정비소 수리만 모아 한 장으로 만들고, 확인 번호로 누구나 진위를 볼 수 있다(발급 때 내용 그대로).
import { randomInt } from "node:crypto";
import { and, desc, eq, gte, isNull } from "drizzle-orm";
import type { Db } from "@/db/client";
import { carbookCert, carbookSold, consultation, MAIN_BRANCH_ID, repairOrder, repairStatement, vehicle } from "@/db/schema";
import { warrantyState, type Warranty } from "@/modules/cs/rules";
import { addBusinessDays } from "@/modules/customer/rules";
import { consentState as requiredConsent } from "@/modules/customer/service";
import { writeAudit } from "@/modules/platform/audit";
import { loadShopCalendar } from "@/modules/platform/calendar";
import { branchDocNo } from "@/modules/platform/docno";
import { notifyRole } from "@/modules/platform/notify";
import { loadPolicy } from "@/modules/platform/policy";
import { loadShopInfo, shopAddressLine } from "@/modules/platform/shop";
import { IMAGE_TYPES, MAX_IMAGE_BYTES, sniffImage, storeFile } from "@/modules/platform/storage";
import { seoulDate } from "@/modules/platform/time";
import { cleanMarks } from "@/modules/repair/rules";
import { CarbookError, type MySession } from "./service";

const carName = (v: { maker: string | null; model: string | null; generation: string | null }) => [v.maker, v.model, v.generation].filter(Boolean).join(" ");

async function myCarsFull(db: Db, s: MySession) {
  if (s.scope !== "full") throw new CarbookError("휴대폰 문자 인증으로 들어와야 합니다");
  const sold = new Set((await db.select({ v: carbookSold.vehicleId }).from(carbookSold).where(eq(carbookSold.customerId, s.customerId))).map((r) => r.v));
  return (await db.select().from(vehicle).where(eq(vehicle.customerId, s.customerId)).orderBy(vehicle.createdAt)).filter((v) => !sold.has(v.id));
}

// ── 사진으로 상담·예약 요청 ──
export const REQUEST_LIMIT = { perDay: 3, photos: 5 } as const;
export const INSURANCE_PICK = { self: "내 돈으로(자비)", own: "내 보험(자차)", other: "상대 보험(대물)" } as const;

export type ConsultRequestInput = {
  vehicleId: string;
  damageParts: string;
  damageZones: unknown;
  insurance: string;
  insurer: string;
  wantDate: string;
  needs: string;
  photos: Uint8Array[];
};

/** 손님이 보낸 상담 요청 → 상담 일지 한 줄(경로 '고객용 화면', 회신 기한). 상담원에게 알린다 */
export async function requestConsult(db: Db, s: MySession, input: ConsultRequestInput, now = new Date()) {
  const cars = await myCarsFull(db, s);
  const car = cars.find((c) => c.id === input.vehicleId);
  if (!car) throw new CarbookError("어느 차인지 골라 주세요");
  if (!(await requiredConsent(db, s.customerId)).required) throw new CarbookError("개인정보 동의가 없어 상담을 받을 수 없습니다. 정비소로 전화해 주세요");
  const zones = cleanMarks(input.damageZones).filter((m) => m.kind !== "O").slice(0, 40);
  const parts = input.damageParts.trim().slice(0, 500);
  if (!zones.length && parts.length < 2) throw new CarbookError("차 그림에서 다친 곳을 누르거나, 어디가 어떤지 적어 주세요");
  if (!(input.insurance in INSURANCE_PICK)) throw new CarbookError("수리비를 어떻게 하실지 골라 주세요");
  const insurer = input.insurance === "self" ? null : input.insurer.trim().slice(0, 40) || null;
  const today = seoulDate(now);
  if (input.wantDate && (!/^\d{4}-\d{2}-\d{2}$/.test(input.wantDate) || input.wantDate < today)) throw new CarbookError("원하는 날짜는 오늘 뒤로 골라 주세요");
  if (input.photos.length > REQUEST_LIMIT.photos) throw new CarbookError(`사진은 ${REQUEST_LIMIT.photos}장까지 보낼 수 있습니다`);
  const recent = await db
    .select({ id: consultation.id })
    .from(consultation)
    .where(and(eq(consultation.customerId, s.customerId), eq(consultation.channel, "online"), gte(consultation.at, new Date(now.getTime() - 864e5))));
  if (recent.length >= REQUEST_LIMIT.perDay) throw new CarbookError("오늘은 상담 요청을 더 보낼 수 없습니다. 정비소로 전화해 주세요");
  const paths: string[] = [];
  for (const b of input.photos) {
    if (!b.length) continue;
    if (b.length > MAX_IMAGE_BYTES) throw new CarbookError("사진이 너무 큽니다(6MB까지)");
    const t = sniffImage(b);
    if (!t) throw new CarbookError("사진 파일만 보낼 수 있습니다(JPG·PNG·WEBP)");
    paths.push(await storeFile("cs/app", b, IMAGE_TYPES[t]));
  }
  const policy = await loadPolicy(db, today);
  const replyDue = addBusinessDays(today, policy["consult.reply_business_days"], await loadShopCalendar(db));
  const docNo = await branchDocNo(db, "CS", now, MAIN_BRANCH_ID);
  const types = [...new Set(zones.map((z) => ({ D: "찌그러짐", S: "긁힘", R: "부식", W: "긁힘", C: "기타" })[z.kind as "D"] ?? "기타"))];
  const [row] = await db
    .insert(consultation)
    .values({
      docNo,
      branchId: MAIN_BRANCH_ID,
      at: now,
      channel: "online",
      customerId: s.customerId,
      vehicleId: car.id,
      damageTypes: types,
      damageParts: parts || null,
      damageZones: zones,
      photoCount: paths.length,
      photos: paths,
      mileage: null,
      methods: [],
      insurance: input.insurance as "self",
      insurer,
      wantDate: input.wantDate || null,
      needs: input.needs.trim().slice(0, 500) || null,
      replyDue,
      advisorId: null,
    })
    .returning({ id: consultation.id, docNo: consultation.docNo });
  await notifyRole(db, "advisor", `내 차 수첩 상담 요청: ${car.plateNo} ${parts.slice(0, 30) || "사진 상담"} — ${replyDue}까지 회신`, `carbook-consult-${row.id}`, `/consults/${row.id}`);
  await writeAudit(db, { actorId: null, action: "carbook.consult", entityType: "consultation", entityId: docNo, after: { photos: paths.length, zones: zones.length } });
  return { id: row.id, docNo, replyDue };
}

/** 내가 보낸 상담 요청(최근 10건): 정비소가 회신했는지, 예약됐는지 */
export async function myConsults(db: Db, s: MySession) {
  if (s.scope !== "full") return [];
  const rows = await db
    .select({ id: consultation.id, at: consultation.at, plateNo: vehicle.plateNo, parts: consultation.damageParts, result: consultation.result, repliedAt: consultation.repliedAt, reservedAt: consultation.reservedAt, replyDue: consultation.replyDue, photos: consultation.photoCount })
    .from(consultation)
    .leftJoin(vehicle, eq(vehicle.id, consultation.vehicleId))
    .where(and(eq(consultation.customerId, s.customerId), eq(consultation.channel, "online")))
    .orderBy(desc(consultation.at))
    .limit(10);
  return rows;
}

export async function consultCars(db: Db, s: MySession) {
  return (await myCarsFull(db, s)).map((c) => ({ id: c.id, label: `${c.plateNo} ${carName(c)}`.trim(), model: c.model, bodyType: c.bodyType, options: c.options }));
}

// ── 수리 이력 확인서 ──
/** 확인 번호: 헷갈리는 글자(0·O·1·I·L) 뺀 10자 */
const CODE_CHARS = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
export const newCertCode = () => Array.from({ length: 10 }, () => CODE_CHARS[randomInt(0, CODE_CHARS.length)]).join("");
export const fmtCertCode = (c: string) => `${c.slice(0, 5)}-${c.slice(5)}`;
export const cleanCertCode = (raw: string) => raw.toUpperCase().replace(/[^0-9A-Z]/g, "").slice(0, 10);

export type CertSnap = {
  shop: { name: string; phone: string; address: string; bizNo: string };
  car: { plateNo: string; name: string; year: number | null; registeredOn: string | null; vinTail: string | null };
  issuedOn: string;
  withAmount: boolean;
  repairs: { inOn: string; outOn: string | null; docNo: string; items: string[]; total: number | null; warranty: { kind: string; until: string; live: boolean }[] }[];
};

/** 확인서 만들기: 그 차의 출고한 수리만(정비명세서 기준). 금액은 손님이 고를 때만 넣는다 */
export async function issueCert(db: Db, s: MySession, vehicleId: string, withAmount: boolean, now = new Date()) {
  const cars = await myCarsFull(db, s);
  const car = cars.find((c) => c.id === vehicleId);
  if (!car) throw new CarbookError("내 차를 골라 주세요");
  const today = seoulDate(now);
  const ros = await db
    .select({ id: repairOrder.id, inAt: repairOrder.inAt, docNo: repairStatement.docNo, deliveredAt: repairStatement.deliveredAt, total: repairStatement.totalWon, snapshot: repairStatement.snapshot })
    .from(repairOrder)
    .innerJoin(repairStatement, eq(repairStatement.repairOrderId, repairOrder.id))
    .where(and(eq(repairOrder.customerId, s.customerId), eq(repairOrder.vehicleId, car.id), eq(repairOrder.status, "delivered")))
    .orderBy(desc(repairOrder.inAt));
  if (!ros.length) throw new CarbookError("이 차는 우리 정비소에서 출고한 수리가 없어 확인서를 만들 수 없습니다");
  const shop = await loadShopInfo(db);
  const snap: CertSnap = {
    shop: { name: shop.name, phone: shop.phone ?? "", address: shopAddressLine(shop), bizNo: shop.bizNo ?? "" },
    car: { plateNo: car.plateNo, name: carName(car), year: car.year, registeredOn: car.registeredOn, vinTail: car.vin ? car.vin.slice(-6) : null },
    issuedOn: today,
    withAmount,
    repairs: ros.map((r) => {
      const sn = (r.snapshot ?? {}) as { lines?: { name: string }[]; warranty?: Warranty[] };
      const w = warrantyState(sn.warranty, today);
      return {
        inOn: seoulDate(r.inAt),
        outOn: r.deliveredAt ? seoulDate(r.deliveredAt) : null,
        docNo: r.docNo,
        items: [...new Set((sn.lines ?? []).map((l) => l.name.trim()).filter(Boolean))].slice(0, 30),
        total: withAmount ? r.total : null,
        warranty: w.all.map((x) => ({ kind: x.kind, until: x.until, live: x.until >= today })),
      };
    }),
  };
  let code = newCertCode();
  for (let i = 0; i < 5; i++) {
    const [dup] = await db.select({ id: carbookCert.id }).from(carbookCert).where(eq(carbookCert.code, code));
    if (!dup) break;
    code = newCertCode();
  }
  const docNo = await branchDocNo(db, "HC", now, MAIN_BRANCH_ID);
  const [row] = await db.insert(carbookCert).values({ docNo, code, customerId: s.customerId, vehicleId: car.id, withAmount, snapshot: snap, createdAt: now }).returning({ id: carbookCert.id });
  await writeAudit(db, { actorId: null, action: "carbook.cert", entityType: "vehicle", entityId: car.plateNo, after: { docNo, repairs: ros.length, withAmount } });
  return { id: row.id, docNo, code };
}

export async function myCerts(db: Db, s: MySession) {
  if (s.scope !== "full") return [];
  return db
    .select({ id: carbookCert.id, docNo: carbookCert.docNo, code: carbookCert.code, plateNo: vehicle.plateNo, createdAt: carbookCert.createdAt, revokedAt: carbookCert.revokedAt, withAmount: carbookCert.withAmount })
    .from(carbookCert)
    .innerJoin(vehicle, eq(vehicle.id, carbookCert.vehicleId))
    .where(eq(carbookCert.customerId, s.customerId))
    .orderBy(desc(carbookCert.createdAt))
    .limit(20);
}

export async function myCert(db: Db, s: MySession, id: string) {
  const [c] = await db.select().from(carbookCert).where(and(eq(carbookCert.id, id), eq(carbookCert.customerId, s.customerId)));
  if (!c || s.scope !== "full") throw new CarbookError("확인서를 찾을 수 없습니다");
  return { ...c, snap: c.snapshot as unknown as CertSnap };
}

/** 확인서 무효로 하기(잘못 만들었거나 더 쓰지 않을 때). 확인 페이지에 '무효'로 나온다 */
export async function revokeCert(db: Db, s: MySession, id: string, now = new Date()) {
  const c = await myCert(db, s, id);
  if (c.revokedAt) return;
  await db.update(carbookCert).set({ revokedAt: now }).where(eq(carbookCert.id, id));
  await writeAudit(db, { actorId: null, action: "carbook.cert_revoke", entityType: "vehicle", entityId: c.snap.car.plateNo, after: { docNo: c.docNo } });
}

/** 누구나(사는 사람·중고차 딜러): 확인 번호로 진위 보기. 차량번호는 가운데를 가린다 */
export async function verifyCert(db: Db, raw: string) {
  const code = cleanCertCode(raw);
  if (code.length !== 10) return null;
  const [c] = await db.select().from(carbookCert).where(eq(carbookCert.code, code));
  if (!c) return null;
  const snap = c.snapshot as unknown as CertSnap;
  return { docNo: c.docNo, issuedAt: c.createdAt, revokedAt: c.revokedAt, snap };
}

export const maskPlate = (p: string) => p.replace(/^(.*?\d{2,3}[가-힣])(\d{2})(\d{2})$/, "$1**$3");

/** 대표 설정 화면 숫자 */
export async function requestStats(db: Db, now = new Date()) {
  const month = new Date(now.getTime() - 30 * 864e5);
  const [c, k] = await Promise.all([
    db.select({ id: consultation.id }).from(consultation).where(and(eq(consultation.channel, "online"), gte(consultation.at, month))),
    db.select({ id: carbookCert.id }).from(carbookCert).where(and(gte(carbookCert.createdAt, month), isNull(carbookCert.revokedAt))),
  ]);
  return { consults: c.length, certs: k.length };
}
