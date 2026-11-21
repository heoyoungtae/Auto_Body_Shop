// 내 차 수첩 2단계: 이용 동의, 손님 기록(주유·소모품·비용), 주행거리 도우미, 다가오는 일·알림, 오래 안 쓴 기록 지우기.
// 손님 기록은 손님 것이다. 정비소는 주행거리만 참고로 본다(carbookMileage). 금액·장소는 사내 화면에 나가지 않는다.
// 앞선 값 불러오기: 차·연료·주유소는 지난 기록, 주행거리는 정비소 확인 값과 손님 기록으로 짐작한 오늘 값을 미리 채운다.
import { and, desc, eq, inArray, isNotNull, isNull, lt, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { carbookAlertLog, carbookCar, carbookConsent, carbookEntry, carbookPref, carbookSold, customer, repairOrder, repairStatement, vehicle } from "@/db/schema";
import { warrantyState, type Warranty } from "@/modules/cs/rules";
import { phoneForNotice } from "@/modules/customer/service";
import { sendNotice, sendSecretSms } from "@/modules/messaging/service";
import { writeAudit } from "@/modules/platform/audit";
import { addDays, seoulDate } from "@/modules/platform/time";
import { carbookConfig, CarbookError, endAllSessions, makeLink, type MySession } from "./service";
import {
  addMonths,
  ALERTS,
  alertOn,
  CARBOOK_CONSENT_VERSION,
  daysLeft,
  ENTRY_KIND_LABEL,
  FEES,
  fuelEconomy,
  fuelFill,
  FUELS,
  IDLE_PURGE,
  itemDue,
  ITEMS,
  mileageGuess,
  nextInspection,
  nextYearly,
  subLabel,
  type AlertKind,
  type EntryKind,
} from "./rules";

type Meta = { ip?: string | null };

const mustFull = (s: MySession) => {
  if (s.scope !== "full") throw new CarbookError("내 기록은 휴대폰 문자 인증으로 들어와야 볼 수 있습니다");
};

// ── 이용 동의 ──
export async function consentState(db: Db, customerId: string) {
  const [r] = await db.select().from(carbookConsent).where(eq(carbookConsent.customerId, customerId)).orderBy(desc(carbookConsent.at)).limit(1);
  return { agreed: !!r?.agreed, at: r?.at ?? null, version: r?.version ?? null };
}

/** 동의하기·철회하기. 철회하면 손님 기록·보험 만기일·알림 설정을 바로 지운다 */
export async function setConsent(db: Db, s: MySession, agreed: boolean, meta: Meta = {}, now = new Date()) {
  mustFull(s);
  let deleted = 0;
  if (!agreed) deleted = await wipeRecords(db, s.customerId);
  await db.insert(carbookConsent).values({ customerId: s.customerId, version: CARBOOK_CONSENT_VERSION, agreed, ip: meta.ip ?? null, at: now });
  await writeAudit(db, { actorId: null, action: "carbook.consent", entityType: "customer", entityId: s.customerId, after: { agreed, version: CARBOOK_CONSENT_VERSION, deleted } });
  return { deleted };
}

/** 손님이 적은 것을 모두 지운다(철회·그만 쓰기·3년 미접속·연락처 파기) */
async function wipeRecords(db: Db, customerId: string) {
  const gone = await db.delete(carbookEntry).where(eq(carbookEntry.customerId, customerId)).returning({ id: carbookEntry.id });
  await db.delete(carbookCar).where(eq(carbookCar.customerId, customerId));
  await db.delete(carbookPref).where(eq(carbookPref.customerId, customerId));
  return gone.length;
}

/** 그만 쓰기: 기록을 지우고 동의를 철회한 뒤 모든 기기에서 나간다. 수리 기록(정비소 전표)은 법정 보관 기간대로 남는다 */
export async function leaveCarbook(db: Db, s: MySession, meta: Meta = {}, now = new Date()) {
  const { deleted } = await setConsent(db, s, false, meta, now);
  await endAllSessions(db, s.customerId);
  await db.update(customer).set({ carbookAt: null, carbookSeenAt: null }).where(eq(customer.id, s.customerId));
  return { deleted };
}

// ── 내 차·주행거리 ──
type Car = { id: string; plateNo: string; name: string; bodyType: string | null; registeredOn: string | null; mileage: number | null; mileageOn: string | null };
const carName = (v: { maker: string | null; model: string | null; generation: string | null }) => [v.maker, v.model, v.generation].filter(Boolean).join(" ");

async function myCars(db: Db, customerId: string): Promise<Car[]> {
  const sold = new Set((await db.select({ v: carbookSold.vehicleId }).from(carbookSold).where(eq(carbookSold.customerId, customerId))).map((r) => r.v));
  return (await db.select().from(vehicle).where(eq(vehicle.customerId, customerId)).orderBy(vehicle.createdAt))
    .filter((v) => !sold.has(v.id))
    .map((v) => ({ id: v.id, plateNo: v.plateNo, name: carName(v), bodyType: v.bodyType, registeredOn: v.registeredOn, mileage: v.mileage, mileageOn: v.mileageOn }));
}

type EntryRow = typeof carbookEntry.$inferSelect;

function guessFor(car: Car, entries: EntryRow[], today: string) {
  const pts = entries.filter((e) => e.vehicleId === car.id && e.mileage != null).map((e) => ({ on: e.on, km: e.mileage! }));
  if (car.mileage != null && car.mileageOn) pts.push({ on: car.mileageOn, km: car.mileage });
  return mileageGuess(pts, today);
}

// ── 다가오는 일(홈·알림 같이 씀) ──
export type Upcoming = { key: string; kind: AlertKind; vehicleId: string; plateNo: string; title: string; date: string; line: string; sendFrom: string; sendUntil: string; href: string };

async function upcomingFor(db: Db, customerId: string, today: string): Promise<Upcoming[]> {
  const [cars, entries, cars2, ros] = await Promise.all([
    myCars(db, customerId),
    db.select().from(carbookEntry).where(eq(carbookEntry.customerId, customerId)).orderBy(desc(carbookEntry.on), desc(carbookEntry.createdAt)),
    db.select().from(carbookCar).where(eq(carbookCar.customerId, customerId)),
    db
      .select({ id: repairOrder.id, vehicleId: repairOrder.vehicleId, snapshot: repairStatement.snapshot })
      .from(repairOrder)
      .innerJoin(repairStatement, eq(repairStatement.repairOrderId, repairOrder.id))
      .where(and(eq(repairOrder.customerId, customerId), eq(repairOrder.status, "delivered"))),
  ]);
  const out: Upcoming[] = [];
  for (const c of cars) {
    const insp = nextInspection(c.registeredOn, c.bodyType, today);
    if (insp)
      out.push({
        key: `insp:${c.id}:${insp.end}`,
        kind: "inspection",
        vehicleId: c.id,
        plateNo: c.plateNo,
        title: "자동차 정기검사",
        date: insp.from,
        line: `${c.plateNo} 정기검사 기간: ${insp.from} ~ ${insp.until}`,
        sendFrom: insp.from,
        sendUntil: insp.end,
        href: "/my/log",
      });
    const ins = nextYearly(cars2.find((x) => x.vehicleId === c.id)?.insuranceUntil ?? null, today);
    if (ins)
      out.push({ key: `ins:${c.id}:${ins}`, kind: "insurance", vehicleId: c.id, plateNo: c.plateNo, title: "자동차 보험 만기", date: ins, line: `${c.plateNo} 자동차 보험 만기 ${ins}`, sendFrom: addDays(ins, -30), sendUntil: ins, href: "/my/log" });
    const g = guessFor(c, entries, today);
    const seen = new Set<string>();
    for (const e of entries.filter((x) => x.vehicleId === c.id && x.kind === "item" && x.sub)) {
      if (seen.has(e.sub!)) continue; // 품목마다 가장 최근 기록만
      seen.add(e.sub!);
      const due = itemDue(e, g?.perDay ?? 40);
      if (!due) continue;
      const name = subLabel("item", e.sub);
      out.push({
        key: `item:${e.id}`,
        kind: "items",
        vehicleId: c.id,
        plateNo: c.plateNo,
        title: `${name} 교체`,
        date: due.date,
        line: `${c.plateNo} ${name} 교체 때: ${due.date}쯤${due.km ? `(약 ${due.km.toLocaleString("ko-KR")}km)` : ""}`,
        sendFrom: addDays(due.date, -14),
        sendUntil: addDays(due.date, 60),
        href: "/my/log",
      });
    }
  }
  for (const r of ros) {
    const plate = cars.find((c) => c.id === r.vehicleId)?.plateNo;
    if (!plate) continue;
    for (const w of warrantyState((r.snapshot as { warranty?: Warranty[] })?.warranty, today).live)
      out.push({ key: `warr:${r.id}:${w.kind}:${w.until}`, kind: "warranty", vehicleId: r.vehicleId, plateNo: plate, title: `${w.kind} 보증 끝`, date: w.until, line: `${plate} ${w.kind} 보증이 ${w.until}에 끝납니다. 이상이 있으면 그 전에 보증 신청을 눌러 주세요`, sendFrom: addDays(w.until, -30), sendUntil: w.until, href: `/my/warranty/${r.id}` });
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : 1));
}

