// 품질목표 관리표(F-Q-02, 총람 Q.3). 지표는 앱 기록에서 저절로 계산하고(다시 입력하지 않음), 매월 5일 앞달분을 고정한다.
// 2개월 연속 미달이면 부적합(Q.9)을 저절로 발행한다. 분기마다 대표가 검토 서명한다.
import { and, eq, gte, inArray, isNotNull, lte, ne } from "drizzle-orm";
import type { Db } from "@/db/client";
import {
  complaint,
  equipmentFailure,
  estimate,
  estimateLine,
  fiveSMonthly,
  goalMonth,
  goalQuarterSign,
  incident,
  inspection,
  legalItem,
  pmTask,
  qualityGoal,
  repairOrder,
  repairStatement,
  survey,
  userRole,
  workOrder,
} from "@/db/schema";
import { can } from "@/modules/auth/permissions";
import type { Role } from "@/modules/auth/roles";
import { writeAudit } from "@/modules/platform/audit";
import { UserError } from "@/modules/platform/errors";
import { seoulDate } from "@/modules/platform/time";
import { totals } from "@/modules/repair/estimate-rules";
import { issueNc } from "./nc";
import {
  GOAL_KEYS,
  GOAL_SNAPSHOT_DAY,
  GOALS,
  goalOk,
  goalText,
  isGoalKey,
  type GoalKey,
} from "./qms-rules";

export class GoalError extends UserError {}
type Actor = { id: string; roles: Role[] };

const lastDay = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return `${ym}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`;
};
const span = (ym: string) => ({
  from: `${ym}-01`,
  to: lastDay(ym),
  start: new Date(`${ym}-01T00:00:00+09:00`),
  end: new Date(`${lastDay(ym)}T23:59:59.999+09:00`),
});
export const prevMonth = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
};
const pct = (n: number, d: number) => (d ? (n / d) * 100 : null);

/** 그 해 목표값(정한 것이 없으면 표준서 초기 목표) */
export async function targetsFor(
  db: Db,
  year: number,
): Promise<Record<GoalKey, number>> {
  const rows = await db
    .select()
    .from(qualityGoal)
    .where(eq(qualityGoal.year, year));
  return Object.fromEntries(
    GOAL_KEYS.map((k) => [
      k,
      rows.find((r) => r.key === k)?.target ?? GOALS[k].target,
    ]),
  ) as Record<GoalKey, number>;
}

/** 목표값 바꾸기(대표). 개업 후 6개월 실적으로 다시 정한다 */
export async function setTarget(
  db: Db,
  actor: Actor,
  year: number,
  key: string,
  target: number | null,
  reason: string,
  now = new Date(),
) {
  if (!can(actor, "qms.goal_target"))
    throw new GoalError("품질목표 값은 대표가 정합니다");
  if (!isGoalKey(key)) throw new GoalError("없는 지표입니다");
  if (target == null || !Number.isFinite(target) || target < 0)
    throw new GoalError("목표값을 숫자로 적어 주세요");
  if (GOALS[key].unit === "%" && target > 100)
    throw new GoalError("비율은 100% 이하입니다");
  if (!reason.trim())
    throw new GoalError(
      "왜 바꾸는지 적어 주세요(예: 개업 후 6개월 실적 평균 3.1%)",
    );
  const before = (await targetsFor(db, year))[key];
  await db
    .insert(qualityGoal)
    .values({
      year,
      key,
      target,
      reason: reason.trim(),
      setBy: actor.id,
      setAt: now,
    })
    .onConflictDoUpdate({
      target: [qualityGoal.year, qualityGoal.key],
      set: { target, reason: reason.trim(), setBy: actor.id, setAt: now },
    });
  await writeAudit(db, {
    actorId: actor.id,
    action: "goal.target",
    entityType: "quality_goal",
    entityId: `${year}:${key}`,
    before: { target: before },
    after: { target, reason: reason.trim() },
  });
}

