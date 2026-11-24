// 연차 사용 촉진(근로기준법 제61조, STD-11 7.4)과 남은 연차 보상(대표 결정 2026-11-25: 연차는 월급에 미리 넣지 않고 촉진 + 연말 정산).
// 1차: 앱이 기간(연차 연도 끝 6개월 전부터 10일, 1년 미만은 3개월 전) 안에 직원에게 남은 일수를 알리고 쓸 날을 내라고 보낸다.
// 2차: 직원이 10일 안에 내지 않으면 대표·회계가 쓸 날을 정해 보낸다(끝 2개월 전까지, 1년 미만은 1개월 전). 앱이 할 일로 알린다.
// 연차 연도가 끝나면 급여 계산이 남은 일수를 보고, 촉진을 다 했으면 보상 없음, 아니면 '미사용 연차수당'을 넣는다(payroll.ts).
import { and, eq, isNull } from "drizzle-orm";
import type { Db } from "@/db/client";
import { appUser, leaveNotice, staffProfile, userRole } from "@/db/schema";
import { can } from "@/modules/auth/permissions";
import type { Role } from "@/modules/auth/roles";
import { writeAudit } from "@/modules/platform/audit";
import { UserError } from "@/modules/platform/errors";
import { notifyRole, notifyUser } from "@/modules/platform/notify";
import { loadPolicy } from "@/modules/platform/policy";
import { seoulDate } from "@/modules/platform/time";
import { leaveBalance } from "./attendance";
import { planDue, promoteDone, promoteWindows } from "./leave-rules";

export class PromoteError extends UserError {}
type Actor = { id: string; roles: Role[] };
type Notice = typeof leaveNotice.$inferSelect;

export const canAssign = (a: Actor) => can(a, "staff.roster");

/** 촉진 대상: 근로자 명부에 입사일이 있고 퇴직하지 않은 직원(대표 제외) */
async function members(db: Db, on: string) {
  const [rows, owners] = await Promise.all([
    db.select({ id: appUser.id, name: appUser.name, hiredOn: staffProfile.hiredOn, leftOn: staffProfile.leftOn, active: appUser.active }).from(staffProfile).innerJoin(appUser, eq(appUser.id, staffProfile.userId)),
    db.select({ userId: userRole.userId }).from(userRole).where(eq(userRole.role, "owner")),
  ]);
  const own = new Set(owners.map((o) => o.userId));
  return rows.filter((r) => r.hiredOn && r.hiredOn <= on && (!r.leftOn || r.leftOn >= on) && r.active && !own.has(r.id));
}

async function noticesOf(db: Db, userId: string, yearFrom: string) {
  const rows = await db.select().from(leaveNotice).where(and(eq(leaveNotice.userId, userId), eq(leaveNotice.yearFrom, yearFrom)));
  return { r1: rows.find((r) => r.round === 1) ?? null, r2: rows.find((r) => r.round === 2) ?? null };
}

/** 한 사람·한 연차 연도의 촉진 상태 */
export async function promoteState(db: Db, userId: string, on = seoulDate()) {
  const bal = await leaveBalance(db, userId, on);
  if (!bal) return null;
  const w = promoteWindows(bal);
  const { r1, r2 } = await noticesOf(db, userId, bal.from);
  const done = promoteDone(w, { r1On: r1?.sentOn, planOn: r1?.planOn, r2On: r2?.sentOn });
  const needR2 = !!r1 && !r1.planOn && on >= planDue(r1.sentOn) && !r2;
  return { bal, w, r1, r2, done, needR2 };
}

/** 대표·회계 화면: 직원별 촉진 상태 */
export async function promoteBoard(db: Db, actor: Actor, on = seoulDate()) {
  if (!canAssign(actor)) throw new PromoteError("연차 촉진 현황은 대표·회계 담당이 봅니다");
  const out = [];
  for (const m of await members(db, on)) {
    const s = await promoteState(db, m.id, on);
    if (s) out.push({ userId: m.id, name: m.name, ...s });
  }
  return out;
}