/** 홈 '다가오는 일': 60일 안(지난 소모품 포함). 동의가 없으면 빈 목록 */
export async function myUpcoming(db: Db, s: MySession, now = new Date()) {
  type Row = Upcoming & { left: number };
  if (s.scope !== "full") return { consent: false, list: [] as Row[], next: null as Row | null };
  const today = seoulDate(now);
  const c = await consentState(db, s.customerId);
  if (!c.agreed) return { consent: false, list: [] as Row[], next: null as Row | null };
  const all = (await upcomingFor(db, s.customerId, today)).filter((u) => u.sendUntil >= today).map((u) => ({ ...u, left: daysLeft(u.date, today) }));
  const list = all.filter((u) => u.left <= 60);
  return { consent: true, list, next: list.length ? null : (all[0] ?? null) };
}

// ── 내 기록 화면 ──
export async function myLog(db: Db, s: MySession, carId: string | null, now = new Date()) {
  mustFull(s);
  const today = seoulDate(now);
  const consent = await consentState(db, s.customerId);
  const cars = await myCars(db, s.customerId);
  const car = cars.find((c) => c.id === carId) ?? cars[0] ?? null;
  if (!consent.agreed || !car) return { consent, cars, car, entries: [], guess: null, economy: null, months: [], insuranceUntil: null, items: [] };
  const [entries, [cc]] = await Promise.all([
    db.select().from(carbookEntry).where(and(eq(carbookEntry.customerId, s.customerId), eq(carbookEntry.vehicleId, car.id))).orderBy(desc(carbookEntry.on), desc(carbookEntry.createdAt)),
    db.select().from(carbookCar).where(and(eq(carbookCar.customerId, s.customerId), eq(carbookCar.vehicleId, car.id))),
  ]);
  const guess = guessFor(car, entries, today);
  // 최근 6달 비용(달마다·종류마다)
  const months = Array.from({ length: 6 }, (_, i) => addMonths(`${today.slice(0, 7)}-01`, -i).slice(0, 7));
  const sums = months.map((m) => {
    const rows = entries.filter((e) => e.on.startsWith(m));
    const byKind = Object.fromEntries((Object.keys(ENTRY_KIND_LABEL) as EntryKind[]).map((k) => [k, rows.filter((r) => r.kind === k).reduce((a, r) => a + (r.amountWon ?? 0), 0)]));
    return { month: m, total: rows.reduce((a, r) => a + (r.amountWon ?? 0), 0), byKind };
  });
  const year = entries.filter((e) => e.on > addMonths(today, -12));
  const fuelRows = year.filter((e) => e.kind === "fuel");
  const items = Object.entries(ITEMS)
    .filter(([k]) => k !== "etc")
    .map(([k, v]) => {
      const last = entries.find((e) => e.kind === "item" && e.sub === k);
      const due = last ? itemDue(last, guess?.perDay ?? 40) : null;
      return { key: k, label: v.label, last: last ? { on: last.on, mileage: last.mileage } : null, due };
    });
  return {
    consent,
    cars,
    car,
    entries: entries.slice(0, 100).map((e) => ({ ...e, label: subLabel(e.kind, e.sub), qty: e.qtyX100 != null ? e.qtyX100 / 100 : null, qtyUnit: e.kind === "fuel" ? (FUELS[e.sub as keyof typeof FUELS]?.unit ?? "L") : null })),
    total: entries.length,
    guess,
    economy: fuelEconomy(fuelRows),
    yearCost: year.reduce((a, r) => a + (r.amountWon ?? 0), 0),
    months: sums,
    insuranceUntil: nextYearly(cc?.insuranceUntil ?? null, today),
    items,
  };
}