type Calc = {
  value: number | null;
  numer: number | null;
  denom: number | null;
};

type Span = ReturnType<typeof span>;
/** 날짜 범위(YYYY-MM-DD ~ YYYY-MM-DD)를 지표 계산 범위로 */
export const spanOf = (from: string, to: string): Span => ({
  from,
  to,
  start: new Date(`${from}T00:00:00+09:00`),
  end: new Date(`${to}T23:59:59.999+09:00`),
});

async function delivered(db: Db, s: Span) {
  return db
    .select({
      roId: repairStatement.repairOrderId,
      totalWon: repairStatement.totalWon,
      deliveredAt: repairStatement.deliveredAt,
    })
    .from(repairStatement)
    .innerJoin(repairOrder, eq(repairOrder.id, repairStatement.repairOrderId))
    .where(
      and(
        gte(repairStatement.deliveredAt, s.start),
        lte(repairStatement.deliveredAt, s.end),
        ne(repairOrder.status, "cancelled"),
      ),
    );
}

/** 지표 하나를 그 달 기록으로 계산한다 */
export async function computeGoal(
  db: Db,
  ym: string,
  key: GoalKey,
  now = new Date(),
): Promise<Calc> {
  return computeGoalSpan(db, span(ym), key, now);
}

/** 아무 기간으로 지표 계산(통계·보고서). 3정5S 는 기간에 걸친 달의 평균 */
export async function computeGoalSpan(
  db: Db,
  s: Span,
  key: GoalKey,
  now = new Date(),
): Promise<Calc> {
  const ratio = (n: number, d: number): Calc => ({
    value: pct(n, d),
    numer: n,
    denom: d,
  });
  switch (key) {
    case "rework": {
      const d = await delivered(db, s);
      if (!d.length) return ratio(0, 0);
      const fails = await db
        .select({ ro: inspection.repairOrderId })
        .from(inspection)
        .where(
          and(
            inArray(
              inspection.repairOrderId,
              d.map((x) => x.roId),
            ),
            eq(inspection.result, "fail"),
          ),
        );
      return ratio(new Set(fails.map((f) => f.ro)).size, d.length);
    }
    case "warranty": {
      const d = await delivered(db, s);
      const w = await db
        .select({ id: complaint.id })
        .from(complaint)
        .where(
          and(
            eq(complaint.resolution, "warranty_repair"),
            gte(complaint.agreedAt, s.start),
            lte(complaint.agreedAt, s.end),
          ),
        );
      return ratio(w.length, d.length);
    }
    case "ontime": {
      const d = await delivered(db, s);
      if (!d.length) return ratio(0, 0);
      const wos = await db
        .select({ ro: workOrder.repairOrderId, due: workOrder.dueDate })
        .from(workOrder)
        .where(
          and(
            inArray(
              workOrder.repairOrderId,
              d.map((x) => x.roId),
            ),
            isNotNull(workOrder.dueDate),
          ),
        );
      let n = 0;
      let den = 0;
      for (const x of d) {
        const due = wos
          .filter((w) => w.ro === x.roId)
          .map((w) => w.due!)
          .sort()
          .pop();
        if (!due || !x.deliveredAt) continue;
        den++;
        if (seoulDate(x.deliveredAt) <= due) n++;
      }
      return ratio(n, den);
    }
    case "overrun": {
      const d = await delivered(db, s);
      if (!d.length) return ratio(0, 0);
      const ests = await db
        .select()
        .from(estimate)
        .where(
          and(
            inArray(
              estimate.repairOrderId,
              d.map((x) => x.roId),
            ),
            inArray(estimate.status, ["accepted", "partial"]),
          ),
        );
      const firsts = d
        .map(
          (x) =>
            ests
              .filter((e) => e.repairOrderId === x.roId)
              .sort((a, b) => a.rev - b.rev)[0],
        )
        .filter(Boolean);
      const lines = firsts.length
        ? await db
            .select()
            .from(estimateLine)
            .where(
              inArray(
                estimateLine.estimateId,
                firsts.map((e) => e.id),
              ),
            )
        : [];
      let n = 0;
      for (const x of d) {
        const e = firsts.find((f) => f.repairOrderId === x.roId);
        if (!e) continue;
        const base = totals(
          lines.filter((l) => l.estimateId === e.id),
          true,
        ).total;
        if (base > 0 && x.totalWon > base * 1.1) n++;
      }
      return ratio(n, d.length);
    }
    case "satisfaction": {
      const rows = await db
        .select({ scores: survey.scores })
        .from(survey)
        .where(
          and(gte(survey.answeredAt, s.start), lte(survey.answeredAt, s.end)),
        );
      const means = rows
        .map((r) => r.scores ?? [])
        .filter((x) => x.length)
        .map((x) => x.reduce((a, b) => a + b, 0) / x.length);
      const sum = means.reduce((a, b) => a + b, 0);
      return {
        value: means.length ? sum / means.length : null,
        numer: sum,
        denom: means.length,
      };
    }
    case "complaint7": {
      const rows = await db
        .select({ r: complaint.receivedAt, c: complaint.closedAt })
        .from(complaint)
        .where(
          and(gte(complaint.closedAt, s.start), lte(complaint.closedAt, s.end)),
        );
      return ratio(
        rows.filter((x) => x.c && x.c.getTime() - x.r.getTime() <= 7 * 864e5)
          .length,
        rows.length,
      );
    }
    case "accident": {
      const rows = await db
        .select({ id: incident.id })
        .from(incident)
        .where(
          and(
            gte(incident.occurredAt, s.start),
            lte(incident.occurredAt, s.end),
            inArray(incident.severity, ["lost_time", "serious"]),
          ),
        );
      return { value: rows.length, numer: rows.length, denom: null };
    }
    case "legal": {
      const rows = await db
        .select({ due: legalItem.nextDue })
        .from(legalItem)
        .where(
          and(
            eq(legalItem.active, true),
            eq(legalItem.applies, "yes"),
            isNotNull(legalItem.nextDue),
          ),
        );
      const today = seoulDate(now);
      const cut = s.to < today ? s.to : today;
      const late = rows.filter((r) => r.due! < cut).length;
      return ratio(rows.length - late, rows.length);
    }
    case "downtime": {
      const rows = await db
        .select({ m: equipmentFailure.downMinutes })
        .from(equipmentFailure)
        .where(
          and(
            gte(equipmentFailure.occurredAt, s.start),
            lte(equipmentFailure.occurredAt, s.end),
          ),
        );
      const min = rows.reduce((a, r) => a + (r.m ?? 0), 0);
      return { value: min / 60, numer: min / 60, denom: null };
    }
    case "fiveS": {
      const rows = await db
        .select({ t: fiveSMonthly.total })
        .from(fiveSMonthly)
        .where(
          and(
            gte(fiveSMonthly.ym, s.from.slice(0, 7)),
            lte(fiveSMonthly.ym, s.to.slice(0, 7)),
          ),
        );
      const sum = rows.reduce((a, r) => a + r.t, 0);
      return {
        value: rows.length ? sum / rows.length : null,
        numer: sum,
        denom: rows.length,
      };
    }
    case "pm": {
      const rows = await db
        .select({ due: pmTask.dueOn, done: pmTask.doneOn })
        .from(pmTask)
        .where(and(gte(pmTask.dueOn, s.from), lte(pmTask.dueOn, s.to)));
      return ratio(
        rows.filter((r) => r.done && r.done <= r.due).length,
        rows.length,
      );
    }
  }
}

