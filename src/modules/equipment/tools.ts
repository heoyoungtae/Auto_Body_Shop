// 치공구 관리(STD-08 8.7, F-08-08)
// 10.1 등록(관리 번호 TL-·라벨) → 10.2 공용은 쉐도우 보드, 개인 공구는 개인 공구함 → 10.3 고가·특수 치공구 반출·반납 기록
// → 10.4 분기 1회 상태 점검(마모·파손·누락 → 수리·교체·폐기 결정) → 10.5 분실 경위 기록, 대체 구입은 전결(발주)
import { and, asc, desc, eq, inArray, isNotNull, ne } from "drizzle-orm";
import type { Db } from "@/db/client";
import { appUser, tool, toolEvent } from "@/db/schema";
import { can } from "@/modules/auth/permissions";
import type { Role } from "@/modules/auth/roles";
import { writeAudit } from "@/modules/platform/audit";
import { UserError } from "@/modules/platform/errors";
import { notifyRole, notifyUser } from "@/modules/platform/notify";
import { seoulDate } from "@/modules/platform/time";
import { nextToolNo, quarterEndMonth, quarterOf, TOOL_CHECK, TOOL_DECISION, TOOL_KEEP, type ToolCheck, type ToolDecision, type ToolStatus } from "./rules";

export class ToolError extends UserError {}
type Actor = { id: string; roles: Role[] };
const clean = (s: string | null | undefined) => (s ?? "").trim() || null;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

async function row(db: Db, id: string) {
  const [t] = await db.select().from(tool).where(eq(tool.id, id));
  if (!t) throw new ToolError("치공구를 찾을 수 없습니다");
  return t;
}
const must = (a: Actor) => {
  if (!can(a, "equip.manage")) throw new ToolError("치공구 대장은 공장장·대표가 관리합니다");
};
async function event(db: Db, toolId: string, e: { kind: string; detail?: string | null; result?: string; decision?: string; quarter?: string }, by: string, at: Date) {
  await db.insert(toolEvent).values({ toolId, kind: e.kind, detail: e.detail ?? null, result: e.result ?? null, decision: e.decision ?? null, quarter: e.quarter ?? null, by, at });
}

export type ToolInput = { name: string; spec: string; purchasedOn: string; location: string; keep: string; holderId: string; managerId: string; special: boolean; note: string };

function check(i: ToolInput) {
  if (!i.name.trim()) throw new ToolError("품명을 적어 주세요");
  if (!(i.keep in TOOL_KEEP)) throw new ToolError("보관 방법(공용·개인)을 골라 주세요");
  if (i.purchasedOn && !DATE.test(i.purchasedOn)) throw new ToolError("구입일을 확인해 주세요");
  if (i.keep === "personal" && !i.holderId) throw new ToolError("개인 공구는 쓰는 사람을 골라 주세요");
  if (i.keep === "board" && !i.location.trim()) throw new ToolError("공용 치공구는 보관 위치(쉐도우 보드 자리)를 적어 주세요");
  return {
    name: i.name.trim(),
    spec: clean(i.spec),
    purchasedOn: i.purchasedOn || null,
    location: clean(i.location),
    keep: i.keep,
    holderId: i.keep === "personal" ? i.holderId : null,
    managerId: i.managerId || null,
    special: i.special,
    note: clean(i.note),
  };
}

/** 10.1 등록: 관리 번호를 매기고 라벨을 붙인다 */
export async function registerTool(db: Db, actor: Actor, input: ToolInput, now = new Date()) {
  must(actor);
  const v = check(input);
  const no = nextToolNo((await db.select({ no: tool.no }).from(tool)).map((r) => r.no));
  const [r] = await db.insert(tool).values({ ...v, no, createdBy: actor.id, createdAt: now, updatedAt: now }).returning({ id: tool.id });
  await event(db, r.id, { kind: "register", detail: `${TOOL_KEEP[v.keep as keyof typeof TOOL_KEEP]}${v.location ? ` · ${v.location}` : ""}${v.special ? " · 반출 기록 대상" : ""}` }, actor.id, now);
  await writeAudit(db, { actorId: actor.id, action: "tool.create", entityType: "tool", entityId: no, after: { name: v.name } });
  if (v.holderId && v.holderId !== actor.id) await notifyUser(db, v.holderId, `개인 공구 지급: ${no} ${v.name}`, `tool-give-${r.id}-${v.holderId}`, `/tools/${r.id}`);
  return { id: r.id, no };
}

