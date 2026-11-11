// 업무일지 '내가 적는 칸'과 마감·확인(사용자 결정 2026-11-11: 제안 5개 + 퇴근 전 마감·확인).
// 칸: 특이사항, 내일 할 일 메모, 앱 밖에서 한 일, 건의, 안전 확인. 모두 선택이지만 마감하려면 안전 확인은 답해야 한다.
// 마감하면 고치지 못하고 덧붙이기만. 확인: 기술자 등 → 공장장, 공장장 → 대표, 대표 본인 일지는 확인 없음.
import { and, count, eq, gte, inArray, isNull, lt, lte, ne } from "drizzle-orm";
import type { Db } from "@/db/client";
import { appUser, auditLog, dailyJournal, instruction, instructionTask, repairOrder, vehicle, workOrder, workStep, type OffAppRow } from "@/db/schema";
import type { Role } from "@/modules/auth/roles";
import { writeAudit } from "@/modules/platform/audit";
import { addBusinessDays } from "@/modules/platform/business-days";
import { loadShopCalendar } from "@/modules/platform/calendar";
import { notifyRole, notifyUser } from "@/modules/platform/notify";
import { addDays, seoulDate } from "@/modules/platform/time";
import { PROCESSES } from "@/modules/repair/work-rules";
import { buildJournal, dayRange, JournalError } from "./service";

type Actor = { id: string; roles: readonly Role[] };

/** 앱 밖에서 한 일: 자주 쓰는 종류 */
export const OFF_APP_KINDS = ["전화 응대", "고객 응대(방문)", "부품 받으러 감", "외근·출장", "청소·정리", "설비 손질", "교육·회의", "차량 이동·세차", "기타"] as const;


export const JOURNAL_STATUS = { draft: "작성 중", closed: "마감(확인 대기)", returned: "보완 요청", confirmed: "확인 끝" } as const;
export type JournalStatus = keyof typeof JOURNAL_STATUS;

export type EntryInput = {
  notes: string;
  tomorrow: string;
  offApp: OffAppRow[];
  suggestionText: string;
  /** "yes" 없음 / "no" 있음 / "" 아직 */
  safety: string;
  safetyNote: string;
};

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const HM = /^([01]\d|2[0-3]):[0-5]\d$/;
const clean = (s: string | null | undefined) => (s ?? "").trim() || null;

/** 확인할 역할: 대표 본인은 없음, 공장장은 대표, 나머지는 공장장 */
export function confirmRoleFor(roles: readonly Role[]): Role | null {
  if (roles.includes("owner")) return null;
  if (roles.includes("plant_manager")) return "owner";
  return "plant_manager";
}

export async function getEntry(db: Db, userId: string, day: string) {
  const [r] = await db.select().from(dailyJournal).where(and(eq(dailyJournal.userId, userId), eq(dailyJournal.day, day)));
  return r ?? null;
}

function checkInput(i: EntryInput) {
  const rows: OffAppRow[] = [];
  for (const r of i.offApp) {
    const from = r.from.trim();
    const to = r.to.trim();
    const kind = r.kind.trim();
    const detail = r.detail.trim();
    if (!from && !to && !kind && !detail) continue;
    if (!kind) throw new JournalError("앱 밖에서 한 일의 종류를 골라 주세요");
    if ((from && !HM.test(from)) || (to && !HM.test(to))) throw new JournalError("앱 밖에서 한 일의 시각은 09:30 처럼 적어 주세요");
    if (from && to && to <= from) throw new JournalError(`앱 밖에서 한 일(${kind})의 끝 시각이 시작보다 빠릅니다`);
    if (kind === "기타" && !detail) throw new JournalError("'기타'는 무슨 일인지 내용을 적어 주세요");
    rows.push({ from, to, kind, detail });
  }
  if (rows.length > 20) throw new JournalError("앱 밖에서 한 일은 20줄까지 적습니다");
  const safetyOk = i.safety === "yes" ? true : i.safety === "no" ? false : null;
  if (safetyOk === false && !i.safetyNote.trim()) throw new JournalError("다치거나 아차사고가 있었으면 무슨 일인지 적어 주세요(사고 보고로 이어 씁니다)");
  return {
    notes: clean(i.notes),
    tomorrow: clean(i.tomorrow),
    offApp: rows,
    suggestionText: clean(i.suggestionText),
    safetyOk,
    safetyNote: safetyOk === false ? i.safetyNote.trim() : null,
  };
}