/** 매일: 1차 기간이면 앱이 촉진서를 보내고, 2차가 필요하면 대표·회계에게 알린다(정책값 leave.promote = 0 이면 하지 않음) */
export async function leavePromoteDaily(db: Db, now = new Date()) {
  const today = seoulDate(now);
  const pol = await loadPolicy(db, today);
  if (pol["leave.promote"] !== 1) return "연차 촉진 꺼짐";
  let sent = 0;
  let need = 0;
  for (const m of await members(db, today)) {
    const s = await promoteState(db, m.id, today);
    if (!s) continue;
    const remain = Math.max(0, s.bal.days - s.bal.used - s.bal.pending);
    if (!s.r1 && remain > 0 && today >= s.w.r1From && today <= s.w.r1To) {
      await db
        .insert(leaveNotice)
        .values({ userId: m.id, round: 1, yearFrom: s.bal.from, yearTo: s.bal.to, remain, sentOn: today })
        .onConflictDoNothing();
      await notifyUser(db, m.id, `연차 사용 촉진: 남은 연차 ${remain}일. ${planDue(today)}까지 쓸 날을 정해 내 주세요`, `lp1-${m.id}-${s.bal.from}`, "/attendance");
      await notifyRole(db, "owner", `${m.name} 연차 사용 촉진(1차)을 보냈습니다: 남은 ${remain}일`, `lp1o-${m.id}-${s.bal.from}`, "/staff/leave-promote");
      sent++;
    } else if (s.needR2 && today <= s.w.r2Due) {
      await notifyRole(db, "owner", `${m.name} 연차 쓸 날 지정(2차) 필요: ${s.w.r2Due}까지`, `lp2-${m.id}-${s.bal.from}`, "/staff/leave-promote");
      need++;
    }
  }
  return `연차 촉진 1차 ${sent}명 · 2차 필요 ${need}명`;
}

/** 직원: 1차 촉진서에 쓸 날을 내거나(받았음 확인 포함), 2차 통보를 받았음 확인 */
export async function answerNotice(db: Db, actor: Actor, id: string, plan: string, now = new Date()) {
  const [n] = await db.select().from(leaveNotice).where(eq(leaveNotice.id, id));
  if (!n || n.userId !== actor.id) throw new PromoteError("내 촉진서가 아닙니다");
  const today = seoulDate(now);
  const set: Partial<Notice> = { confirmedAt: n.confirmedAt ?? now };
  if (n.round === 1) {
    const p = plan.trim();
    if (!p) throw new PromoteError("쓸 날을 적어 주세요(예: 12월 24일, 12월 26일)");
    set.planText = p.slice(0, 300);
    set.planOn = today;
  }
  await db.update(leaveNotice).set(set).where(eq(leaveNotice.id, id));
  await writeAudit(db, { actorId: actor.id, action: n.round === 1 ? "leave_notice.plan" : "leave_notice.confirm", entityType: "leave_notice", entityId: id, after: { plan: set.planText ?? null } });
  if (n.round === 1) await notifyRole(db, "owner", `연차 쓸 날 제출: ${set.planText}`, `lpp-${id}`, "/staff/leave-promote");
}

/** 대표·회계: 2차 — 직원이 쓸 날을 내지 않았으면 회사가 정해 보낸다 */
export async function assignDates(db: Db, actor: Actor, userId: string, dates: string, now = new Date()) {
  if (!canAssign(actor)) throw new PromoteError("쓸 날 지정은 대표·회계 담당이 합니다");
  const today = seoulDate(now);
  const s = await promoteState(db, userId, today);
  if (!s) throw new PromoteError("근로자 명부에 입사일이 없습니다");
  if (!s.r1) throw new PromoteError("1차 촉진서를 먼저 보내야 합니다");
  if (s.r2) throw new PromoteError("이미 2차 통보를 보냈습니다");
  const d = dates.trim();
  if (!d) throw new PromoteError("쓸 날을 적어 주세요");
  const remain = Math.max(0, s.bal.days - s.bal.used - s.bal.pending);
  await db.insert(leaveNotice).values({ userId, round: 2, yearFrom: s.bal.from, yearTo: s.bal.to, remain, sentOn: today, sentBy: actor.id, dates: d.slice(0, 300) });
  await writeAudit(db, { actorId: actor.id, action: "leave_notice.assign", entityType: "app_user", entityId: userId, after: { dates: d, late: today > s.w.r2Due } });
  await notifyUser(db, userId, `연차 쓸 날 통보: ${d}. 앱에서 받았음을 확인해 주세요`, `lp2u-${userId}-${s.bal.from}`, "/attendance");
  return { late: today > s.w.r2Due };
}

