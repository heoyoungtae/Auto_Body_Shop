// 개인별 일일 업무일지(사용자 지시 2026-11-11 "개인별 일일 업무일지가 자동 기록되도록").
// 따로 적지 않는다. 그날 그 사람이 앱에서 한 일(감사 로그)과 공정·업무지시·점검 기록을 모아 시간 순서로 보여 준다.
// 본인 일지는 누구나, 다른 사람 일지는 권한표 '직원 업무일지 보기'(journal.team).
import { and, asc, eq, gte, inArray, isNull, lt, lte, or } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import type { Db } from "@/db/client";
import {
  approvalDoc,
  appUser,
  auditLog,
  envEvent,
  equipment,
  equipmentCheck,
  equipmentRunLog,
  fiveSDaily,
  fiveSZone,
  instruction,
  instructionTask,
  lubeLog,
  lubePoint,
  repairOrder,
  tool,
  toolEvent,
  userRole,
  vehicle,
  workOrder,
  workStep,
} from "@/db/schema";
import { can } from "@/modules/auth/permissions";
import type { Role } from "@/modules/auth/roles";
import { CHECK_KINDS } from "@/modules/equipment/rules";
import { UserError } from "@/modules/platform/errors";
import { addDays } from "@/modules/platform/time";
import { ENV_EVENTS } from "@/modules/safety/env-rules";
import { LEAVE_KINDS } from "@/modules/staff/leave-rules";
import { PROCESSES } from "@/modules/repair/work-rules";
import { actionLabel, areaOf, AREAS, ENTITY, SKIP_ACTIONS, type Area } from "./labels";

export class JournalError extends UserError {}
type Actor = { id: string; roles: readonly Role[] };

export type JournalEntry = {
  at: Date;
  area: Area;
  text: string;
  /** 문서 번호·차량 번호 등 */
  ref?: string;
  /** 덧붙임(시간, 결과) */
  note?: string;
  href?: string;
  tone?: "ok" | "warn" | "danger";
};

export type JournalStep = { process: string; plate: string; woNo: string; href: string; startedAt: Date | null; endedAt: Date | null; minutes: number | null; std: number };
export type CarryItem = { text: string; ref: string; href: string; due?: string };

export type Journal = {
  user: { id: string; name: string; roles: Role[] };
  date: string;
  entries: JournalEntry[];
  /** 영역별 건수(일지 첫머리 요약) */
  areas: { area: Area; count: number }[];
  firstAt: Date | null;
  lastAt: Date | null;
  /** 그날 이 사람이 끝낸 공정 */
  steps: JournalStep[];
  workMinutes: number;
  stdMinutes: number;
  /** 근태(결재 확정된 휴가·외출·조퇴 등) */
  leave: string[];
  /** 내일로 넘어가는 일: 그날까지 예정인데 안 끝난 공정, 기한 지난·그날 기한인 받은 지시 */
  carry: CarryItem[];
};

const ISO = /^\d{4}-\d{2}-\d{2}$/;
/** 한국 시각 하루의 시작·끝(UTC Date) */
export function dayRange(date: string) {
  if (!ISO.test(date)) throw new JournalError("날짜를 YYYY-MM-DD 로 넣어 주세요");
  return { from: new Date(`${date}T00:00:00+09:00`), to: new Date(`${addDays(date, 1)}T00:00:00+09:00`) };
}

const procLabel = (p: string) => (PROCESSES as Record<string, { label: string }>)[p]?.label ?? p;

/** 볼 수 있는지: 본인 또는 journal.team */
export function canViewJournal(actor: Actor, userId: string) {
  return actor.id === userId || can(actor, "journal.team");
}

export async function journalUsers(db: Db, actor: Actor) {
  const users = await db.select({ id: appUser.id, name: appUser.name, active: appUser.active, retiredOn: appUser.retiredOn }).from(appUser).orderBy(asc(appUser.name));
  return users.filter((u) => u.id === actor.id || (can(actor, "journal.team") && u.active && !u.retiredOn));
}