export type GoalCell = {
  value: number | null;
  ok: boolean | null;
  fixed: boolean;
  ncId: string | null;
};

/** 한 달 모든 지표(고정된 달은 고정 값, 아니면 지금 계산) */
export async function monthGoals(db: Db, ym: string, now = new Date()) {
  const fixed = await db.select().from(goalMonth).where(eq(goalMonth.ym, ym));
  const targets = await targetsFor(db, Number(ym.slice(0, 4)));
  const out = {} as Record<GoalKey, GoalCell & Calc & { target: number }>;
  for (const k of GOAL_KEYS) {
    const f = fixed.find((x) => x.key === k);
    if (f)
      out[k] = {
        value: f.value,
        numer: f.numer,
        denom: f.denom,
        target: f.target,
        ok: f.ok,
        fixed: true,
        ncId: f.ncId,
      };
    else {
      const c = await computeGoal(db, ym, k, now);
      out[k] = {
        ...c,
        target: targets[k],
        ok: goalOk(k, c.value, targets[k]),
        fixed: false,
        ncId: null,
      };
    }
  }
  return out;
}

async function systemActor(db: Db) {
  for (const role of ["quality", "owner"] as const) {
    const [u] = await db
      .select({ id: userRole.userId })
      .from(userRole)
      .where(eq(userRole.role, role))
      .limit(1);
    if (u) return u.id;
  }
  return null;
}