/** 새 기록 칸에 미리 넣을 값: 지난 기록(같은 종류)의 연료·장소·단가, 짐작한 오늘 주행거리, 소모품 기본 주기. copy 면 그 줄 값 그대로 */
export async function entryDefaults(db: Db, s: MySession, q: { car?: string | null; kind?: string | null; sub?: string | null; copy?: string | null }, now = new Date()) {
  mustFull(s);
  const today = seoulDate(now);
  if (!(await consentState(db, s.customerId)).agreed) throw new CarbookError("먼저 '내 기록' 이용에 동의해 주세요");
  const cars = await myCars(db, s.customerId);
  if (!cars.length) throw new CarbookError("내 차가 없습니다");
  const all = await db.select().from(carbookEntry).where(eq(carbookEntry.customerId, s.customerId)).orderBy(desc(carbookEntry.on), desc(carbookEntry.createdAt));
  const copy = q.copy ? all.find((e) => e.id === q.copy) : undefined;
  const car = cars.find((c) => c.id === (copy?.vehicleId ?? q.car)) ?? cars.find((c) => c.id === all[0]?.vehicleId) ?? cars[0];
  const kind = (copy?.kind ?? (q.kind && q.kind in ENTRY_KIND_LABEL ? q.kind : "fuel")) as EntryKind;
  const mine = all.filter((e) => e.vehicleId === car.id);
  const sameKind = mine.find((e) => e.kind === kind && (!q.sub || e.sub === q.sub));
  const sub = copy?.sub ?? q.sub ?? (kind === "fuel" ? (sameKind?.sub ?? "gasoline") : kind === "item" ? "oil" : kind === "fee" ? "insurance" : null);
  const guess = guessFor(car, mine, today);
  const base = kind === "item" && sub ? ITEMS[sub as keyof typeof ITEMS] : null;
  const from = copy ? "복사한 기록" : sameKind ? `지난 ${subLabel(kind, sameKind.sub)} 기록(${sameKind.on})` : null;
  const [cc] = await db.select().from(carbookCar).where(and(eq(carbookCar.customerId, s.customerId), eq(carbookCar.vehicleId, car.id)));
  return {
    cars: cars.map((c) => ({ id: c.id, label: `${c.plateNo} ${c.name}` })),
    car: car.id,
    kind,
    sub,
    on: today,
    mileage: guess?.km ?? null,
    mileageFrom: guess ? (guess.last.on === today ? "오늘 기록" : `${guess.last.on} ${guess.last.km.toLocaleString("ko-KR")}km 기록과 하루 평균 ${guess.perDay}km`) : null,
    place: copy?.place ?? (kind === "fuel" || kind === "wash" ? (sameKind?.place ?? "") : ""),
    unitPrice: copy?.unitPrice ?? (kind === "fuel" ? (sameKind?.unitPrice ?? null) : null),
    amount: copy?.amountWon ?? null,
    qty: copy?.qtyX100 != null ? copy.qtyX100 / 100 : null,
    intervalKm: copy?.intervalKm ?? base?.km ?? null,
    intervalMonths: copy?.intervalMonths ?? base?.months ?? null,
    memo: copy?.memo ?? "",
    insuranceUntil: cc?.insuranceUntil ?? null,
    from,
  };
}