function checkDay(day: string, now: Date) {
  if (!ISO.test(day)) throw new JournalError("날짜를 YYYY-MM-DD 로 넣어 주세요");
  if (day > seoulDate(now)) throw new JournalError("내일 이후 일지는 미리 쓸 수 없습니다");
}

/** 저장(작성 중·보완 요청일 때만). 본인 일지만 */
export async function saveEntry(db: Db, actor: Actor, day: string, input: EntryInput, now = new Date()) {
  checkDay(day, now);
  const v = checkInput(input);
  const cur = await getEntry(db, actor.id, day);
  if (cur && (cur.status === "closed" || cur.status === "confirmed")) throw new JournalError("마감한 일지는 고칠 수 없습니다. 아래 '덧붙이기'로 더해 주세요");
  if (cur) {
    await db.update(dailyJournal).set({ ...v, updatedAt: now }).where(eq(dailyJournal.id, cur.id));
    return cur.id;
  }
  const [r] = await db.insert(dailyJournal).values({ userId: actor.id, day, ...v, createdAt: now, updatedAt: now }).returning({ id: dailyJournal.id });
  return r.id;
}

/** 마감: 저장하고 닫는다. 안전 확인을 답해야 한다. 자동 기록 요약 숫자를 남긴다 */
export async function closeEntry(db: Db, actor: Actor, day: string, input: EntryInput, now = new Date()) {
  const id = await saveEntry(db, actor, day, input, now);
  const e = (await getEntry(db, actor.id, day))!;
  if (e.safetyOk === null) throw new JournalError("마감하려면 안전 확인(오늘 다치거나 아차사고가 있었는지)에 답해 주세요");
  const j = await buildJournal(db, actor, actor.id, day);
  const role = confirmRoleFor(j.user.roles);
  const snapshot = { entries: j.entries.length, workMinutes: j.workMinutes, stdMinutes: j.stdMinutes, steps: j.steps.length, carry: j.carry.length, firstAt: j.firstAt?.toISOString() ?? null, lastAt: j.lastAt?.toISOString() ?? null };
  await db
    .update(dailyJournal)
    .set({ status: role ? "closed" : "confirmed", closedAt: now, snapshot, confirmRole: role, confirmedAt: role ? null : now, returnNote: null, updatedAt: now })
    .where(eq(dailyJournal.id, id));
  await writeAudit(db, { actorId: actor.id, action: "journal.close", entityType: "daily_journal", entityId: day, after: { safetyOk: e.safetyOk, entries: snapshot.entries } });
  if (role) await notifyRole(db, role, `업무일지 마감: ${j.user.name} ${day}`, `jn-close-${id}-${now.getTime()}`, `/journal?d=${day}&u=${actor.id}`);
  if (e.safetyOk === false) await notifyRole(db, "safety", `업무일지 안전 확인 '있음': ${j.user.name} ${day} — ${e.safetyNote}`, `jn-safety-${id}`, `/journal?d=${day}&u=${actor.id}`);
  return { status: role ? ("closed" as const) : ("confirmed" as const), safetyOk: e.safetyOk };
}

