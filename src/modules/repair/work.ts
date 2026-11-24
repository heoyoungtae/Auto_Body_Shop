// 작업 지시서(F-04-01, STD-04): 승인한 견적 줄만으로 공정을 만들고, 공장장이 담당·예정일을 정하고,
// 기술자가 공정마다 시작·끝을 누르며 자주 검사·사진을 남긴다. 앞 공정이 끝나야 다음 공정을 시작한다.
// 모든 공정이 끝나면 수리 건은 검사 대기(STD-05)로 넘어간다.
import { rolesFor } from "@/modules/auth/permissions";
import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import type { Db } from "@/db/client";
import { appUser, customer, estimate, estimateLine, repairOrder, vehicle, workOrder, workStep } from "@/db/schema";
import { rolesOf, usersWithRole } from "@/modules/approval/line";
import type { Role } from "@/modules/auth/roles";
import { writeAudit } from "@/modules/platform/audit";
import { branchDocNo, nextDocNo } from "@/modules/platform/docno";
import { UserError } from "@/modules/platform/errors";
import { notifyRole, notifyUser } from "@/modules/platform/notify";
import { IMAGE_TYPES, MAX_IMAGE_BYTES, removeStored, sniffImage, storeFile } from "@/modules/platform/storage";
import { loadPolicy } from "@/modules/platform/policy";
import { seoulDate } from "@/modules/platform/time";
import { checkAssignment, currentLevels } from "@/modules/staff/service";
import { processEquipmentWarnings } from "@/modules/equipment/service";
import { candidatesFor, checkWorkplace, chooseWorkplace, fillWorkplaces, listWorkplaces, workplaceState } from "@/modules/platform/branch";
import { blockers, buildSteps, checksFor, damageProgress, DETAIL_KEYS, finishIssues, groupIssues, groupLabel, groupOf, groupSteps, isProcess, minutesBetween, processLabel, PROCESSES, splitMinutes, STEP_GROUPS, type GroupKey } from "./work-rules";

export class WorkError extends UserError {}
type Actor = { id: string; roles: Role[] };
const BOSS: Role[] = rolesFor("work.assign");
const isBoss = (a: Actor) => a.roles.some((r) => BOSS.includes(r));
const clean = (s: string | null | undefined) => (s ?? "").trim() || null;

function mustBoss(a: Actor) {
  if (!isBoss(a)) throw new WorkError("작업 지시·배정은 공장장(또는 대표)이 합니다");
}

/** 승인 받은 견적(가장 최근 차수) */
async function approvedEstimate(db: Db, roId: string) {
  const [e] = await db
    .select()
    .from(estimate)
    .where(and(eq(estimate.repairOrderId, roId), inArray(estimate.status, ["accepted", "partial"])))
    .orderBy(desc(estimate.rev))
    .limit(1);
  return e ?? null;
}

/** 작업 지시서 만들기. 이미 있으면 그것을 돌려준다 */
export async function createWorkOrder(db: Db, actor: Actor, roId: string, now = new Date()) {
  mustBoss(actor);
  return makeWorkOrder(db, actor.id, roId, now);
}

/** 지시서 만들기 공통. actorId 가 null 이면 고객 승인 때 앱이 자동으로 만든 것(간소화 simple.work_order_auto) */
async function makeWorkOrder(db: Db, actorId: string | null, roId: string, now: Date) {
  const [r] = await db.select().from(repairOrder).where(eq(repairOrder.id, roId));
  if (!r) throw new WorkError("없는 수리 건입니다");
  const e = await approvedEstimate(db, roId);
  if (!e || r.status !== "working") throw new WorkError("고객이 승인한 견적이 있어야 작업을 지시합니다");
  const [old] = await db.select({ id: workOrder.id }).from(workOrder).where(eq(workOrder.estimateId, e.id));
  if (old) return { id: old.id, created: false };
  const lines = await db.select().from(estimateLine).where(and(eq(estimateLine.estimateId, e.id), eq(estimateLine.approved, true)));
  const steps = buildSteps(lines);
  if (!steps.length) throw new WorkError("승인한 견적 항목이 없습니다");
  // 작업장은 공정 종류로 자동으로 채운다(대표 지시 2026-11-19). 작업장을 등록하지 않았으면 비워 둔다
  const filled = fillWorkplaces(steps, await workplaceState(db, r.branchId));
  return db.transaction(async (tx) => {
    const docNo = await branchDocNo(tx, "WO", now, r.branchId);
    const [w] = await tx.insert(workOrder).values({ docNo, repairOrderId: roId, estimateId: e.id, dueDate: e.dueDate, createdBy: actorId }).returning({ id: workOrder.id });
    await tx.insert(workStep).values(filled.map((s, i) => ({ ...s, workOrderId: w.id, seq: i + 1 })));
    await writeAudit(tx, { actorId, action: actorId ? "work.create" : "work.auto_create", entityType: "work_order", entityId: docNo, after: { ro: r.docNo, estimate: e.docNo, steps: steps.map((s) => s.process) } });
    return { id: w.id, created: true };
  });
}

