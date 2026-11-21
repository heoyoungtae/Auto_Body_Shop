// 내 차 수첩(고객용 차계부) 1단계: 로그인(문자 인증·알림톡 링크), 내 차·진행 중 수리·수리 이력·서류 보관함·보증 신청·차 판 기록.
// 수리 기록은 정비소가 이미 넣은 전표(수리 건·진단·견적·작업 지시서·검사·정비명세서)를 그대로 보여 준다. 손님은 새로 치지 않는다.
// 사내 메모·원가·담당 기술자 이름은 내보내지 않는다.
import { randomInt } from "node:crypto";
import { and, desc, eq, gt, gte, inArray, isNull, ne, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { appConfig, carbookLink, carbookOtp, carbookSession, carbookSold, complaint, customer, estimate, inspection, repairOrder, repairStatement, roPhoto, vehicle, workOrder } from "@/db/schema";
import { maskPhone, normalizePhone, phoneHash, randomToken, sha256 } from "@/modules/auth/crypto";
import type { Role } from "@/modules/auth/roles";
import { can } from "@/modules/auth/permissions";
import { receiveComplaint } from "@/modules/cs/service";
import { warrantyState, type Warranty } from "@/modules/cs/rules";
import { PHONE_RE } from "@/modules/customer/rules";
import { appUrl, phoneForNotice } from "@/modules/customer/service";
import { formatPhone, sendSecretSms, SHOP_NAME, smsSenderInfo } from "@/modules/messaging/service";
import { MOBILE_RE } from "@/modules/messaging/rules";
import { writeAudit } from "@/modules/platform/audit";
import { UserError } from "@/modules/platform/errors";
import { notifyRole } from "@/modules/platform/notify";
import { loadShopInfo, shopAddressLine } from "@/modules/platform/shop";
import { IMAGE_TYPES, MAX_IMAGE_BYTES, sniffImage, storeFile } from "@/modules/platform/storage";
import { addDays, seoulDate } from "@/modules/platform/time";
import { carOf, isView } from "@/modules/repair/body-map";
import { partName, RO_STATUS_LABEL } from "@/modules/repair/rules";
import { listDamage } from "@/modules/repair/service";
import { roProgress } from "@/modules/repair/work";
import { ESTIMATE_KIND } from "@/modules/repair/estimate-rules";
import { makeLink } from "./link";
export { makeLink };
import { cleanCode, DEFAULT_CONFIG, isActiveRo, LINK_DAYS, MY_STATUS_LABEL, mySteps, OTP, SESSION_DAYS, visiblePhotos, type CarbookConfig, type Scope } from "./rules";

export class CarbookError extends UserError {}

type Meta = { ip?: string | null; userAgent?: string | null };
type Actor = { id: string; roles: Role[] };
/** 로그인한 손님. link 이면 roId 한 건만 본다 */
export type MySession = { customerId: string; name: string; scope: Scope; roId: string | null; phoneMasked: string | null };

const KEY = "carbook";

// ── 설정(대표) ──
export async function carbookConfig(db: Db): Promise<CarbookConfig> {
  const [r] = await db.select({ data: appConfig.data }).from(appConfig).where(eq(appConfig.key, KEY));
  return { ...DEFAULT_CONFIG, ...((r?.data as Partial<CarbookConfig>) ?? {}) };
}

export async function saveCarbookConfig(db: Db, actor: Actor, input: CarbookConfig, now = new Date()) {
  if (!actor.roles.includes("owner")) throw new CarbookError("내 차 수첩 설정은 대표만 바꿉니다");
  const data: CarbookConfig = { enabled: !!input.enabled, notice: input.notice.trim().slice(0, 300), hours: input.hours.trim().slice(0, 100) };
  await db.insert(appConfig).values({ key: KEY, data, updatedBy: actor.id, updatedAt: now }).onConflictDoUpdate({ target: appConfig.key, set: { data, updatedBy: actor.id, updatedAt: now } });
  await writeAudit(db, { actorId: actor.id, action: "carbook.config", entityType: "app_config", entityId: KEY, after: data });
}

/** 손님 화면 아래 정비소 안내(이름·전화·주소·영업시간·안내문). 사업장 정보에서 불러온다 */
export async function shopCard(db: Db) {
  const [shop, cfg, sms] = await Promise.all([loadShopInfo(db), carbookConfig(db), smsSenderInfo(db)]);
  const phone = shop.phone || sms.sender;
  return { name: shop.name || SHOP_NAME, phone: phone ? formatPhone(phone) : "", tel: phone ? phone.replace(/\D/g, "") : "", address: shopAddressLine(shop), hours: cfg.hours, notice: cfg.notice, enabled: cfg.enabled };
}

// ── 로그인: 문자 인증 ──
const codeHash = (otpId: string, code: string) => sha256(`${otpId}:${code}`);

/**
 * 인증번호 보내기. 등록되지 않은 번호여도 화면은 똑같이 '보냈습니다'(누가 우리 손님인지 알아낼 수 없게).
 * 테스트 서버(문자 '시연' 설정)에서는 실제로 보내지 않으니 demoCode 로 화면에 보여 준다.
 */
export async function requestCode(db: Db, raw: string, meta: Meta = {}, now = new Date(), f: typeof fetch = fetch): Promise<{ demoCode?: string }> {
  if (!(await carbookConfig(db)).enabled) throw new CarbookError("내 차 수첩을 잠시 쉬고 있습니다. 정비소로 전화해 주세요");
  const phone = normalizePhone(raw);
  if (!MOBILE_RE.test(phone)) throw new CarbookError("휴대폰 번호를 확인해 주세요(예: 010-1234-5678)");
  const ph = phoneHash(phone);
  const dayAgo = new Date(now.getTime() - 864e5);
  const recent = await db.select().from(carbookOtp).where(and(eq(carbookOtp.phoneHash, ph), gte(carbookOtp.createdAt, dayAgo))).orderBy(desc(carbookOtp.createdAt));
  if (recent.length >= OTP.perDay) throw new CarbookError("오늘은 인증번호를 더 보낼 수 없습니다. 내일 다시 해 주시거나 정비소로 전화해 주세요");
  const locked = recent.find((o) => o.tries >= OTP.maxTries && o.createdAt.getTime() > now.getTime() - OTP.lockMinutes * 60_000);
  if (locked) throw new CarbookError(`인증번호를 여러 번 틀려 ${OTP.lockMinutes}분 동안 잠겼습니다. 잠시 뒤 다시 해 주세요`);
  if (recent[0] && now.getTime() - recent[0].createdAt.getTime() < 30_000) throw new CarbookError("방금 보냈습니다. 30초 뒤에 다시 받을 수 있습니다");
  if (meta.ip) {
    const [n] = await db.select({ n: sql<number>`count(*)::int` }).from(carbookOtp).where(and(eq(carbookOtp.ip, meta.ip), gte(carbookOtp.createdAt, new Date(now.getTime() - 3600_000))));
    if ((n?.n ?? 0) >= OTP.perIpHour) throw new CarbookError("요청이 너무 많습니다. 한 시간 뒤에 다시 해 주세요");
  }
  const [c] = await db.select({ id: customer.id, name: customer.name, purgedAt: customer.purgedAt }).from(customer).where(eq(customer.phoneHash, ph));
  const who = c && !c.purgedAt ? c : null;
  const code = String(randomInt(0, 10 ** OTP.digits)).padStart(OTP.digits, "0");
  const [row] = await db.insert(carbookOtp).values({ phoneHash: ph, customerId: who?.id ?? null, codeHash: "-", expiresAt: new Date(now.getTime() + OTP.minutes * 60_000), ip: meta.ip ?? null, createdAt: now }).returning({ id: carbookOtp.id });
  await db.update(carbookOtp).set({ codeHash: codeHash(row.id, code) }).where(eq(carbookOtp.id, row.id));
  if (!who) return {};
  const shop = await shopCard(db);
  const text = `[${shop.name}] 내 차 수첩 인증번호 ${code} (${OTP.minutes}분 안에 넣어 주세요). 다른 사람에게 알려 주지 마세요.`;
  const r = await sendSecretSms(db, { to: phone, text, secret: code, purpose: "내 차 수첩 인증번호", customerName: who.name }, f);
  if (!r.ok && !r.demo) throw new CarbookError("문자를 보내지 못했습니다. 잠시 뒤 다시 해 주시거나 정비소로 전화해 주세요");
  return r.demo ? { demoCode: code } : {};
}

/** 인증번호 확인 → 로그인(90일). 틀리면 횟수를 올리고 5번이면 잠근다 */
export async function verifyCode(db: Db, raw: string, rawCode: string, meta: Meta = {}, now = new Date()) {
  const phone = normalizePhone(raw);
  const code = cleanCode(rawCode);
  if (!MOBILE_RE.test(phone)) throw new CarbookError("휴대폰 번호부터 다시 넣어 주세요");
  if (code.length !== OTP.digits) throw new CarbookError(`문자로 받은 숫자 ${OTP.digits}자리를 넣어 주세요`);
  const ph = phoneHash(phone);
  const [o] = await db.select().from(carbookOtp).where(and(eq(carbookOtp.phoneHash, ph), eq(carbookOtp.purpose, "login"))).orderBy(desc(carbookOtp.createdAt)).limit(1);
  if (!o || o.usedAt) throw new CarbookError("인증번호를 먼저 받아 주세요");
  if (o.tries >= OTP.maxTries) throw new CarbookError(`여러 번 틀려 잠겼습니다. ${OTP.lockMinutes}분 뒤 인증번호를 다시 받아 주세요`);
  if (o.expiresAt < now) throw new CarbookError("인증번호 시간이 지났습니다. 다시 받아 주세요");
  if (o.codeHash !== codeHash(o.id, code) || !o.customerId) {
    const tries = o.tries + 1;
    await db.update(carbookOtp).set({ tries }).where(eq(carbookOtp.id, o.id));
    throw new CarbookError(tries >= OTP.maxTries ? `여러 번 틀려 ${OTP.lockMinutes}분 동안 잠겼습니다` : `인증번호가 맞지 않습니다(${OTP.maxTries - tries}번 더 넣을 수 있음)`);
  }
  await db.update(carbookOtp).set({ usedAt: now }).where(eq(carbookOtp.id, o.id));
  const token = randomToken(32);
  await db.insert(carbookSession).values({ tokenHash: sha256(token), customerId: o.customerId, scope: "full", expiresAt: new Date(now.getTime() + SESSION_DAYS.full * 864e5), ip: meta.ip ?? null, userAgent: meta.userAgent?.slice(0, 300) ?? null, lastSeenAt: now, createdAt: now });
  const [c] = await db.select({ at: customer.carbookAt }).from(customer).where(eq(customer.id, o.customerId));
  await db.update(customer).set({ carbookAt: c?.at ?? now, carbookSeenAt: now }).where(eq(customer.id, o.customerId));
  await writeAudit(db, { actorId: null, action: "carbook.login", entityType: "customer", entityId: o.customerId, after: { ip: meta.ip ?? null, first: !c?.at } });
  return { token, maxAgeDays: SESSION_DAYS.full };
}

/** 쿠키 토큰 → 손님. 연락처를 지운(동의 철회·보관 기간 끝) 고객은 로그인이 풀린다. 마지막 접속은 5분 단위로만 적는다 */
export async function sessionOf(db: Db, token: string | undefined | null, now = new Date()): Promise<MySession | null> {
  if (!token) return null;
  const [s] = await db
    .select({ customerId: carbookSession.customerId, scope: carbookSession.scope, roId: carbookSession.repairOrderId, expiresAt: carbookSession.expiresAt, lastSeenAt: carbookSession.lastSeenAt, tokenHash: carbookSession.tokenHash, name: customer.name, phoneHash: customer.phoneHash, purgedAt: customer.purgedAt, masked: customer.phoneMasked })
    .from(carbookSession)
    .innerJoin(customer, eq(customer.id, carbookSession.customerId))
    .where(eq(carbookSession.tokenHash, sha256(token)));
  if (!s || s.expiresAt < now || !s.phoneHash || s.purgedAt) return null;
  if (!(await carbookConfig(db)).enabled) return null;
  if (!s.lastSeenAt || now.getTime() - s.lastSeenAt.getTime() > 5 * 60_000) {
    await db.update(carbookSession).set({ lastSeenAt: now }).where(eq(carbookSession.tokenHash, s.tokenHash));
    await db.update(customer).set({ carbookSeenAt: now }).where(eq(customer.id, s.customerId));
  }
  return { customerId: s.customerId, name: s.name, scope: s.scope === "link" ? "link" : "full", roId: s.roId, phoneMasked: s.masked };
}

export async function endSession(db: Db, token: string | undefined | null) {
  if (token) await db.delete(carbookSession).where(eq(carbookSession.tokenHash, sha256(token)));
}

/** 이 손님의 모든 기기 로그아웃(동의 철회·차 판 뒤 직원이 쓰거나, 손님이 '모든 기기에서 나가기') */
export async function endAllSessions(db: Db, customerId: string) {
  await db.delete(carbookSession).where(eq(carbookSession.customerId, customerId));
}

// ── 로그인: 알림톡·문자 링크(그 수리 건만) ──
/** 링크 열기 → 그 수리 건만 보는 로그인(30일). 이미 문자 인증한 기기면 새 로그인을 만들지 않는다(부르는 쪽이 판단) */
export async function openLink(db: Db, linkToken: string, meta: Meta = {}, now = new Date()) {
  const [l] = await db.select().from(carbookLink).where(eq(carbookLink.tokenHash, sha256(linkToken)));
  if (!l || l.expiresAt < now) return null;
  const [c] = await db.select({ phoneHash: customer.phoneHash, purgedAt: customer.purgedAt }).from(customer).where(eq(customer.id, l.customerId));
  if (!c?.phoneHash || c.purgedAt) return null;
  if (!(await carbookConfig(db)).enabled) return null;
  const token = randomToken(32);
  await db.insert(carbookSession).values({ tokenHash: sha256(token), customerId: l.customerId, scope: "link", repairOrderId: l.repairOrderId, expiresAt: new Date(now.getTime() + SESSION_DAYS.link * 864e5), ip: meta.ip ?? null, userAgent: meta.userAgent?.slice(0, 300) ?? null, lastSeenAt: now, createdAt: now });
  if (!l.openedAt) await db.update(carbookLink).set({ openedAt: now }).where(eq(carbookLink.tokenHash, l.tokenHash));
  await db.update(customer).set({ carbookSeenAt: now }).where(eq(customer.id, l.customerId));
  await writeAudit(db, { actorId: null, action: "carbook.link", entityType: "customer", entityId: l.customerId, after: { ip: meta.ip ?? null, ro: l.repairOrderId } });
  return { token, customerId: l.customerId, roId: l.repairOrderId, maxAgeDays: SESSION_DAYS.link };
}

// ── 보기 ──
/** 이 손님이 볼 수 있는 수리 건 id. link 로그인이면 그 한 건만 */
async function myRoIds(db: Db, s: MySession) {
  if (s.scope === "link") {
    if (!s.roId) return [];
    const [r] = await db.select({ id: repairOrder.id }).from(repairOrder).where(and(eq(repairOrder.id, s.roId), eq(repairOrder.customerId, s.customerId)));
    return r ? [r.id] : [];
  }
  return (await db.select({ id: repairOrder.id }).from(repairOrder).where(and(eq(repairOrder.customerId, s.customerId), ne(repairOrder.status, "cancelled")))).map((r) => r.id);
}

async function mustOwnRo(db: Db, s: MySession, roId: string) {
  if (!(await myRoIds(db, s)).includes(roId)) throw new CarbookError("볼 수 없는 수리 기록입니다. 문자 인증으로 다시 들어와 주세요");
}

const carName = (v: { maker: string | null; model: string | null; generation: string | null }) => [v.maker, v.model, v.generation].filter(Boolean).join(" ");

type RoRow = { id: string; docNo: string; status: (typeof repairOrder.$inferSelect)["status"]; inAt: Date; vehicleId: string; insurance: string; plateNo: string; maker: string | null; model: string | null; generation: string | null };

async function roRows(db: Db, ids: string[]): Promise<RoRow[]> {
  if (!ids.length) return [];
  return db
    .select({ id: repairOrder.id, docNo: repairOrder.docNo, status: repairOrder.status, inAt: repairOrder.inAt, vehicleId: repairOrder.vehicleId, insurance: repairOrder.insurance, plateNo: vehicle.plateNo, maker: vehicle.maker, model: vehicle.model, generation: vehicle.generation })
    .from(repairOrder)
    .innerJoin(vehicle, eq(vehicle.id, repairOrder.vehicleId))
    .where(inArray(repairOrder.id, ids))
    .orderBy(desc(repairOrder.inAt));
}

/** 수리 건마다 출고 예정일(최근 견적·작업 지시서), 기다리는 견적 승인, 명세서·보증·금액 */
type Facts = { dueDate: string | null; awaiting: { id: string; docNo: string; total: number; validUntil: string | null }[]; statement: { docNo: string; issuedOn: string; deliveredOn: string | null; total: number; warranty: Warranty[] } | null };
async function roFacts(db: Db, ids: string[], today: string): Promise<Map<string, Facts>> {
  if (!ids.length) return new Map();
  const [ests, wos, sts] = await Promise.all([
    db.select().from(estimate).where(and(inArray(estimate.repairOrderId, ids), ne(estimate.status, "void"))).orderBy(desc(estimate.rev)),
    db.select({ roId: workOrder.repairOrderId, dueDate: workOrder.dueDate, createdAt: workOrder.createdAt }).from(workOrder).where(inArray(workOrder.repairOrderId, ids)).orderBy(desc(workOrder.createdAt)),
    db.select().from(repairStatement).where(inArray(repairStatement.repairOrderId, ids)),
  ]);
  const out = new Map<string, Facts>();
  for (const id of ids) {
    const e = ests.filter((x) => x.repairOrderId === id);
    const w = wos.find((x) => x.roId === id);
    const st = sts.find((x) => x.repairOrderId === id);
    const snap = (st?.snapshot ?? {}) as { warranty?: Warranty[] };
    out.set(id, {
      dueDate: w?.dueDate ?? e.find((x) => x.dueDate)?.dueDate ?? null,
      awaiting: e.filter((x) => x.status === "sent" && (!x.validUntil || x.validUntil >= today)).map((x) => ({ id: x.id, docNo: x.docNo, total: x.totalWon, validUntil: x.validUntil })),
      statement: st ? { docNo: st.docNo, issuedOn: st.issuedOn, deliveredOn: st.deliveredAt ? seoulDate(st.deliveredAt) : null, total: st.totalWon, warranty: snap.warranty ?? [] } : null,
    });
  }
  return out;
}

/** 홈: 내 차, 진행 중 수리(단계·출고 예정·할 일), 남은 보증 */
export async function myHome(db: Db, s: MySession, now = new Date()) {
  const today = seoulDate(now);
  const ids = await myRoIds(db, s);
  const ros = await roRows(db, ids);
  const facts = await roFacts(db, ids, today);
  const sold = new Set((await db.select({ v: carbookSold.vehicleId }).from(carbookSold).where(eq(carbookSold.customerId, s.customerId))).map((r) => r.v));
  const cars =
    s.scope === "full"
      ? (await db.select().from(vehicle).where(eq(vehicle.customerId, s.customerId))).filter((v) => !sold.has(v.id)).map((v) => ({ id: v.id, plateNo: v.plateNo, name: carName(v), year: v.year, mileage: v.mileage, mileageOn: v.mileageOn, registeredOn: v.registeredOn, visits: ros.filter((r) => r.vehicleId === v.id).length }))
      : [];
  const active = ros.filter((r) => isActiveRo(r.status)).map((r) => ({ ...r, car: carName(r), statusLabel: MY_STATUS_LABEL[r.status], steps: mySteps(r.status), ...facts.get(r.id)! }));
  const todos = active.flatMap((r) => r.awaiting.map((a) => ({ kind: "approve" as const, href: `/my/estimate/${a.id}`, label: `${r.plateNo} 수리 견적 승인`, sub: `${a.total.toLocaleString("ko-KR")}원 · ${a.validUntil ?? ""}까지` })));
  const warranties = ros
    .filter((r) => r.status === "delivered")
    .flatMap((r) => {
      const st = facts.get(r.id)?.statement;
      return warrantyState(st?.warranty, today).live.map((w) => ({ roId: r.id, plateNo: r.plateNo, kind: w.kind, until: w.until }));
    });
  return { cars, active, todos, warranties, total: ros.length };
}

/** 수리 이력 목록: 방문마다 날짜·차·상태·금액·보증 */
export async function myRepairs(db: Db, s: MySession, now = new Date()) {
  const today = seoulDate(now);
  const ids = await myRoIds(db, s);
  const ros = await roRows(db, ids);
  const facts = await roFacts(db, ids, today);
  return ros.map((r) => {
    const f = facts.get(r.id)!;
    const w = warrantyState(f.statement?.warranty, today);
    return { id: r.id, inOn: seoulDate(r.inAt), plateNo: r.plateNo, car: carName(r), status: r.status, statusLabel: MY_STATUS_LABEL[r.status], total: f.statement?.total ?? null, deliveredOn: f.statement?.deliveredOn ?? null, inWarranty: w.inWarranty };
  });
}

/** 수리 한 건: 단계, 손상 부위 그림(작업 진행 색), 사진(손님에게 보일 것만), 견적·명세서, 보증, 보증 신청 기록 */
export async function myRepair(db: Db, s: MySession, roId: string, now = new Date()) {
  await mustOwnRo(db, s, roId);
  const today = seoulDate(now);
  const [[r], [v]] = await Promise.all([db.select().from(repairOrder).where(eq(repairOrder.id, roId)), db.select().from(vehicle).innerJoin(repairOrder, eq(repairOrder.vehicleId, vehicle.id)).where(eq(repairOrder.id, roId))]);
  const veh = v.vehicle;
  const facts = (await roFacts(db, [roId], today)).get(roId)!;
  const [ests, damagesAll, photos, insp, cps] = await Promise.all([
    db.select().from(estimate).where(and(eq(estimate.repairOrderId, roId), inArray(estimate.status, ["sent", "accepted", "partial", "declined"]))).orderBy(desc(estimate.rev)),
    listDamage(db, roId),
    db.select({ path: roPhoto.path, slot: roPhoto.slot, damageId: roPhoto.damageId, createdAt: roPhoto.createdAt }).from(roPhoto).where(eq(roPhoto.repairOrderId, roId)).orderBy(roPhoto.createdAt),
    db.select({ photos: inspection.photos, result: inspection.result }).from(inspection).where(eq(inspection.repairOrderId, roId)),
    db.select({ id: complaint.id, docNo: complaint.docNo, status: complaint.status, verdict: complaint.verdict, receivedAt: complaint.receivedAt, content: complaint.content }).from(complaint).where(and(eq(complaint.repairOrderId, roId), eq(complaint.channel, "app"))).orderBy(desc(complaint.receivedAt)),
  ]);
  // 그림은 진단을 공장장이 확인한 뒤부터(그 전에는 바뀔 수 있음). 승인 안 한 부위는 빼지 않고 회색으로
  const damages = r.diagConfirmedAt ? damagesAll : [];
  const prog = damages.length ? await roProgress(db, roId, damages.map((d) => d.id)) : null;
  const before = visiblePhotos(photos, r.customerHiddenPhotos).map((p) => p.path);
  const after = visiblePhotos(
    insp.filter((i) => i.result === "pass").flatMap((i) => i.photos.map((path) => ({ path }))),
    r.customerHiddenPhotos,
  ).map((p) => p.path);
  const w = warrantyState(facts.statement?.warranty, today);
  return {
    id: r.id,
    status: r.status,
    statusLabel: MY_STATUS_LABEL[r.status],
    staffStatus: RO_STATUS_LABEL[r.status],
    steps: mySteps(r.status),
    inOn: seoulDate(r.inAt),
    mileage: r.mileage,
    insurance: r.insurance,
    plateNo: veh.plateNo,
    car: carName(veh),
    look: carOf(veh),
    dueDate: facts.dueDate,
    awaiting: facts.awaiting,
    estimates: ests.map((e) => ({ id: e.id, docNo: e.docNo, rev: e.rev, kind: ESTIMATE_KIND[e.kind as keyof typeof ESTIMATE_KIND] ?? e.kind, status: e.status, total: e.totalWon, issuedOn: e.issuedOn })),
    statement: facts.statement,
    warranty: w,
    damages: damages.map((d) => ({ id: d.id, seq: d.seq, part: d.part, view: d.view && isView(d.view) ? d.view : null, cells: d.cells, label: partName(d.part, d.subPart), kind: d.kind, method: d.method, raw: d })),
    progress: prog,
    before,
    after,
    claims: cps,
  };
}

/** 서류 보관함: 견적서(발급한 것)·정비명세서 */
export async function myDocs(db: Db, s: MySession) {
  const ids = await myRoIds(db, s);
  if (!ids.length) return [];
  const [ests, sts, ros] = await Promise.all([
    db.select().from(estimate).where(and(inArray(estimate.repairOrderId, ids), inArray(estimate.status, ["sent", "accepted", "partial", "declined"]))),
    db.select().from(repairStatement).where(inArray(repairStatement.repairOrderId, ids)),
    roRows(db, ids),
  ]);
  const plate = new Map(ros.map((r) => [r.id, r.plateNo]));
  return [
    ...sts.map((x) => ({ kind: "statement" as const, href: `/my/docs/statement/${x.repairOrderId}`, title: "정비명세서", docNo: x.docNo, on: x.issuedOn, plateNo: plate.get(x.repairOrderId) ?? "", total: x.totalWon })),
    ...ests.map((x) => ({ kind: "estimate" as const, href: `/my/docs/estimate/${x.id}`, title: x.rev > 1 ? `견적서(${x.rev}차)` : "견적서", docNo: x.docNo, on: x.issuedOn ?? "", plateNo: plate.get(x.repairOrderId) ?? "", total: x.totalWon })),
  ].sort((a, b) => b.on.localeCompare(a.on));
}

/** 정비명세서 보기 권한 확인 후 수리 건 id(인쇄 화면이 statementOf 로 그린다) */
export async function myStatementRo(db: Db, s: MySession, roId: string) {
  await mustOwnRo(db, s, roId);
  const [st] = await db.select({ docNo: repairStatement.docNo }).from(repairStatement).where(eq(repairStatement.repairOrderId, roId));
  if (!st) throw new CarbookError("아직 정비명세서가 없습니다(출고 때 발급)");
  await writeAudit(db, { actorId: null, action: "carbook.view", entityType: "repair_statement", entityId: st.docNo, after: { customer: s.customerId } });
  return roId;
}

/** 견적서 보기 권한(발급한 견적만) */
export async function myEstimateDoc(db: Db, s: MySession, estimateId: string) {
  const [e] = await db.select({ roId: estimate.repairOrderId, status: estimate.status, docNo: estimate.docNo }).from(estimate).where(eq(estimate.id, estimateId));
  if (!e || !["sent", "accepted", "partial", "declined"].includes(e.status)) throw new CarbookError("볼 수 없는 견적서입니다");
  await mustOwnRo(db, s, e.roId);
  await writeAudit(db, { actorId: null, action: "carbook.view", entityType: "estimate", entityId: e.docNo, after: { customer: s.customerId } });
  return e.roId;
}

/**
 * 손님이 볼 수 있는 보관 파일인지: 내 수리 건의 보일 사진, 내 서류(발급 때 고정)의 서명·직인, 내 보증 신청 사진.
 * 사내 메모 사진·다른 손님 파일은 막는다.
 */
export async function canSeeFile(db: Db, s: MySession, path: string) {
  const ids = await myRoIds(db, s);
  if (!ids.length) return false;
  const ros = await db.select({ id: repairOrder.id, hidden: repairOrder.customerHiddenPhotos }).from(repairOrder).where(inArray(repairOrder.id, ids));
  const hidden = new Set(ros.flatMap((r) => r.hidden));
  if (hidden.has(path)) return false;
  const [p] = await db.select({ slot: roPhoto.slot }).from(roPhoto).where(and(eq(roPhoto.path, path), inArray(roPhoto.repairOrderId, ids)));
  if (p) return visiblePhotos([{ path, slot: p.slot }], []).length > 0;
  const insp = await db.select({ photos: inspection.photos, result: inspection.result }).from(inspection).where(inArray(inspection.repairOrderId, ids));
  if (insp.some((i) => i.result === "pass" && i.photos.includes(path))) return true;
  const docs = [
    ...(await db.select({ snap: estimate.snapshot, sig: estimate.approvalSignature }).from(estimate).where(and(inArray(estimate.repairOrderId, ids), inArray(estimate.status, ["sent", "accepted", "partial", "declined"])))),
    ...(await db.select({ snap: repairStatement.snapshot, sig: repairStatement.signature }).from(repairStatement).where(inArray(repairStatement.repairOrderId, ids))),
  ];
  for (const d of docs) {
    const sn = d.snap as { writerSign?: string | null; shop?: { sealPath?: string } };
    if (path === sn.writerSign || path === sn.shop?.sealPath) return true;
  }
  const cps = await db.select({ photos: complaint.photos }).from(complaint).where(and(inArray(complaint.repairOrderId, ids), eq(complaint.channel, "app")));
  return cps.some((c) => c.photos.includes(path));
}

// ── 보증 신청 ──
export type ClaimInput = { content: string; wish: string; photos: Uint8Array[] };

/**
 * 수리 이력에서 [보증 신청]: 고객 불만·보증 처리부(F-06-02)에 '앱' 경로로 접수된다.
 * 어느 수리·어느 명세서인지는 이 수리 건에서 저절로 이어진다. 손님은 사진과 한 줄만.
 */
export async function claimWarranty(db: Db, s: MySession, roId: string, input: ClaimInput, now = new Date()) {
  await mustOwnRo(db, s, roId);
  const [r] = await db.select({ status: repairOrder.status }).from(repairOrder).where(eq(repairOrder.id, roId));
  if (r.status !== "delivered") throw new CarbookError("출고한 수리만 보증 신청을 합니다. 수리 중이면 정비소로 전화해 주세요");
  const content = input.content.trim();
  if (content.length < 5) throw new CarbookError("어디가 어떻게 이상한지 적어 주세요(예: 보닛 도장에 기포가 생겼어요)");
  if (input.photos.length > 5) throw new CarbookError("사진은 5장까지 올릴 수 있습니다");
  const open = await db.select({ id: complaint.id }).from(complaint).where(and(eq(complaint.repairOrderId, roId), eq(complaint.channel, "app"), ne(complaint.status, "closed"), gt(complaint.receivedAt, new Date(now.getTime() - 864e5))));
  if (open.length) throw new CarbookError("오늘 이미 신청하셨습니다. 정비소에서 곧 연락드립니다");
  const paths: string[] = [];
  for (const b of input.photos) {
    if (!b.length) continue;
    if (b.length > MAX_IMAGE_BYTES) throw new CarbookError("사진이 너무 큽니다(6MB까지)");
    const t = sniffImage(b);
    if (!t) throw new CarbookError("사진 파일만 올릴 수 있습니다(JPG·PNG·WEBP)");
    paths.push(await storeFile(`cp/app`, b, IMAGE_TYPES[t]));
  }
  const { id, docNo } = await receiveComplaint(db, null, { channel: "app", category: "quality", repairOrderId: roId, content, wish: input.wish.trim() || undefined, urgent: false }, now);
  if (paths.length) await db.update(complaint).set({ photos: paths }).where(eq(complaint.id, id));
  return { id, docNo };
}

// ── 차 판 기록 ──
export async function markSold(db: Db, s: MySession, vehicleId: string, now = new Date()) {
  if (s.scope !== "full") throw new CarbookError("문자 인증으로 들어와야 합니다");
  const [v] = await db.select({ id: vehicle.id, plateNo: vehicle.plateNo }).from(vehicle).where(and(eq(vehicle.id, vehicleId), eq(vehicle.customerId, s.customerId)));
  if (!v) throw new CarbookError("내 차가 아닙니다");
  const [dup] = await db.select({ id: carbookSold.id }).from(carbookSold).where(and(eq(carbookSold.customerId, s.customerId), eq(carbookSold.vehicleId, vehicleId)));
  if (dup) return;
  await db.insert(carbookSold).values({ customerId: s.customerId, vehicleId, soldOn: seoulDate(now), createdAt: now });
  await notifyRole(db, "advisor", `내 차 수첩: ${v.plateNo} 차를 팔았다고 알려 왔습니다(${s.name}) — 다음 입고 때 소유자를 바꾸세요`, `carbook-sold-${vehicleId}`, `/customers/${s.customerId}`);
  await writeAudit(db, { actorId: null, action: "carbook.sold", entityType: "vehicle", entityId: v.plateNo, after: { customer: s.customerId } });
}

// ── 정비소 쪽 ──
/** 고객 화면 카드: 사용 여부·처음·마지막 접속·로그인 기기 수·판 차 */
export async function carbookStatus(db: Db, customerId: string, now = new Date()) {
  const [c] = await db.select({ at: customer.carbookAt, seen: customer.carbookSeenAt, phoneHash: customer.phoneHash, kind: customer.kind }).from(customer).where(eq(customer.id, customerId));
  if (!c) throw new CarbookError("고객을 찾을 수 없습니다");
  const sessions = await db.select({ scope: carbookSession.scope }).from(carbookSession).where(and(eq(carbookSession.customerId, customerId), gt(carbookSession.expiresAt, now)));
  const sold = await db.select({ plateNo: vehicle.plateNo, soldOn: carbookSold.soldOn }).from(carbookSold).innerJoin(vehicle, eq(vehicle.id, carbookSold.vehicleId)).where(eq(carbookSold.customerId, customerId));
  return { since: c.at, seen: c.seen, devices: sessions.filter((x) => x.scope === "full").length, canInvite: !!c.phoneHash && c.kind === "person", sold };
}

/** [초대 문자 보내기]: 링크 하나(90일)를 문자로. 링크는 비밀이라 발송 기록에는 가린다 */
export async function sendInvite(db: Db, actor: Actor, customerId: string, now = new Date(), f: typeof fetch = fetch) {
  if (!can(actor, "customer.write")) throw new CarbookError("고객 담당(상담원·공장장·대표)만 보냅니다");
  if (!(await carbookConfig(db)).enabled) throw new CarbookError("내 차 수첩이 꺼져 있습니다(설정 › 내 차 수첩)");
  const p = await phoneForNotice(db, customerId);
  if (!PHONE_RE.test(normalizePhone(p.to)) || !MOBILE_RE.test(normalizePhone(p.to))) throw new CarbookError("휴대폰 번호가 아니어서 보낼 수 없습니다");
  const [last] = await db.select({ id: repairOrder.id }).from(repairOrder).where(eq(repairOrder.customerId, customerId)).orderBy(desc(repairOrder.inAt)).limit(1);
  const { url, token } = await makeLink(db, customerId, last?.id ?? null, now);
  const shop = await shopCard(db);
  const text = `[${shop.name}] ${p.name} 고객님, 수리 기록·견적서·명세서·보증 기간을 '내 차 수첩'에서 보실 수 있습니다.\n${url}\n처음 한 번만 휴대폰 문자 인증을 하시면 됩니다(비밀번호 없음).`;
  const r = await sendSecretSms(db, { to: p.to, text, secret: token, purpose: "내 차 수첩 초대", customerName: p.name }, f);
  await writeAudit(db, { actorId: actor.id, action: "carbook.invite", entityType: "customer", entityId: customerId, after: { ok: r.ok, to: maskPhone(p.to) } });
  if (!r.ok && !r.demo) throw new CarbookError(`문자를 보내지 못했습니다: ${r.error ?? "실패"}`);
  return { demo: r.demo, url };
}

/** 수리 건 화면: 손님에게 보이지 않을 사진 고르기(상담원·공장장·대표) */
export async function setHiddenPhotos(db: Db, actor: Actor, roId: string, hidden: string[], now = new Date()) {
  if (!can(actor, "customer.write")) throw new CarbookError("고객 담당(상담원·공장장·대표)만 고릅니다");
  const [r] = await db.select({ docNo: repairOrder.docNo }).from(repairOrder).where(eq(repairOrder.id, roId));
  if (!r) throw new CarbookError("수리 건을 찾을 수 없습니다");
  const all = await photoChoices(db, roId);
  const known = new Set(all.map((p) => p.path));
  const list = [...new Set(hidden.filter((h) => known.has(h)))];
  await db.update(repairOrder).set({ customerHiddenPhotos: list, updatedAt: now }).where(eq(repairOrder.id, roId));
  await writeAudit(db, { actorId: actor.id, action: "carbook.hide_photos", entityType: "repair_order", entityId: r.docNo, after: { hidden: list.length } });
}

/** 고를 수 있는 사진: 입고 사진(숨김 칸 제외)과 합격한 검사 사진. 숨김 칸(계기판·차대번호·기타)은 원래 안 보인다 */
export async function photoChoices(db: Db, roId: string) {
  const [[r], photos, insp] = await Promise.all([
    db.select({ hidden: repairOrder.customerHiddenPhotos }).from(repairOrder).where(eq(repairOrder.id, roId)),
    db.select({ path: roPhoto.path, slot: roPhoto.slot }).from(roPhoto).where(eq(roPhoto.repairOrderId, roId)).orderBy(roPhoto.createdAt),
    db.select({ photos: inspection.photos, result: inspection.result }).from(inspection).where(eq(inspection.repairOrderId, roId)),
  ]);
  const hidden = new Set(r?.hidden ?? []);
  return [...visiblePhotos(photos, []).map((p) => ({ path: p.path, label: "입고", hidden: hidden.has(p.path) })), ...insp.filter((i) => i.result === "pass").flatMap((i) => i.photos.map((path) => ({ path, label: "작업 후", hidden: hidden.has(path) })))];
}

/** 대표 설정 화면 숫자: 쓰는 손님 수, 최근 30일 접속, 초대·인증 문자 */
export async function carbookStats(db: Db, now = new Date()) {
  const month = new Date(now.getTime() - 30 * 864e5);
  const [[a], [b]] = await Promise.all([
    db.select({ n: sql<number>`count(*)::int` }).from(customer).where(and(sql`${customer.carbookAt} is not null`, isNull(customer.purgedAt))),
    db.select({ n: sql<number>`count(*)::int` }).from(customer).where(gte(customer.carbookSeenAt, month)),
  ]);
  return { users: a?.n ?? 0, recent: b?.n ?? 0, today: seoulDate(now), linkDays: LINK_DAYS, until: addDays(seoulDate(now), LINK_DAYS) };
}
