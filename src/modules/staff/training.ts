// 교육 기록(F-11-03), STD-11 5절·취업규칙 제27조
// 5.1 연간 계획(대표, 1월) → 5.2 실시·이수자 서명(교육 주관자, 당일) → 5.3 효과 확인(공장장, 1개월 뒤) · 4.7 채용 시 교육
import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import type { Db } from "@/db/client";
import { appUser, staffProfile, training, trainingAttendee } from "@/db/schema";
import { can } from "@/modules/auth/permissions";
import type { Role } from "@/modules/auth/roles";
import { writeAudit } from "@/modules/platform/audit";
import { nextDocNo } from "@/modules/platform/docno";
import { UserError } from "@/modules/platform/errors";
import { notifyUser } from "@/modules/platform/notify";
import { addDays, seoulDate } from "@/modules/platform/time";
import {
  DEFAULT_PLAN,
  EFFECT_DAYS,
  EFFECT_METHODS,
  EFFECT_RESULTS,
  HIRE_WINDOW_DAYS,
  isTrKind,
  TR_KINDS,
  ym,
  type TrKind,
} from "./training-rules";

export class TrainingError extends UserError {}
type Actor = { id: string; roles: Role[] };
const clean = (s: string | null | undefined) => (s ?? "").trim() || null;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const YM = /^\d{4}-\d{2}$/;
const must = (a: Actor) => {
  if (!can(a, "training.manage"))
    throw new TrainingError(
      "교육 기록은 대표·공장장·안전환경 담당이 관리합니다",
    );
};

async function row(db: Db, id: string) {
  const [x] = await db.select().from(training).where(eq(training.id, id));
  if (!x) throw new TrainingError("교육을 찾을 수 없습니다");
  return x;
}

export type TrainingInput = {
  year: number;
  kind: string;
  title: string;
  plannedMonth: string;
  plannedHours: number | null;
  target: string;
  organizerId: string;
};

function check(i: TrainingInput) {
  if (!isTrKind(i.kind)) throw new TrainingError("교육 종류를 골라 주세요");
  if (!i.title.trim()) throw new TrainingError("교육 이름을 적어 주세요");
  if (!Number.isInteger(i.year) || i.year < 2020 || i.year > 2100)
    throw new TrainingError("연도를 확인해 주세요");
  const pm = clean(i.plannedMonth);
  if (pm && (!YM.test(pm) || !pm.startsWith(`${i.year}-`)))
    throw new TrainingError("계획 달은 같은 해의 달로 골라 주세요");
  if (i.plannedHours !== null && !(i.plannedHours > 0 && i.plannedHours <= 100))
    throw new TrainingError("계획 시간을 확인해 주세요(0.5~100시간)");
  return {
    year: i.year,
    kind: i.kind,
    title: i.title.trim(),
    plannedMonth: pm,
    plannedHours: i.plannedHours,
    target: clean(i.target),
    organizerId: clean(i.organizerId),
  };
}

/** 계획 올리기(연간 계획 한 줄, 또는 채용 시·작업 변경 같은 수시 교육) */
export async function createTraining(
  db: Db,
  actor: Actor,
  input: TrainingInput,
  now = new Date(),
) {
  must(actor);
  const v = check(input);
  const docNo = await nextDocNo(db, "TR", now);
  const [r] = await db
    .insert(training)
    .values({
      ...v,
      docNo,
      createdBy: actor.id,
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: training.id });
  await writeAudit(db, {
    actorId: actor.id,
    action: "training.plan",
    entityType: "training",
    entityId: docNo,
    after: { title: v.title, kind: v.kind, plannedMonth: v.plannedMonth },
  });
  if (v.organizerId && v.organizerId !== actor.id)
    await notifyUser(
      db,
      v.organizerId,
      `교육 주관 지정: ${v.title}${v.plannedMonth ? ` (${v.plannedMonth})` : ""}`,
      `tr-org-${r.id}`,
      `/training/${r.id}`,
    );
  return r.id;
}

/**
 * 5.1 연간 계획 불러오기(대표). 작년 계획이 있으면 작년 것을(수시 교육 빼고), 없으면 기본 계획을 넣는다.
 * 이미 같은 종류·이름이 있는 줄은 건너뛴다.
 */
