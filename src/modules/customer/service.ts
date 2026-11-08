// 고객·차량·동의·상담 일지 — 사내 표준서 STD-01(상담·예약), STD-13(개인정보), 설계서 6.1·9.2
// 규칙: 동의 없이 연락처를 저장하지 않는다. 같은 전화번호·차량번호는 새로 만들지 않고 다시 쓴다.
import { and, asc, desc, eq, gte, ilike, inArray, isNull, lt, lte, ne, or, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { appUser, consent, consultation, customer, vehicle } from "@/db/schema";
import { decrypt, encrypt, maskPhone, normalizePhone, phoneHash } from "@/modules/auth/crypto";
import { sendNotice } from "@/modules/messaging/service";
import { writeAudit } from "@/modules/platform/audit";
import { nextDocNo } from "@/modules/platform/docno";
import { UserError } from "@/modules/platform/errors";
import { notifyRole } from "@/modules/platform/notify";
import { loadPolicy } from "@/modules/platform/policy";
import { addDays, seoulDate } from "@/modules/platform/time";
import {
  addBusinessDays,
  CONSENT_VERSION,
  INSURANCE_LABEL,
  koDateTime,
  normalizePlate,
  PHONE_RE,
  PLATE_RE,
  RESULT_LABEL,
  seoulDateTime,
  seoulParts,
} from "./rules";

export class CustomerError extends UserError {}

type Tx = Db;
const clean = (s: string | null | undefined) => (s ?? "").trim() || null;

// ── 동의 ──
export type ConsentState = { required: boolean; photo: boolean; marketing: boolean; at: Date | null; method: string | null; version: string | null; current: boolean };

export async function consentState(db: Db, customerId: string): Promise<ConsentState> {
  const [row] = await db.select().from(consent).where(eq(consent.customerId, customerId)).orderBy(desc(consent.at)).limit(1);
  if (!row) return { required: false, photo: false, marketing: false, at: null, method: null, version: null, current: false };
  return { required: row.required, photo: row.photo, marketing: row.marketing, at: row.at, method: row.method, version: row.version, current: row.version === CONSENT_VERSION };
}

export type ConsentInput = { required: boolean; photo: boolean; marketing: boolean; method: "phone" | "visit" | "online"; note?: string };

async function addConsent(tx: Tx, actorId: string | null, customerId: string, c: ConsentInput, withdrawal = false) {
  await tx.insert(consent).values({ customerId, version: CONSENT_VERSION, required: c.required, photo: c.photo, marketing: c.marketing, method: c.method, withdrawal, note: clean(c.note), recordedBy: actorId });
  await writeAudit(tx, { actorId, action: withdrawal ? "consent.withdraw" : "consent.record", entityType: "customer", entityId: customerId, after: { required: c.required, photo: c.photo, marketing: c.marketing, method: c.method, version: CONSENT_VERSION } });
}

/** 동의 바꾸기·철회. 필수를 철회하면 연락처를 지운다(더 연락하지 않음) */
export async function changeConsent(db: Db, actorId: string, customerId: string, c: ConsentInput) {
  const prev = await consentState(db, customerId);
  const withdrawal = (prev.required && !c.required) || (prev.marketing && !c.marketing) || (prev.photo && !c.photo);
  await db.transaction(async (tx) => {
    await addConsent(tx, actorId, customerId, c, withdrawal);
    if (!c.required) {
      await tx.update(customer).set({ phoneEnc: null, phoneHash: null, phoneMasked: null, updatedAt: new Date() }).where(eq(customer.id, customerId));
      await writeAudit(tx, { actorId, action: "customer.phone_removed", entityType: "customer", entityId: customerId, after: { reason: "필수 동의 철회" } });
    }
  });
}

// ── 고객·차량 ──
function phoneOf(raw: string): string {
  const d = normalizePhone(raw);
  if (!PHONE_RE.test(d)) throw new CustomerError("연락처를 확인해 주세요(예: 010-1234-5678)");
  return d;
}

function plateOf(raw: string): string {
  const p = normalizePlate(raw);
  if (!PLATE_RE.test(p)) throw new CustomerError("차량번호를 확인해 주세요(예: 12가3456, 서울12가3456)");
  return p;
}

export async function findByPhone(db: Db, raw: string) {
  const d = normalizePhone(raw);
  if (!PHONE_RE.test(d)) return null;
  const [c] = await db.select().from(customer).where(eq(customer.phoneHash, phoneHash(d)));
  return c ?? null;
}

export async function findByPlate(db: Db, raw: string) {
  const [v] = await db.select().from(vehicle).where(eq(vehicle.plateNo, normalizePlate(raw)));
  return v ?? null;
}

/**
 * 찾기: 전체 전화번호(정확히), 전화 끝 4자리, 차량번호(일부), 이름(일부).
 * 결과마다 고객·차량·지금 동의 상태·최근 상담을 함께 준다(새 상담에 그대로 불러오기 위해).
 */
export async function searchCustomers(db: Db, q: string, limit = 20) {
  const s = q.trim();
  if (!s) return [];
  const d = normalizePhone(s);
  const conds = [];
  if (PHONE_RE.test(d)) conds.push(eq(customer.phoneHash, phoneHash(d)));
  if (/^\d{4}$/.test(s)) conds.push(ilike(customer.phoneMasked, `%-${s}`));
  const plate = normalizePlate(s);
  if (plate.length >= 2) {
    const vs = await db.select({ c: vehicle.customerId }).from(vehicle).where(ilike(vehicle.plateNo, `%${plate}%`)).limit(limit);
    if (vs.length) conds.push(inArray(customer.id, vs.map((v) => v.c)));
  }
  if (!/^\d+$/.test(s)) conds.push(ilike(customer.name, `%${s}%`));
  if (!conds.length) return [];
  const rows = await db.select().from(customer).where(or(...conds)).orderBy(desc(customer.updatedAt)).limit(limit);
  return Promise.all(rows.map((c) => customerSummary(db, c)));
}

export async function recentCustomers(db: Db, limit = 50) {
  const rows = await db.select().from(customer).orderBy(desc(customer.updatedAt)).limit(limit);
  return Promise.all(rows.map((c) => customerSummary(db, c)));
}

async function customerSummary(db: Db, c: typeof customer.$inferSelect) {
  const vehicles = await db.select().from(vehicle).where(eq(vehicle.customerId, c.id)).orderBy(desc(vehicle.updatedAt));
  const [last] = await db.select({ id: consultation.id, docNo: consultation.docNo, at: consultation.at, result: consultation.result }).from(consultation).where(eq(consultation.customerId, c.id)).orderBy(desc(consultation.at)).limit(1);
  return { id: c.id, name: c.name, phone: c.phoneMasked, memo: c.memo, vehicles, consent: await consentState(db, c.id), last: last ?? null };
}

export async function getCustomer(db: Db, id: string) {
  const [c] = await db.select().from(customer).where(eq(customer.id, id));
  if (!c) throw new CustomerError("없는 고객입니다");
  const consents = await db
    .select({ id: consent.id, at: consent.at, required: consent.required, photo: consent.photo, marketing: consent.marketing, method: consent.method, withdrawal: consent.withdrawal, version: consent.version, note: consent.note, by: appUser.name })
    .from(consent)
    .leftJoin(appUser, eq(appUser.id, consent.recordedBy))
    .where(eq(consent.customerId, id))
    .orderBy(desc(consent.at));
  const consults = await db
    .select({ id: consultation.id, docNo: consultation.docNo, at: consultation.at, result: consultation.result, reservedAt: consultation.reservedAt, plateNo: vehicle.plateNo, damageParts: consultation.damageParts })
    .from(consultation)
    .leftJoin(vehicle, eq(vehicle.id, consultation.vehicleId))
    .where(eq(consultation.customerId, id))
    .orderBy(desc(consultation.at));
  return { ...(await customerSummary(db, c)), createdAt: c.createdAt, consents, consults };
}

/** 전체 번호 보기: 업무에 필요할 때만, 볼 때마다 감사 기록(설계서 9.2) */
export async function revealPhone(db: Db, actorId: string, customerId: string): Promise<string | null> {
  const [c] = await db.select({ enc: customer.phoneEnc }).from(customer).where(eq(customer.id, customerId));
  if (!c?.enc) return null;
  await writeAudit(db, { actorId, action: "customer.view_phone", entityType: "customer", entityId: customerId });
  return decrypt(c.enc);
}

export async function updateCustomer(db: Db, actorId: string, id: string, input: { name: string; phone?: string; memo?: string }) {
  const name = input.name.trim();
  if (!name) throw new CustomerError("고객명을 적어 주세요");
  const set: Partial<typeof customer.$inferInsert> = { name, memo: clean(input.memo), updatedAt: new Date() };
  if (input.phone?.trim()) {
    if (!(await consentState(db, id)).required) throw new CustomerError("개인정보 필수 동의가 없어 연락처를 저장할 수 없습니다. 먼저 동의를 받아 주세요");
    const p = phoneOf(input.phone);
    const other = await findByPhone(db, p);
    if (other && other.id !== id) throw new CustomerError(`같은 번호의 고객(${other.name})이 이미 있습니다. 그 고객으로 상담하세요`);
    Object.assign(set, { phoneEnc: encrypt(p), phoneHash: phoneHash(p), phoneMasked: maskPhone(p) });
  }
  await db.update(customer).set(set).where(eq(customer.id, id));
  await writeAudit(db, { actorId, action: "customer.update", entityType: "customer", entityId: id, after: { name, memo: set.memo, phoneChanged: !!input.phone?.trim() } });
}

export async function saveVehicle(db: Db, actorId: string, customerId: string, input: { id?: string; plateNo: string; model?: string; year?: number | null; colorCode?: string }) {
  const plateNo = plateOf(input.plateNo);
  const year = input.year ?? null;
  if (year != null && (year < 1980 || year > new Date().getFullYear() + 1)) throw new CustomerError("연식을 확인해 주세요(예: 2021)");
  const same = await findByPlate(db, plateNo);
  if (same && same.id !== input.id && same.customerId !== customerId) throw new CustomerError(`${plateNo}는 다른 고객의 차량으로 등록되어 있습니다. 소유자가 바뀌었으면 그 고객 화면에서 옮겨 주세요`);
  const vid = input.id ?? same?.id;
  // 이미 있는 차량이면 비운 칸은 지난 값을 그대로 둔다(다시 칠 필요 없음)
  const [old] = vid ? await db.select().from(vehicle).where(eq(vehicle.id, vid)) : [];
  const values = { plateNo, model: clean(input.model) ?? old?.model ?? null, year: year ?? old?.year ?? null, colorCode: clean(input.colorCode)?.toUpperCase() ?? old?.colorCode ?? null, updatedAt: new Date() };
  if (vid) {
    await db.update(vehicle).set({ ...values, customerId }).where(eq(vehicle.id, vid));
    await writeAudit(db, { actorId, action: "vehicle.update", entityType: "vehicle", entityId: plateNo, after: values });
    return vid;
  }
  const [v] = await db.insert(vehicle).values({ ...values, customerId }).returning({ id: vehicle.id });
  await writeAudit(db, { actorId, action: "vehicle.create", entityType: "vehicle", entityId: plateNo, after: values });
  return v.id;
}

/** 차량 소유자 바꾸기(중고 매매 등). 지난 상담·수리 기록은 원래 고객에게 남는다 */
export async function moveVehicle(db: Db, actorId: string, vehicleId: string, toCustomerId: string) {
  const [v] = await db.select().from(vehicle).where(eq(vehicle.id, vehicleId));
  if (!v) throw new CustomerError("없는 차량입니다");
  await db.update(vehicle).set({ customerId: toCustomerId, updatedAt: new Date() }).where(eq(vehicle.id, vehicleId));
  await writeAudit(db, { actorId, action: "vehicle.move", entityType: "vehicle", entityId: v.plateNo, before: { customerId: v.customerId }, after: { customerId: toCustomerId } });
}

// ── 상담 일지(F-01-01) ──
export type ConsultInput = {
  /** 기존 고객이면 id. 없으면 newCustomer 로 만든다(같은 번호가 있으면 그 고객을 다시 쓴다) */
  customerId?: string;
  newCustomer?: { name: string; phone: string };
  /** 기존 고객의 동의가 없거나 판이 바뀌었으면 여기서 받는다 */
  consent?: ConsentInput;
  vehicleId?: string;
  newVehicle?: { plateNo: string; model?: string; year?: number | null; colorCode?: string };
  channel: (typeof consultation.$inferInsert)["channel"];
  damageTypes: string[];
  damageParts?: string;
  cause?: string;
  photoCount?: number;
  methods: string[];
  structural?: boolean;
  insurance: "self" | "own" | "other";
  insurer?: string;
  claimNo?: string;
  wantDate?: string;
  partsPref?: string;
  rental?: boolean;
  needs?: string;
  estMin?: number | null;
  estMax?: number | null;
  estNoticed?: boolean;
  fromId?: string;
} & ResultInput;

export type ResultInput = {
  result: "open" | "reserved" | "recontact" | "declined";
  reservedDate?: string;
  reservedTime?: string;
  overCapacityOk?: boolean;
  recontactOn?: string;
  closeReason?: string;
};

/** 그날 입고 예약 수와 한도(정책값 '일별 입고 한도', 0이면 한도 없음) */
export async function capacity(db: Db, date: string, exceptId?: string) {
  const from = seoulDateTime(date, "00:00");
  const to = seoulDateTime(addDays(date, 1), "00:00");
  const conds = [eq(consultation.result, "reserved"), gte(consultation.reservedAt, from), lt(consultation.reservedAt, to)];
  if (exceptId) conds.push(ne(consultation.id, exceptId));
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(consultation).where(and(...conds));
  const cap = (await loadPolicy(db, date))["intake.daily_capacity"];
  return { date, count: r.n, cap, full: cap > 0 && r.n >= cap };
}

async function resultFields(db: Db, r: ResultInput, insurance: string, claimNo: string | null, now: Date, exceptId?: string) {
  const today = seoulDate(now);
  const policy = await loadPolicy(db, today);
  const out = { result: r.result, reservedAt: null as Date | null, overCapacityOk: false, recontactOn: null as string | null, closeReason: null as string | null };
  if (r.result === "reserved") {
    if (!r.reservedDate || !r.reservedTime) throw new CustomerError("입고 예약 날짜와 시간을 골라 주세요");
    if (r.reservedDate < today) throw new CustomerError("지난 날짜로는 예약할 수 없습니다");
    if (insurance !== "self" && !claimNo) throw new CustomerError("보험 건은 예약 전에 사고접수번호를 받아 적어 주세요(STD-01 6단계)");
    const cap = await capacity(db, r.reservedDate, exceptId);
    if (cap.full && !r.overCapacityOk) throw new CustomerError(`${r.reservedDate} 입고 예약이 한도(${cap.cap}대)에 찼습니다. 공장장 동의를 받았으면 '한도 넘김 동의'에 체크하세요`);
    out.reservedAt = seoulDateTime(r.reservedDate, r.reservedTime);
    out.overCapacityOk = cap.full && !!r.overCapacityOk;
  } else if (r.result === "recontact") {
    out.recontactOn = r.recontactOn || addDays(today, policy["consult.follow_up_days"]);
  } else if (r.result === "declined") {
    out.closeReason = clean(r.closeReason);
    if (!out.closeReason) throw new CustomerError("거절·보류 사유를 적어 주세요");
  }
  return out;
}

export async function createConsultation(db: Db, actorId: string, input: ConsultInput, now = new Date()) {
  const today = seoulDate(now);
  const policy = await loadPolicy(db, today);
  if (!input.damageTypes.length && !clean(input.damageParts)) throw new CustomerError("손상 유형이나 부위를 하나 이상 적어 주세요");
  const estMin = input.estMin ?? null;
  const estMax = input.estMax ?? null;
  if (estMin != null && estMax != null && estMin > estMax) throw new CustomerError("예상 금액의 최소가 최대보다 큽니다");
  if ((estMin != null || estMax != null) && !input.estNoticed) throw new CustomerError("예상 금액을 안내했으면 '실차 진단 후 확정됨을 안내함'에 체크해 주세요(STD-01 4단계)");
  const insurer = input.insurance === "self" ? null : clean(input.insurer);
  if (input.insurance !== "self" && !insurer) throw new CustomerError("보험사를 적어 주세요");
  const claimNo = input.insurance === "self" ? null : clean(input.claimNo);

  return db.transaction(async (tx) => {
    // 1) 고객: 고른 고객 → 같은 번호의 고객 → 새 고객. 연락처는 필수 동의가 있어야 저장한다
    let customerId = input.customerId;
    if (!customerId) {
      const nc = input.newCustomer;
      if (!nc?.name.trim()) throw new CustomerError("고객명을 적어 주세요");
      const phone = phoneOf(nc.phone);
      const same = await findByPhone(tx, phone);
      if (same) customerId = same.id;
      else {
        if (!input.consent?.required) throw new CustomerError("개인정보 필수 동의 없이 연락처를 저장할 수 없습니다. 동의서를 읽어 주고 '필수'에 체크하세요(STD-13)");
        const [c] = await tx.insert(customer).values({ name: nc.name.trim(), phoneEnc: encrypt(phone), phoneHash: phoneHash(phone), phoneMasked: maskPhone(phone), createdBy: actorId }).returning({ id: customer.id });
        customerId = c.id;
        await writeAudit(tx, { actorId, action: "customer.create", entityType: "customer", entityId: customerId, after: { name: nc.name.trim() } });
      }
    }
    const st = await consentState(tx, customerId);
    if (input.consent && (input.consent.required !== st.required || input.consent.marketing !== st.marketing || input.consent.photo !== st.photo || !st.current)) {
      if (!input.consent.required) throw new CustomerError("필수 동의가 없으면 상담을 기록할 수 없습니다");
      await addConsent(tx, actorId, customerId, input.consent);
    } else if (!st.required) throw new CustomerError("이 고객은 개인정보 필수 동의가 없습니다. 동의를 받아 체크해 주세요");

    // 2) 차량: 고른 차량 → 같은 번호의 차량 → 새 차량
    let vehicleId: string | null = input.vehicleId ?? null;
    if (vehicleId) {
      const [v] = await tx.select().from(vehicle).where(eq(vehicle.id, vehicleId));
      if (!v || v.customerId !== customerId) throw new CustomerError("고른 차량이 이 고객의 차량이 아닙니다");
    } else if (input.newVehicle?.plateNo.trim()) {
      vehicleId = await saveVehicle(tx, actorId, customerId, input.newVehicle);
    }

    // 3) 결과(예약·재연락·거절)
    const res = await resultFields(tx, input, input.insurance, claimNo, now);
    const docNo = await nextDocNo(tx, "CS", now);
    // 전화·방문은 그 자리에서 답한 것. 문자·화면·소개로 들어온 것은 회신 기한을 둔다
    const answered = input.channel === "phone" || input.channel === "visit";
    const [row] = await tx
      .insert(consultation)
      .values({
        docNo,
        at: now,
        channel: input.channel,
        customerId,
        vehicleId,
        damageTypes: input.damageTypes,
        damageParts: clean(input.damageParts),
        cause: clean(input.cause),
        photoCount: Math.max(0, input.photoCount ?? 0),
        methods: input.methods,
        structural: !!input.structural,
        insurance: input.insurance,
        insurer,
        claimNo,
        wantDate: input.wantDate || null,
        partsPref: clean(input.partsPref),
        rental: !!input.rental,
        needs: clean(input.needs),
        estMin,
        estMax,
        estNoticed: !!input.estNoticed,
        ...res,
        replyDue: addBusinessDays(today, policy["consult.reply_business_days"]),
        repliedAt: answered ? now : null,
        fromId: input.fromId ?? null,
        advisorId: actorId,
      })
      .returning();
    await tx.update(customer).set({ updatedAt: now }).where(eq(customer.id, customerId));
    await writeAudit(tx, { actorId, action: "consult.create", entityType: "consultation", entityId: docNo, after: { result: res.result, reservedAt: res.reservedAt } });
    return row;
  });
}

/** 상담 내용 고치기(입고 전까지). 고객·차량은 그대로 두고 상담 칸만 */
export async function updateConsultation(db: Db, actorId: string, id: string, input: Omit<ConsultInput, "customerId" | "newCustomer" | "consent" | "vehicleId" | "newVehicle" | "fromId" | "channel"> & { vehicleId?: string | null }, now = new Date()) {
  const c = await getConsultRow(db, id);
  if (c.result === "converted") throw new CustomerError("입고된 상담은 고칠 수 없습니다. 수리 건에서 고쳐 주세요");
  const insurer = input.insurance === "self" ? null : clean(input.insurer);
  if (input.insurance !== "self" && !insurer) throw new CustomerError("보험사를 적어 주세요");
  const claimNo = input.insurance === "self" ? null : clean(input.claimNo);
  if (input.estMin != null && input.estMax != null && input.estMin > input.estMax) throw new CustomerError("예상 금액의 최소가 최대보다 큽니다");
  if ((input.estMin != null || input.estMax != null) && !input.estNoticed) throw new CustomerError("예상 금액을 안내했으면 '실차 진단 후 확정됨을 안내함'에 체크해 주세요(STD-01 4단계)");
  const res = await resultFields(db, input, input.insurance, claimNo, now, id);
  const moved = res.reservedAt?.getTime() !== c.reservedAt?.getTime();
  await db
    .update(consultation)
    .set({
      vehicleId: input.vehicleId === undefined ? c.vehicleId : input.vehicleId,
      damageTypes: input.damageTypes,
      damageParts: clean(input.damageParts),
      cause: clean(input.cause),
      photoCount: Math.max(0, input.photoCount ?? 0),
      methods: input.methods,
      structural: !!input.structural,
      insurance: input.insurance,
      insurer,
      claimNo,
      wantDate: input.wantDate || null,
      partsPref: clean(input.partsPref),
      rental: !!input.rental,
      needs: clean(input.needs),
      estMin: input.estMin ?? null,
      estMax: input.estMax ?? null,
      estNoticed: !!input.estNoticed,
      ...res,
      // 예약 일시가 바뀌면 확인·전날 안내를 다시 보낼 수 있게
      ...(moved ? { confirmSentAt: null, reminderSentAt: null } : {}),
      updatedAt: now,
    })
    .where(eq(consultation.id, id));
  await writeAudit(db, { actorId, action: "consult.update", entityType: "consultation", entityId: c.docNo, before: { result: c.result, reservedAt: c.reservedAt }, after: { result: res.result, reservedAt: res.reservedAt } });
}

async function getConsultRow(db: Db, id: string) {
  const [c] = await db.select().from(consultation).where(eq(consultation.id, id));
  if (!c) throw new CustomerError("없는 상담입니다");
  return c;
}

export async function getConsultation(db: Db, id: string) {
  const c = await getConsultRow(db, id);
  const [cu] = await db.select().from(customer).where(eq(customer.id, c.customerId));
  const [v] = c.vehicleId ? await db.select().from(vehicle).where(eq(vehicle.id, c.vehicleId)) : [];
  const [adv] = c.advisorId ? await db.select({ name: appUser.name }).from(appUser).where(eq(appUser.id, c.advisorId)) : [];
  const [from] = c.fromId ? await db.select({ id: consultation.id, docNo: consultation.docNo }).from(consultation).where(eq(consultation.id, c.fromId)) : [];
  const vehicles = await db.select().from(vehicle).where(eq(vehicle.customerId, c.customerId));
  return { ...c, customer: { id: cu.id, name: cu.name, phone: cu.phoneMasked, hasPhone: !!cu.phoneEnc }, vehicle: v ?? null, vehicles, advisor: adv?.name ?? null, from: from ?? null, consent: await consentState(db, c.customerId) };
}

export async function markReplied(db: Db, actorId: string, id: string, now = new Date()) {
  const c = await getConsultRow(db, id);
  if (c.repliedAt) return;
  await db.update(consultation).set({ repliedAt: now, updatedAt: now }).where(eq(consultation.id, id));
  await writeAudit(db, { actorId, action: "consult.replied", entityType: "consultation", entityId: c.docNo });
}

export type ConsultFilter = "active" | "reservations" | "due" | "all";

/** 상담 목록. 표시: 회신 기한 지남, 재연락 날 됨, 오늘 예약 */
export async function listConsultations(db: Db, filter: ConsultFilter, now = new Date(), q?: string, date?: string) {
  const today = seoulDate(now);
  const conds = [];
  if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) conds.push(eq(consultation.result, "reserved"), gte(consultation.reservedAt, seoulDateTime(date, "00:00")), lt(consultation.reservedAt, seoulDateTime(addDays(date, 1), "00:00")));
  if (filter === "active") conds.push(inArray(consultation.result, ["open", "reserved", "recontact"]));
  if (filter === "reservations") conds.push(eq(consultation.result, "reserved"), gte(consultation.reservedAt, seoulDateTime(today, "00:00")));
  if (filter === "due")
    conds.push(
      or(
        and(eq(consultation.result, "recontact"), lte(consultation.recontactOn, today)),
        and(isNull(consultation.repliedAt), lt(consultation.replyDue, today), inArray(consultation.result, ["open", "recontact"])),
        and(eq(consultation.result, "reserved"), lt(consultation.reservedAt, seoulDateTime(today, "00:00"))),
      )!,
    );
  if (q?.trim()) {
    const ids = (await searchCustomers(db, q, 100)).map((c) => c.id);
    const s = q.trim();
    conds.push(ids.length ? or(inArray(consultation.customerId, ids), ilike(consultation.docNo, `%${s}%`))! : ilike(consultation.docNo, `%${s}%`));
  }
  const rows = await db
    .select({
      id: consultation.id,
      docNo: consultation.docNo,
      at: consultation.at,
      channel: consultation.channel,
      result: consultation.result,
      reservedAt: consultation.reservedAt,
      recontactOn: consultation.recontactOn,
      replyDue: consultation.replyDue,
      repliedAt: consultation.repliedAt,
      insurance: consultation.insurance,
      damageTypes: consultation.damageTypes,
      damageParts: consultation.damageParts,
      confirmSentAt: consultation.confirmSentAt,
      customerId: customer.id,
      customerName: customer.name,
      phone: customer.phoneMasked,
      plateNo: vehicle.plateNo,
      model: vehicle.model,
      advisor: appUser.name,
    })
    .from(consultation)
    .innerJoin(customer, eq(customer.id, consultation.customerId))
    .leftJoin(vehicle, eq(vehicle.id, consultation.vehicleId))
    .leftJoin(appUser, eq(appUser.id, consultation.advisorId))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(filter === "reservations" ? asc(consultation.reservedAt) : desc(consultation.at))
    .limit(200);
  return rows.map((r) => ({ ...r, flags: consultFlags(r, today) }));
}

