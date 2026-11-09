// 업무지시(사용자 지시 2026-11-09): 지시 → 받은 사람 '내 할 일' → (아래로 전달) → 결과보고 → 준 사람 확인(또는 보완 요청).
// 전달받은 사람들의 보고를 전달한 사람이 모두 확인하면, 그 보고가 그대로 위로 올라간다(다시 쓰지 않음).
// 지시할 수 있는 역할은 권한표 '업무지시'(기본 대표·공장장)이고 대표가 설정에서 바꾼다.
import { and, desc, eq, inArray, isNull, ne, or } from "drizzle-orm";
import type { Db } from "@/db/client";
import { appConfig, appUser, instruction, instructionTask } from "@/db/schema";
import { ROLES, type Role } from "@/modules/auth/roles";
import { writeAudit } from "@/modules/platform/audit";
import { nextDocNo } from "@/modules/platform/docno";
import { UserError } from "@/modules/platform/errors";
import { notifyUser } from "@/modules/platform/notify";
import { IMAGE_TYPES, MAX_IMAGE_BYTES, removeStored, sniffImage, storeFile } from "@/modules/platform/storage";
import { seoulDate } from "@/modules/platform/time";

export class TaskError extends UserError {}
type Actor = { id: string; roles: Role[] };
const clean = (s: string | null | undefined) => (s ?? "").trim() || null;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export const TASK_STATUS = { open: "할 일", forwarded: "전달함", reported: "보고함(확인 대기)", done: "확인 끝" } as const;
export type TaskStatus = keyof typeof TASK_STATUS;
export const TASK_TONE: Record<TaskStatus, "warn" | "accent" | "ok" | "neutral"> = { open: "warn", forwarded: "accent", reported: "accent", done: "ok" };
export const RESULTS = { done: "완료", notdone: "못함" } as const;

// ── 지시할 수 있는 역할(대표가 바꿈) ──
const CFG = "task.assign_roles";
export const DEFAULT_ASSIGN_ROLES: Role[] = ["owner", "plant_manager"];

export async function assignRoles(db: Db): Promise<Role[]> {
  const [r] = await db.select({ data: appConfig.data }).from(appConfig).where(eq(appConfig.key, CFG));
  const roles = ((r?.data as { roles?: string[] } | undefined)?.roles ?? DEFAULT_ASSIGN_ROLES).filter((x): x is Role => (ROLES as readonly string[]).includes(x));
  return roles.includes("owner") ? roles : ["owner", ...roles];
}

export async function saveAssignRoles(db: Db, actor: Actor, roles: string[]) {
  if (!actor.roles.includes("owner")) throw new TaskError("업무지시 권한은 대표가 정합니다");
  const list = [...new Set(["owner", ...roles])].filter((x): x is Role => (ROLES as readonly string[]).includes(x));
  const before = await assignRoles(db);
  await db
    .insert(appConfig)
    .values({ key: CFG, data: { roles: list }, updatedBy: actor.id, updatedAt: new Date() })
    .onConflictDoUpdate({ target: appConfig.key, set: { data: { roles: list }, updatedBy: actor.id, updatedAt: new Date() } });
  await writeAudit(db, { actorId: actor.id, action: "task.assign_roles", entityType: "config", entityId: CFG, before: { roles: before }, after: { roles: list } });
}

export async function canInstruct(db: Db, a: Actor) {
  const roles = await assignRoles(db);
  return a.roles.some((r) => roles.includes(r));
}

async function taskRow(db: Db, id: string) {
  const [t] = await db.select().from(instructionTask).where(eq(instructionTask.id, id));
  if (!t) throw new TaskError("업무지시를 찾을 수 없습니다");
  const [i] = await db.select().from(instruction).where(eq(instruction.id, t.instructionId));
  return { t, i };
}

async function activeUsers(db: Db, ids: string[]) {
  const uniq = [...new Set(ids.filter(Boolean))];
  if (!uniq.length) throw new TaskError("받는 사람을 골라 주세요");
  const rows = await db.select({ id: appUser.id, name: appUser.name, active: appUser.active }).from(appUser).where(inArray(appUser.id, uniq));
  if (rows.length !== uniq.length || rows.some((r) => !r.active)) throw new TaskError("받는 사람을 찾을 수 없습니다");
  return rows;
}