/** 마감 뒤 덧붙이기(본인). 고치지 않고 더하기만 */
export async function addAddendum(db: Db, actor: Actor, day: string, text: string, now = new Date()) {
  const e = await getEntry(db, actor.id, day);
  if (!e || (e.status !== "closed" && e.status !== "confirmed")) throw new JournalError("덧붙이기는 마감한 일지에만 합니다. 작성 중이면 칸을 고쳐 저장하세요");
  if (!text.trim()) throw new JournalError("덧붙일 내용을 적어 주세요");
  await db
    .update(dailyJournal)
    .set({ addenda: [...e.addenda, { at: now.toISOString(), by: actor.id, text: text.trim() }], updatedAt: now })
    .where(eq(dailyJournal.id, e.id));
}

function canConfirm(actor: Actor, e: { userId: string; confirmRole: string | null }) {
  if (actor.id === e.userId || !e.confirmRole) return false;
  return actor.roles.includes(e.confirmRole as Role) || actor.roles.includes("owner");
}

/** 확인(공장장·대표). 보완 요청이면 사유를 받아 본인에게 돌려보낸다 */
export async function reviewEntry(db: Db, actor: Actor, userId: string, day: string, ok: boolean, note: string, now = new Date()) {
  const e = await getEntry(db, userId, day);
  if (!e || e.status !== "closed") throw new JournalError("마감되어 확인을 기다리는 일지가 아닙니다");
  if (!canConfirm(actor, e)) throw new JournalError(e.confirmRole === "owner" ? "공장장 일지는 대표가 확인합니다" : "업무일지 확인은 공장장(또는 대표)이 합니다. 자기 일지는 확인할 수 없습니다");
  if (!ok && !note.trim()) throw new JournalError("보완 요청 사유를 적어 주세요");
  await db
    .update(dailyJournal)
    .set(ok ? { status: "confirmed", confirmedBy: actor.id, confirmedAt: now, updatedAt: now } : { status: "returned", returnNote: note.trim(), returnedAt: now, updatedAt: now })
    .where(eq(dailyJournal.id, e.id));
  await writeAudit(db, { actorId: actor.id, action: ok ? "journal.confirm" : "journal.return", entityType: "daily_journal", entityId: day, after: { user: userId, note: clean(note) } });
  if (!ok) await notifyUser(db, userId, `업무일지 보완 요청(${day}): ${note.trim()}`, `jn-ret-${e.id}-${now.getTime()}`, `/journal?d=${day}`);
}

/** 건의를 개선 제안으로 올렸으면 번호를 남긴다 */
export async function linkSuggestion(db: Db, actor: Actor, day: string, docNo: string, now = new Date()) {
  const e = await getEntry(db, actor.id, day);
  if (e) await db.update(dailyJournal).set({ suggestionNo: docNo, updatedAt: now }).where(eq(dailyJournal.id, e.id));
}

const procLabel = (p: string) => (PROCESSES as Record<string, { label: string }>)[p]?.label ?? p;

/** 내일 할 일(자동): 넘어가는 일 + 다음 영업일에 배정된 공정 + 다음 영업일까지 기한인 받은 지시 */
export async function tomorrowPlan(db: Db, actor: Actor, userId: string, day: string) {
  const j = await buildJournal(db, actor, userId, day);
  const next = addBusinessDays(day, 1, await loadShopCalendar(db));
  const [steps, tasks] = await Promise.all([
    db
      .select({ process: workStep.process, woNo: workOrder.docNo, woId: workOrder.id, plate: vehicle.plateNo })
      .from(workStep)
      .innerJoin(workOrder, eq(workOrder.id, workStep.workOrderId))
      .innerJoin(repairOrder, eq(repairOrder.id, workOrder.repairOrderId))
      .leftJoin(vehicle, eq(vehicle.id, repairOrder.vehicleId))
      .where(and(eq(workStep.assignee, userId), eq(workStep.planDate, next), isNull(workStep.endedAt))),
    db
      .select({ docNo: instruction.docNo, title: instruction.title, insId: instruction.id, dueOn: instruction.dueOn })
      .from(instructionTask)
      .innerJoin(instruction, eq(instruction.id, instructionTask.instructionId))
      .where(and(eq(instructionTask.assigneeId, userId), eq(instructionTask.status, "open"), lte(instruction.dueOn, next), gte(instruction.dueOn, addDays(day, 1)))),
  ]);
  return {
    next,
    items: [
      ...j.carry.map((c) => ({ ...c, kind: "넘어감" })),
      ...steps.map((s) => ({ text: `공정 ${procLabel(s.process)}`, ref: `${s.plate ?? ""} ${s.woNo}`.trim(), href: `/work/${s.woId}`, due: next, kind: "배정" })),
      ...tasks.map((t) => ({ text: `업무지시: ${t.title}`, ref: t.docNo, href: `/tasks/${t.insId}`, due: t.dueOn, kind: "기한" })),
    ],
  };
}

