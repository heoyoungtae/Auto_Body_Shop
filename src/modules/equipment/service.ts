// 설비 관리(STD-08): 설비 대장·점검·윤활·운전 일지·고장·교정·예방정비
import { and, asc, desc, eq, gte, inArray, isNull, lte, ne } from "drizzle-orm";
import type { Db } from "@/db/client";
import { appUser, equipment, equipmentCalibration, equipmentCheck, equipmentFailure, equipmentRunLog, lubeLog, lubePoint, pmItem, pmPlan, pmTask, type CheckItem, type CheckResult } from "@/db/schema";
import { can } from "@/modules/auth/permissions";
import type { Role } from "@/modules/auth/roles";
import { writeAudit } from "@/modules/platform/audit";
import { nextDocNo } from "@/modules/platform/docno";
import { UserError } from "@/modules/platform/errors";
import { notifyRole, notifyUser } from "@/modules/platform/notify";
import { loadPolicy } from "@/modules/platform/policy";
import { seoulDate } from "@/modules/platform/time";
import { processLabel } from "@/modules/repair/work-rules";
import { issueNc } from "@/modules/quality/nc";
import {
  addDaysIso,
  addMonthsIso,
  checkIssues,
  checkOutcome,
  daysBetween,
  dueState,
  EQ_KINDS,
  FAIL_CAUSES,
  isEqKind,
  isGrade,
  isMark,
  LUBE_STATES,
  lastDay,
  MONTHLY_DEFAULT,
  nextEqNo,
  nextLubeCode,
  pmDueDates,
  pmKpi,
  PREVENTIONS,
  type CheckKind,
} from "./rules";

export class EquipError extends UserError {}
type Actor = { id: string; roles: Role[] };
const clean = (s: string | null | undefined) => (s ?? "").trim() || null;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function must(a: Actor, k: "equip.manage" | "equip.check" | "equip.calibrate" | "pm.approve", msg: string) {
  if (!can(a, k)) throw new EquipError(msg);
}

async function eqRow(db: Db, id: string) {
  const [e] = await db.select().from(equipment).where(eq(equipment.id, id));
  if (!e) throw new EquipError("설비를 찾을 수 없습니다");
  return e;
}

// ───────── 설비 대장(F-08-01) ─────────

export type EquipmentInput = {
  /** 관리자(부). 관리자(정)은 ownerId(설비 담당) */
  subManagerId?: string;
  /** 지출 결의에서 불러와 등록하면 그 결의 */
  expenseId?: string;
  name: string;
  kind: string;
  grade: string;
  model?: string;
  maker?: string;
  makerContact?: string;
  boughtOn?: string;
  price?: number | null;
  zone?: string;
  rating?: string;
  ownerId?: string;
  operators?: string[];
  legalKind?: string;
  legalNextOn?: string;
  manualRef?: string;
  checkDaily: boolean;
  checkMonthly: boolean;
  dailyItems: CheckItem[];
  monthlyItems: CheckItem[];
  processes: string[];
  measureRange?: string;
  tolerance?: string;
  calibMonths?: number | null;
  calibNextOn?: string;
  trialOn?: string;
  note?: string;
};

/** 새 설비 등록 화면의 기본값: 종류별 점검 항목·중요도·공정, 정책값 교정 주기 */
export async function equipmentDefaults(db: Db, kind = "other") {
  const k = isEqKind(kind) ? EQ_KINDS[kind] : EQ_KINDS.other;
  const pol = await loadPolicy(db);
  return { grade: k.grade, dailyItems: [...k.daily], monthlyItems: MONTHLY_DEFAULT, processes: [...k.processes], legalKind: k.legal, calibMonths: kind === "gauge" ? pol["calibration.interval_months"] : null };
}

/** 저장 전 경고(막지는 않음) */
export function equipmentWarnings(i: EquipmentInput): string[] {
  const out: string[] = [];
  if (i.grade === "A" && !i.checkDaily) out.push("A등급 설비는 매일 작업 전 일상 점검을 합니다(5.1)");
  if (i.grade === "A" && !i.ownerId) out.push("A등급 설비는 설비 담당을 정해 두세요");
  if (i.checkDaily && !i.dailyItems.length) out.push("일상 점검 항목이 비었습니다");
  if (!i.trialOn) out.push("사용 전 시운전 확인일이 없습니다(4.6)");
  return out;
}