export type IssueInput = { title: string; body?: string; assigneeIds: string[]; dueOn: string; urgent?: boolean; needPhoto?: boolean; refType?: string; refId?: string; refLabel?: string };

/** 지시. 받는 사람마다 할 일 한 줄 */
export async function issueInstruction(db: Db, actor: Actor, p: IssueInput, now = new Date()) {
  if (!(await canInstruct(db, actor))) throw new TaskError("업무지시 권한이 없습니다(권한표 '업무지시'). 받은 지시는 '전달'로 넘길 수 있습니다");
  const title = clean(p.title);
  if (!title) throw new TaskError("무엇을 할지 제목을 적어 주세요");
  if (!DATE.test(p.dueOn) || p.dueOn < seoulDate(now)) throw new TaskError("기한을 오늘 이후로 골라 주세요");
  const users = await activeUsers(db, p.assigneeIds);
  if (users.some((u) => u.id === actor.id)) throw new TaskError("자기 자신에게는 지시하지 않습니다");
  const docNo = await nextDocNo(db, "WI", now);
  const [ins] = await db
    .insert(instruction)
    .values({ docNo, title, body: clean(p.body), urgent: !!p.urgent, dueOn: p.dueOn, needPhoto: !!p.needPhoto, refType: clean(p.refType), refId: clean(p.refId), refLabel: clean(p.refLabel), issuedBy: actor.id, createdAt: now })
    .returning({ id: instruction.id });
  await db.insert(instructionTask).values(users.map((u) => ({ instructionId: ins.id, assigneeId: u.id, fromUserId: actor.id, createdAt: now })));
  for (const u of users) await notifyUser(db, u.id, `${p.urgent ? "[긴급] " : ""}업무지시 ${docNo}: ${title} (기한 ${p.dueOn})`, `wi-${docNo}-${u.id}`, `/tasks/${ins.id}`);
  await writeAudit(db, { actorId: actor.id, action: "task.issue", entityType: "instruction", entityId: docNo, after: { title, to: users.map((u) => u.name), dueOn: p.dueOn } });
  return { id: ins.id, docNo };
}

/** 받은 사람이 열어 봄 */
export async function markRead(db: Db, actor: Actor, instructionId: string, now = new Date()) {
  await db
    .update(instructionTask)
    .set({ readAt: now })
    .where(and(eq(instructionTask.instructionId, instructionId), eq(instructionTask.assigneeId, actor.id), eq(instructionTask.status, "open"), isNull(instructionTask.readAt)));
}

/** 받은 지시를 다른 사람(들)에게 전달. 그 사람들의 보고를 모두 확인하면 내 보고로 올라간다 */
export async function forwardTask(db: Db, actor: Actor, taskId: string, p: { assigneeIds: string[]; note: string }, now = new Date()) {
  const { t, i } = await taskRow(db, taskId);
  if (t.assigneeId !== actor.id) throw new TaskError("받은 사람만 전달합니다");
  if (t.status !== "open") throw new TaskError("지금은 전달할 수 없습니다");
  const users = await activeUsers(db, p.assigneeIds);
  if (users.some((u) => u.id === actor.id || u.id === t.fromUserId || u.id === i.issuedBy)) throw new TaskError("자기 자신이나 지시한 사람에게는 전달하지 않습니다");
  await db.insert(instructionTask).values(users.map((u) => ({ instructionId: i.id, parentTaskId: t.id, assigneeId: u.id, fromUserId: actor.id, note: clean(p.note), createdAt: now })));
  await db.update(instructionTask).set({ status: "forwarded", forwardedAt: now, readAt: t.readAt ?? now }).where(eq(instructionTask.id, t.id));
  for (const u of users) await notifyUser(db, u.id, `업무지시 ${i.docNo}(전달): ${i.title} (기한 ${i.dueOn})`, `wi-${i.docNo}-${u.id}`, `/tasks/${i.id}`);
  await notifyUser(db, t.fromUserId, `${i.docNo}를 ${users.map((u) => u.name).join(", ")}에게 전달했습니다`, `wi-fwd-${t.id}`, `/tasks/${i.id}`);
}