/** 앞달 집계 고정 + 2개월 연속 미달이면 부적합 발행. 이미 고정했으면 건너뜀 */
export async function snapshotMonth(db: Db, ym: string, now = new Date()) {
  const have = await db
    .select({ key: goalMonth.key })
    .from(goalMonth)
    .where(eq(goalMonth.ym, ym));
  if (have.length >= GOAL_KEYS.length) return { fixed: 0, nc: [] as string[] };
  const cur = await monthGoals(db, ym, now);
  const prev = await db
    .select()
    .from(goalMonth)
    .where(eq(goalMonth.ym, prevMonth(ym)));
  const actorId = await systemActor(db);
  const nc: string[] = [];
  let fixed = 0;
  for (const k of GOAL_KEYS) {
    if (have.some((h) => h.key === k)) continue;
    const c = cur[k];
    let ncId: string | null = null;
    const p = prev.find((x) => x.key === k);
    if (c.ok === false && p?.ok === false && actorId) {
      const r = await issueNc(
        db,
        actorId,
        {
          source: "goal",
          refType: "goal",
          refId: k,
          refLabel: `품질목표 ${GOALS[k].label}`,
          content: `품질목표 '${GOALS[k].label}' 2개월 연속 미달: ${prevMonth(ym)} ${goalText(k, p.value)} · ${ym} ${goalText(k, c.value)} (목표 ${GOALS[k].dir === "lower" ? "이하" : "이상"} ${goalText(k, c.target)})`,
        },
        now,
      );
      ncId = r.id;
      if (!r.existed) nc.push(r.docNo);
    }
    await db
      .insert(goalMonth)
      .values({
        ym,
        key: k,
        value: c.value,
        numer: c.numer,
        denom: c.denom,
        target: c.target,
        ok: c.ok,
        ncId,
        computedAt: now,
      })
      .onConflictDoNothing();
    fixed++;
  }
  return { fixed, nc };
}

/** 매일 작업: 5일부터 앞달 집계를 고정한다 */
export async function goalDailyJob(db: Db, now = new Date()) {
  const today = seoulDate(now);
  if (Number(today.slice(8)) < GOAL_SNAPSHOT_DAY) return "품질목표: 5일 전";
  const ym = prevMonth(today.slice(0, 7));
  const r = await snapshotMonth(db, ym, now);
  return r.fixed
    ? `품질목표 ${ym} 고정 ${r.fixed}개${r.nc.length ? `, 부적합 ${r.nc.join(", ")}` : ""}`
    : "품질목표: 이미 고정";
}

