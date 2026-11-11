// 통계·보고서(경영 현황): 일·주·월·분기·연 기간별로 모든 업무 기록을 모아 앞 기간과 비교한다.
// 따로 입력하는 값은 없다. 숫자는 모두 앞선 전표(상담·수리·명세서·수납·지출·검사·불만·설비·안전·환경·교육)에서 계산한다.
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

export type Unit = "건" | "대" | "원" | "%" | "점" | "시간" | "일" | "kg";
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
export type SectionId =
  | "ops"
  | "money"
  | "quality"
  | "customer"
  | "field"
  | "safety";
export type Section = {
  id: SectionId;
  title: string;
  std: string;
  metrics: Metric[];
};

export const SECTION_TITLES: Record<SectionId, { title: string; std: string }> =
  {
    ops: { title: "영업·작업", std: "STD-01~05" },
    money: { title: "매출·수금·지출", std: "STD-12" },
    quality: { title: "품질목표", std: "STD-Q Q.3" },
    customer: { title: "고객 만족·불만", std: "STD-06" },
    field: { title: "설비·현장·교육", std: "STD-08·11" },
    safety: { title: "안전·환경", std: "STD-09·10" },
  };

const ts = (p: { from: string; to: string }) => ({
  start: new Date(`${p.from}T00:00:00+09:00`),
  end: new Date(`${p.to}T23:59:59.999+09:00`),
});
const sum = <T>(xs: T[], f: (x: T) => number) =>
  xs.reduce((a, x) => a + f(x), 0);
const pct = (n: number, d: number) => (d ? (n / d) * 100 : null);