/** 결과보고. 사진 필수 지시는 '완료'에 사진이 있어야 한다 */
export async function reportTask(db: Db, actor: Actor, taskId: string, p: { result: string; report: string }, now = new Date()) {
  const { t, i } = await taskRow(db, taskId);
  if (t.assigneeId !== actor.id) throw new TaskError("받은 사람만 보고합니다");
  if (t.status !== "open") throw new TaskError(t.status === "forwarded" ? "전달한 사람들의 보고를 확인하면 저절로 보고됩니다" : "이미 보고했습니다");
  if (p.result !== "done" && p.result !== "notdone") throw new TaskError("완료·못함을 골라 주세요");
  const report = clean(p.report);
  if (!report) throw new TaskError(p.result === "done" ? "무엇을 했는지 적어 주세요" : "못 한 이유를 적어 주세요");
  if (p.result === "done" && i.needPhoto && !t.reportPhotos.length) throw new TaskError("이 지시는 사진이 있어야 완료 보고를 할 수 있습니다. 먼저 사진을 올리세요");
  await db.update(instructionTask).set({ status: "reported", result: p.result, report, reportedAt: now, readAt: t.readAt ?? now }).where(eq(instructionTask.id, t.id));
  const [me] = await db.select({ name: appUser.name }).from(appUser).where(eq(appUser.id, actor.id));
  await notifyUser(db, t.fromUserId, `결과보고 ${i.docNo} ${i.title}: ${me?.name ?? ""} ${RESULTS[p.result]} — 확인하세요`, `wi-rep-${t.id}-${now.getTime()}`, `/tasks/${i.id}`);
}

/** 준 사람이 확인. 전달한 일이면, 아래 보고가 모두 확인되었을 때 위로 저절로 보고한다 */
export async function confirmTask(db: Db, actor: Actor, taskId: string, now = new Date()) {
  const { t, i } = await taskRow(db, taskId);
  if (t.fromUserId !== actor.id) throw new TaskError("이 일을 준 사람만 확인합니다");
  if (t.status !== "reported") throw new TaskError("보고가 올라온 뒤에 확인합니다");
  await db.update(instructionTask).set({ status: "done", confirmedAt: now }).where(eq(instructionTask.id, t.id));
  if (t.parentTaskId) await rollUp(db, t.parentTaskId, i, now);
}

async function rollUp(db: Db, parentId: string, i: typeof instruction.$inferSelect, now: Date) {
  const kids = await db.select({ t: instructionTask, name: appUser.name }).from(instructionTask).innerJoin(appUser, eq(appUser.id, instructionTask.assigneeId)).where(eq(instructionTask.parentTaskId, parentId));
  if (kids.some((k) => k.t.status !== "done")) return;
  const [parent] = await db.select().from(instructionTask).where(eq(instructionTask.id, parentId));
  if (!parent || parent.status !== "forwarded") return;
  const result = kids.every((k) => k.t.result === "done") ? "done" : "notdone";
  const report = kids.map((k) => `${k.name}(${RESULTS[k.t.result as keyof typeof RESULTS] ?? "-"}): ${k.t.report ?? ""}`).join("\n");
  const photos = kids.flatMap((k) => k.t.reportPhotos).slice(0, 16);
  await db.update(instructionTask).set({ status: "reported", result, report, reportPhotos: photos, reportedAt: now }).where(eq(instructionTask.id, parentId));
  await notifyUser(db, parent.fromUserId, `결과보고 ${i.docNo} ${i.title}: 전달받은 ${kids.length}명 보고 ${RESULTS[result]} — 확인하세요`, `wi-rep-${parentId}-${now.getTime()}`, `/tasks/${i.id}`);
}