/**
 * 간소화(simple.work_order_auto, 대표 2026-11-24): 고객이 견적을 승인하면 지시서를 바로 만들고,
 * 공정마다 남은 공정이 가장 적은 기술자 중 역량 단독 기준(STD-11 6절)을 넘는 사람을 담당으로 넣는다.
 * 맞는 사람이 없으면 그 공정은 비워 두고 공장장에게 알린다. 수리 건에서 '공장장이 직접 배정'을 골랐으면 하지 않는다.
 * 고객 승인은 이 일이 실패해도 그대로 남는다(실패하면 공장장 할 일로 넘어감).
 */
export async function autoWorkOrder(db: Db, roId: string, now = new Date()) {
  const today = seoulDate(now);
  const p = await loadPolicy(db, today);
  if (p["simple.work_order_auto"] !== 1) return null;
  const [r] = await db.select({ manual: repairOrder.manualWorkOrder, docNo: repairOrder.docNo, status: repairOrder.status }).from(repairOrder).where(eq(repairOrder.id, roId));
  if (!r || r.manual || r.status !== "working") return null;
  try {
    const { id, created } = await makeWorkOrder(db, null, roId, now);
    if (!created) return null;
    const [w] = await db.select({ docNo: workOrder.docNo }).from(workOrder).where(eq(workOrder.id, id));
    const steps = await db.select().from(workStep).where(eq(workStep.workOrderId, id)).orderBy(asc(workStep.seq));
    const techs = await usersWithRole(db, "technician");
    const load = new Map<string, number>();
    if (techs.length) {
      const open = await db.select({ a: workStep.assignee }).from(workStep).where(and(inArray(workStep.assignee, techs), isNull(workStep.endedAt)));
      for (const t of techs) load.set(t, 0);
      for (const o of open) if (o.a) load.set(o.a, (load.get(o.a) ?? 0) + 1);
    }
    const got = new Map<string, string[]>();
    const left: string[] = [];
    // 공정 3묶음(simple.step_groups)이면 묶음마다 한 사람(묶음의 모든 공정 역량 기준을 넘는 사람)
    const units = p["simple.step_groups"] === 1 ? groupSteps(steps).map((g) => ({ label: g.label, steps: g.steps })) : steps.map((s) => ({ label: processLabel(s.process), steps: [s] }));
    for (const unit of units) {
      // 일이 적은 사람부터, 같으면 아이디 순(늘 같은 결과)
      const order = [...load.entries()].sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0])).map(([u]) => u);
      let who: string | null = null;
      for (const u of order) {
        let ok = true;
        for (const s of unit.steps) if (await checkAssignment(db, s.process, u, null, today)) { ok = false; break; }
        if (ok) { who = u; break; }
      }
      if (!who) {
        left.push(unit.label);
        continue;
      }
      await db.update(workStep).set({ assignee: who }).where(inArray(workStep.id, unit.steps.map((s) => s.id)));
      load.set(who, (load.get(who) ?? 0) + unit.steps.length);
      got.set(who, [...(got.get(who) ?? []), unit.label]);
    }
    await writeAudit(db, { actorId: null, action: "work.auto_assign", entityType: "work_order", entityId: w.docNo, after: { assigned: Object.fromEntries(got), left } });
    for (const [u, list] of got) await notifyUser(db, u, `작업 배정(자동): ${w.docNo} ${list.join("·")}`, `work-auto-${id}-${u}`, `/work/${id}`);
    await notifyRole(
      db,
      "plant_manager",
      left.length ? `작업 지시서 자동 생성: ${w.docNo}(${r.docNo}) — 담당을 못 정한 ${p["simple.step_groups"] === 1 ? "묶음" : "공정"} ${left.length}개(${left.join("·")}), 배정해 주세요` : `작업 지시서 자동 생성: ${w.docNo}(${r.docNo}) — 담당 자동 배정 끝, 바꿀 때만 여세요`,
      `work-auto-${id}`,
      `/work/${id}`,
    );
    return { id, assigned: [...got.values()].reduce((a, l) => a + l.length, 0), left: left.length };
  } catch {
    return null;
  }
}

/** 수리 건마다: 이 건은 공장장이 직접 지시서를 만들고 배정한다(자동 지시서 끔) */
export async function setManualWorkOrder(db: Db, actor: Actor, roId: string, manual: boolean, now = new Date()) {
  mustBoss(actor);
  const [r] = await db.select({ docNo: repairOrder.docNo }).from(repairOrder).where(eq(repairOrder.id, roId));
  if (!r) throw new WorkError("없는 수리 건입니다");
  await db.update(repairOrder).set({ manualWorkOrder: manual, updatedAt: now }).where(eq(repairOrder.id, roId));
  await writeAudit(db, { actorId: actor.id, action: "work.manual", entityType: "repair_order", entityId: r.docNo, after: { manual } });
}