export async function updateTool(db: Db, actor: Actor, id: string, input: ToolInput, now = new Date()) {
  must(actor);
  const t = await row(db, id);
  if (t.status === "disposed") throw new ToolError("폐기한 치공구는 고칠 수 없습니다");
  const v = check(input);
  await db.update(tool).set({ ...v, updatedAt: now }).where(eq(tool.id, id));
  const moved = [t.location !== v.location && `위치 ${t.location ?? "-"} → ${v.location ?? "-"}`, t.keep !== v.keep && `보관 ${TOOL_KEEP[t.keep as keyof typeof TOOL_KEEP]} → ${TOOL_KEEP[v.keep as keyof typeof TOOL_KEEP]}`, t.holderId !== v.holderId && "사용자 바뀜"].filter(Boolean).join(", ");
  await event(db, id, { kind: "edit", detail: moved || "정보 고침" }, actor.id, now);
  if (v.holderId && v.holderId !== t.holderId && v.holderId !== actor.id) await notifyUser(db, v.holderId, `개인 공구 지급: ${t.no} ${v.name}`, `tool-give-${id}-${v.holderId}-${now.getTime()}`, `/tools/${id}`);
}

/** 10.3 반출: 반출자·시각·어디에 쓰는지. 이미 나가 있으면 막는다 */
export async function checkoutTool(db: Db, actor: Actor, id: string, note: string, now = new Date()) {
  if (!can(actor, "equip.check")) throw new ToolError("현장 직원이 반출합니다");
  const t = await row(db, id);
  if (t.status !== "ok") throw new ToolError(`지금 ${t.status === "repair" ? "수리 중" : t.status === "lost" ? "분실" : "폐기"} 상태라 반출할 수 없습니다`);
  if (t.outAt) throw new ToolError("이미 반출 중입니다. 먼저 반납해야 합니다");
  if (!note.trim()) throw new ToolError("어디에 쓰는지 적어 주세요(예: 3번 베이 RO-2611-0003 덴트 복원)");
  await db.update(tool).set({ outBy: actor.id, outAt: now, outNote: note.trim(), updatedAt: now }).where(eq(tool.id, id));
  await event(db, id, { kind: "out", detail: note.trim() }, actor.id, now);
}

/** 반납: 반출한 사람이나 공장장. 상태 이상이 있으면 같이 적는다(파손이면 수리 중으로) */
export async function returnTool(db: Db, actor: Actor, id: string, input: { broken: boolean; note: string }, now = new Date()) {
  const t = await row(db, id);
  if (!t.outAt) throw new ToolError("반출 중이 아닙니다");
  if (t.outBy !== actor.id && !can(actor, "equip.manage")) throw new ToolError("반출한 사람이나 공장장이 반납 처리합니다");
  if (input.broken && !input.note.trim()) throw new ToolError("어디가 어떻게 상했는지 적어 주세요");
  await db.update(tool).set({ outBy: null, outAt: null, outNote: null, status: input.broken ? "repair" : t.status, updatedAt: now }).where(eq(tool.id, id));
  const mins = Math.round((now.getTime() - t.outAt.getTime()) / 60000);
  await event(db, id, { kind: "return", detail: `${mins >= 60 ? `${Math.floor(mins / 60)}시간 ${mins % 60}분` : `${mins}분`} 사용${input.broken ? ` · 상함: ${input.note.trim()}` : input.note.trim() ? ` · ${input.note.trim()}` : ""}` }, actor.id, now);
  if (input.broken) await notifyRole(db, "plant_manager", `치공구 상함: ${t.no} ${t.name} — ${input.note.trim()}`, `tool-broken-${id}-${now.getTime()}`, `/tools/${id}`);
}

/**
 * 10.4 분기 점검(공장장). 양호가 아니면 결정(수리·교체·폐기·지켜봄)과 내용이 필요.
 * 누락은 분실로 보고 대표에게 알린다(10.5).
 */