/** 보완 요청: 다시 받은 사람의 할 일로 */
export async function returnTask(db: Db, actor: Actor, taskId: string, note: string, now = new Date()) {
  const { t, i } = await taskRow(db, taskId);
  if (t.fromUserId !== actor.id) throw new TaskError("이 일을 준 사람만 보완을 요청합니다");
  if (t.status !== "reported") throw new TaskError("보고가 올라온 뒤에 보완을 요청합니다");
  if (!clean(note)) throw new TaskError("무엇을 보완할지 적어 주세요");
  // 전달해서 올라온 보고면 전달한 사람이 다시 판단하도록 '할 일'로 돌린다(아래 사람들의 기록은 그대로)
  await db.update(instructionTask).set({ status: "open", returnNote: clean(note), returnedAt: now, reportedAt: null }).where(eq(instructionTask.id, t.id));
  await notifyUser(db, t.assigneeId, `보완 요청 ${i.docNo} ${i.title}: ${clean(note)!.slice(0, 40)}`, `wi-ret-${t.id}-${now.getTime()}`, `/tasks/${i.id}`);
}

export async function addReportPhoto(db: Db, actor: Actor, taskId: string, bytes: Uint8Array) {
  const { t, i } = await taskRow(db, taskId);
  if (t.assigneeId !== actor.id) throw new TaskError("받은 사람만 사진을 올립니다");
  if (t.status !== "open") throw new TaskError("보고 전에만 사진을 올립니다");
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) throw new TaskError("사진이 비었거나 너무 큽니다(6MB까지)");
  const type = sniffImage(bytes);
  if (!type) throw new TaskError("사진 파일만 올릴 수 있습니다(JPG·PNG·WEBP)");
  if (t.reportPhotos.length >= 8) throw new TaskError("사진은 8장까지입니다");
  const path = await storeFile(`wi/${i.docNo}`, bytes, IMAGE_TYPES[type]);
  await db.update(instructionTask).set({ reportPhotos: [...t.reportPhotos, path] }).where(eq(instructionTask.id, t.id));
}

export async function removeReportPhoto(db: Db, actor: Actor, taskId: string, path: string) {
  const { t } = await taskRow(db, taskId);
  if (t.assigneeId !== actor.id || t.status !== "open") throw new TaskError("보고 전에 받은 사람만 지웁니다");
  if (!t.reportPhotos.includes(path)) return;
  await db.update(instructionTask).set({ reportPhotos: t.reportPhotos.filter((p) => p !== path) }).where(eq(instructionTask.id, t.id));
  await removeStored(path);
}

/** 상세: 지시 내용과 모든 할 일(전달 사슬 포함). 지시자·관련된 사람·대표만 본다 */
export async function getInstruction(db: Db, actor: Actor, id: string) {
  const [i] = await db.select().from(instruction).where(eq(instruction.id, id));
  if (!i) throw new TaskError("업무지시를 찾을 수 없습니다");
  const tasks = await db.select().from(instructionTask).where(eq(instructionTask.instructionId, id)).orderBy(instructionTask.createdAt);
  const involved = i.issuedBy === actor.id || tasks.some((t) => t.assigneeId === actor.id || t.fromUserId === actor.id);
  if (!involved && !actor.roles.includes("owner")) throw new TaskError("관련된 사람만 봅니다");
  const names = new Map((await db.select({ id: appUser.id, name: appUser.name }).from(appUser)).map((u) => [u.id, u.name]));
  return { i, tasks, names };
}

export type TaskTab = "received" | "sent" | "all";