export function consultFlags(r: { result: string; reservedAt: Date | null; recontactOn: string | null; replyDue: string | null; repliedAt: Date | null }, today: string) {
  const f: { tone: "danger" | "warn" | "accent"; label: string }[] = [];
  if (!r.repliedAt && r.replyDue && r.replyDue < today && (r.result === "open" || r.result === "recontact")) f.push({ tone: "danger", label: "회신 기한 지남" });
  else if (!r.repliedAt && r.replyDue && (r.result === "open" || r.result === "recontact")) f.push({ tone: "warn", label: `회신 ${r.replyDue.slice(5)}까지` });
  if (r.result === "recontact" && r.recontactOn && r.recontactOn <= today) f.push({ tone: "warn", label: "재연락할 날" });
  if (r.result === "reserved" && r.reservedAt) {
    const d = seoulParts(r.reservedAt).date;
    if (d === today) f.push({ tone: "accent", label: "오늘 입고" });
    else if (d < today) f.push({ tone: "danger", label: "예약일 지남(입고·취소 확인)" });
  }
  return f;
}

/** 앞으로 days 일의 날짜별 예약 수와 한도 */
export async function reservationCalendar(db: Db, days = 14, now = new Date()) {
  const today = seoulDate(now);
  const out = [];
  for (let i = 0; i < days; i++) out.push(await capacity(db, addDays(today, i)));
  return out;
}