/** 영업·작업 숫자 */
async function opsValues(db: Db, p: Period) {
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

async function customerValues(db: Db, p: Period) {
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

async function fieldValues(db: Db, p: Period) {
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

async function safetyValues(db: Db, p: Period) {
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

/** 보고서 한 장: 권한에 맞는 영역만 */
export async function buildReport(
  db: Db,
  actor: Actor,
  p: Period,
  now = new Date(),
): Promise<Section[]> {
  const q = prevPeriod(p);
  const out: Section[] = [];
  const sec = (id: SectionId, metrics: Metric[]) =>
    out.push({ id, ...SECTION_TITLES[id], metrics });

  const [o, oq] = await Promise.all([opsValues(db, p), opsValues(db, q)]);
  sec("ops", [
    {
      key: "consults",
      label: "상담",
      unit: "건",
      value: o.consults,
      prev: oq.consults,
      better: "up",
      href: "/consults",
    },
    {
      key: "reserved",
      label: "예약 전환율",
      unit: "%",
      value: o.reserved,
      prev: oq.reserved,
      better: "up",
      note: "예약·입고로 이어진 상담 ÷ 상담",
    },
    {
      key: "intake",
      label: "입고",
      unit: "대",
      value: o.intake,
      prev: oq.intake,
      better: "up",
      href: "/repairs",
    },
    {
      key: "delivered",
      label: "출고",
      unit: "대",
      value: o.delivered,
      prev: oq.delivered,
      better: "up",
    },
    {
      key: "insurance",
      label: "보험 수리 비중",
      unit: "%",
      value: o.insurance,
      prev: oq.insurance,
      note: "출고 중 보험 건",
    },
    {
      key: "lead",
      label: "평균 수리 기간",
      unit: "일",
      value: o.lead,
      prev: oq.lead,
      better: "down",
      note: "입고 → 출고",
    },
    {
      key: "workHours",
      label: "작업 실적 시간",
      unit: "시간",
      value: o.workHours,
      prev: oq.workHours,
      href: "/work",
    },
    {
      key: "efficiency",
      label: "작업 효율",
      unit: "%",
      value: o.efficiency,
      prev: oq.efficiency,
      better: "up",
      note: "표준 시간 ÷ 실제 시간(100% 넘으면 표준보다 빠름)",
    },
  ]);

  if (can(actor, "money.view")) {
    const [m, mq] = await Promise.all([
      rangeSummary(db, p),
      rangeSummary(db, q),
    ]);
    sec("money", [
      {
        key: "sales",
        label: "매출(명세서 발급)",
        unit: "원",
        value: m.sales.total,
        prev: mq.sales.total,
        better: "up",
        note: `${m.sales.count}건 · 부품 ${m.sales.parts.toLocaleString("ko-KR")} · 공임 ${m.sales.labor.toLocaleString("ko-KR")}`,
      },
      {
        key: "salesIns",
        label: "보험 수리 매출",
        unit: "원",
        value: m.sales.insuranceTotal,
        prev: mq.sales.insuranceTotal,
      },
      {
        key: "collectedCustomer",
        label: "고객 수납",
        unit: "원",
        value: m.collected.customer,
        prev: mq.collected.customer,
        better: "up",
        href: "/money",
        note: `카드 ${m.collected.card.toLocaleString("ko-KR")} · 현금 ${m.collected.cash.toLocaleString("ko-KR")} · 이체 ${m.collected.transfer.toLocaleString("ko-KR")}`,
      },
      {
        key: "collectedInsurer",
        label: "보험사 입금",
        unit: "원",
        value: m.collected.insurer,
        prev: mq.collected.insurer,
        better: "up",
        note: m.collected.insurerCut
          ? `삭감 ${m.collected.insurerCut.toLocaleString("ko-KR")}원`
          : undefined,
      },
      {
        key: "purchases",
        label: "매입(발주·외주)",
        unit: "원",
        value: m.purchases.total,
        prev: mq.purchases.total,
        better: "down",
        href: "/money/payables",
      },
      {
        key: "margin",
        label: "매출 − 매입(어림)",
        unit: "원",
        value: m.sales.total - m.purchases.total,
        prev: mq.sales.total - mq.purchases.total,
        better: "up",
        note: "인건비·경비 빼기 전",
      },
      {
        key: "expenses",
        label: "지출 지급",
        unit: "원",
        value: m.expenses.paid,
        prev: mq.expenses.paid,
        better: "down",
        href: "/money/expenses",
        note:
          m.expenses.byCategory
            .slice(0, 3)
            .map((c) => `${c.label} ${c.won.toLocaleString("ko-KR")}`)
            .join(" · ") || undefined,
      },
      {
        key: "payroll",
        label: "급여(지급 총액)",
        unit: "원",
        value: m.expenses.payroll,
        prev: mq.expenses.payroll,
      },
      {
        key: "arCustomer",
        label: "고객 미수",
        unit: "원",
        value: m.receivables.customer,
        prev: null,
        now: true,
        better: "down",
        note: `${m.receivables.customerCount}건, 30일 넘은 것 ${m.receivables.customerOld}건`,
      },
      {
        key: "arInsurer",
        label: "보험사 미수",
        unit: "원",
        value: m.receivables.insurer,
        prev: null,
        now: true,
        better: "down",
        note: `${m.receivables.insurerCount}건`,
      },
    ]);
  }

  const targets = await targetsFor(db, Number(p.from.slice(0, 4)));
  const goals: Metric[] = [];
  for (const k of GOAL_KEYS) {
    const [a, b] = await Promise.all([
      computeGoalSpan(db, spanOf(p.from, p.to), k, now),
      computeGoalSpan(db, spanOf(q.from, q.to), k, now),
    ]);
    const g = GOALS[k];
    goals.push({
      key: k,
      label: g.label,
      unit: g.unit as Unit,
      value: a.value,
      prev: b.value,
      better: g.dir === "lower" ? "down" : "up",
      target: targets[k],
      ok: goalOk(k, a.value, targets[k]),
      note:
        a.denom != null && GOALS[k].unit === "%"
          ? `${Math.round(a.numer ?? 0)} / ${a.denom}`
          : undefined,
      href: "/qms/goals",
    });
  }
  sec("quality", goals);

  const [c, cq] = await Promise.all([
    customerValues(db, p),
    customerValues(db, q),
  ]);
  sec("customer", [
    {
      key: "surveys",
      label: "만족도 설문 발송",
      unit: "건",
      value: c.surveys,
      prev: cq.surveys,
    },
    {
      key: "answerRate",
      label: "설문 응답률",
      unit: "%",
      value: c.answerRate,
      prev: cq.answerRate,
      better: "up",
    },
    {
      key: "complaints",
      label: "불만 접수",
      unit: "건",
      value: c.complaints,
      prev: cq.complaints,
      better: "down",
      href: "/complaints",
    },
    {
      key: "closed",
      label: "불만 종결",
      unit: "건",
      value: c.closed,
      prev: cq.closed,
    },
    {
      key: "comp",
      label: "보상 승인 금액",
      unit: "원",
      value: c.comp,
      prev: cq.comp,
      better: "down",
    },
  ]);

  const [f, fq] = await Promise.all([fieldValues(db, p), fieldValues(db, q)]);
  sec("field", [
    {
      key: "failures",
      label: "설비 고장",
      unit: "건",
      value: f.failures,
      prev: fq.failures,
      better: "down",
      href: "/equipment",
    },
    {
      key: "ncs",
      label: "부적합 발행",
      unit: "건",
      value: f.ncs,
      prev: fq.ncs,
      better: "down",
      href: "/nc",
    },
    {
      key: "ncClosed",
      label: "부적합 종결",
      unit: "건",
      value: f.ncClosed,
      prev: fq.ncClosed,
      better: "up",
    },
    {
      key: "suggestions",
      label: "개선 제안",
      unit: "건",
      value: f.suggestions,
      prev: fq.suggestions,
      better: "up",
      href: "/suggestions",
    },
    {
      key: "adopted",
      label: "제안 채택",
      unit: "건",
      value: f.adopted,
      prev: fq.adopted,
      better: "up",
    },
    {
      key: "trainings",
      label: "교육 실시",
      unit: "건",
      value: f.trainings,
      prev: fq.trainings,
      href: "/training",
      note: `${Math.round(f.trainingHours * 10) / 10}시간`,
    },
  ]);

  const [s, sq] = await Promise.all([safetyValues(db, p), safetyValues(db, q)]);
  sec("safety", [
    {
      key: "accidents",
      label: "사고",
      unit: "건",
      value: s.accidents,
      prev: sq.accidents,
      better: "down",
      href: "/incidents",
    },
    {
      key: "near",
      label: "아차사고 보고",
      unit: "건",
      value: s.near,
      prev: sq.near,
      note: "보고가 많을수록 위험을 일찍 찾습니다",
    },
    {
      key: "wasteGen",
      label: "지정폐기물 발생",
      unit: "kg",
      value: s.wasteGen,
      prev: sq.wasteGen,
      better: "down",
      href: "/environment",
    },
    {
      key: "wasteOut",
      label: "지정폐기물 위탁 인계",
      unit: "kg",
      value: s.wasteOut,
      prev: sq.wasteOut,
    },
  ]);
  return out;
}

export type TrendSeries = {
  key: string;
  label: string;
  unit: Unit;
  values: number[];
};
/** 최근 기간 추이(입고·출고·상담, 권한이 있으면 매출·수납) */
export async function buildTrend(db: Db, actor: Actor, p: Period) {
  const ps = recentPeriods(p, TREND_COUNT[p.kind]);
  const all = { from: ps[0].from, to: ps[ps.length - 1].to };
  const { start, end } = ts(all);
  const idx = (d: string) => ps.findIndex((x) => x.from <= d && d <= x.to);
  const bucket = (days: string[], w?: number[]) => {
    const v = ps.map(() => 0);
    days.forEach((d, i) => {
      const k = idx(d);
      if (k >= 0) v[k] += w ? w[i] : 1;
    });
    return v;
  };
  const cs = await db
    .select({ at: consultation.at })
    .from(consultation)
    .where(and(gte(consultation.at, start), lte(consultation.at, end)));
  const ins = await db
    .select({ at: repairOrder.inAt })
    .from(repairOrder)
    .where(
      and(
        gte(repairOrder.inAt, start),
        lte(repairOrder.inAt, end),
        ne(repairOrder.status, "cancelled"),
      ),
    );
  const outs = await db
    .select({ at: repairStatement.deliveredAt })
    .from(repairStatement)
    .innerJoin(repairOrder, eq(repairOrder.id, repairStatement.repairOrderId))
    .where(
      and(
        gte(repairStatement.deliveredAt, start),
        lte(repairStatement.deliveredAt, end),
        ne(repairOrder.status, "cancelled"),
      ),
    );
  const series: TrendSeries[] = [
    {
      key: "consults",
      label: "상담",
      unit: "건",
      values: bucket(cs.map((x) => seoulDate(x.at))),
    },
    {
      key: "intake",
      label: "입고",
      unit: "대",
      values: bucket(ins.map((x) => seoulDate(x.at))),
    },
    {
      key: "delivered",
      label: "출고",
      unit: "대",
      values: bucket(outs.map((x) => seoulDate(x.at!))),
    },
  ];
  if (can(actor, "money.view")) {
    const st = await db
      .select({ on: repairStatement.issuedOn, w: repairStatement.totalWon })
      .from(repairStatement)
      .where(
        and(
          gte(repairStatement.issuedOn, all.from),
          lte(repairStatement.issuedOn, all.to),
        ),
      );
    series.unshift({
      key: "sales",
      label: "매출",
      unit: "원",
      values: bucket(
        st.map((x) => x.on),
        st.map((x) => x.w),
      ),
    });
  }
  return { labels: ps.map(shortLabel), periods: ps, series };
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

/** CSV(엑셀에서 열림, BOM 포함) */
export function reportCsv(p: Period, sections: Section[]) {
  const esc = (s: string) =>
    /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  const rows = [
    ["기간", "영역", "항목", "단위", "이번 기간", "앞 기간", "목표", "비고"],
  ];
  for (const s of sections)
    for (const m of s.metrics)
      rows.push([
        p.label,
        s.title,
        m.label,
        m.unit,
        m.value == null ? "" : String(Math.round(m.value * 100) / 100),
        m.prev == null ? "" : String(Math.round(m.prev * 100) / 100),
        m.target == null ? "" : String(m.target),
        [m.now ? "지금 기준" : "", m.note ?? ""].filter(Boolean).join(" "),
      ]);
  return "﻿" + rows.map((r) => r.map(esc).join(",")).join("\r\n");
}

/** 대시보드 경영 현황 패널: 이번 달과 지난달 같은 날까지 */
export async function kpiPanel(db: Db, actor: Actor, now = new Date()) {
  const today = seoulDate(now);
  const cur = { from: `${today.slice(0, 8)}01`, to: today };
  const m = can(actor, "money.view") ? await rangeSummary(db, cur) : null;
  const o = await opsValues(db, {
    ...cur,
    kind: "month",
    label: "",
    prev: "",
    next: "",
    days: 0,
  });
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