/** 내 할 일: 마감 안 한 지난 일지(최근 3일, 기록이 있던 날), 보완 요청, 오늘 퇴근 전 마감, 확인할 일지 */
export async function journalTodos(db: Db, actor: Actor, now = new Date()) {
  const today = seoulDate(now);
  const out: { key: string; when: "late" | "today" | "soon"; what: string; detail?: string; href: string; action: string }[] = [];
  const mine = await db.select().from(dailyJournal).where(and(eq(dailyJournal.userId, actor.id), gte(dailyJournal.day, addDays(today, -3))));
  const byDay = new Map(mine.map((e) => [e.day, e]));
  for (let k = 0; k <= 3; k++) {
    const d = addDays(today, -k);
    const e = byDay.get(d);
    if (e?.status === "returned") {
      out.push({ key: `jn-ret-${d}`, when: "today", what: `업무일지 보완 요청: ${d}`, detail: e.returnNote ?? undefined, href: `/journal?d=${d}`, action: "고쳐 다시 마감" });
      continue;
    }
    if (e && e.status !== "draft") continue;
    const { from, to } = dayRange(d);
    const [{ n }] = await db.select({ n: count() }).from(auditLog).where(and(eq(auditLog.actorId, actor.id), gte(auditLog.at, from), lt(auditLog.at, to), ne(auditLog.action, "auth.login")));
    if (!n && !e) continue;
    out.push(
      k === 0
        ? { key: `jn-today`, when: "soon", what: "퇴근 전 업무일지 마감", detail: "자동 기록을 보고 특이사항·내일 할 일·안전 확인을 적은 뒤 마감합니다", href: `/journal?d=${d}`, action: "일지 쓰기" }
        : { key: `jn-late-${d}`, when: "late", what: `업무일지 마감 안 함: ${d}`, detail: "그날 기록이 있는데 마감하지 않았습니다", href: `/journal?d=${d}`, action: "마감하기" },
    );
  }
  const roles = actor.roles.filter((r) => r === "owner" || r === "plant_manager");
  if (roles.length) {
    const waiting = await db
      .select({ day: dailyJournal.day, userId: dailyJournal.userId, name: appUser.name })
      .from(dailyJournal)
      .innerJoin(appUser, eq(appUser.id, dailyJournal.userId))
      .where(and(eq(dailyJournal.status, "closed"), inArray(dailyJournal.confirmRole, roles)));
    for (const w of waiting.filter((x) => x.userId !== actor.id))
      out.push({ key: `jn-cf-${w.userId}-${w.day}`, when: w.day < addDays(today, -1) ? "late" : "today", what: `업무일지 확인: ${w.name} ${w.day}`, href: `/journal?d=${w.day}&u=${w.userId}`, action: "확인하기" });
  }
  return out;
}

/** 직원별 요약에 붙일 일지 상태 */
export async function entryStatuses(db: Db, day: string) {
  const rows = await db.select({ userId: dailyJournal.userId, status: dailyJournal.status, safetyOk: dailyJournal.safetyOk }).from(dailyJournal).where(eq(dailyJournal.day, day));
  return new Map(rows.map((r) => [r.userId, r]));
}