// ── 고객 안내 ──
async function phoneForNotice(db: Db, customerId: string) {
  const [c] = await db.select({ enc: customer.phoneEnc, name: customer.name }).from(customer).where(eq(customer.id, customerId));
  if (!c?.enc) throw new CustomerError("이 고객은 연락처가 없습니다(동의 철회 등)");
  return { to: decrypt(c.enc), name: c.name };
}

function noticeVars(c: { reservedAt: Date | null; damageParts: string | null; damageTypes: string[]; insurance: string }, name: string) {
  const what = [c.damageParts, c.damageTypes.join("·")].filter(Boolean).join(" ") || "외관 수리";
  return { 고객명: name, 예약일시: c.reservedAt ? koDateTime(c.reservedAt) : "", 용건: `${what} 입고${c.insurance !== "self" ? `(${INSURANCE_LABEL[c.insurance as keyof typeof INSURANCE_LABEL]})` : ""}` };
}

/** [예약 확인 보내기]: 예약 확인 알림톡(준비 안 됐으면 문자) */
export async function sendReservationConfirm(db: Db, actorId: string, id: string, now = new Date(), f: typeof fetch = fetch) {
  const c = await getConsultRow(db, id);
  if (c.result !== "reserved" || !c.reservedAt) throw new CustomerError("입고 예약된 상담만 예약 확인을 보낼 수 있습니다");
  const p = await phoneForNotice(db, c.customerId);
  const r = await sendNotice(db, { key: "reservation_confirm", to: p.to, vars: noticeVars(c, p.name), purpose: "예약 확인", customerName: p.name, ref: c.docNo, sentBy: actorId }, f);
  if (r.ok) await db.update(consultation).set({ confirmSentAt: now, repliedAt: c.repliedAt ?? now }).where(eq(consultation.id, id));
  return r;
}