export async function saveEquipment(db: Db, actor: Actor, input: EquipmentInput, id?: string, now = new Date()) {
  must(actor, "equip.manage", "설비 대장은 공장장(또는 대표)이 씁니다");
  const name = clean(input.name);
  if (!name) throw new EquipError("설비명을 적어 주세요");
  if (!isEqKind(input.kind)) throw new EquipError("설비 종류를 골라 주세요");
  if (!isGrade(input.grade)) throw new EquipError("중요도(A·B·C)를 골라 주세요");
  for (const [d, label] of [
    [input.boughtOn, "구입일"],
    [input.legalNextOn, "다음 법정 검사일"],
    [input.calibNextOn, "다음 교정일"],
    [input.trialOn, "시운전 확인일"],
  ] as const)
    if (d && !DATE.test(d)) throw new EquipError(`${label} 형식을 확인해 주세요`);
  if (clean(input.legalKind) && !input.legalNextOn) throw new EquipError("법정 검사 대상이면 다음 검사일을 적어 주세요");
  if (input.kind === "gauge") {
    if (!input.calibMonths || input.calibMonths < 1) throw new EquipError("측정 장비는 교정 주기(개월)를 적어 주세요");
    if (!input.calibNextOn) throw new EquipError("측정 장비는 다음 교정일을 적어 주세요");
  }
  if (input.checkDaily && !input.dailyItems.length) throw new EquipError("일상 점검을 하면 점검 항목을 한 줄 이상 적어 주세요");
  if (input.checkMonthly && !input.monthlyItems.length) throw new EquipError("월간 점검을 하면 점검 항목을 한 줄 이상 적어 주세요");
  if (input.subManagerId && input.subManagerId === input.ownerId) throw new EquipError("관리자(정)과 (부)는 다른 사람으로 정해 주세요");
  const values = {
    name,
    kind: input.kind,
    grade: input.grade,
    model: clean(input.model),
    maker: clean(input.maker),
    makerContact: clean(input.makerContact),
    boughtOn: clean(input.boughtOn),
    price: input.price ?? null,
    zone: clean(input.zone),
    rating: clean(input.rating),
    ownerId: clean(input.ownerId),
    subManagerId: clean(input.subManagerId),
    operators: input.operators ?? [],
    legalKind: clean(input.legalKind),
    legalNextOn: clean(input.legalKind) ? clean(input.legalNextOn) : null,
    manualRef: clean(input.manualRef),
    checkDaily: input.checkDaily,
    checkMonthly: input.checkMonthly,
    dailyItems: input.dailyItems,
    monthlyItems: input.monthlyItems,
    processes: input.processes,
    measureRange: clean(input.measureRange),
    tolerance: clean(input.tolerance),
    calibMonths: input.calibMonths ?? null,
    calibNextOn: clean(input.calibNextOn),
    trialOn: clean(input.trialOn),
    note: clean(input.note),
    updatedAt: now,
  };
  if (id) {
    const before = await eqRow(db, id);
    if (before.status === "disposed") throw new EquipError("처분한 설비는 고칠 수 없습니다");
    // 관리자(정·부)가 바뀌면 라벨에 이름이 들어가 있으므로 다시 붙인다
    const relabel = (before.ownerId ?? null) !== values.ownerId || (before.subManagerId ?? null) !== values.subManagerId;
    await db.update(equipment).set(relabel ? { ...values, labeledAt: null } : values).where(eq(equipment.id, id));
    await writeAudit(db, { actorId: actor.id, action: "equipment.update", entityType: "equipment", entityId: before.no, after: { name, grade: input.grade } });
    return { id, no: before.no, warnings: equipmentWarnings(input) };
  }
  const nos = await db.select({ no: equipment.no }).from(equipment);
  const no = nextEqNo(nos.map((r) => r.no));
  // 상각 방법은 금액으로 먼저 정한다(산 날 비용 처리 기준 이하 → 비용, 아니면 정책값). 상세 화면에서 바꾼다
  const p = await loadPolicy(db, seoulDate(now));
  const price = input.price ?? 0;
  const dep = { expenseId: clean(input.expenseId), depMethod: price <= p["asset.immediate_max"] ? "expense" : p["asset.dep_declining"] ? "db" : "sl", usefulYears: p["asset.equipment_years"], depStartOn: values.trialOn ?? values.boughtOn };
  const [row] = await db
    .insert(equipment)
    .values({ ...values, ...dep, no, createdBy: actor.id, createdAt: now })
    .returning({ id: equipment.id });
  await writeAudit(db, { actorId: actor.id, action: "equipment.create", entityType: "equipment", entityId: no, after: { name, grade: input.grade } });
  return { id: row.id, no, warnings: equipmentWarnings(input) };
}

export async function disposeEquipment(db: Db, actor: Actor, id: string, reason: string, now = new Date()) {
  must(actor, "equip.manage", "처분은 공장장(또는 대표)이 정합니다");
  const e = await eqRow(db, id);
  if (e.status === "disposed") throw new EquipError("이미 처분한 설비입니다");
  if (!clean(reason)) throw new EquipError("처분 사유를 적어 주세요");
  await db.update(equipment).set({ status: "disposed", disposedOn: seoulDate(now), stopReason: clean(reason), updatedAt: now }).where(eq(equipment.id, id));
  await db.update(lubePoint).set({ active: false }).where(eq(lubePoint.equipmentId, id));
  await writeAudit(db, { actorId: actor.id, action: "equipment.dispose", entityType: "equipment", entityId: e.no, after: { reason } });
}

export async function listEquipment(db: Db, opts: { includeDisposed?: boolean } = {}) {
  const rows = await db
    .select({ e: equipment, ownerName: appUser.name })
    .from(equipment)
    .leftJoin(appUser, eq(appUser.id, equipment.ownerId))
    .where(opts.includeDisposed ? undefined : ne(equipment.status, "disposed"))
    .orderBy(asc(equipment.no));
  return rows.map((r) => ({ ...r.e, ownerName: r.ownerName }));
}

/** 설비 한 대의 모든 기록(이력은 점검·고장·정비·교정에서 모여 보인다) */
export async function getEquipment(db: Db, id: string) {
  const e = await eqRow(db, id);
  const names = new Map((await db.select({ id: appUser.id, name: appUser.name }).from(appUser)).map((u) => [u.id, u.name]));
  const [checks, points, runs, failures, calibrations, tasks] = await Promise.all([
    db.select().from(equipmentCheck).where(eq(equipmentCheck.equipmentId, id)).orderBy(desc(equipmentCheck.checkDate), desc(equipmentCheck.createdAt)).limit(40),
    db.select().from(lubePoint).where(eq(lubePoint.equipmentId, id)).orderBy(asc(lubePoint.code)),
    db.select().from(equipmentRunLog).where(eq(equipmentRunLog.equipmentId, id)).orderBy(desc(equipmentRunLog.logDate), desc(equipmentRunLog.createdAt)).limit(30),
    db.select().from(equipmentFailure).where(eq(equipmentFailure.equipmentId, id)).orderBy(desc(equipmentFailure.occurredAt)),
    db.select().from(equipmentCalibration).where(eq(equipmentCalibration.equipmentId, id)).orderBy(desc(equipmentCalibration.calibratedOn)),
    db
      .select({ t: pmTask, task: pmItem.task, external: pmItem.external })
      .from(pmTask)
      .innerJoin(pmItem, eq(pmItem.id, pmTask.itemId))
      .where(eq(pmItem.equipmentId, id))
      .orderBy(asc(pmTask.dueOn)),
  ]);
  const pointIds = points.map((p) => p.id);
  const lubes = pointIds.length ? await db.select().from(lubeLog).where(inArray(lubeLog.pointId, pointIds)).orderBy(desc(lubeLog.doneOn), desc(lubeLog.createdAt)).limit(40) : [];
  return { e, names, checks, points, lubes, runs, failures, calibrations, tasks: tasks.map((r) => ({ ...r.t, task: r.task, external: r.external })) };
}