export async function inspectTool(db: Db, actor: Actor, id: string, input: { result: string; decision: string; note: string }, now = new Date()) {
  must(actor);
  const t = await row(db, id);
  if (t.status === "disposed") throw new ToolError("폐기한 치공구입니다");
  if (!(input.result in TOOL_CHECK)) throw new ToolError("점검 결과를 골라 주세요");
  const result = input.result as ToolCheck;
  if (result === "missing") return reportLost(db, actor, id, input.note, now, true);
  if (result !== "ok" && !(input.decision in TOOL_DECISION)) throw new ToolError("마모·파손이면 어떻게 할지(수리·교체·폐기·지켜봄) 골라 주세요");
  if (result !== "ok" && !input.note.trim()) throw new ToolError("어디가 어떻게 상했는지 적어 주세요");
  const decision = result === "ok" ? undefined : (input.decision as ToolDecision);
  const status: ToolStatus = decision === "repair" ? "repair" : decision === "dispose" ? "disposed" : t.status === "lost" ? "ok" : (t.status as ToolStatus);
  await db.update(tool).set({ status, ...(status === "disposed" ? { holderId: null, outBy: null, outAt: null, outNote: null } : {}), updatedAt: now }).where(eq(tool.id, id));
  await event(db, id, { kind: "check", result, decision, quarter: quarterOf(seoulDate(now)), detail: clean(input.note) }, actor.id, now);
  await writeAudit(db, { actorId: actor.id, action: "tool.check", entityType: "tool", entityId: t.no, after: { result, decision: decision ?? null } });
  return { result, decision: decision ?? null };
}

/** 10.5 분실: 경위 필수, 대표에게 알림. 분기 점검의 '누락'도 여기로 */
export async function reportLost(db: Db, actor: Actor, id: string, note: string, now = new Date(), fromCheck = false) {
  const t = await row(db, id);
  if (t.status === "disposed") throw new ToolError("폐기한 치공구입니다");
  if (t.status === "lost") throw new ToolError("이미 분실로 기록했습니다");
  if (!can(actor, "equip.manage") && t.outBy !== actor.id && t.holderId !== actor.id) throw new ToolError("분실 신고는 공장장, 반출한 사람, 개인 공구 사용자가 합니다");
  if (!note.trim()) throw new ToolError("언제·어디서 마지막으로 봤는지 경위를 적어 주세요");
  await db.update(tool).set({ status: "lost", outBy: null, outAt: null, outNote: null, updatedAt: now }).where(eq(tool.id, id));
  await event(db, id, { kind: fromCheck ? "check" : "lost", result: fromCheck ? "missing" : undefined, quarter: fromCheck ? quarterOf(seoulDate(now)) : undefined, detail: note.trim() }, actor.id, now);
  await writeAudit(db, { actorId: actor.id, action: "tool.lost", entityType: "tool", entityId: t.no, after: { note: note.trim() } });
  await notifyRole(db, "owner", `치공구 분실: ${t.no} ${t.name} — ${note.trim()} (대체 구입은 전결에 따라 발주)`, `tool-lost-${id}-${now.getTime()}`, `/tools/${id}`);
  if (!actor.roles.includes("plant_manager")) await notifyRole(db, "plant_manager", `치공구 분실 신고: ${t.no} ${t.name} — ${note.trim()}`, `tool-lost-pm-${id}-${now.getTime()}`, `/tools/${id}`);
  return { result: "missing" as const, decision: null };
}

/** 되찾음·수리 끝 → 사용 가능 */
export async function restoreTool(db: Db, actor: Actor, id: string, note: string, now = new Date()) {
  must(actor);
  const t = await row(db, id);
  if (t.status !== "lost" && t.status !== "repair") throw new ToolError("분실·수리 중인 치공구만 되돌립니다");
  await db.update(tool).set({ status: "ok", updatedAt: now }).where(eq(tool.id, id));
  await event(db, id, { kind: t.status === "lost" ? "found" : "repaired", detail: clean(note) }, actor.id, now);
}

export async function disposeTool(db: Db, actor: Actor, id: string, note: string, now = new Date()) {
  must(actor);
  const t = await row(db, id);
  if (t.status === "disposed") throw new ToolError("이미 폐기했습니다");
  if (t.outAt) throw new ToolError("반출 중입니다. 먼저 반납해야 합니다");
  if (!note.trim()) throw new ToolError("폐기 이유를 적어 주세요");
  await db.update(tool).set({ status: "disposed", holderId: null, updatedAt: now }).where(eq(tool.id, id));
  await event(db, id, { kind: "dispose", detail: note.trim() }, actor.id, now);
  await writeAudit(db, { actorId: actor.id, action: "tool.dispose", entityType: "tool", entityId: t.no, after: { note: note.trim() } });
}

export async function markToolLabeled(db: Db, actor: Actor, id: string, now = new Date()) {
  must(actor);
  const t = await row(db, id);
  await db.update(tool).set({ labeledAt: now, updatedAt: now }).where(eq(tool.id, id));
  if (!t.labeledAt) await event(db, id, { kind: "label" }, actor.id, now);
}