/** 주기 작업: 내일 입고 예약에 전날 안내(STD-01 7단계, 전날 16시) */
export async function sendReminders(db: Db, now = new Date(), f: typeof fetch = fetch) {
  const tomorrow = addDays(seoulDate(now), 1);
  const rows = await db
    .select()
    .from(consultation)
    .where(and(eq(consultation.result, "reserved"), isNull(consultation.reminderSentAt), gte(consultation.reservedAt, seoulDateTime(tomorrow, "00:00")), lt(consultation.reservedAt, seoulDateTime(addDays(tomorrow, 1), "00:00"))));
  let ok = 0;
  let fail = 0;
  for (const c of rows) {
    try {
      const p = await phoneForNotice(db, c.customerId);
      const r = await sendNotice(db, { key: "reservation_reminder", to: p.to, vars: noticeVars(c, p.name), purpose: "예약 전날 안내", customerName: p.name, ref: c.docNo, sentBy: null }, f);
      if (r.ok) {
        ok++;
        await db.update(consultation).set({ reminderSentAt: now }).where(eq(consultation.id, c.id));
      } else fail++;
    } catch {
      fail++;
    }
  }
  if (fail) await notifyRole(db, "advisor", `예약 전날 안내 ${fail}건을 보내지 못했습니다. 전화로 안내해 주세요`, `reminder-fail-${tomorrow}`, "/consults?f=reservations");
  return `전날 안내 ${ok}건${fail ? `, 실패 ${fail}건` : ""}`;
}

/** 주기 작업(매일 아침): 재연락할 날·회신 기한 지난 상담을 상담원에게 알림 */
export async function notifyDueConsults(db: Db, now = new Date()) {
  const due = await listConsultations(db, "due", now);
  if (due.length) await notifyRole(db, "advisor", `오늘 챙길 상담 ${due.length}건(재연락·회신 기한·지난 예약)`, `consult-due-${seoulDate(now)}`, "/consults?f=due");
  return `챙길 상담 ${due.length}건`;
}

export const resultLabel = (r: string) => RESULT_LABEL[r as keyof typeof RESULT_LABEL] ?? r;