// ───────── 점검표(F-08-02) ─────────

/** 점검 저장. × 가 있으면 설비를 '사용 금지'로 바꾸고 고장 기록(F-08-04)을 연다 */
export async function recordCheck(db: Db, actor: Actor, equipmentId: string, input: { kind: CheckKind; date?: string; marks: string[]; notes: string[]; note?: string }, now = new Date()) {
  must(actor, "equip.check", "설비 점검은 기술자·공장장·안전환경·품질 담당이 합니다");
  const e = await eqRow(db, equipmentId);
  if (e.status === "disposed") throw new EquipError("처분한 설비입니다");
  const items = input.kind === "monthly" ? e.monthlyItems : e.dailyItems;
  const date = input.date || seoulDate(now);
  if (!DATE.test(date)) throw new EquipError("점검일 형식을 확인해 주세요");
  if (date > seoulDate(now)) throw new EquipError("앞날 점검은 적을 수 없습니다");
  const results: CheckResult[] = items.map((it, i) => ({ ...it, mark: (isMark(input.marks[i] ?? "") ? input.marks[i] : "") as CheckResult["mark"], note: clean(input.notes[i]) ?? undefined }));
  const issues = checkIssues(results);
  if (issues.length) throw new EquipError(issues.join(" / "));
  const out = checkOutcome(results);
  const [c] = await db
    .insert(equipmentCheck)
    .values({ equipmentId, kind: input.kind, checkDate: date, results, ok: out.ok, idle: out.idle, note: clean(input.note), checkedBy: actor.id, createdAt: now })
    .returning({ id: equipmentCheck.id });
  let failureId: string | null = null;
  if (!out.ok) {
    const symptom = out.bad.map((b) => `${b.item}: ${b.note}`).join(" / ");
    failureId = await openFailure(db, actor, e, { symptom: `[점검 ×] ${symptom}`, checkId: c.id }, now);
  }
  await writeAudit(db, { actorId: actor.id, action: "equipment.check", entityType: "equipment", entityId: e.no, after: { kind: input.kind, date, ok: out.ok } });
  return { id: c.id, ok: out.ok, failureId, warn: out.warn.map((w) => w.item) };
}

async function openFailure(db: Db, actor: Actor, e: typeof equipment.$inferSelect, input: { symptom: string; checkId?: string; occurredAt?: Date }, now: Date) {
  const docNo = await nextDocNo(db, "EF", now);
  const [f] = await db
    .insert(equipmentFailure)
    .values({ docNo, equipmentId: e.id, occurredAt: input.occurredAt ?? now, foundBy: actor.id, symptom: input.symptom, checkId: input.checkId ?? null, createdAt: now })
    .returning({ id: equipmentFailure.id });
  await db
    .update(equipment)
    .set({ status: "stopped", stopReason: `고장 ${docNo}`, stoppedAt: now, updatedAt: now })
    .where(eq(equipment.id, e.id));
  const title = `설비 사용 금지: ${e.no} ${e.name} — ${input.symptom.slice(0, 60)}`;
  await notifyRole(db, "plant_manager", title, `eqfail-${docNo}`, `/equipment/failures/${f.id}`);
  if (e.ownerId && e.ownerId !== actor.id) await notifyUser(db, e.ownerId, title, `eqfail-${docNo}-owner`, `/equipment/failures/${f.id}`);
  await writeAudit(db, { actorId: actor.id, action: "equipment.failure", entityType: "equipment", entityId: e.no, after: { docNo } });
  return f.id;
}

/** 운전 중 이상·고장 신고(8절 이상 운전). 설비는 사용 금지가 된다 */
export async function reportFailure(db: Db, actor: Actor, equipmentId: string, input: { symptom: string; occurredAt?: Date }, now = new Date()) {
  must(actor, "equip.check", "고장 신고는 기술자·공장장·안전환경·품질 담당이 합니다");
  const e = await eqRow(db, equipmentId);
  if (e.status === "disposed") throw new EquipError("처분한 설비입니다");
  const symptom = clean(input.symptom);
  if (!symptom) throw new EquipError("증상을 적어 주세요");
  return openFailure(db, actor, e, { symptom, occurredAt: input.occurredAt }, now);
}

export type FailureInput = { action?: string; external?: boolean; downMinutes?: number | null; parts?: string; cost?: number | null; cause?: string; prevention?: string[]; ncRef?: string };

export async function updateFailure(db: Db, actor: Actor, failureId: string, input: FailureInput) {
  must(actor, "equip.check", "고장 기록은 기술자·공장장·안전환경·품질 담당이 씁니다");
  const [f] = await db.select().from(equipmentFailure).where(eq(equipmentFailure.id, failureId));
  if (!f) throw new EquipError("고장 기록을 찾을 수 없습니다");
  if (f.status === "closed") throw new EquipError("공장장이 확인한 기록은 고칠 수 없습니다");
  if (input.cause && !(input.cause in FAIL_CAUSES)) throw new EquipError("원인을 목록에서 골라 주세요");
  const prevention = (input.prevention ?? []).filter((p) => p in PREVENTIONS);
  // 부적합 보고를 고르면 이 고장으로 F-Q-10을 발행하고 번호를 채운다(이미 있으면 그 번호)
  let ncRef = clean(input.ncRef);
  if (prevention.includes("nc") && !ncRef) {
    const e = await eqRow(db, f.equipmentId);
    ncRef = (await issueNc(db, actor.id, { source: "equipment", refType: "equipment_failure", refId: f.id, refLabel: `${e.no} ${e.name} 고장 ${f.docNo}`, content: f.symptom, immediate: clean(input.action) ?? "설비 사용 금지" })).docNo;
  }
  await db
    .update(equipmentFailure)
    .set({ action: clean(input.action), external: !!input.external, downMinutes: input.downMinutes ?? null, parts: clean(input.parts), cost: input.cost ?? null, cause: clean(input.cause), prevention, ncRef })
    .where(eq(equipmentFailure.id, failureId));
}