/** 한 해 관리표: 지표마다 1~12월 값과 달성 개월 수. 오늘 이후의 달은 비움 */
export async function goalYear(db: Db, year: number, now = new Date()) {
  const today = seoulDate(now);
  const months = Array.from(
    { length: 12 },
    (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`,
  );
  const targets = await targetsFor(db, year);
  const cells: Record<string, Awaited<ReturnType<typeof monthGoals>>> = {};
  for (const ym of months)
    if (`${ym}-01` <= today) cells[ym] = await monthGoals(db, ym, now);
  const rows = GOAL_KEYS.map((k) => {
    const vals = months.map((ym) => cells[ym]?.[k] ?? null);
    const judged = vals.filter((v) => v && v.ok != null);
    return {
      key: k,
      ...GOALS[k],
      target: targets[k],
      months: vals,
      okMonths: judged.filter((v) => v!.ok).length,
      judgedMonths: judged.length,
    };
  });
  const signs = await db
    .select()
    .from(goalQuarterSign)
    .where(eq(goalQuarterSign.year, year));
  return { year, months, rows, signs };
}

/** 분기 검토 서명(대표). 분기가 끝난 뒤에 한다 */
export async function signQuarter(
  db: Db,
  actor: Actor,
  year: number,
  quarter: number,
  note: string,
  now = new Date(),
) {
  if (!can(actor, "qms.goal_target"))
    throw new GoalError("분기 검토 서명은 대표가 합니다");
  if (![1, 2, 3, 4].includes(quarter))
    throw new GoalError("분기를 확인해 주세요");
  const endYm = `${year}-${String(quarter * 3).padStart(2, "0")}`;
  if (lastDay(endYm) >= seoulDate(now))
    throw new GoalError(`${quarter}분기가 아직 끝나지 않았습니다`);
  const y = await goalYear(db, year, now);
  const miss = y.rows.filter((r) =>
    r.months.slice((quarter - 1) * 3, quarter * 3).some((m) => m?.ok === false),
  );
  if (miss.length && !note.trim())
    throw new GoalError(
      `이 분기에 미달한 지표가 ${miss.length}개 있습니다(${miss.map((m) => m.label).join(", ")}). 검토 의견을 적어 주세요`,
    );
  await db
    .insert(goalQuarterSign)
    .values({ year, quarter, note: note.trim() || null, by: actor.id, at: now })
    .onConflictDoUpdate({
      target: [goalQuarterSign.year, goalQuarterSign.quarter],
      set: { note: note.trim() || null, by: actor.id, at: now },
    });
  await writeAudit(db, {
    actorId: actor.id,
    action: "goal.sign",
    entityType: "goal_quarter",
    entityId: `${year}Q${quarter}`,
    after: { miss: miss.map((m) => m.key) },
  });
}

/** 내 할 일(대표): 끝난 분기 검토 서명 */
export async function goalTodos(db: Db, actor: Actor, today: string) {
  if (!can(actor, "qms.goal_target")) return [];
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7));
  const q = Math.floor((m - 1) / 3); // 끝난 마지막 분기(0이면 작년 4분기)
  const [yy, qq] = q === 0 ? [y - 1, 4] : [y, q];
  const any = (
    await db
      .select({ id: goalMonth.id })
      .from(goalMonth)
      .where(gte(goalMonth.ym, `${yy}-01`))
      .limit(1)
  ).length;
  if (!any) return [];
  const [s] = await db
    .select()
    .from(goalQuarterSign)
    .where(and(eq(goalQuarterSign.year, yy), eq(goalQuarterSign.quarter, qq)));
  if (s) return [];
  return [
    {
      key: `goal-q-${yy}-${qq}`,
      when: "soon" as const,
      what: `품질목표 ${yy}년 ${qq}분기 검토 서명`,
      detail: "분기 실적을 보고 미달 지표에 의견을 적습니다",
      href: `/qms/goals?year=${yy}`,
      action: "검토하기",
    },
  ];
}