/** 대표·회계가 1차를 직접 보냄(기간을 놓쳤거나 자동 발송을 꺼 둔 경우). 기간 밖이면 보상 면제 근거가 되지 않는다 */
export async function sendFirst(db: Db, actor: Actor, userId: string, now = new Date()) {
  if (!canAssign(actor)) throw new PromoteError("촉진서는 대표·회계 담당이 보냅니다");
  const today = seoulDate(now);
  const s = await promoteState(db, userId, today);
  if (!s) throw new PromoteError("근로자 명부에 입사일이 없습니다");
  if (s.r1) throw new PromoteError("이미 1차 촉진서를 보냈습니다");
  const remain = Math.max(0, s.bal.days - s.bal.used - s.bal.pending);
  await db.insert(leaveNotice).values({ userId, round: 1, yearFrom: s.bal.from, yearTo: s.bal.to, remain, sentOn: today, sentBy: actor.id });
  await notifyUser(db, userId, `연차 사용 촉진: 남은 연차 ${remain}일. ${planDue(today)}까지 쓸 날을 정해 내 주세요`, `lp1-${userId}-${s.bal.from}`, "/attendance");
  return { inWindow: today >= s.w.r1From && today <= s.w.r1To };
}

/** 직원 화면: 지금 연차 연도의 촉진서(답하지 않은 것 먼저) */
export async function myNotices(db: Db, userId: string, on = seoulDate()) {
  const s = await promoteState(db, userId, on);
  if (!s) return null;
  return { w: s.w, r1: s.r1, r2: s.r2, bal: s.bal };
}

/** 할 일: 2차가 필요한 직원(대표·회계) */
export async function promoteTodos(db: Db, actor: Actor, today: string) {
  if (!canAssign(actor)) return [];
  const pending = await db.select({ userId: leaveNotice.userId }).from(leaveNotice).where(and(eq(leaveNotice.round, 1), isNull(leaveNotice.planOn)));
  if (!pending.length) return [];
  const out: { key: string; when: "late" | "today" | "soon"; what: string; detail?: string; href: string; action: string }[] = [];
  for (const r of await promoteBoard(db, actor, today)) {
    if (!r.needR2) continue;
    out.push({
      key: `lp2-${r.userId}-${r.bal.from}`,
      when: today > r.w.r2Due ? "late" : "today",
      what: `${r.name} 연차 쓸 날 지정(2차)`,
      detail: `${r.w.r2Due}까지 · 남은 ${Math.max(0, r.bal.days - r.bal.used - r.bal.pending)}일`,
      href: "/staff/leave-promote",
      action: "지정하기",
    });
  }
  return out;
}

/**
 * 급여 계산용: 이 달에 연차 연도가 끝난(새 연도가 시작된) 직원의 지난 연도 남은 연차와 촉진 여부.
 * 퇴직하는 달이면 지금 연도의 남은 연차(촉진과 관계없이 보상).
 */
export async function leavePayFor(db: Db, userId: string, ym: { from: string; to: string }, leftOn: string | null) {
  if (leftOn && leftOn >= ym.from && leftOn <= ym.to) {
    const b = await leaveBalance(db, userId, leftOn);
    if (!b) return null;
    const remain = Math.max(0, b.days - b.used);
    return remain ? { days: remain, reason: `퇴직: ${b.from}~${b.to} 연차 중 남은 ${remain}일`, paid: true } : null;
  }
  const cur = await leaveBalance(db, userId, ym.to);
  if (!cur || cur.from < ym.from || cur.from > ym.to || cur.from === cur.hiredOn) return null;
  const prevDay = new Date(Date.parse(`${cur.from}T00:00:00Z`) - 864e5).toISOString().slice(0, 10);
  const b = await leaveBalance(db, userId, prevDay);
  if (!b) return null;
  const remain = Math.max(0, b.days - b.used);
  if (!remain) return null;
  const w = promoteWindows(b);
  const { r1, r2 } = await noticesOf(db, userId, b.from);
  const done = promoteDone(w, { r1On: r1?.sentOn, planOn: r1?.planOn, r2On: r2?.sentOn });
  return {
    days: remain,
    reason: `${b.from}~${b.to} 연차 ${b.days}일 중 남은 ${remain}일`,
    paid: !done,
  };
}