/** 공장장 확인: 조치·원인·정지 시간이 있어야 한다. 남은 고장이 없으면 설비를 다시 쓴다. 같은 설비 분기 2회째면 원인 분석 알림(9.6) */
export async function closeFailure(db: Db, actor: Actor, failureId: string, now = new Date()) {
  must(actor, "equip.manage", "고장 기록 확인과 사용 재개는 공장장(또는 대표)이 합니다");
  const [f] = await db.select().from(equipmentFailure).where(eq(equipmentFailure.id, failureId));
  if (!f) throw new EquipError("고장 기록을 찾을 수 없습니다");
  if (f.status === "closed") throw new EquipError("이미 확인한 기록입니다");
  const missing = [!f.action && "조치", !f.cause && "원인", f.downMinutes == null && "정지 시간", !f.prevention.length && "재발 방지"].filter(Boolean);
  if (missing.length) throw new EquipError(`확인 전에 적을 것: ${missing.join(", ")}`);
  await db.update(equipmentFailure).set({ status: "closed", closedBy: actor.id, closedAt: now }).where(eq(equipmentFailure.id, failureId));
  const e = await eqRow(db, f.equipmentId);
  const open = await db.select({ id: equipmentFailure.id }).from(equipmentFailure).where(and(eq(equipmentFailure.equipmentId, e.id), eq(equipmentFailure.status, "open")));
  let resumed = false;
  if (!open.length && e.status === "stopped" && e.stopReason?.startsWith("고장")) {
    await db.update(equipment).set({ status: "in_use", stopReason: null, stoppedAt: null, updatedAt: now }).where(eq(equipment.id, e.id));
    resumed = true;
  }
  const today = seoulDate(now);
  const qStart = `${today.slice(0, 4)}-${String(Math.floor((+today.slice(5, 7) - 1) / 3) * 3 + 1).padStart(2, "0")}-01`;
  const inQuarter = (await db.select({ at: equipmentFailure.occurredAt }).from(equipmentFailure).where(eq(equipmentFailure.equipmentId, e.id))).filter((r) => seoulDate(r.at) >= qStart).length;
  const repeat = inQuarter >= 2;
  if (repeat) await notifyRole(db, "plant_manager", `${e.no} ${e.name} 이번 분기 고장 ${inQuarter}회: 원인 분석 후 정비 주기·항목을 조정하세요(14일 안)`, `eqrepeat-${e.id}-${qStart}-${inQuarter}`, `/equipment/${e.id}`);
  await writeAudit(db, { actorId: actor.id, action: "equipment.failure.close", entityType: "equipment", entityId: f.docNo, after: { resumed } });
  return { resumed, repeat, inQuarter };
}

/** 고장이 아닌 사유(교정 불합격 등)로 멈춘 설비를 다시 쓰기 */
export async function resumeEquipment(db: Db, actor: Actor, id: string, now = new Date()) {
  must(actor, "equip.manage", "사용 재개는 공장장(또는 대표)이 합니다");
  const e = await eqRow(db, id);
  if (e.status !== "stopped") throw new EquipError("사용 금지 상태가 아닙니다");
  const open = await db.select({ id: equipmentFailure.id }).from(equipmentFailure).where(and(eq(equipmentFailure.equipmentId, id), eq(equipmentFailure.status, "open")));
  if (open.length) throw new EquipError("조치 중인 고장 기록이 있습니다. 고장 기록을 확인하면 다시 쓸 수 있습니다");
  if (e.kind === "gauge" && e.calibNextOn && e.calibNextOn < seoulDate(now)) throw new EquipError("교정 기한이 지났습니다. 교정 합격을 기록하면 다시 쓸 수 있습니다");
  await db.update(equipment).set({ status: "in_use", stopReason: null, stoppedAt: null, updatedAt: now }).where(eq(equipment.id, id));
  await writeAudit(db, { actorId: actor.id, action: "equipment.resume", entityType: "equipment", entityId: e.no });
}

export async function getFailure(db: Db, id: string) {
  const [f] = await db.select().from(equipmentFailure).where(eq(equipmentFailure.id, id));
  if (!f) throw new EquipError("고장 기록을 찾을 수 없습니다");
  const e = await eqRow(db, f.equipmentId);
  const names = new Map((await db.select({ id: appUser.id, name: appUser.name }).from(appUser)).map((u) => [u.id, u.name]));
  return { f, e, names };
}

export async function listOpenFailures(db: Db) {
  return db
    .select({ id: equipmentFailure.id, docNo: equipmentFailure.docNo, symptom: equipmentFailure.symptom, occurredAt: equipmentFailure.occurredAt, eqNo: equipment.no, eqName: equipment.name })
    .from(equipmentFailure)
    .innerJoin(equipment, eq(equipment.id, equipmentFailure.equipmentId))
    .where(eq(equipmentFailure.status, "open"))
    .orderBy(asc(equipmentFailure.occurredAt));
}

// ───────── 운전 일지(F-08-04) ─────────

