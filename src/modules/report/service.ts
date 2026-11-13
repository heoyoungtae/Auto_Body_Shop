// 통계·보고서 공용: 숫자 줄(Metric)·표시·앞 기간 대비, 영역별 기간 숫자(영업·고객·현장·안전), 대시보드 경영 현황.
// 보고서별 계산은 reports-*.ts, 보고서 목록은 catalog.ts. 숫자는 모두 앞선 전표에서 계산한다(입력 없음).
import { and, eq, gte, inArray, isNotNull, lte, ne } from "drizzle-orm";
import type { Db } from "@/db/client";
import {
  complaint,
  consultation,
  equipmentFailure,
  incident,
  nonconformance,
  repairOrder,
  repairStatement,
  suggestion,
  survey,
  training,
  wasteLog,
  workStep,
} from "@/db/schema";
import { can } from "@/modules/auth/permissions";
import type { Role } from "@/modules/auth/roles";
import { rangeSummary } from "@/modules/money/close";
import { seoulDate } from "@/modules/platform/time";
import { computeGoalSpan, spanOf, targetsFor } from "@/modules/quality/goals";
import { GOAL_KEYS, GOALS, goalOk } from "@/modules/quality/qms-rules";
import { WASTE_ITEMS } from "@/modules/safety/env-rules";
import {
  prevPeriod,
  recentPeriods,
  shortLabel,
  TREND_COUNT,
  type Period,
} from "./period";

type Actor = { id: string; roles: Role[] };

export type Unit = "건" | "대" | "원" | "%" | "점" | "시간" | "일" | "kg" | "회";
export type Metric = {
  key: string;
  label: string;
  unit: Unit;
  value: number | null;
  prev: number | null;
  /** 늘면 좋은가(up) 줄면 좋은가(down). 없으면 좋고 나쁨 표시 안 함 */
  better?: "up" | "down";
  /** 품질목표 지표만 */
  target?: number;
  ok?: boolean | null;
  /** 지금 기준 값(기간과 무관): 앞 기간 비교 없음 */
  now?: boolean;
  href?: string;
  note?: string;
};
const ts = (p: { from: string; to: string }) => ({
  start: new Date(`${p.from}T00:00:00+09:00`),
  end: new Date(`${p.to}T23:59:59.999+09:00`),
});
const sum = <T>(xs: T[], f: (x: T) => number) =>
  xs.reduce((a, x) => a + f(x), 0);
const pct = (n: number, d: number) => (d ? (n / d) * 100 : null);

/** 영업·작업 숫자 */
export async function opsValues(db: Db, p: { from: string; to: string }) {
  const { start, end } = ts(p);
  const cs = await db
    .select({ result: consultation.result })
    .from(consultation)
    .where(and(gte(consultation.at, start), lte(consultation.at, end)));
  const ins = await db
    .select({ id: repairOrder.id })
    .from(repairOrder)
    .where(
      and(
        gte(repairOrder.inAt, start),
        lte(repairOrder.inAt, end),
        ne(repairOrder.status, "cancelled"),
      ),
    );
  const outs = await db
    .select({
      inAt: repairOrder.inAt,
      insurance: repairOrder.insurance,
      at: repairStatement.deliveredAt,
    })
    .from(repairStatement)
    .innerJoin(repairOrder, eq(repairOrder.id, repairStatement.repairOrderId))
    .where(
      and(
        gte(repairStatement.deliveredAt, start),
        lte(repairStatement.deliveredAt, end),
        ne(repairOrder.status, "cancelled"),
      ),
    );
  const steps = await db
    .select({ std: workStep.stdMinutes, act: workStep.actualMinutes })
    .from(workStep)
    .where(and(gte(workStep.endedAt, start), lte(workStep.endedAt, end)));
  const withAct = steps.filter((s) => s.act && s.act > 0 && s.std > 0);
  const lead = outs
    .filter((o) => o.at)
    .map((o) => (o.at!.getTime() - o.inAt.getTime()) / 864e5);
  return {
    consults: cs.length,
    reserved: pct(
      cs.filter((c) => c.result === "reserved" || c.result === "converted")
        .length,
      cs.length,
    ),
    intake: ins.length,
    delivered: outs.length,
    insurance: pct(
      outs.filter((o) => o.insurance !== "self").length,
      outs.length,
    ),
    lead: lead.length ? sum(lead, (x) => x) / lead.length : null,
    workHours: sum(steps, (s) => s.act ?? 0) / 60,
    efficiency: withAct.length
      ? (sum(withAct, (s) => s.std) / sum(withAct, (s) => s.act!)) * 100
      : null,
  };
}

export async function customerValues(db: Db, p: { from: string; to: string }) {
  const { start, end } = ts(p);
  const sent = await db
    .select({ answeredAt: survey.answeredAt })
    .from(survey)
    .where(
      and(
        gte(survey.sentAt, start),
        lte(survey.sentAt, end),
        eq(survey.sentOk, true),
      ),
    );
  const rec = await db
    .select({ id: complaint.id })
    .from(complaint)
    .where(
      and(gte(complaint.receivedAt, start), lte(complaint.receivedAt, end)),
    );
  const closed = await db
    .select({ id: complaint.id })
    .from(complaint)
    .where(and(gte(complaint.closedAt, start), lte(complaint.closedAt, end)));
  const comp = await db
    .select({ w: complaint.compWon })
    .from(complaint)
    .where(
      and(
        gte(complaint.compApprovedAt, start),
        lte(complaint.compApprovedAt, end),
      ),
    );
  return {
    surveys: sent.length,
    answerRate: pct(sent.filter((s) => s.answeredAt).length, sent.length),
    complaints: rec.length,
    closed: closed.length,
    comp: sum(comp, (c) => c.w ?? 0),
  };
}