async function woRow(db: Db, id: string) {
  const [w] = await db.select().from(workOrder).where(eq(workOrder.id, id));
  if (!w) throw new WorkError("없는 작업 지시서입니다");
  return w;
}
async function stepRow(db: Db, id: string) {
  const [s] = await db.select().from(workStep).where(eq(workStep.id, id));
  if (!s) throw new WorkError("없는 공정입니다");
  return { s, w: await woRow(db, s.workOrderId) };
}
const mustOpen = (w: { status: string; docNo: string }) => {
  if (w.status === "done") throw new WorkError(`${w.docNo}는 작업이 끝나 검사로 넘어갔습니다`);
};

export async function saveWorkHeader(db: Db, actor: Actor, id: string, input: { dueDate: string; note: string }, now = new Date()) {
  mustBoss(actor);
  const w = await woRow(db, id);
  mustOpen(w);
  if (input.dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(input.dueDate)) throw new WorkError("출고 약속일을 다시 골라 주세요");
  await db.update(workOrder).set({ dueDate: input.dueDate || null, note: clean(input.note), updatedAt: now }).where(eq(workOrder.id, id));
  await writeAudit(db, { actorId: actor.id, action: "work.header", entityType: "work_order", entityId: w.docNo, after: input });
}

/** 공정 배정: 담당(기술자 또는 공장장)·예정일·표준 시간 */
export async function assignStep(db: Db, actor: Actor, stepId: string, input: { assignee: string; planDate: string; stdMinutes: number | null; mentor?: string | null; workplaceId?: string | null }, now = new Date()) {
  mustBoss(actor);
  const { s, w } = await stepRow(db, stepId);
  mustOpen(w);
  if (s.endedAt) throw new WorkError("끝난 공정은 다시 배정하지 않습니다");
  if (!input.assignee) throw new WorkError("담당자를 골라 주세요");
  const roles = await rolesOf(db, input.assignee);
  if (!roles.some((r) => r === "technician" || r === "plant_manager")) throw new WorkError("공정 담당은 기술자(또는 공장장)입니다");
  if (input.planDate && !/^\d{4}-\d{2}-\d{2}$/.test(input.planDate)) throw new WorkError("예정일을 다시 골라 주세요");
  const mentor = input.mentor || null;
  if (mentor === input.assignee) throw new WorkError("지도자는 담당과 다른 사람이어야 합니다");
  // 역량 표(F-11-02): 단독 기준 미만이면 지도자 함께(STD-11 6절)
  const issue = await checkAssignment(db, s.process, input.assignee, mentor, seoulDate(now));
  if (issue) throw new WorkError(issue);
  // 작업장: 공장장이 바꿀 때만 넘어온다(같은 종류가 하나면 칸이 없음)
  let workplaceId = s.workplaceId;
  if (input.workplaceId && input.workplaceId !== s.workplaceId) {
    const [r] = await db.select({ branchId: repairOrder.branchId }).from(repairOrder).where(eq(repairOrder.id, w.repairOrderId));
    await checkWorkplace(db, r.branchId, input.workplaceId);
    workplaceId = input.workplaceId;
  }
  await db.update(workStep).set({ assignee: input.assignee, mentor, planDate: input.planDate || null, stdMinutes: input.stdMinutes ?? s.stdMinutes, workplaceId }).where(eq(workStep.id, stepId));
  await db.update(workOrder).set({ updatedAt: now }).where(eq(workOrder.id, w.id));
  await writeAudit(db, { actorId: actor.id, action: "work.assign", entityType: "work_order", entityId: w.docNo, after: { step: s.process, assignee: input.assignee, mentor, planDate: input.planDate } });
  if (input.assignee !== s.assignee) await notifyUser(db, input.assignee, `작업 배정: ${w.docNo} ${processLabel(s.process)}${input.planDate ? ` (${input.planDate})` : ""}`, `work-assign-${stepId}-${input.assignee}`, `/work/${w.id}`);
}

const mayWork = (a: Actor, s: { assignee: string | null }) => s.assignee === a.id || isBoss(a);