export async function importYearPlan(
  db: Db,
  actor: Actor,
  year: number,
  now = new Date(),
) {
  if (!can(actor, "training.plan"))
    throw new TrainingError("연간 교육 계획은 대표가 세웁니다");
  const have = await db
    .select({ kind: training.kind, title: training.title })
    .from(training)
    .where(eq(training.year, year));
  const last = (
    await db
      .select()
      .from(training)
      .where(eq(training.year, year - 1))
  ).filter(
    (x) =>
      x.plannedMonth &&
      x.kind !== "safety_hire" &&
      x.kind !== "safety_change" &&
      x.kind !== "ojt" &&
      x.status !== "cancelled",
  );
  const src = last.length
    ? last.map((x) => ({
        kind: x.kind as TrKind,
        title: x.title,
        month: Number(x.plannedMonth!.slice(5)),
        hours: x.plannedHours ?? 1,
        target: x.target ?? "",
      }))
    : DEFAULT_PLAN;
  // 올해 계획을 늦게 세우면 이미 지난 달은 이번 달로 당긴다(지난 달로 넣으면 모두 '늦음'이 됨)
  const now_ = seoulDate(now);
  const minMonth =
    Number(now_.slice(0, 4)) === year ? Number(now_.slice(5, 7)) : 1;
  let n = 0;
  for (const p of src) {
    if (have.some((h) => h.kind === p.kind && h.title === p.title)) continue;
    await createTraining(
      db,
      actor,
      {
        year,
        kind: p.kind,
        title: p.title,
        plannedMonth: ym(year, Math.max(p.month, minMonth)),
        plannedHours: p.hours,
        target: p.target,
        organizerId: "",
      },
      now,
    );
    n++;
  }
  return { n, from: last.length ? ("last" as const) : ("default" as const) };
}

export async function updateTraining(
  db: Db,
  actor: Actor,
  id: string,
  input: TrainingInput,
  now = new Date(),
) {
  must(actor);
  const x = await row(db, id);
  if (x.status !== "planned")
    throw new TrainingError("실시·취소한 교육의 계획은 고칠 수 없습니다");
  await db
    .update(training)
    .set({ ...check(input), updatedAt: now })
    .where(eq(training.id, id));
}

export type HeldInput = {
  heldOn: string;
  hours: number;
  instructor: string;
  content: string;
  attendeeIds: string[];
};

/** 5.2 실시 기록: 이수자에게 서명 요청 알림. 직무 교육은 효과 확인 기한(+1개월)을 잡는다 */
export async function recordHeld(
  db: Db,
  actor: Actor,
  id: string,
  input: HeldInput,
  now = new Date(),
) {
  const x = await row(db, id);
  if (!can(actor, "training.manage") && x.organizerId !== actor.id)
    throw new TrainingError("교육 주관자나 관리자가 기록합니다");
  if (x.status === "cancelled") throw new TrainingError("취소한 교육입니다");
  if (!DATE.test(input.heldOn))
    throw new TrainingError("실시한 날을 적어 주세요");
  if (input.heldOn > seoulDate(now))
    throw new TrainingError("아직 오지 않은 날은 실시 기록을 할 수 없습니다");
  if (!(input.hours > 0 && input.hours <= 100))
    throw new TrainingError("교육 시간을 적어 주세요");
  if (!input.instructor.trim())
    throw new TrainingError("강사(외부 기관이면 기관명)를 적어 주세요");
  const ids = [...new Set(input.attendeeIds.filter(Boolean))];
  if (!ids.length) throw new TrainingError("이수자를 한 명 이상 골라 주세요");
  const users = await db
    .select({ id: appUser.id })
    .from(appUser)
    .where(inArray(appUser.id, ids));
  if (users.length !== ids.length)
    throw new TrainingError("이수자 중에 없는 직원이 있습니다");
  const effect = TR_KINDS[x.kind as TrKind]?.effect;
  await db
    .update(training)
    .set({
      status: "done",
      heldOn: input.heldOn,
      hours: input.hours,
      instructor: input.instructor.trim(),
      content: clean(input.content),
      effectDue: effect ? addDays(input.heldOn, EFFECT_DAYS) : null,
      updatedAt: now,
    })
    .where(eq(training.id, id));
  const before = await db
    .select()
    .from(trainingAttendee)
    .where(eq(trainingAttendee.trainingId, id));
  for (const b of before.filter((b) => !ids.includes(b.userId))) {
    if (b.signedAt)
      throw new TrainingError("이미 서명한 이수자는 뺄 수 없습니다");
    await db.delete(trainingAttendee).where(eq(trainingAttendee.id, b.id));
  }
  for (const u of ids) {
    const old = before.find((b) => b.userId === u);
    if (old)
      await db
        .update(trainingAttendee)
        .set({ hours: input.hours })
        .where(eq(trainingAttendee.id, old.id));
    else {
      await db
        .insert(trainingAttendee)
        .values({ trainingId: id, userId: u, hours: input.hours });
      await notifyUser(
        db,
        u,
        `교육 이수 서명: ${x.title} (${input.heldOn})`,
        `tr-sign-${id}-${u}`,
        `/training/${id}`,
      );
    }
  }
  await writeAudit(db, {
    actorId: actor.id,
    action: "training.held",
    entityType: "training",
    entityId: x.docNo,
    after: { heldOn: input.heldOn, hours: input.hours, attendees: ids.length },
  });
}