export async function fieldValues(db: Db, p: { from: string; to: string }) {
  const { start, end } = ts(p);
  const fails = await db
    .select({ id: equipmentFailure.id })
    .from(equipmentFailure)
    .where(
      and(
        gte(equipmentFailure.occurredAt, start),
        lte(equipmentFailure.occurredAt, end),
      ),
    );
  const ncs = await db
    .select({ id: nonconformance.id })
    .from(nonconformance)
    .where(
      and(
        gte(nonconformance.createdAt, start),
        lte(nonconformance.createdAt, end),
      ),
    );
  const ncClosed = await db
    .select({ id: nonconformance.id })
    .from(nonconformance)
    .where(
      and(
        gte(nonconformance.closedAt, start),
        lte(nonconformance.closedAt, end),
      ),
    );
  const sg = await db
    .select({ id: suggestion.id })
    .from(suggestion)
    .where(
      and(gte(suggestion.createdAt, start), lte(suggestion.createdAt, end)),
    );
  const sgOk = await db
    .select({ id: suggestion.id })
    .from(suggestion)
    .where(
      and(
        gte(suggestion.decidedAt, start),
        lte(suggestion.decidedAt, end),
        inArray(suggestion.status, ["adopted", "done"]),
      ),
    );
  const tr = await db
    .select({ h: training.hours })
    .from(training)
    .where(
      and(
        eq(training.status, "done"),
        isNotNull(training.heldOn),
        gte(training.heldOn, p.from),
        lte(training.heldOn, p.to),
      ),
    );
  return {
    failures: fails.length,
    ncs: ncs.length,
    ncClosed: ncClosed.length,
    suggestions: sg.length,
    adopted: sgOk.length,
    trainings: tr.length,
    trainingHours: sum(tr, (t) => t.h ?? 0),
  };
}

export async function safetyValues(db: Db, p: { from: string; to: string }) {
  const { start, end } = ts(p);
  const inc = await db
    .select({ kind: incident.kind })
    .from(incident)
    .where(and(gte(incident.occurredAt, start), lte(incident.occurredAt, end)));
  const waste = await db
    .select({ kind: wasteLog.kind, item: wasteLog.item, qty: wasteLog.qty })
    .from(wasteLog)
    .where(and(gte(wasteLog.on, p.from), lte(wasteLog.on, p.to)));
  const designated = waste.filter(
    (w) =>
      WASTE_ITEMS[w.item as keyof typeof WASTE_ITEMS]?.group === "designated",
  );
  return {
    accidents: inc.filter((i) => i.kind === "accident").length,
    near: inc.filter((i) => i.kind === "near").length,
    wasteGen: sum(
      designated.filter((w) => w.kind === "gen"),
      (w) => w.qty,
    ),
    wasteOut: sum(
      designated.filter((w) => w.kind === "out"),
      (w) => w.qty,
    ),
  };
}

/** 표시용 숫자 */
export function fmtMetric(v: number | null, unit: Unit) {
  if (v == null) return "—";
  if (unit === "원") return `${Math.round(v).toLocaleString("ko-KR")}원`;
  if (unit === "건" || unit === "대")
    return `${Math.round(v).toLocaleString("ko-KR")}${unit}`;
  return `${(Math.round(v * 10) / 10).toLocaleString("ko-KR")}${unit}`;
}

/** 앞 기간 대비: 차이와 좋고 나쁨 */
export function delta(
  m: Metric,
): { text: string; tone: "ok" | "danger" | "neutral" } | null {
  if (m.now || m.value == null || m.prev == null) return null;
  const d = m.value - m.prev;
  if (Math.abs(d) < 1e-9) return { text: "변화 없음", tone: "neutral" };
  const sign = d > 0 ? "▲" : "▼";
  const abs = Math.abs(d);
  const text =
    m.unit === "%"
      ? `${sign} ${Math.round(abs * 10) / 10}%p`
      : `${sign} ${fmtMetric(abs, m.unit)}`;
  const good = m.better ? (m.better === "up" ? d > 0 : d < 0) : null;
  return { text, tone: good == null ? "neutral" : good ? "ok" : "danger" };
}

/** 대시보드 경영 현황 패널: 이번 달과 지난달 같은 날까지 */
export async function kpiPanel(db: Db, actor: Actor, now = new Date()) {
  const today = seoulDate(now);
  const cur = { from: `${today.slice(0, 8)}01`, to: today };
  const m = can(actor, "money.view") ? await rangeSummary(db, cur) : null;
  const o = await opsValues(db, cur);
  const targets = await targetsFor(db, Number(today.slice(0, 4)));
  let miss = 0;
  for (const k of GOAL_KEYS) {
    const v = await computeGoalSpan(db, spanOf(cur.from, cur.to), k, now);
    if (goalOk(k, v.value, targets[k]) === false) miss++;
  }
  return {
    today,
    sales: m?.sales.total ?? null,
    collected: m ? m.collected.total : null,
    arCustomer: m?.receivables.customer ?? null,
    arInsurer: m?.receivables.insurer ?? null,
    intake: o.intake,
    delivered: o.delivered,
    consults: o.consults,
    goalMiss: miss,
  };
}