/** 공정 시작. 담당이 정해져 있고 앞 공정의 자주 검사가 끝나야 한다(4절 5) */
export async function startStep(db: Db, actor: Actor, stepId: string, now = new Date()) {
  const { s, w } = await stepRow(db, stepId);
  mustOpen(w);
  if (!s.assignee) throw new WorkError("공장장이 담당을 정한 뒤에 시작합니다");
  if (!mayWork(actor, s)) throw new WorkError("담당 기술자(또는 공장장)만 시작할 수 있습니다");
  if (s.startedAt) throw new WorkError("이미 시작한 공정입니다");
  const all = await db.select().from(workStep).where(eq(workStep.workOrderId, w.id));
  const before = blockers(all, s);
  if (before.length) throw new WorkError(`앞 공정이 아직 끝나지 않았습니다: ${before.map((b) => processLabel(b.process)).join(", ")}`);
  // 작업장이 비어 있으면(작업장을 나중에 등록했거나 재작업) 지금 덜 붐비는 곳으로 채운다
  let workplaceId = s.workplaceId;
  if (!workplaceId) {
    const [r] = await db.select({ branchId: repairOrder.branchId }).from(repairOrder).where(eq(repairOrder.id, w.repairOrderId));
    const prev = all.filter((x) => x.seq < s.seq && x.workplaceId).sort((a, b) => b.seq - a.seq)[0]?.workplaceId ?? null;
    const st = await workplaceState(db, r.branchId);
    workplaceId = chooseWorkplace(s.process, st.wps, st.inUse, prev);
  }
  await db.update(workStep).set({ startedAt: now, startedBy: actor.id, workplaceId }).where(eq(workStep.id, stepId));
  if (w.status === "planned") await db.update(workOrder).set({ status: "working", updatedAt: now }).where(eq(workOrder.id, w.id));
  await writeAudit(db, { actorId: actor.id, action: "work.start", entityType: "work_order", entityId: w.docNo, after: { step: s.process } });
  // 설비 경고(STD-08 5.4): 사용 금지 설비나 오늘 점검 안 한 A등급 설비. 막지는 않고 알린다
  const warnings = await processEquipmentWarnings(db, s.process, seoulDate(now));
  if (warnings.length) await notifyRole(db, "plant_manager", `${w.docNo} ${processLabel(s.process)} 시작 — 설비 확인: ${warnings.join(" / ")}`, `work-eq-${stepId}`, `/work/${w.id}`);
  return { warnings };
}

/** 공정 사진(시작한 뒤, 끝나기 전) */
export async function addStepPhoto(db: Db, actor: Actor, stepId: string, bytes: Uint8Array, now = new Date()) {
  const { s, w } = await stepRow(db, stepId);
  mustOpen(w);
  if (!mayWork(actor, s)) throw new WorkError("담당 기술자(또는 공장장)만 사진을 올립니다");
  if (s.endedAt) throw new WorkError("끝난 공정에는 사진을 올리지 않습니다");
  // 공정 3묶음이면 '시작' 단추가 없다: 묶음의 첫 사진을 올린 때가 그 묶음의 시작이다
  if (!s.startedAt) {
    if (!(await groupMode(db, now))) throw new WorkError("시작한 공정에만 사진을 올립니다");
    await startGroup(db, actor, w, groupOf(s.process), now);
  }
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) throw new WorkError("사진이 비었거나 너무 큽니다(6MB까지)");
  const type = sniffImage(bytes);
  if (!type) throw new WorkError("사진 파일만 올릴 수 있습니다(JPG·PNG·WEBP)");
  if (s.photos.length >= 12) throw new WorkError("공정당 사진은 12장까지입니다");
  const path = await storeFile(`wo/${w.docNo}`, bytes, IMAGE_TYPES[type]);
  await db.update(workStep).set({ photos: [...s.photos, path] }).where(eq(workStep.id, stepId));
}

export async function removeStepPhoto(db: Db, actor: Actor, stepId: string, path: string) {
  const { s, w } = await stepRow(db, stepId);
  mustOpen(w);
  if (!mayWork(actor, s) || s.endedAt) throw new WorkError("끝나지 않은 내 공정의 사진만 지웁니다");
  if (!s.photos.includes(path)) return;
  await db.update(workStep).set({ photos: s.photos.filter((p) => p !== path) }).where(eq(workStep.id, stepId));
  await removeStored(path);
}

export type FinishInput = { checks: string[]; detail: Record<string, string>; note: string };

/** 공정 끝: 자주 검사를 모두 확인하고 사진·기록을 남긴다. 마지막 공정이면 검사 대기로 */
export async function finishStep(db: Db, actor: Actor, stepId: string, input: FinishInput, now = new Date()) {
  const { s, w } = await stepRow(db, stepId);
  mustOpen(w);
  if (!mayWork(actor, s)) throw new WorkError("담당 기술자(또는 공장장)만 끝낼 수 있습니다");
  if (!s.startedAt) throw new WorkError("시작하지 않은 공정입니다");
  if (s.endedAt) throw new WorkError("이미 끝난 공정입니다");
  const detail = Object.fromEntries(Object.entries(input.detail).map(([k, v]) => [k, v.trim()]).filter(([, v]) => v));
  const checks = isProcess(s.process) ? PROCESSES[s.process].checks.filter((c) => input.checks.includes(c)) : [];
  const issues = finishIssues(s.process, { checks, photos: s.photos.length, detail });
  if (issues.length) throw new WorkError(issues.join(" / "));
  await db.update(workStep).set({ endedAt: now, endedBy: actor.id, actualMinutes: minutesBetween(s.startedAt, now), checks, detail, note: clean(input.note) }).where(eq(workStep.id, stepId));
  await writeAudit(db, { actorId: actor.id, action: "work.finish", entityType: "work_order", entityId: w.docNo, after: { step: s.process, minutes: minutesBetween(s.startedAt, now), std: s.stdMinutes } });
  return completeIfDone(db, w, now);
}