/** 이수자 본인 서명 */
export async function signTraining(
  db: Db,
  actor: Actor,
  id: string,
  now = new Date(),
) {
  const x = await row(db, id);
  if (x.status !== "done")
    throw new TrainingError("실시 기록이 있어야 서명합니다");
  const [a] = await db
    .select()
    .from(trainingAttendee)
    .where(
      and(
        eq(trainingAttendee.trainingId, id),
        eq(trainingAttendee.userId, actor.id),
      ),
    );
  if (!a) throw new TrainingError("이 교육의 이수자가 아닙니다");
  if (a.signedAt) return;
  await db
    .update(trainingAttendee)
    .set({ signedAt: now })
    .where(eq(trainingAttendee.id, a.id));
}

/** 5.3 효과 확인(공장장): 직무 교육. 효과 없음이면 재교육 계획을 같이 올린다 */
export async function checkEffect(
  db: Db,
  actor: Actor,
  id: string,
  input: { method: string; result: string; note: string },
  now = new Date(),
) {
  if (!can(actor, "training.effect"))
    throw new TrainingError("교육 효과 확인은 공장장이 합니다");
  const x = await row(db, id);
  if (x.status !== "done" || !x.effectDue)
    throw new TrainingError("효과 확인 대상이 아닙니다(실시한 직무 교육만)");
  if (x.effectAt) throw new TrainingError("이미 효과를 확인했습니다");
  if (!(input.method in EFFECT_METHODS))
    throw new TrainingError("확인 방법을 골라 주세요");
  if (!(input.result in EFFECT_RESULTS))
    throw new TrainingError("결과를 골라 주세요");
  if (!input.note.trim())
    throw new TrainingError(
      "확인한 근거를 적어 주세요(실습 점수, 재작업 건수 등)",
    );
  await db
    .update(training)
    .set({
      effectMethod: input.method,
      effectResult: input.result,
      effectNote: input.note.trim(),
      effectBy: actor.id,
      effectAt: now,
      updatedAt: now,
    })
    .where(eq(training.id, id));
  await writeAudit(db, {
    actorId: actor.id,
    action: "training.effect",
    entityType: "training",
    entityId: x.docNo,
    after: { result: input.result },
  });
  let retrain: string | null = null;
  if (input.result === "none") {
    const today = seoulDate(now);
    const next =
      today.slice(0, 7) < `${x.year}-12`
        ? addDays(today, 31).slice(0, 7)
        : null;
    retrain = await createTraining(
      db,
      actor,
      {
        year: Number((next ?? today).slice(0, 4)),
        kind: x.kind,
        title: `${x.title} (재교육)`,
        plannedMonth: next ?? addDays(today, 31).slice(0, 7),
        plannedHours: x.hours,
        target: x.target ?? "",
        organizerId: x.organizerId ?? "",
      },
      now,
    );
  }
  return { retrain };
}