export async function addRunLog(db: Db, actor: Actor, equipmentId: string, input: { date?: string; data: Record<string, string>; abnormal?: string }, now = new Date()) {
  must(actor, "equip.check", "운전 일지는 설비를 운전한 사람이 씁니다");
  const e = await eqRow(db, equipmentId);
  if (!isEqKind(e.kind) || !EQ_KINDS[e.kind].log.length) throw new EquipError("이 설비는 운전 일지를 쓰지 않습니다");
  const date = input.date || seoulDate(now);
  if (!DATE.test(date) || date > seoulDate(now)) throw new EquipError("일자를 확인해 주세요");
  const data: Record<string, string> = {};
  for (const f of EQ_KINDS[e.kind].log) {
    const v = (input.data[f.key] ?? "").trim();
    if (f.num && v && !/^-?\d+(\.\d+)?$/.test(v)) throw new EquipError(`${f.label}은(는) 숫자로 적어 주세요`);
    if (v) data[f.key] = v;
  }
  if (!Object.keys(data).length) throw new EquipError("운전 기록을 한 칸 이상 적어 주세요");
  const [r] = await db.insert(equipmentRunLog).values({ equipmentId, logDate: date, data, operatorId: actor.id, createdAt: now }).returning({ id: equipmentRunLog.id });
  let failureId: string | null = null;
  if (clean(input.abnormal)) failureId = await openFailure(db, actor, e, { symptom: `[운전 이상] ${clean(input.abnormal)}` }, now);
  return { id: r.id, failureId };
}

// ───────── 윤활(F-08-03) ─────────

export type LubePointInput = { spot: string; oil: string; color?: string; amount?: string; cycleDays: number; method?: string; ownerId?: string; firstDue?: string };

export async function addLubePoint(db: Db, actor: Actor, equipmentId: string, input: LubePointInput, now = new Date()) {
  must(actor, "equip.manage", "윤활 개소표는 공장장(또는 대표)이 정합니다");
  const e = await eqRow(db, equipmentId);
  if (e.status === "disposed") throw new EquipError("처분한 설비입니다");
  if (!clean(input.spot)) throw new EquipError("윤활 위치를 적어 주세요");
  if (!clean(input.oil)) throw new EquipError("유종(제조사 지정)을 적어 주세요");
  if (!input.cycleDays || input.cycleDays < 1 || input.cycleDays > 730) throw new EquipError("주기는 1~730일로 적어 주세요");
  if (input.firstDue && !DATE.test(input.firstDue)) throw new EquipError("첫 윤활일 형식을 확인해 주세요");
  const codes = await db.select({ code: lubePoint.code }).from(lubePoint).where(eq(lubePoint.equipmentId, equipmentId));
  const code = nextLubeCode(codes.map((c) => c.code));
  await db.insert(lubePoint).values({
    equipmentId,
    code,
    spot: clean(input.spot)!,
    oil: clean(input.oil)!,
    color: clean(input.color),
    amount: clean(input.amount),
    cycleDays: input.cycleDays,
    method: clean(input.method),
    ownerId: clean(input.ownerId) ?? e.ownerId,
    nextDueOn: input.firstDue || seoulDate(now),
    createdAt: now,
  });
  return code;
}

export async function removeLubePoint(db: Db, actor: Actor, pointId: string) {
  must(actor, "equip.manage", "윤활 개소표는 공장장(또는 대표)이 정합니다");
  await db.update(lubePoint).set({ active: false }).where(eq(lubePoint.id, pointId));
}

/** 윤활 기록. 다음 기한 = 실시일 + 주기. 정상이 아니면 조치 필수, 공장장에게 알림(7.5) */
export async function recordLube(db: Db, actor: Actor, pointId: string, input: { doneOn?: string; used?: string; state: string; action?: string }, now = new Date()) {
  must(actor, "equip.check", "윤활 기록은 설비 담당 기술자가 씁니다");
  const [p] = await db.select().from(lubePoint).where(eq(lubePoint.id, pointId));
  if (!p || !p.active) throw new EquipError("윤활 개소를 찾을 수 없습니다");
  if (!(input.state in LUBE_STATES)) throw new EquipError("상태를 골라 주세요");
  const doneOn = input.doneOn || seoulDate(now);
  if (!DATE.test(doneOn) || doneOn > seoulDate(now)) throw new EquipError("실시일을 확인해 주세요");
  if (input.state !== "normal" && !clean(input.action)) throw new EquipError("상태가 정상이 아니면 한 조치를 적어 주세요");
  await db.insert(lubeLog).values({ pointId, doneOn, used: clean(input.used), state: input.state, action: clean(input.action), doneBy: actor.id, createdAt: now });
  const nextDueOn = addDaysIso(doneOn, p.cycleDays);
  await db.update(lubePoint).set({ lastDoneOn: doneOn, nextDueOn }).where(eq(lubePoint.id, pointId));
  if (input.state !== "normal") {
    const e = await eqRow(db, p.equipmentId);
    await notifyRole(db, "plant_manager", `윤활 이상(${LUBE_STATES[input.state as keyof typeof LUBE_STATES]}): ${e.no} ${e.name} ${p.code} — 예방정비로 넘길지 정하세요`, `lube-${pointId}-${doneOn}`, `/equipment/${e.id}`);
  }
  return { nextDueOn };
}

export async function listLubePoints(db: Db) {
  return db
    .select({ p: lubePoint, eqNo: equipment.no, eqName: equipment.name, eqId: equipment.id, ownerName: appUser.name })
    .from(lubePoint)
    .innerJoin(equipment, eq(equipment.id, lubePoint.equipmentId))
    .leftJoin(appUser, eq(appUser.id, lubePoint.ownerId))
    .where(eq(lubePoint.active, true))
    .orderBy(asc(lubePoint.nextDueOn), asc(equipment.no), asc(lubePoint.code));
}

// ───────── 측정 장비 교정(6절) ─────────