export type EntryInput = {
  vehicleId: string;
  kind: string;
  sub: string | null;
  on: string;
  mileage: number | null;
  amount: number | null;
  qty: number | null;
  unitPrice: number | null;
  place: string;
  memo: string;
  intervalKm: number | null;
  intervalMonths: number | null;
  insuranceUntil: string | null;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const nonNeg = (n: number | null, max: number, what: string) => {
  if (n == null) return null;
  if (!Number.isFinite(n) || n < 0 || n > max) throw new CarbookError(`${what}을(를) 확인해 주세요`);
  return n;
};

export async function addEntry(db: Db, s: MySession, input: EntryInput, now = new Date()) {
  mustFull(s);
  const today = seoulDate(now);
  if (!(await consentState(db, s.customerId)).agreed) throw new CarbookError("먼저 '내 기록' 이용에 동의해 주세요");
  const cars = await myCars(db, s.customerId);
  if (!cars.some((c) => c.id === input.vehicleId)) throw new CarbookError("내 차를 골라 주세요");
  if (!(input.kind in ENTRY_KIND_LABEL)) throw new CarbookError("무엇을 적을지 골라 주세요");
  const kind = input.kind as EntryKind;
  const subOk = kind === "fuel" ? input.sub && input.sub in FUELS : kind === "item" ? input.sub && input.sub in ITEMS : kind === "fee" ? input.sub && input.sub in FEES : true;
  if (!subOk) throw new CarbookError("종류를 골라 주세요");
  if (!DATE_RE.test(input.on) || input.on > today || input.on < "2000-01-01") throw new CarbookError("날짜를 확인해 주세요(오늘까지)");
  const mileage = nonNeg(input.mileage, 2_000_000, "주행거리");
  let amount = nonNeg(input.amount, 100_000_000, "금액");
  let qty = nonNeg(input.qty, 100_000, "넣은 양");
  let unit = nonNeg(input.unitPrice, 100_000, "단가");
  if (kind === "fuel") {
    ({ amount, qty, unit } = fuelFill({ amount, qty, unit }));
    if (amount == null && qty == null) throw new CarbookError("금액·넣은 양·단가 중 두 가지를 넣어 주세요(나머지는 계산합니다)");
  } else if (amount == null && kind !== "item") throw new CarbookError("금액을 넣어 주세요");
  // 주행거리가 지난 기록보다 크게 줄면 잘못 친 것일 수 있다(10km 넘게 줄면 막음)
  if (mileage != null) {
    const [prev] = await db
      .select({ km: carbookEntry.mileage, on: carbookEntry.on })
      .from(carbookEntry)
      .where(and(eq(carbookEntry.customerId, s.customerId), eq(carbookEntry.vehicleId, input.vehicleId), isNotNull(carbookEntry.mileage), lt(carbookEntry.on, input.on)))
      .orderBy(desc(carbookEntry.on))
      .limit(1);
    if (prev?.km != null && mileage < prev.km - 10) throw new CarbookError(`주행거리가 ${prev.on} 기록(${prev.km.toLocaleString("ko-KR")}km)보다 적습니다. 숫자를 확인해 주세요`);
  }
  const [row] = await db
    .insert(carbookEntry)
    .values({
      customerId: s.customerId,
      vehicleId: input.vehicleId,
      kind,
      sub: kind === "wash" || kind === "other" ? null : input.sub,
      on: input.on,
      mileage,
      amountWon: amount == null ? null : Math.round(amount),
      qtyX100: qty == null ? null : Math.round(qty * 100),
      unitPrice: unit == null ? null : Math.round(unit),
      place: input.place.trim().slice(0, 60) || null,
      memo: input.memo.trim().slice(0, 200) || null,
      intervalKm: kind === "item" ? nonNeg(input.intervalKm, 500_000, "교체 주기(km)") : null,
      intervalMonths: kind === "item" ? nonNeg(input.intervalMonths, 240, "교체 주기(개월)") : null,
      createdAt: now,
    })
    .returning({ id: carbookEntry.id });
  // 보험 기록에 만기일을 넣으면 그 차의 보험 만기 알림도 바뀐다
  if (kind === "fee" && input.sub === "insurance" && input.insuranceUntil) await saveInsurance(db, s, input.vehicleId, input.insuranceUntil, now);
  return row.id;
}

export async function deleteEntry(db: Db, s: MySession, id: string) {
  mustFull(s);
  const gone = await db.delete(carbookEntry).where(and(eq(carbookEntry.id, id), eq(carbookEntry.customerId, s.customerId))).returning({ id: carbookEntry.id });
  if (!gone.length) throw new CarbookError("지울 기록을 찾을 수 없습니다");
}

export async function saveInsurance(db: Db, s: MySession, vehicleId: string, until: string | null, now = new Date()) {
  mustFull(s);
  if (!(await consentState(db, s.customerId)).agreed) throw new CarbookError("먼저 '내 기록' 이용에 동의해 주세요");
  if (until && !DATE_RE.test(until)) throw new CarbookError("보험 만기일을 확인해 주세요");
  if (!(await myCars(db, s.customerId)).some((c) => c.id === vehicleId)) throw new CarbookError("내 차가 아닙니다");
  await db
    .insert(carbookCar)
    .values({ customerId: s.customerId, vehicleId, insuranceUntil: until, updatedAt: now })
    .onConflictDoUpdate({ target: [carbookCar.customerId, carbookCar.vehicleId], set: { insuranceUntil: until, updatedAt: now } });
}

// ── 알림 설정 ──
export async function myPrefs(db: Db, s: MySession) {
  const [r] = await db.select().from(carbookPref).where(eq(carbookPref.customerId, s.customerId));
  const cars = s.scope === "full" ? await myCars(db, s.customerId) : [];
  const ins = s.scope === "full" ? await db.select().from(carbookCar).where(eq(carbookCar.customerId, s.customerId)) : [];
  return {
    alerts: Object.fromEntries((Object.keys(ALERTS) as AlertKind[]).map((k) => [k, alertOn(r?.alerts, k)])) as Record<AlertKind, boolean>,
    cars: cars.map((c) => ({ id: c.id, plateNo: c.plateNo, name: c.name, insuranceUntil: ins.find((x) => x.vehicleId === c.id)?.insuranceUntil ?? null, registeredOn: c.registeredOn })),
  };
}

export async function savePrefs(db: Db, s: MySession, on: string[], now = new Date()) {
  mustFull(s);
  if (!(await consentState(db, s.customerId)).agreed) throw new CarbookError("먼저 '내 기록' 이용에 동의해 주세요");
  const alerts = Object.fromEntries((Object.keys(ALERTS) as AlertKind[]).map((k) => [k, on.includes(k)]));
  await db.insert(carbookPref).values({ customerId: s.customerId, alerts, updatedAt: now }).onConflictDoUpdate({ target: carbookPref.customerId, set: { alerts, updatedAt: now } });
}

// ── 정비소 쪽: 주행거리만 ──
/** 고객 화면·상담·입고 참고용: 손님이 적은 가장 최근 주행거리(차마다). 금액·장소는 내보내지 않는다 */
export async function carbookMileage(db: Db, customerId: string) {
  const rows = await db
    .select({ vehicleId: carbookEntry.vehicleId, km: carbookEntry.mileage, on: carbookEntry.on, plateNo: vehicle.plateNo })
    .from(carbookEntry)
    .innerJoin(vehicle, eq(vehicle.id, carbookEntry.vehicleId))
    .where(and(eq(carbookEntry.customerId, customerId), isNotNull(carbookEntry.mileage)))
    .orderBy(desc(carbookEntry.on), desc(carbookEntry.mileage));
  const seen = new Set<string>();
  return rows.filter((r) => (seen.has(r.vehicleId) ? false : (seen.add(r.vehicleId), true))).map((r) => ({ vehicleId: r.vehicleId, plateNo: r.plateNo, km: r.km!, on: r.on }));
}

// ── 주기 작업 ──
/**
 * 매일 16:00: 동의한 손님에게 다가오는 일 알림(정기검사·보증·소모품·보험). 손님마다 한 통으로 묶고,
 * 같은 알림은 한 번만(carbook_alert_log). 알림톡 템플릿 'carbook_reminder' 가 준비 안 됐으면 문자로 간다.
 */
export async function carbookAlertsJob(db: Db, now = new Date(), f: typeof fetch = fetch) {
  if (!(await carbookConfig(db)).enabled) return "내 차 수첩 알림: 꺼짐";
  const today = seoulDate(now);
  const users = await db
    .select({ id: customer.id })
    .from(customer)
    .where(and(isNotNull(customer.carbookAt), isNull(customer.purgedAt), isNotNull(customer.phoneEnc)));
  let sent = 0;
  let failed = 0;
  for (const u of users) {
    if (!(await consentState(db, u.id)).agreed) continue;
    const [pref] = await db.select().from(carbookPref).where(eq(carbookPref.customerId, u.id));
    const due = (await upcomingFor(db, u.id, today)).filter((x) => alertOn(pref?.alerts, x.kind) && x.sendFrom <= today && today <= x.sendUntil);
    if (!due.length) continue;
    const done = new Set(
      (await db.select({ key: carbookAlertLog.key }).from(carbookAlertLog).where(and(eq(carbookAlertLog.customerId, u.id), inArray(carbookAlertLog.key, due.map((d) => d.key))))).map((r) => r.key),
    );
    const fresh = due.filter((d) => !done.has(d.key));
    if (!fresh.length) continue;
    const p = await phoneForNotice(db, u.id).catch(() => null);
    if (!p) continue;
    const { url, token } = await makeLink(db, u.id, null, now);
    const r = await sendNotice(db, { key: "carbook_reminder", to: p.to, vars: { 고객명: p.name, 안내내용: fresh.map((d) => `· ${d.line}`).join("\n"), 수첩링크: url }, purpose: "내 차 수첩 알림", customerName: p.name, sentBy: null, secret: token }, f);
    await db
      .insert(carbookAlertLog)
      .values(fresh.map((d) => ({ customerId: u.id, key: d.key, kind: d.kind, ok: r.ok, sentAt: now })))
      .onConflictDoNothing();
    if (r.ok) sent++;
    else failed++;
  }
  return `내 차 수첩 알림 ${sent}명${failed ? `(실패 ${failed})` : ""}`;
}

/**
 * 매일 07:00: 오래 안 쓴 손님 기록 지우기. 마지막 접속 뒤 3년이 되기 30일 전에 문자로 한 번 알리고, 3년이 되면 지운다.
 * 연락처를 파기한 고객(필수 동의 철회 등)의 기록은 바로 지운다.
 */
export async function carbookIdleJob(db: Db, now = new Date(), f: typeof fetch = fetch) {
  const today = seoulDate(now);
  const owners = await db.selectDistinct({ id: carbookEntry.customerId }).from(carbookEntry);
  if (!owners.length) return "내 차 수첩 기록 정리: 없음";
  const rows = await db
    .select({ id: customer.id, seen: customer.carbookSeenAt, purged: customer.purgedAt, name: customer.name })
    .from(customer)
    .where(inArray(customer.id, owners.map((o) => o.id)));
  let wiped = 0;
  let warned = 0;
  for (const c of rows) {
    const seen = c.seen ? seoulDate(c.seen) : null;
    const cutoff = seen ? addMonths(seen, IDLE_PURGE.years * 12) : null;
    if (c.purged || (cutoff && cutoff <= today)) {
      await wipeRecords(db, c.id);
      await writeAudit(db, { actorId: null, action: "carbook.purge", entityType: "customer", entityId: c.id, after: { reason: c.purged ? "연락처 파기" : `${IDLE_PURGE.years}년 미접속` } });
      wiped++;
      continue;
    }
    if (cutoff && addDays(cutoff, -IDLE_PURGE.noticeDays) <= today) {
      const key = `idle:${seen}`;
      const [dup] = await db.select({ id: carbookAlertLog.id }).from(carbookAlertLog).where(and(eq(carbookAlertLog.customerId, c.id), eq(carbookAlertLog.key, key)));
      if (dup) continue;
      const p = await phoneForNotice(db, c.id).catch(() => null);
      if (!p) continue;
      const { url, token } = await makeLink(db, c.id, null, now);
      const text = `${p.name} 고객님, '내 차 수첩'에 ${IDLE_PURGE.years}년 가까이 들어오지 않으셔서 ${cutoff}에 직접 적으신 기록(주유·소모품·비용)을 지웁니다. 계속 쓰시려면 그 전에 한 번 들어와 주세요.\n${url}\n수리 기록과 서류는 지워지지 않습니다.`;
      const r = await sendSecretSms(db, { to: p.to, text, secret: token, purpose: "내 차 수첩 기록 정리 안내", customerName: p.name }, f);
      await db.insert(carbookAlertLog).values({ customerId: c.id, key, kind: "idle", ok: r.ok, sentAt: now }).onConflictDoNothing();
      warned++;
    }
  }
  return `내 차 수첩 기록 정리 ${wiped}명·안내 ${warned}명`;
}

/** 설정 화면 숫자: 이용 동의한 손님, 기록 수 */
export async function carbookLogStats(db: Db) {
  const [[a], [b]] = await Promise.all([
    db.select({ n: sql<number>`count(distinct ${carbookEntry.customerId})::int` }).from(carbookEntry),
    db.select({ n: sql<number>`count(*)::int` }).from(carbookEntry),
  ]);
  return { writers: a?.n ?? 0, entries: b?.n ?? 0 };
}