/** 남은 공정이 없으면 작업 끝 → 검사 대기(STD-05) */
async function completeIfDone(db: Db, w: { id: string; docNo: string; repairOrderId: string }, now: Date) {
  const left = await db.select({ id: workStep.id }).from(workStep).where(and(eq(workStep.workOrderId, w.id), isNull(workStep.endedAt)));
  if (left.length) return { done: false };
  await db.update(workOrder).set({ status: "done", completedAt: now, updatedAt: now }).where(eq(workOrder.id, w.id));
  await db.update(repairOrder).set({ status: "inspecting", updatedAt: now }).where(and(eq(repairOrder.id, w.repairOrderId), eq(repairOrder.status, "working")));
  const [r] = await db.select({ docNo: repairOrder.docNo }).from(repairOrder).where(eq(repairOrder.id, w.repairOrderId));
  for (const role of ["quality", "plant_manager"] as const) await notifyRole(db, role, `최종 검사 대기: ${r.docNo}(${w.docNo}) — 주 작업자 외의 사람이 검사합니다`, `work-done-${w.docNo}-${role}`, `/repairs/${w.repairOrderId}`);
  return { done: true };
}

/** 간소화 '공정 3묶음'이 켜져 있나 */
export async function groupMode(db: Db, now = new Date()) {
  return (await loadPolicy(db, seoulDate(now)))["simple.step_groups"] === 1;
}

async function groupRows(db: Db, woId: string, key: GroupKey) {
  const all = await db.select().from(workStep).where(eq(workStep.workOrderId, woId));
  const groups = groupSteps(all);
  const g = groups.find((x) => x.key === key);
  if (!g) throw new WorkError("이 작업에 없는 묶음입니다");
  return { all, g };
}

/** 묶음 시작(첫 사진을 올릴 때). 앞 묶음이 모두 끝나야 한다 */
async function startGroup(db: Db, actor: Actor, w: { id: string; docNo: string; status: string; repairOrderId: string }, key: GroupKey, now = new Date()) {
  const { all, g } = await groupRows(db, w.id, key);
  if (!g.open) throw new WorkError(`앞 묶음이 아직 끝나지 않았습니다. ${groupLabel(key)} 묶음은 그다음에 합니다`);
  const todo = g.steps.filter((s) => !s.startedAt && !s.endedAt);
  if (!todo.length) return;
  const [r] = await db.select({ branchId: repairOrder.branchId }).from(repairOrder).where(eq(repairOrder.id, w.repairOrderId));
  const st = await workplaceState(db, r.branchId);
  for (const s of todo) {
    const prev = all.filter((x) => x.seq < s.seq && x.workplaceId).sort((a, b) => b.seq - a.seq)[0]?.workplaceId ?? null;
    const workplaceId = s.workplaceId ?? chooseWorkplace(s.process, st.wps, st.inUse, prev);
    await db.update(workStep).set({ startedAt: now, startedBy: actor.id, workplaceId }).where(eq(workStep.id, s.id));
  }
  if (w.status === "planned") await db.update(workOrder).set({ status: "working", updatedAt: now }).where(eq(workOrder.id, w.id));
  await writeAudit(db, { actorId: actor.id, action: "work.start", entityType: "work_order", entityId: w.docNo, after: { group: key, steps: todo.map((s) => s.process) } });
  const warnings = [...new Set((await Promise.all([...new Set(todo.map((s) => s.process))].map((p) => processEquipmentWarnings(db, p, seoulDate(now))))).flat())];
  if (warnings.length) await notifyRole(db, "plant_manager", `${w.docNo} ${groupLabel(key)} 시작 — 설비 확인: ${warnings.join(" / ")}`, `work-eq-${w.id}-${key}`, `/work/${w.id}`);
}

/** 사진을 묶음당 1장으로 받나: 간소화가 켜져 있고 보험 수리가 아닐 때(보험 건은 공정마다) */
export async function photoPerGroup(db: Db, roId: string, now = new Date()) {
  if ((await loadPolicy(db, seoulDate(now)))["simple.photo_per_group"] !== 1) return false;
  const [r] = await db.select({ insurance: repairOrder.insurance }).from(repairOrder).where(eq(repairOrder.id, roId));
  return r?.insurance === "self";
}

/**
 * 묶음 끝(간소화 '공정 3묶음'): 묶음 안의 남은 공정을 한 번에 끝낸다. 자주 검사는 공정마다 체크한 것으로 남고,
 * 조색 배합·건조 조건·용접 방식은 그 공정 기록으로 나눠 담는다. 실제 시간은 묶음 시작(첫 사진)부터 지금까지를 표준 시간 비율로 나눈다.
 */