export async function recordCalibration(db: Db, actor: Actor, equipmentId: string, input: { calibratedOn: string; agency: string; pass: boolean; certNo?: string }, now = new Date()) {
  must(actor, "equip.calibrate", "교정 기록은 품질 담당·공장장이 씁니다");
  const e = await eqRow(db, equipmentId);
  if (!e.calibMonths) throw new EquipError("교정 주기가 없는 설비입니다. 설비 대장에서 교정 주기를 먼저 적으세요");
  if (!DATE.test(input.calibratedOn) || input.calibratedOn > seoulDate(now)) throw new EquipError("교정일을 확인해 주세요");
  if (!clean(input.agency)) throw new EquipError("교정 기관을 적어 주세요");
  const nextOn = addMonthsIso(input.calibratedOn, e.calibMonths);
  await db.insert(equipmentCalibration).values({ equipmentId, calibratedOn: input.calibratedOn, agency: clean(input.agency)!, pass: input.pass, certNo: clean(input.certNo), nextOn, recordedBy: actor.id, createdAt: now });
  if (input.pass) {
    await db.update(equipment).set({ calibNextOn: nextOn, updatedAt: now, ...(e.status === "stopped" && e.stopReason === "교정 불합격" ? { status: "in_use", stopReason: null, stoppedAt: null } : {}) }).where(eq(equipment.id, equipmentId));
  } else {
    await db.update(equipment).set({ status: "stopped", stopReason: "교정 불합격", stoppedAt: now, updatedAt: now }).where(eq(equipment.id, equipmentId));
    const nc = await issueNc(db, actor.id, { source: "equipment", refType: "equipment", refId: e.id, refLabel: `${e.no} ${e.name} 교정 불합격`, content: `측정 장비 교정 불합격(${input.calibratedOn}, ${clean(input.agency)})`, immediate: "사용 금지, 지난 교정 뒤 측정한 차 다시 확인" }, now);
    const t = `교정 불합격: ${e.no} ${e.name} — 사용 금지(부적합 ${nc.docNo}). 지난 교정 뒤 이 장비로 측정한 차를 다시 확인하세요(6절)`;
    await notifyRole(db, "quality", t, `calib-${equipmentId}-${input.calibratedOn}`, `/equipment/${equipmentId}`);
    await notifyRole(db, "plant_manager", t, `calib-${equipmentId}-${input.calibratedOn}`, `/equipment/${equipmentId}`);
  }
  await writeAudit(db, { actorId: actor.id, action: "equipment.calibrate", entityType: "equipment", entityId: e.no, after: { pass: input.pass, nextOn } });
  return { nextOn };
}

// ───────── 예방정비(F-08-07) ─────────

export async function getPlan(db: Db, year: number) {
  const [plan] = await db.select().from(pmPlan).where(eq(pmPlan.year, year));
  if (!plan) return null;
  const items = await db
    .select({ i: pmItem, eqNo: equipment.no, eqName: equipment.name })
    .from(pmItem)
    .innerJoin(equipment, eq(equipment.id, pmItem.equipmentId))
    .where(eq(pmItem.planId, plan.id))
    .orderBy(asc(equipment.no), asc(pmItem.createdAt));
  const ids = items.map((r) => r.i.id);
  const tasks = ids.length ? await db.select().from(pmTask).where(inArray(pmTask.itemId, ids)).orderBy(asc(pmTask.dueOn)) : [];
  return { plan, items: items.map((r) => ({ ...r.i, eqNo: r.eqNo, eqName: r.eqName })), tasks };
}

/** 지난해 계획을 불러와 새 해 계획을 만든다(같은 설비·항목·주기) */
export async function createPlan(db: Db, actor: Actor, year: number, now = new Date()) {
  must(actor, "equip.manage", "예방정비 계획은 공장장이 세웁니다");
  if (year < 2020 || year > 2100) throw new EquipError("연도를 확인해 주세요");
  const [exists] = await db.select({ id: pmPlan.id }).from(pmPlan).where(eq(pmPlan.year, year));
  if (exists) throw new EquipError(`${year}년 계획이 이미 있습니다`);
  const [plan] = await db.insert(pmPlan).values({ year, createdBy: actor.id, createdAt: now }).returning({ id: pmPlan.id });
  const prev = await getPlan(db, year - 1);
  let copied = 0;
  if (prev?.items.length) {
    const live = new Set((await db.select({ id: equipment.id }).from(equipment).where(ne(equipment.status, "disposed"))).map((r) => r.id));
    const keep = prev.items.filter((i) => live.has(i.equipmentId));
    if (keep.length) await db.insert(pmItem).values(keep.map((i) => ({ planId: plan.id, equipmentId: i.equipmentId, task: i.task, cycleMonths: i.cycleMonths, months: i.months, day: i.day, external: i.external, cost: i.cost, createdAt: now })));
    copied = keep.length;
  }
  return { id: plan.id, copied };
}

export async function addPmItem(db: Db, actor: Actor, planId: string, input: { equipmentId: string; task: string; cycleMonths: number; months?: number[]; day?: number; external: boolean; cost?: number | null }, now = new Date()) {
  must(actor, "equip.manage", "예방정비 계획은 공장장이 세웁니다");
  const [plan] = await db.select().from(pmPlan).where(eq(pmPlan.id, planId));
  if (!plan) throw new EquipError("계획을 찾을 수 없습니다");
  if (plan.status !== "draft") throw new EquipError("승인한 계획입니다. 대표가 '계획 고치기'로 다시 열어야 고칠 수 있습니다");
  await eqRow(db, input.equipmentId);
  if (!clean(input.task)) throw new EquipError("정비 항목을 적어 주세요");
  if (!input.cycleMonths || input.cycleMonths < 1 || input.cycleMonths > 12) throw new EquipError("주기는 1~12개월로 적어 주세요");
  const months = input.months?.length ? input.months.filter((m) => m >= 1 && m <= 12) : [];
  if (!months.length) throw new EquipError("계획 월을 하나 이상 골라 주세요");
  await db.insert(pmItem).values({ planId, equipmentId: input.equipmentId, task: clean(input.task)!, cycleMonths: input.cycleMonths, months: [...new Set(months)].sort((a, b) => a - b), day: input.day ?? 10, external: input.external, cost: input.cost ?? null, createdAt: now });
}