export async function buildJournal(db: Db, actor: Actor, userId: string, date: string): Promise<Journal> {
  if (!canViewJournal(actor, userId)) throw new JournalError("다른 직원의 업무일지는 대표·공장장(권한표 '직원 업무일지 보기')만 봅니다");
  const { from, to } = dayRange(date);
  const [u] = await db.select({ id: appUser.id, name: appUser.name }).from(appUser).where(eq(appUser.id, userId));
  if (!u) throw new JournalError("직원을 찾을 수 없습니다");
  const roles = (await db.select({ role: userRole.role }).from(userRole).where(eq(userRole.userId, userId))).map((r) => r.role);
  const inDay = (col: PgColumn) => and(gte(col, from), lt(col, to));

  const entries: JournalEntry[] = [];
  let firstLogin: Date | null = null;

  // 1) 감사 로그: 앱에서 저장·확인·승인한 모든 일
  const audits = await db.select().from(auditLog).where(and(eq(auditLog.actorId, userId), inDay(auditLog.at))).orderBy(asc(auditLog.at));
  const roNos = [...new Set(audits.filter((a) => a.entityType === "repair_order" && a.entityId).map((a) => a.entityId!))];
  const roIds = new Map(roNos.length ? (await db.select({ id: repairOrder.id, docNo: repairOrder.docNo }).from(repairOrder).where(inArray(repairOrder.docNo, roNos))).map((r) => [r.docNo, r.id]) : []);
  for (const a of audits) {
    if (a.action === "auth.login") firstLogin ??= a.at;
    if (SKIP_ACTIONS.has(a.action)) continue;
    const after = (a.after ?? {}) as Record<string, unknown>;
    const roId = a.entityType === "repair_order" && a.entityId ? roIds.get(a.entityId) : undefined;
    entries.push({
      at: a.at,
      area: areaOf(a.entityType),
      text: actionLabel(a.action, a.entityType),
      ref: a.entityId && !/^[0-9a-f-]{36}$/.test(a.entityId) && a.entityType !== "config" && a.entityType !== "app_config" ? a.entityId : undefined,
      note: typeof after.title === "string" ? after.title : undefined,
      href: roId ? `/repairs/${roId}` : ENTITY[a.entityType]?.href,
      tone: /fail|reject|return|lost|redo|declined|cancel/.test(a.action) ? "warn" : undefined,
    });
  }

  // 2) 공정 시작·끝(작업 지시서). 걸린 시간·표준 시간까지
  const stepRows = await db
    .select({ s: workStep, woNo: workOrder.docNo, woId: workOrder.id, plate: vehicle.plateNo })
    .from(workStep)
    .innerJoin(workOrder, eq(workOrder.id, workStep.workOrderId))
    .innerJoin(repairOrder, eq(repairOrder.id, workOrder.repairOrderId))
    .leftJoin(vehicle, eq(vehicle.id, repairOrder.vehicleId))
    .where(or(and(eq(workStep.startedBy, userId), inDay(workStep.startedAt)), and(eq(workStep.endedBy, userId), inDay(workStep.endedAt))));
  const steps: JournalStep[] = [];
  for (const { s, woNo, woId, plate } of stepRows) {
    const href = `/work/${woId}`;
    const ref = `${plate ?? ""} ${woNo}`.trim();
    if (s.startedBy === userId && s.startedAt && s.startedAt >= from && s.startedAt < to) entries.push({ at: s.startedAt, area: "수리", text: `공정 시작: ${procLabel(s.process)}`, ref, href });
    if (s.endedBy === userId && s.endedAt && s.endedAt >= from && s.endedAt < to) {
      const over = s.stdMinutes > 0 && (s.actualMinutes ?? 0) > s.stdMinutes * 1.5;
      entries.push({ at: s.endedAt, area: "수리", text: `공정 끝: ${procLabel(s.process)}`, ref, href, note: `${s.actualMinutes ?? 0}분${s.stdMinutes ? ` (표준 ${s.stdMinutes}분)` : ""}`, tone: over ? "warn" : "ok" });
      steps.push({ process: procLabel(s.process), plate: plate ?? "", woNo, href, startedAt: s.startedAt, endedAt: s.endedAt, minutes: s.actualMinutes, std: s.stdMinutes });
    }
  }

  // 3) 업무지시: 받음·전달·결과보고, 내가 준 일의 확인·보완 요청
  const tasks = await db
    .select({ t: instructionTask, docNo: instruction.docNo, title: instruction.title, insId: instruction.id, dueOn: instruction.dueOn })
    .from(instructionTask)
    .innerJoin(instruction, eq(instruction.id, instructionTask.instructionId))
    .where(
      or(
        and(eq(instructionTask.assigneeId, userId), or(inDay(instructionTask.createdAt), inDay(instructionTask.forwardedAt), inDay(instructionTask.reportedAt))),
        and(eq(instructionTask.fromUserId, userId), or(inDay(instructionTask.confirmedAt), inDay(instructionTask.returnedAt))),
      ),
    );
  const hit = (d: Date | null): d is Date => !!d && d >= from && d < to;
  for (const { t, docNo, title, insId } of tasks) {
    const base = { area: "업무지시" as const, ref: docNo, href: `/tasks/${insId}`, note: title };
    if (t.assigneeId === userId) {
      if (hit(t.createdAt)) entries.push({ ...base, at: t.createdAt, text: "업무지시 받음" });
      if (hit(t.forwardedAt)) entries.push({ ...base, at: t.forwardedAt, text: "받은 지시 아래로 전달" });
      if (hit(t.reportedAt)) entries.push({ ...base, at: t.reportedAt, text: t.result === "notdone" ? "결과보고(못함)" : "결과보고(완료)", tone: t.result === "notdone" ? "warn" : "ok" });
    }
    if (t.fromUserId === userId) {
      if (hit(t.confirmedAt)) entries.push({ ...base, at: t.confirmedAt, text: "결과보고 확인" });
      if (hit(t.returnedAt)) entries.push({ ...base, at: t.returnedAt, text: "결과보고 보완 요청", tone: "warn" });
    }
  }

  // 4) 현장 점검 기록: 설비 점검·운전 일지·윤활·5S 일일 점검·치공구 반출·반납·환경 시설
  const [checks, runs, lubes, fives, tools, envs] = await Promise.all([
    db.select({ c: equipmentCheck, no: equipment.no, name: equipment.name }).from(equipmentCheck).innerJoin(equipment, eq(equipment.id, equipmentCheck.equipmentId)).where(and(eq(equipmentCheck.checkedBy, userId), inDay(equipmentCheck.createdAt))),
    db.select({ r: equipmentRunLog, no: equipment.no, name: equipment.name }).from(equipmentRunLog).innerJoin(equipment, eq(equipment.id, equipmentRunLog.equipmentId)).where(and(eq(equipmentRunLog.operatorId, userId), inDay(equipmentRunLog.createdAt))),
    db.select({ l: lubeLog, code: lubePoint.code, name: equipment.name }).from(lubeLog).innerJoin(lubePoint, eq(lubePoint.id, lubeLog.pointId)).innerJoin(equipment, eq(equipment.id, lubePoint.equipmentId)).where(and(eq(lubeLog.doneBy, userId), inDay(lubeLog.createdAt))),
    db.select({ f: fiveSDaily, name: fiveSZone.name }).from(fiveSDaily).leftJoin(fiveSZone, eq(fiveSZone.code, fiveSDaily.zone)).where(and(eq(fiveSDaily.checkedBy, userId), inDay(fiveSDaily.createdAt))),
    db.select({ e: toolEvent, no: tool.no, name: tool.name }).from(toolEvent).innerJoin(tool, eq(tool.id, toolEvent.toolId)).where(and(eq(toolEvent.by, userId), inDay(toolEvent.at), inArray(toolEvent.kind, ["out", "return"]))),
    db.select({ e: envEvent }).from(envEvent).where(and(eq(envEvent.by, userId), inDay(envEvent.at))),
  ]);
  for (const { c, no, name } of checks)
    entries.push({ at: c.createdAt, area: "설비·현장", text: `설비 ${CHECK_KINDS[c.kind as keyof typeof CHECK_KINDS] ?? "점검"}: ${name}`, ref: no, href: "/equipment/checks", note: c.idle ? "비가동" : c.ok ? "이상 없음" : "이상 있음", tone: c.ok ? "ok" : "danger" });
  for (const { r, no, name } of runs) entries.push({ at: r.createdAt, area: "설비·현장", text: `설비 운전 일지: ${name}`, ref: no, href: "/equipment" });
  for (const { l, code, name } of lubes) entries.push({ at: l.createdAt, area: "설비·현장", text: `윤활: ${name}`, ref: code, href: "/equipment/lube", note: l.action ?? undefined });
  for (const { f, name } of fives) {
    const bad = f.results.filter((x) => !x).length;
    entries.push({ at: f.createdAt, area: "설비·현장", text: `5S 일일 점검: ${name ?? f.zone}`, ref: f.zone, href: "/five-s", note: bad ? `× ${bad}개` : "모두 ○", tone: bad ? "warn" : "ok" });
  }
  for (const { e, no, name } of tools) entries.push({ at: e.at, area: "설비·현장", text: e.kind === "out" ? `치공구 반출: ${name}` : `치공구 반납: ${name}`, ref: no, href: "/tools" });
  for (const { e } of envs) entries.push({ at: e.at, area: "안전·환경", text: `환경 시설: ${ENV_EVENTS[e.kind as keyof typeof ENV_EVENTS] ?? e.kind}`, href: "/environment", note: e.result ?? undefined });

  entries.sort((a, b) => a.at.getTime() - b.at.getTime());

  // 5) 근태: 결재 확정된 휴가·외출·조퇴·연장근무
  const leaves = await db
    .select({ data: approvalDoc.data })
    .from(approvalDoc)
    .where(and(eq(approvalDoc.formCode, "F-11-04"), eq(approvalDoc.drafterId, userId), isNull(approvalDoc.cancelsId), inArray(approvalDoc.status, ["confirmed", "checked"])));
  const leave = leaves
    .map((l) => l.data as { leaveKind: string; fromDate: string; toDate: string; fromTime?: string; toTime?: string })
    .filter((d) => d.fromDate <= date && d.toDate >= date)
    .map((d) => `${LEAVE_KINDS[d.leaveKind as keyof typeof LEAVE_KINDS]?.label ?? d.leaveKind}${d.fromTime && d.toTime ? ` ${d.fromTime}~${d.toTime}` : ""}`);

  // 6) 넘어가는 일: 그날까지 예정인데 안 끝난 내 공정, 기한이 그날까지인데 보고 안 한 받은 지시
  const [openSteps, openTasks] = await Promise.all([
    db
      .select({ process: workStep.process, planDate: workStep.planDate, woNo: workOrder.docNo, woId: workOrder.id, plate: vehicle.plateNo })
      .from(workStep)
      .innerJoin(workOrder, eq(workOrder.id, workStep.workOrderId))
      .innerJoin(repairOrder, eq(repairOrder.id, workOrder.repairOrderId))
      .leftJoin(vehicle, eq(vehicle.id, repairOrder.vehicleId))
      .where(and(eq(workStep.assignee, userId), lte(workStep.planDate, date), or(isNull(workStep.endedAt), gte(workStep.endedAt, to)))),
    db
      .select({ docNo: instruction.docNo, title: instruction.title, insId: instruction.id, dueOn: instruction.dueOn })
      .from(instructionTask)
      .innerJoin(instruction, eq(instruction.id, instructionTask.instructionId))
      .where(and(eq(instructionTask.assigneeId, userId), lt(instructionTask.createdAt, to), lte(instruction.dueOn, date), inArray(instructionTask.status, ["open"]))),
  ]);
  const carry: CarryItem[] = [
    ...openSteps.map((s) => ({ text: `공정 ${procLabel(s.process)} 못 끝냄`, ref: `${s.plate ?? ""} ${s.woNo}`.trim(), href: `/work/${s.woId}`, due: s.planDate ?? undefined })),
    ...openTasks.map((t) => ({ text: `업무지시 보고 안 함: ${t.title}`, ref: t.docNo, href: `/tasks/${t.insId}`, due: t.dueOn })),
  ];

  const counts = new Map<Area, number>();
  for (const e of entries) counts.set(e.area, (counts.get(e.area) ?? 0) + 1);
  const times = entries.map((e) => e.at.getTime());
  if (firstLogin) times.push(firstLogin.getTime());
  return {
    user: { id: u.id, name: u.name, roles },
    date,
    entries,
    areas: AREAS.filter((a) => counts.has(a)).map((a) => ({ area: a, count: counts.get(a)! })),
    firstAt: times.length ? new Date(Math.min(...times)) : null,
    lastAt: times.length ? new Date(Math.max(...times)) : null,
    steps,
    workMinutes: steps.reduce((n, s) => n + (s.minutes ?? 0), 0),
    stdMinutes: steps.reduce((n, s) => n + s.std, 0),
    leave,
    carry,
  };
}

/** 대표·공장장용: 그날 직원별 한 줄 요약 */
export async function teamJournal(db: Db, actor: Actor, date: string) {
  if (!can(actor, "journal.team")) throw new JournalError("직원 업무일지는 대표·공장장(권한표 '직원 업무일지 보기')이 봅니다");
  const users = (await journalUsers(db, actor)).filter((u) => u.active && !u.retiredOn);
  const rows = [];
  for (const u of users) {
    const j = await buildJournal(db, actor, u.id, date);
    rows.push({ id: u.id, name: u.name, roles: j.user.roles, firstAt: j.firstAt, lastAt: j.lastAt, count: j.entries.length, areas: j.areas, workMinutes: j.workMinutes, steps: j.steps.length, leave: j.leave, carry: j.carry.length });
  }
  return rows;
}