export async function finishGroup(db: Db, actor: Actor, woId: string, key: string, input: FinishInput, now = new Date()) {
  const w = await woRow(db, woId);
  mustOpen(w);
  if (!(await groupMode(db, now))) throw new WorkError("공정 3묶음이 꺼져 있습니다. 공정마다 시작·끝을 눌러 주세요");
  if (!STEP_GROUPS.some((g) => g.key === key)) throw new WorkError("알 수 없는 묶음입니다");
  const { all, g } = await groupRows(db, woId, key as GroupKey);
  if (g.done) throw new WorkError("이미 끝난 묶음입니다");
  if (!g.open) throw new WorkError("앞 묶음이 아직 끝나지 않았습니다");
  const todo = g.steps.filter((s) => !s.endedAt);
  if (!todo.some((s) => mayWork(actor, s))) throw new WorkError("이 묶음 담당 기술자(또는 공장장)만 끝낼 수 있습니다");
  if (todo.some((s) => !s.assignee)) throw new WorkError("담당이 정해지지 않은 공정이 있습니다. 공장장이 담당을 정한 뒤에 끝냅니다");
  const detail = Object.fromEntries(Object.entries(input.detail).map(([k, v]) => [k, v.trim()]).filter(([, v]) => v));
  const perGroup = await photoPerGroup(db, w.repairOrderId, now);
  const issues = groupIssues(todo.map((s) => ({ process: s.process, photos: s.photos.length })), { checks: input.checks, detail }, perGroup);
  if (issues.length) throw new WorkError(issues.join(" / "));
  // 묶음 시작: 먼저 시작한 공정(첫 사진) 시각, 없으면 앞 묶음이 끝난 때
  const started = todo.map((s) => s.startedAt).filter((d): d is Date => !!d);
  const prevEnd = all.filter((s) => s.endedAt && groupOf(s.process) !== key).map((s) => s.endedAt!.getTime());
  const start = started.length ? new Date(Math.min(...started.map((d) => d.getTime()))) : prevEnd.length ? new Date(Math.max(...prevEnd)) : now;
  const mins = splitMinutes(minutesBetween(start, now), todo.map((s) => s.stdMinutes ?? 0));
  const note = clean(input.note);
  for (const [i, s] of todo.entries()) {
    const checks = isProcess(s.process) ? PROCESSES[s.process].checks.filter((c) => checksFor(s.process, input.checks).includes(c)) : [];
    const mine: Record<string, string> = Object.fromEntries(Object.entries(detail as Record<string, string>).filter(([k]) => (DETAIL_KEYS[s.process] ?? []).includes(k)));
    await db
      .update(workStep)
      .set({ startedAt: s.startedAt ?? start, startedBy: s.startedBy ?? actor.id, endedAt: now, endedBy: actor.id, actualMinutes: mins[i], checks, detail: mine, note: i === todo.length - 1 ? note : s.note })
      .where(eq(workStep.id, s.id));
  }
  await db.update(workOrder).set({ status: w.status === "planned" ? "working" : w.status, updatedAt: now }).where(eq(workOrder.id, w.id));
  await writeAudit(db, { actorId: actor.id, action: "work.finish_group", entityType: "work_order", entityId: w.docNo, after: { group: key, steps: todo.map((s) => s.process), minutes: minutesBetween(start, now) } });
  return completeIfDone(db, w, now);
}

/** 묶음 담당 한꺼번에 정하기(공장장). 공정마다 역량 기준을 확인한다 */
export async function assignGroup(db: Db, actor: Actor, woId: string, key: string, input: { assignee: string; planDate: string }, now = new Date()) {
  mustBoss(actor);
  if (!STEP_GROUPS.some((g) => g.key === key)) throw new WorkError("알 수 없는 묶음입니다");
  const { g } = await groupRows(db, woId, key as GroupKey);
  for (const s of g.steps.filter((x) => !x.endedAt)) await assignStep(db, actor, s.id, { assignee: input.assignee, planDate: input.planDate, stdMinutes: null, mentor: null }, now);
}