export async function removePmItem(db: Db, actor: Actor, itemId: string) {
  must(actor, "equip.manage", "예방정비 계획은 공장장이 세웁니다");
  const [i] = await db.select({ i: pmItem, status: pmPlan.status }).from(pmItem).innerJoin(pmPlan, eq(pmPlan.id, pmItem.planId)).where(eq(pmItem.id, itemId));
  if (!i) return;
  if (i.status !== "draft") throw new EquipError("승인한 계획입니다");
  const tasks = await db.select({ d: pmTask.doneOn }).from(pmTask).where(eq(pmTask.itemId, itemId));
  if (tasks.some((t) => t.d)) throw new EquipError("실적이 있는 항목은 지울 수 없습니다");
  await db.delete(pmTask).where(eq(pmTask.itemId, itemId));
  await db.delete(pmItem).where(eq(pmItem.id, itemId));
}

/** 대표 승인: 계획 월마다 정비 일정(실적란)을 만든다(9.2·9.3) */
export async function approvePlan(db: Db, actor: Actor, planId: string, now = new Date()) {
  must(actor, "pm.approve", "예방정비 계획은 대표가 승인합니다");
  const p = await db.select().from(pmPlan).where(eq(pmPlan.id, planId));
  if (!p[0]) throw new EquipError("계획을 찾을 수 없습니다");
  if (p[0].status === "approved") throw new EquipError("이미 승인한 계획입니다");
  const items = await db.select().from(pmItem).where(eq(pmItem.planId, planId));
  if (!items.length) throw new EquipError("정비 항목이 없습니다");
  // 승인한 달보다 앞선 달은 일정을 만들지 않는다(해 중간에 처음 세운 계획)
  const monthStart = `${seoulDate(now).slice(0, 7)}-01`;
  const dates = (i: { months: number[]; day: number }) => pmDueDates(p[0].year, i.months, i.day).filter((d) => d >= monthStart);
  const rows = items.flatMap((i) => dates(i).map((dueOn) => ({ itemId: i.id, dueOn, createdAt: now })));
  if (rows.length) await db.insert(pmTask).values(rows).onConflictDoNothing();
  // 계획에서 빠진 월의 실적 없는 일정은 지운다
  for (const i of items) {
    const want = new Set(dates(i));
    const have = await db.select().from(pmTask).where(eq(pmTask.itemId, i.id));
    const drop = have.filter((t) => !want.has(t.dueOn) && !t.doneOn).map((t) => t.id);
    if (drop.length) await db.delete(pmTask).where(inArray(pmTask.id, drop));
  }
  await db.update(pmPlan).set({ status: "approved", approvedBy: actor.id, approvedAt: now }).where(eq(pmPlan.id, planId));
  await notifyRole(db, "plant_manager", `${p[0].year}년 예방정비 계획을 대표가 승인했습니다(일정 ${rows.length}건)`, `pm-approve-${planId}-${now.getTime()}`, `/equipment/pm?year=${p[0].year}`);
  await writeAudit(db, { actorId: actor.id, action: "pm.approve", entityType: "pm_plan", entityId: String(p[0].year), after: { tasks: rows.length } });
  return rows.length;
}

export async function reopenPlan(db: Db, actor: Actor, planId: string) {
  must(actor, "pm.approve", "승인한 계획은 대표가 다시 엽니다");
  await db.update(pmPlan).set({ status: "draft", approvedBy: null, approvedAt: null }).where(eq(pmPlan.id, planId));
}

export async function recordPmTask(db: Db, actor: Actor, taskId: string, input: { doneOn?: string; work: string; parts?: string; minutes?: number | null; cost?: number | null; vendor?: string }, now = new Date()) {
  must(actor, "equip.check", "정비 실적은 설비 담당·공장장이 적습니다");
  const [t] = await db.select({ t: pmTask, external: pmItem.external }).from(pmTask).innerJoin(pmItem, eq(pmItem.id, pmTask.itemId)).where(eq(pmTask.id, taskId));
  if (!t) throw new EquipError("정비 일정을 찾을 수 없습니다");
  if (t.t.doneOn) throw new EquipError("이미 실적을 적은 일정입니다");
  const doneOn = input.doneOn || seoulDate(now);
  if (!DATE.test(doneOn) || doneOn > seoulDate(now)) throw new EquipError("실시일을 확인해 주세요");
  if (!clean(input.work)) throw new EquipError("작업 내용을 적어 주세요");
  if (t.external && !clean(input.vendor)) throw new EquipError("외부 정비는 업체를 적어 주세요(정비 보고서는 받아서 보관)");
  await db.update(pmTask).set({ doneOn, doneBy: actor.id, work: clean(input.work), parts: clean(input.parts), minutes: input.minutes ?? null, cost: input.cost ?? null, vendor: clean(input.vendor) }).where(eq(pmTask.id, taskId));
}

/** 월간 집계(9.5) */
export async function monthKpi(db: Db, ym: string, today = seoulDate()) {
  const y = +ym.slice(0, 4);
  const m = +ym.slice(5, 7);
  const from = `${ym}-01`;
  const to = `${ym}-${String(lastDay(y, m)).padStart(2, "0")}`;
  const until = to < today ? to : today;
  // 오늘까지 예정된 것 + 앞당겨 한 것
  const tasks = (await db.select().from(pmTask).where(and(gte(pmTask.dueOn, from), lte(pmTask.dueOn, to)))).filter((t) => t.dueOn <= until || t.doneOn);
  const fails = (await db.select().from(equipmentFailure)).filter((f) => {
    const d = seoulDate(f.occurredAt);
    return d >= from && d <= to;
  });
  return pmKpi({ due: tasks.length, done: tasks.filter((t) => t.doneOn).length, failures: fails.length, downMinutes: fails.reduce((a, f) => a + (f.downMinutes ?? 0), 0), periodDays: Math.max(1, daysBetween(from, until) + 1) });
}