export type ToolFilter = "active" | "out" | "special" | "mine" | "problem" | "disposed" | "all";

export async function listTools(db: Db, actor: Actor, filter: ToolFilter = "active") {
  const rows = await db.select().from(tool).orderBy(asc(tool.no));
  const ids = [...new Set(rows.flatMap((t) => [t.holderId, t.outBy, t.managerId]).filter((x): x is string => !!x))];
  const names = new Map((ids.length ? await db.select({ id: appUser.id, name: appUser.name }).from(appUser).where(inArray(appUser.id, ids)) : []).map((u) => [u.id, u.name]));
  const list = rows.filter((t) => {
    if (filter === "all") return true;
    if (filter === "disposed") return t.status === "disposed";
    if (t.status === "disposed") return false;
    if (filter === "out") return !!t.outAt;
    if (filter === "special") return t.special;
    if (filter === "mine") return t.holderId === actor.id || t.outBy === actor.id;
    if (filter === "problem") return t.status !== "ok" || !t.labeledAt;
    return true;
  });
  return { list, names };
}

export async function getTool(db: Db, id: string) {
  const t = await row(db, id);
  const events = await db.select({ e: toolEvent, by: appUser.name }).from(toolEvent).leftJoin(appUser, eq(appUser.id, toolEvent.by)).where(eq(toolEvent.toolId, id)).orderBy(desc(toolEvent.at));
  const ids = [t.holderId, t.outBy, t.managerId].filter((x): x is string => !!x);
  const names = new Map((ids.length ? await db.select({ id: appUser.id, name: appUser.name }).from(appUser).where(inArray(appUser.id, ids)) : []).map((u) => [u.id, u.name]));
  const q = quarterOf(seoulDate());
  const checkedThisQuarter = events.some(({ e }) => e.kind === "check" && e.quarter === q);
  return { t, events, names, quarter: q, checkedThisQuarter };
}

/** 이번 분기에 점검을 마친 치공구 id */
export async function checkedInQuarter(db: Db, quarter: string) {
  const r = await db.select({ id: toolEvent.toolId }).from(toolEvent).where(and(eq(toolEvent.kind, "check"), eq(toolEvent.quarter, quarter)));
  return new Set(r.map((x) => x.id));
}

/** 내 할 일: 반출한 채 날을 넘긴 것(본인), 공장장은 남이 안 돌려놓은 것·분기 말 점검·수리 중 */
export async function toolTodos(db: Db, actor: Actor, today: string) {
  const out: { key: string; when: "late" | "today" | "soon"; what: string; detail?: string; href: string; action: string }[] = [];
  const outRows = await db.select().from(tool).where(isNotNull(tool.outAt));
  for (const t of outRows.filter((x) => x.outBy === actor.id))
    out.push({ key: `tool-ret-${t.id}`, when: seoulDate(t.outAt!) < today ? "late" : "today", what: `치공구 반납: ${t.no} ${t.name}`, detail: `${seoulDate(t.outAt!)} 반출 · ${t.outNote ?? ""}`, href: `/tools/${t.id}`, action: "반납하기" });
  if (can(actor, "equip.manage") && !actor.roles.includes("owner")) {
    const late = outRows.filter((x) => x.outBy !== actor.id && seoulDate(x.outAt!) < today);
    if (late.length) out.push({ key: "tool-late", when: "late", what: `반납 안 된 치공구 ${late.length}개`, detail: late.slice(0, 4).map((t) => `${t.no} ${t.name}`).join(", "), href: "/tools?f=out", action: "확인하기" });
    if (quarterEndMonth(today)) {
      const q = quarterOf(today);
      const done = await checkedInQuarter(db, q);
      const left = (await db.select({ id: tool.id }).from(tool).where(ne(tool.status, "disposed"))).filter((t) => !done.has(t.id));
      if (left.length) out.push({ key: `tool-check-${q}`, when: today.slice(8) >= "20" ? "today" : "soon", what: `치공구 분기 점검 ${left.length}개 남음(${q.replace("-Q", "년 ")}분기)`, href: "/tools/check", action: "점검하기" });
    }
    const rep = await db.select({ id: tool.id }).from(tool).where(eq(tool.status, "repair"));
    if (rep.length) out.push({ key: "tool-repair", when: "soon", what: `수리 중인 치공구 ${rep.length}개`, href: "/tools?f=problem", action: "보기" });
  }
  return out;
}