export async function getWorkOrder(db: Db, id: string) {
  const w = await woRow(db, id);
  const [r] = await db.select().from(repairOrder).where(eq(repairOrder.id, w.repairOrderId));
  const [[v], [c], [e], steps, lines, techIds, bossIds] = await Promise.all([
    db.select().from(vehicle).where(eq(vehicle.id, r.vehicleId)),
    db.select({ name: customer.name }).from(customer).where(eq(customer.id, r.customerId)),
    db.select({ docNo: estimate.docNo, id: estimate.id, status: estimate.status }).from(estimate).where(eq(estimate.id, w.estimateId)),
    db.select().from(workStep).where(eq(workStep.workOrderId, id)).orderBy(asc(workStep.seq)),
    db.select().from(estimateLine).where(and(eq(estimateLine.estimateId, w.estimateId), eq(estimateLine.approved, true))).orderBy(asc(estimateLine.seq)),
    usersWithRole(db, "technician"),
    usersWithRole(db, "plant_manager"),
  ]);
  const ids = [...new Set([...techIds, ...bossIds, ...steps.flatMap((s) => [s.assignee, s.mentor]).filter((x): x is string => !!x)])];
  const levels = await currentLevels(db);
  const wpState = await workplaceState(db, r.branchId);
  const wpName = new Map((await listWorkplaces(db, { branchId: r.branchId })).map((x) => [x.id, x.name]));
  const users = ids.length ? await db.select({ id: appUser.id, name: appUser.name }).from(appUser).where(inArray(appUser.id, ids)) : [];
  const nameOf = (uid: string | null) => users.find((u) => u.id === uid)?.name ?? null;
  return {
    ...w,
    ro: r,
    vehicle: v,
    customerName: c?.name ?? "",
    estimate: e,
    lines,
    steps: steps.map((s) => ({
      ...s,
      assigneeName: nameOf(s.assignee),
      mentorName: nameOf(s.mentor),
      blockedBy: s.startedAt ? [] : blockers(steps, s).map((b) => processLabel(b.process)),
      workplaceName: s.workplaceId ? (wpName.get(s.workplaceId) ?? null) : null,
      /** 바꿀 수 있는 작업장(같은 종류). 하나 이하면 화면에 고르는 칸을 두지 않는다 */
      wpChoices: candidatesFor(s.process, wpState.wps).map((x) => ({ id: x.id, name: x.name })),
    })),
    workers: [...techIds.map((uid) => ({ id: uid, name: nameOf(uid) ?? "", role: "기술자", levels: levels.get(uid) ?? {} })), ...bossIds.filter((b) => !techIds.includes(b)).map((uid) => ({ id: uid, name: nameOf(uid) ?? "", role: "공장장", levels: levels.get(uid) ?? {} }))],
  };
}

export async function workOrdersOfRo(db: Db, roId: string) {
  return db.select().from(workOrder).where(eq(workOrder.repairOrderId, roId)).orderBy(desc(workOrder.createdAt));
}

/** 작업 현황판: 진행 중인 작업 지시서와 지금 공정, 그리고 지시서가 아직 없는 승인 건 */
/** branchId: 지금 보는 지점만(없으면 전체) */
export async function workBoard(db: Db, now = new Date(), branchId?: string | null) {
  const today = seoulDate(now);
  const inBranch = branchId ? eq(repairOrder.branchId, branchId) : undefined;
  const wos = await db
    .select({ id: workOrder.id, docNo: workOrder.docNo, status: workOrder.status, dueDate: workOrder.dueDate, roId: repairOrder.id, roNo: repairOrder.docNo, customerName: customer.name, plateNo: vehicle.plateNo, model: vehicle.model })
    .from(workOrder)
    .innerJoin(repairOrder, eq(repairOrder.id, workOrder.repairOrderId))
    .innerJoin(customer, eq(customer.id, repairOrder.customerId))
    .innerJoin(vehicle, eq(vehicle.id, repairOrder.vehicleId))
    .where(and(inArray(workOrder.status, ["planned", "working"]), inBranch))
    .orderBy(asc(workOrder.dueDate));
  const steps = wos.length ? await db.select().from(workStep).where(inArray(workStep.workOrderId, wos.map((w) => w.id))).orderBy(asc(workStep.seq)) : [];
  const userIds = [...new Set(steps.map((s) => s.assignee).filter((x): x is string => !!x))];
  const users = userIds.length ? await db.select({ id: appUser.id, name: appUser.name }).from(appUser).where(inArray(appUser.id, userIds)) : [];
  const board = wos.map((w) => {
    const mine = steps.filter((s) => s.workOrderId === w.id);
    const current = mine.find((s) => s.startedAt && !s.endedAt) ?? mine.find((s) => !s.endedAt) ?? null;
    return {
      ...w,
      late: !!w.dueDate && w.dueDate < today,
      total: mine.length,
      done: mine.filter((s) => s.endedAt).length,
      unassigned: mine.filter((s) => !s.assignee && !s.endedAt).length,
      current: current ? { process: current.process, started: !!current.startedAt, assignee: users.find((u) => u.id === current.assignee)?.name ?? null } : null,
    };
  });
  const waiting = await db
    .select({ roId: repairOrder.id, roNo: repairOrder.docNo, customerName: customer.name, plateNo: vehicle.plateNo })
    .from(repairOrder)
    .innerJoin(customer, eq(customer.id, repairOrder.customerId))
    .innerJoin(vehicle, eq(vehicle.id, repairOrder.vehicleId))
    .where(and(eq(repairOrder.status, "working"), inBranch));
  const withWo = new Set((await db.select({ roId: workOrder.repairOrderId }).from(workOrder)).map((x) => x.roId));
  return { board, needOrder: waiting.filter((x) => !withWo.has(x.roId)) };
}