export async function cancelTraining(
  db: Db,
  actor: Actor,
  id: string,
  reason: string,
  now = new Date(),
) {
  must(actor);
  const x = await row(db, id);
  if (x.status !== "planned")
    throw new TrainingError("계획 상태인 교육만 취소합니다");
  if (!reason.trim())
    throw new TrainingError(
      "취소 이유를 적어 주세요(다른 달로 옮기면 계획 달을 고치세요)",
    );
  await db
    .update(training)
    .set({ status: "cancelled", cancelReason: reason.trim(), updatedAt: now })
    .where(eq(training.id, id));
  await writeAudit(db, {
    actorId: actor.id,
    action: "training.cancel",
    entityType: "training",
    entityId: x.docNo,
    after: { reason: reason.trim() },
  });
}

export async function listTrainings(db: Db, year: number) {
  const rows = await db
    .select()
    .from(training)
    .where(eq(training.year, year))
    .orderBy(asc(training.plannedMonth), asc(training.createdAt));
  const att = rows.length
    ? await db
        .select()
        .from(trainingAttendee)
        .where(
          inArray(
            trainingAttendee.trainingId,
            rows.map((r) => r.id),
          ),
        )
    : [];
  return rows.map((t) => {
    const a = att.filter((x) => x.trainingId === t.id);
    return {
      t,
      attendees: a.length,
      signed: a.filter((x) => x.signedAt).length,
    };
  });
}

export async function getTraining(db: Db, id: string) {
  const t = await row(db, id);
  const attendees = await db
    .select({ a: trainingAttendee, name: appUser.name })
    .from(trainingAttendee)
    .innerJoin(appUser, eq(appUser.id, trainingAttendee.userId))
    .where(eq(trainingAttendee.trainingId, id))
    .orderBy(asc(appUser.name));
  const ids = [t.organizerId, t.effectBy, t.createdBy].filter(
    (x): x is string => !!x,
  );
  const names = new Map(
    ids.length
      ? (
          await db
            .select({ id: appUser.id, name: appUser.name })
            .from(appUser)
            .where(inArray(appUser.id, ids))
        ).map((u) => [u.id, u.name])
      : [],
  );
  return { t, attendees, names };
}

/** 지난 같은 종류 교육의 이수자(실시 기록 때 불러오기) */
export async function lastAttendees(db: Db, kind: string, exceptId: string) {
  const [prev] = await db
    .select({ id: training.id })
    .from(training)
    .where(and(eq(training.kind, kind), eq(training.status, "done")))
    .orderBy(desc(training.heldOn))
    .limit(2)
    .then((r) => r.filter((x) => x.id !== exceptId));
  if (!prev) return [];
  return (
    await db
      .select({ userId: trainingAttendee.userId })
      .from(trainingAttendee)
      .where(eq(trainingAttendee.trainingId, prev.id))
  ).map((r) => r.userId);
}

/** 사람별 이수 현황(한 해): 재직 직원 × 법정 교육 종류. 서명한 것만 이수로 센다 */
export async function trainingMatrix(db: Db, year: number) {
  const users = await activeStaff(db);
  const rows = await db
    .select({ a: trainingAttendee, kind: training.kind })
    .from(trainingAttendee)
    .innerJoin(training, eq(training.id, trainingAttendee.trainingId))
    .where(and(eq(training.year, year), eq(training.status, "done")));
  return users.map((u) => {
    const mine = rows.filter((r) => r.a.userId === u.id);
    const by: Record<string, { hours: number; unsigned: number }> = {};
    for (const r of mine) {
      const k = (by[r.kind] ??= { hours: 0, unsigned: 0 });
      if (r.a.signedAt) k.hours += r.a.hours;
      else k.unsigned++;
    }
    return {
      ...u,
      by,
      total: mine
        .filter((r) => r.a.signedAt)
        .reduce((s, r) => s + r.a.hours, 0),
    };
  });
}

async function activeStaff(db: Db) {
  const rows = await db
    .select({
      id: appUser.id,
      name: appUser.name,
      active: appUser.active,
      hiredOn: staffProfile.hiredOn,
      leftOn: staffProfile.leftOn,
    })
    .from(appUser)
    .leftJoin(staffProfile, eq(staffProfile.userId, appUser.id))
    .orderBy(asc(appUser.name));
  return rows.filter((u) => u.active && !u.leftOn);
}