// ───────── 오늘 현황·경고·알림 ─────────

/** 오늘 일상 점검을 한 설비 id */
async function checkedToday(db: Db, today: string) {
  const rows = await db.select({ id: equipmentCheck.equipmentId }).from(equipmentCheck).where(and(eq(equipmentCheck.kind, "daily"), eq(equipmentCheck.checkDate, today)));
  return new Set(rows.map((r) => r.id));
}

/** 공정 시작 전 경고(5.4): 이 공정에 쓰는 설비가 사용 금지거나, A등급인데 오늘 일상 점검이 없으면 */
export async function processEquipmentWarnings(db: Db, process: string, today = seoulDate()) {
  const list = (await db.select().from(equipment).where(ne(equipment.status, "disposed"))).filter((e) => e.processes.includes(process));
  if (!list.length) return [];
  const done = await checkedToday(db, today);
  const out: string[] = [];
  for (const e of list) {
    if (e.status === "stopped") out.push(`${e.no} ${e.name}: 사용 금지(${e.stopReason ?? ""}) — 쓰지 마세요`);
    else if (e.grade === "A" && e.checkDaily && !done.has(e.id)) out.push(`${e.no} ${e.name}: 오늘 일상 점검을 안 했습니다(${processLabel(process)} 전에 점검)`);
  }
  return out;
}

/** 설비 대장 맨 위 오늘 현황 */
export async function todayBoard(db: Db, today = seoulDate()) {
  const pol = await loadPolicy(db, today);
  const list = await listEquipment(db);
  const done = await checkedToday(db, today);
  const lubes = await listLubePoints(db);
  const soonPm = await db
    .select({ t: pmTask, task: pmItem.task, eqNo: equipment.no, eqName: equipment.name, eqId: equipment.id })
    .from(pmTask)
    .innerJoin(pmItem, eq(pmItem.id, pmTask.itemId))
    .innerJoin(equipment, eq(equipment.id, pmItem.equipmentId))
    .where(and(isNull(pmTask.doneOn), lte(pmTask.dueOn, addDaysIso(today, pol["pm.alert_days_before"]))))
    .orderBy(asc(pmTask.dueOn));
  return {
    unchecked: list.filter((e) => e.checkDaily && e.status === "in_use" && !done.has(e.id)).sort((a, b) => a.grade.localeCompare(b.grade)),
    checked: done,
    stopped: list.filter((e) => e.status === "stopped"),
    lubeDue: lubes.filter((l) => l.p.nextDueOn <= addDaysIso(today, pol["lube.alert_days_before"])),
    pmDue: soonPm,
    calibDue: list.filter((e) => e.calibNextOn && e.calibNextOn <= addDaysIso(today, 30)),
    legalDue: list.filter((e) => e.legalNextOn && e.legalNextOn <= addDaysIso(today, 30)),
    pol,
  };
}

/** 매일 알림(주기 작업): 윤활 3일 전, 예방정비 7일 전, 교정·법정 검사 30일 전, 교정 기한 지난 측정 장비는 사용 금지 */
export async function equipmentDailyAlerts(db: Db, now = new Date()) {
  const today = seoulDate(now);
  const b = await todayBoard(db, today);
  let n = 0;
  for (const l of b.lubeDue) {
    const t = `윤활 ${dueState(l.p.nextDueOn, today, 0) === "overdue" ? "기한 지남" : `예정 ${l.p.nextDueOn}`}: ${l.eqNo} ${l.eqName} ${l.p.code} ${l.p.spot}`;
    if (l.p.ownerId) await notifyUser(db, l.p.ownerId, t, `lube-due-${l.p.id}-${l.p.nextDueOn}`, "/equipment/lube");
    else await notifyRole(db, "plant_manager", t, `lube-due-${l.p.id}-${l.p.nextDueOn}`, "/equipment/lube");
    n++;
  }
  for (const r of b.pmDue) {
    await notifyRole(db, "plant_manager", `예방정비 ${r.t.dueOn}: ${r.eqNo} ${r.eqName} — ${r.task}`, `pm-due-${r.t.id}`, `/equipment/pm`);
    n++;
  }
  for (const e of b.calibDue) {
    await notifyRole(db, "quality", `교정 ${e.calibNextOn}: ${e.no} ${e.name}`, `calib-due-${e.id}-${e.calibNextOn}`, `/equipment/${e.id}`);
    if (e.calibNextOn! < today && e.status === "in_use") await db.update(equipment).set({ status: "stopped", stopReason: "교정 기한 지남", stoppedAt: now, updatedAt: now }).where(eq(equipment.id, e.id));
    n++;
  }
  for (const e of b.legalDue) {
    await notifyRole(db, "safety", `법정 검사 ${e.legalNextOn}: ${e.no} ${e.name}(${e.legalKind})`, `legal-due-${e.id}-${e.legalNextOn}`, `/equipment/${e.id}`);
    n++;
  }
  return `설비 알림 ${n}건`;
}

/** 월별 점검표(F-08-02) 보기: 날짜별 마지막 점검 */
export async function monthSheet(db: Db, equipmentId: string, ym: string) {
  const rows = await db
    .select()
    .from(equipmentCheck)
    .where(and(eq(equipmentCheck.equipmentId, equipmentId), gte(equipmentCheck.checkDate, `${ym}-01`), lte(equipmentCheck.checkDate, `${ym}-31`)))
    .orderBy(asc(equipmentCheck.createdAt));
  const daily = new Map<number, (typeof rows)[number]>();
  const monthly: typeof rows = [];
  for (const r of rows) {
    if (r.kind === "daily") daily.set(+r.checkDate.slice(8, 10), r);
    else monthly.push(r);
  }
  return { daily, monthly };
}