/** 내 할 일: 기술자는 내 공정(시작 가능·작업 중), 공장장은 지시서 만들기·배정 안 된 공정 */
export async function workTodos(db: Db, user: Actor, now = new Date()) {
  const out: { key: string; kind: "order" | "assign" | "mine"; label: string; href: string; detail: string; started?: boolean }[] = [];
  const { board, needOrder } = await workBoard(db, now, (user as { viewBranchId?: string | null }).viewBranchId);
  if (isBoss(user)) {
    for (const n of needOrder) out.push({ key: `wo-${n.roId}`, kind: "order", label: `${n.roNo} ${n.customerName} ${n.plateNo}`, href: `/repairs/${n.roId}#work`, detail: "고객 승인 끝 — 작업 지시서를 만들고 공정을 배정합니다" });
    for (const b of board) if (b.unassigned) out.push({ key: `wa-${b.id}`, kind: "assign", label: `${b.docNo}(${b.roNo})`, href: `/work/${b.id}`, detail: `담당 안 정한 공정 ${b.unassigned}개` });
  }
  if (board.length) {
    const steps = await db.select().from(workStep).where(and(inArray(workStep.workOrderId, board.map((b) => b.id)), eq(workStep.assignee, user.id), isNull(workStep.endedAt)));
    if (await groupMode(db, now)) {
      // 공정 3묶음: 지금 할 차례인 묶음마다 한 줄
      for (const woId of [...new Set(steps.map((s) => s.workOrderId))]) {
        const b = board.find((x) => x.id === woId)!;
        const g = groupSteps(await db.select().from(workStep).where(eq(workStep.workOrderId, woId))).find((x) => x.open);
        if (!g || !g.steps.some((s) => s.assignee === user.id && !s.endedAt)) continue;
        const started = g.steps.some((s) => s.startedAt && !s.endedAt);
        out.push({ key: `wg-${woId}-${g.key}`, kind: "mine", label: `${g.label}: ${b.roNo} ${b.plateNo}`, href: `/work/${woId}#group-${g.key}`, detail: started ? "작업 중 — 끝나면 자주 검사를 확인하고 '묶음 끝'" : "할 차례 — 첫 사진을 올리면 시작됩니다", started });
      }
      return out;
    }
    for (const s of steps) {
      const all = await db.select().from(workStep).where(eq(workStep.workOrderId, s.workOrderId));
      const b = board.find((x) => x.id === s.workOrderId)!;
      if (s.startedAt || !blockers(all, s).length) out.push({ key: `ws-${s.id}`, kind: "mine", label: `${processLabel(s.process)}: ${b.roNo} ${b.plateNo}`, href: `/work/${b.id}#step-${s.id}`, detail: s.startedAt ? "작업 중 — 끝나면 자주 검사·사진을 남기고 '끝'" : `시작할 수 있습니다${s.planDate ? ` · 예정 ${s.planDate}` : ""}`, started: !!s.startedAt });
    }
  }
  return out;
}

/** 한꺼번에 배정: 담당이 없는 남은 공정을 한 사람·한 날로(공정마다 다시 고르지 않게) */
export async function assignRest(db: Db, actor: Actor, woId: string, input: { assignee: string; planDate: string }, now = new Date()) {
  mustBoss(actor);
  const steps = await db.select().from(workStep).where(and(eq(workStep.workOrderId, woId), isNull(workStep.endedAt), isNull(workStep.assignee)));
  if (!steps.length) throw new WorkError("담당을 정할 공정이 없습니다");
  const bad: string[] = [];
  for (const s of steps) if (await checkAssignment(db, s.process, input.assignee, null, seoulDate(now))) bad.push(processLabel(s.process));
  if (bad.length) throw new WorkError(`역량이 단독 기준에 못 미치는 공정이 있어 한꺼번에 정할 수 없습니다: ${bad.join(", ")}. 그 공정은 지도자를 함께 정해 하나씩 배정해 주세요`);
  for (const s of steps) await assignStep(db, actor, s.id, { assignee: input.assignee, planDate: input.planDate, stdMinutes: null }, now);
  return steps.length;
}

/** 수리 건의 부위별 작업 진행(가장 최근 작업 지시서 기준). 지시서가 없으면 null */
export async function roProgress(db: Db, roId: string, damageIds: string[]) {
  const [w] = await db.select().from(workOrder).where(eq(workOrder.repairOrderId, roId)).orderBy(desc(workOrder.createdAt)).limit(1);
  if (!w) return null;
  const [steps, lines] = await Promise.all([
    db.select().from(workStep).where(eq(workStep.workOrderId, w.id)),
    db.select({ id: estimateLine.id, damageId: estimateLine.damageId, approved: estimateLine.approved }).from(estimateLine).where(eq(estimateLine.estimateId, w.estimateId)),
  ]);
  return damageProgress(damageIds, lines, steps);
}