/** 채용 시 교육(4.7)을 아직 이수하지 않은 신규 입사자 */
export async function hiresWithoutTraining(db: Db, today: string) {
  const staff = (await activeStaff(db)).filter(
    (u) => u.hiredOn && u.hiredOn >= addDays(today, -HIRE_WINDOW_DAYS),
  );
  if (!staff.length) return [];
  const done = await db
    .select({ userId: trainingAttendee.userId })
    .from(trainingAttendee)
    .innerJoin(training, eq(training.id, trainingAttendee.trainingId))
    .where(and(eq(training.kind, "safety_hire"), eq(training.status, "done")));
  return staff.filter((u) => !done.some((d) => d.userId === u.id));
}

/** 내 할 일: 계획 세우기(대표)·이번 달 교육·채용 시 교육·서명·효과 확인 */
export async function trainingTodos(db: Db, actor: Actor, today: string) {
  const out: {
    key: string;
    when: "late" | "today" | "soon";
    what: string;
    detail?: string;
    href: string;
    action: string;
  }[] = [];
  const year = Number(today.slice(0, 4));
  const month = today.slice(0, 7);
  const unsigned = await db
    .select({ id: training.id, title: training.title, heldOn: training.heldOn })
    .from(trainingAttendee)
    .innerJoin(training, eq(training.id, trainingAttendee.trainingId))
    .where(
      and(
        eq(trainingAttendee.userId, actor.id),
        isNull(trainingAttendee.signedAt),
        eq(training.status, "done"),
      ),
    );
  for (const u of unsigned)
    out.push({
      key: `tr-sign-${u.id}`,
      when: "today",
      what: `교육 이수 서명: ${u.title}`,
      detail: `${u.heldOn} 실시`,
      href: `/training/${u.id}`,
      action: "서명하기",
    });
  if (can(actor, "training.plan")) {
    const [any] = await db
      .select({ id: training.id })
      .from(training)
      .where(eq(training.year, year))
      .limit(1);
    if (!any)
      out.push({
        key: `tr-plan-${year}`,
        when: today.slice(5, 7) === "01" ? "today" : "late",
        what: `${year}년 교육 계획 세우기`,
        detail: "1월에 연간 계획(F-11-03 계획란)",
        href: `/training?year=${year}`,
        action: "계획 세우기",
      });
  }
  if (can(actor, "training.manage")) {
    const due = await db
      .select()
      .from(training)
      .where(and(eq(training.status, "planned"), eq(training.year, year)));
    for (const t of due.filter(
      (t) => t.plannedMonth && t.plannedMonth <= month,
    ))
      out.push({
        key: `tr-due-${t.id}`,
        when: t.plannedMonth! < month ? "late" : "soon",
        what: `교육 실시: ${t.title}`,
        detail: `${t.plannedMonth} 계획`,
        href: `/training/${t.id}`,
        action: "실시 기록",
      });
    for (const u of await hiresWithoutTraining(db, today))
      out.push({
        key: `tr-hire-${u.id}`,
        when: "today",
        what: `채용 시 교육: ${u.name}`,
        detail: `${u.hiredOn} 입사 · 투입 전 안전보건·직무 입문 교육`,
        href: `/training/new?kind=safety_hire&who=${u.id}`,
        action: "교육 잡기",
      });
  }
  if (can(actor, "training.effect") && !actor.roles.includes("owner")) {
    const eff = await db
      .select()
      .from(training)
      .where(and(eq(training.status, "done"), isNull(training.effectAt)));
    for (const t of eff.filter(
      (t) => t.effectDue && t.effectDue <= addDays(today, 7),
    ))
      out.push({
        key: `tr-eff-${t.id}`,
        when: t.effectDue! < today ? "late" : "soon",
        what: `교육 효과 확인: ${t.title}`,
        detail: `${t.effectDue}까지 실습 평가·재작업률로`,
        href: `/training/${t.id}`,
        action: "확인하기",
      });
  }
  return out;
}