/** 목록: 받은 지시(내 할 일 줄) / 보낸 지시(내가 지시·전달한 것) / 전체(대표) */
export async function listInstructions(db: Db, actor: Actor, tab: TaskTab) {
  let ids: string[] | null = null;
  if (tab === "received") ids = (await db.select({ id: instructionTask.instructionId }).from(instructionTask).where(eq(instructionTask.assigneeId, actor.id))).map((r) => r.id);
  else if (tab === "sent")
    ids = [
      ...(await db.select({ id: instruction.id }).from(instruction).where(eq(instruction.issuedBy, actor.id))).map((r) => r.id),
      ...(await db.select({ id: instructionTask.instructionId }).from(instructionTask).where(eq(instructionTask.fromUserId, actor.id))).map((r) => r.id),
    ];
  else if (!actor.roles.includes("owner")) ids = [];
  if (ids && !ids.length) return [];
  const rows = await db
    .select({ i: instruction, issuer: appUser.name })
    .from(instruction)
    .innerJoin(appUser, eq(appUser.id, instruction.issuedBy))
    .where(ids ? inArray(instruction.id, [...new Set(ids)]) : undefined)
    .orderBy(desc(instruction.createdAt))
    .limit(300);
  const tasks = rows.length ? await db.select().from(instructionTask).where(inArray(instructionTask.instructionId, rows.map((r) => r.i.id))) : [];
  return rows.map((r) => {
    const ts = tasks.filter((t) => t.instructionId === r.i.id);
    const top = ts.filter((t) => !t.parentTaskId);
    const mine = ts.find((t) => t.assigneeId === actor.id && t.status !== "done") ?? ts.find((t) => t.assigneeId === actor.id);
    return { ...r, total: top.length, doneCount: top.filter((t) => t.status === "done").length, closed: top.every((t) => t.status === "done"), mine: mine ?? null, waitingMe: ts.filter((t) => t.fromUserId === actor.id && t.status === "reported").length };
  });
}

/** 내 할 일: 받은 지시(할 일·보완), 내가 확인할 보고, 내가 준 일의 기한 지남 */
export async function taskTodos(db: Db, actor: Actor, today: string) {
  const rows = await db
    .select({ t: instructionTask, i: instruction })
    .from(instructionTask)
    .innerJoin(instruction, eq(instruction.id, instructionTask.instructionId))
    .where(and(or(eq(instructionTask.assigneeId, actor.id), eq(instructionTask.fromUserId, actor.id)), ne(instructionTask.status, "done")));
  const names = new Map((await db.select({ id: appUser.id, name: appUser.name }).from(appUser)).map((u) => [u.id, u.name]));
  const out: { key: string; when: "late" | "today" | "soon"; what: string; detail?: string; href: string; action: string }[] = [];
  for (const { t, i } of rows) {
    const href = `/tasks/${i.id}`;
    const late = i.dueOn < today;
    if (t.assigneeId === actor.id && t.status === "open")
      out.push({ key: `wi-${t.id}`, when: late ? "late" : i.urgent || i.dueOn === today ? "today" : "soon", what: `업무지시: ${i.title}`, detail: `${t.returnNote ? `보완 요청: ${t.returnNote} · ` : ""}${names.get(t.fromUserId) ?? ""} · 기한 ${i.dueOn}`, href, action: t.returnNote ? "보완해 보고" : "하고 보고하기" });
    if (t.fromUserId === actor.id && t.status === "reported") out.push({ key: `wic-${t.id}`, when: "today", what: `결과 확인: ${i.title}`, detail: `${names.get(t.assigneeId) ?? ""} ${RESULTS[t.result as keyof typeof RESULTS] ?? ""}`, href, action: "확인하기" });
    if (t.fromUserId === actor.id && t.status === "open" && late) out.push({ key: `wil-${t.id}`, when: "late", what: `기한 지난 지시: ${i.title}`, detail: `${names.get(t.assigneeId) ?? ""} · 기한 ${i.dueOn}`, href, action: "열기" });
  }
  return out;
}

/** 매일: 기한 지난 할 일을 받은 사람과 준 사람에게 */
export async function instructionDailyAlerts(db: Db, now = new Date()) {
  const today = seoulDate(now);
  const rows = await db
    .select({ t: instructionTask, i: instruction })
    .from(instructionTask)
    .innerJoin(instruction, eq(instruction.id, instructionTask.instructionId))
    .where(eq(instructionTask.status, "open"));
  let n = 0;
  for (const { t, i } of rows.filter((r) => r.i.dueOn < today)) {
    await notifyUser(db, t.assigneeId, `업무지시 기한 지남 ${i.docNo} ${i.title}(${i.dueOn})`, `wi-late-${t.id}-${today}`, `/tasks/${i.id}`);
    await notifyUser(db, t.fromUserId, `지시한 일 기한 지남 ${i.docNo} ${i.title}(${i.dueOn})`, `wi-late-from-${t.id}-${today}`, `/tasks/${i.id}`);
    n++;
  }
  return `업무지시 기한 알림 ${n}건`;
}
