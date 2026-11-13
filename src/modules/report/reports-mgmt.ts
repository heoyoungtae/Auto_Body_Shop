// 경영보고서: 경영 요약·영업 실적·매출 분석·생산성. 숫자는 모두 앞선 전표에서 계산한다(입력 없음).
import { and, eq, gte, inArray, isNotNull, isNull, lt, lte, ne } from "drizzle-orm";
import {
  appUser,
  consultation,
  equipment,
  estimateLine,
  incident,
  nonconformance,
  repairOrder,
  repairStatement,
  stockItem,
  workStep,
} from "@/db/schema";
import { can } from "@/modules/auth/permissions";
import { CHANNEL_LABEL, INSURANCE_LABEL } from "@/modules/customer/rules";
import { rangeSummary } from "@/modules/money/close";
import { customerReceivables, insurerReceivables } from "@/modules/money/receipts";
import { seoulDate } from "@/modules/platform/time";
import { computeGoalSpan, spanOf, targetsFor } from "@/modules/quality/goals";
import { GOAL_KEYS, GOALS, goalOk } from "@/modules/quality/qms-rules";
import { LINE_CATEGORIES } from "@/modules/repair/estimate-rules";
import { processLabel } from "@/modules/repair/work-rules";
import { addDays } from "@/modules/platform/time";
import { type Builder, type Ctx, type Row, avg, both, groupBy, m, pct, round1, sum, tsRange } from "./kit";
import { opsValues } from "./service";

const label = <T extends Record<string, string>>(t: T, k: string) => (t as Record<string, string>)[k] ?? k;

/** 출고(인도) 건: 기간 안에 고객에게 넘긴 것 */
async function deliveries(c: Ctx, p: { from: string; to: string }) {
  const { start, end } = tsRange(p);
  return c.db
    .select({ inAt: repairOrder.inAt, at: repairStatement.deliveredAt, total: repairStatement.totalWon, insurance: repairOrder.insurance })
    .from(repairStatement)
    .innerJoin(repairOrder, eq(repairOrder.id, repairStatement.repairOrderId))
    .where(and(gte(repairStatement.deliveredAt, start), lte(repairStatement.deliveredAt, end), ne(repairOrder.status, "cancelled")));
}

/** 1. 경영 요약 */
export const summary: Builder = async (c) => {
  const [o, oq] = await both(c, (p) => opsValues(c.db, p));
  const kpis = [
    m("consults", "상담", "건", o.consults, oq.consults, { better: "up", href: "/reports/sales" }),
    m("intake", "입고", "대", o.intake, oq.intake, { better: "up", href: "/reports/sales" }),
    m("delivered", "출고", "대", o.delivered, oq.delivered, { better: "up", href: "/reports/sales" }),
    m("lead", "평균 수리 기간", "일", o.lead, oq.lead, { better: "down", href: "/reports/productivity", note: "입고 → 출고" }),
    m("efficiency", "작업 효율", "%", o.efficiency, oq.efficiency, { better: "up", href: "/reports/productivity", note: "표준 시간 ÷ 실제 시간" }),
  ];
  const warn: Row[] = [];
  if (can(c.actor, "money.view")) {
    const [s, sq] = await both(c, (p) => rangeSummary(c.db, p));
    kpis.unshift(
      m("sales", "매출(명세서 발급)", "원", s.sales.total, sq.sales.total, { better: "up", href: "/reports/revenue" }),
      m("collected", "수금(고객+보험사)", "원", s.collected.total, sq.collected.total, { better: "up", href: "/reports/ar" }),
      m("purchases", "매입(발주·외주)", "원", s.purchases.total, sq.purchases.total, { better: "down", href: "/reports/ap" }),
      m("expenses", "지출 지급", "원", s.expenses.paid, sq.expenses.paid, { better: "down", href: "/money/expenses" }),
      m("ar", "미수(고객+보험사)", "원", s.receivables.customer + s.receivables.insurer, null, { now: true, better: "down", href: "/reports/ar" }),
    );
    const car = await customerReceivables(c.db, c.now);
    const old = car.filter((r) => (r.days ?? 0) > 60);
    if (old.length) warn.push({ cells: ["60일 넘은 고객 미수", old.length, sum(old, (r) => r.remain)], href: "/reports/ar", tone: "danger" });
    const iar = (await insurerReceivables(c.db, c.now)).filter((r) => r.days > 30);
    if (iar.length) warn.push({ cells: ["청구 30일 넘은 보험사 미수", iar.length, sum(iar, (r) => r.claimedWon)], href: "/reports/ar", tone: "warn" });
  }
  // 품질목표 미달
  const targets = await targetsFor(c.db, Number(c.p.from.slice(0, 4)));
  const miss: string[] = [];
  for (const k of GOAL_KEYS) {
    const v = await computeGoalSpan(c.db, spanOf(c.p.from, c.p.to), k, c.now);
    if (goalOk(k, v.value, targets[k]) === false) miss.push(GOALS[k].label);
  }
  kpis.push(m("goalMiss", "품질목표 미달", "건", miss.length, null, { better: "down", href: "/reports/quality", note: miss.slice(0, 3).join(", ") || undefined, now: false }));
  if (miss.length) warn.push({ cells: [`품질목표 미달: ${miss.join(", ")}`, miss.length, null], href: "/reports/quality", tone: "danger" });

  const [acc, accq] = await both(c, async (p) => {
    const { start, end } = tsRange(p);
    return (await c.db.select({ id: incident.id }).from(incident).where(and(eq(incident.kind, "accident"), gte(incident.occurredAt, start), lte(incident.occurredAt, end)))).length;
  });
  kpis.push(m("accidents", "사고", "건", acc, accq, { better: "down", href: "/reports/safety" }));

  // 지금 기준 경고
  const ncLate = await c.db.select({ id: nonconformance.id }).from(nonconformance).where(and(ne(nonconformance.status, "closed"), isNotNull(nonconformance.dueOn), lt(nonconformance.dueOn, c.today)));
  if (ncLate.length) warn.push({ cells: ["기한 지난 시정조치", ncLate.length, null], href: "/nc", tone: "danger" });
  const low = await c.db.select({ qty: stockItem.qty, safety: stockItem.safetyQty }).from(stockItem).where(eq(stockItem.active, true));
  const lowN = low.filter((s) => s.safety > 0 && s.qty < s.safety).length;
  if (lowN) warn.push({ cells: ["안전재고 밑으로 떨어진 품목", lowN, null], href: "/stock", tone: "warn" });
  const calib = await c.db.select({ id: equipment.id }).from(equipment).where(and(isNotNull(equipment.calibNextOn), lte(equipment.calibNextOn, addDays(c.today, 30)), isNull(equipment.disposedOn)));
  if (calib.length) warn.push({ cells: ["30일 안에 교정할 측정 장비", calib.length, null], href: "/reports/equipment", tone: "warn" });

  return {
    kpis,
    tables: [
      {
        key: "warn",
        title: "살펴볼 것",
        help: "rep.t.warn",
        cols: [{ label: "항목" }, { label: "건수", unit: "건", num: true }, { label: "금액", unit: "원", num: true }],
        rows: warn,
        total: false,
        empty: "지금 걸리는 경고가 없습니다.",
        now: true,
      },
    ],
    trends: [TREND.sales, TREND.intake, TREND.delivered].filter((t) => t.key !== "sales" || can(c.actor, "money.view")),
  };
};

/** 2. 영업 실적 */
export const sales: Builder = async (c) => {
  const load = async (p: { from: string; to: string }) => {
    const { start, end } = tsRange(p);
    const cs = await c.db
      .select({ channel: consultation.channel, result: consultation.result, insurance: consultation.insurance, closeReason: consultation.closeReason })
      .from(consultation)
      .where(and(gte(consultation.at, start), lte(consultation.at, end)));
    const ros = await c.db
      .select({ customerId: repairOrder.customerId, insurance: repairOrder.insurance, inAt: repairOrder.inAt })
      .from(repairOrder)
      .where(and(gte(repairOrder.inAt, start), lte(repairOrder.inAt, end), ne(repairOrder.status, "cancelled")));
    // 다시 온 고객: 이 기간 입고 고객 중 이 기간 전에 입고한 적이 있는 사람
    const ids = [...new Set(ros.map((r) => r.customerId))];
    const before = ids.length
      ? new Set((await c.db.select({ id: repairOrder.customerId }).from(repairOrder).where(and(inArray(repairOrder.customerId, ids), lt(repairOrder.inAt, start), ne(repairOrder.status, "cancelled")))).map((r) => r.id))
      : new Set<string>();
    const outs = await deliveries(c, p);
    return { cs, ros, outs, revisit: ids.filter((i) => before.has(i)).length, customers: ids.length };
  };
  const [a, b] = await both(c, load);
  const conv = (x: typeof a) => x.cs.filter((r) => r.result === "reserved" || r.result === "converted").length;
  const declined = a.cs.filter((r) => r.result === "declined");
  const money = can(c.actor, "money.view");
  const kpis = [
    m("consults", "상담", "건", a.cs.length, b.cs.length, { better: "up", href: "/consults" }),
    m("conv", "예약·입고 전환율", "%", pct(conv(a), a.cs.length), pct(conv(b), b.cs.length), { better: "up", note: `${conv(a)}건 전환` }),
    m("intake", "입고", "대", a.ros.length, b.ros.length, { better: "up", href: "/repairs" }),
    m("delivered", "출고", "대", a.outs.length, b.outs.length, { better: "up" }),
    m("declined", "거절·보류", "건", declined.length, b.cs.filter((r) => r.result === "declined").length, { better: "down" }),
    m("revisit", "다시 온 고객 비율", "%", pct(a.revisit, a.customers), pct(b.revisit, b.customers), { better: "up", note: "입고 고객 중 전에 온 적 있는 사람" }),
  ];
  if (money) kpis.push(m("perCar", "출고 1대당 매출", "원", avg(a.outs.map((o) => o.total)), avg(b.outs.map((o) => o.total)), { better: "up" }));

  const stages = [
    ["상담", a.cs.length],
    ["예약·입고 전환", conv(a)],
    ["입고", a.ros.length],
    ["출고", a.outs.length],
  ] as const;
  const funnel: Row[] = stages.map(([l, n], i) => ({ cells: [l, n, i ? pct(n, stages[i - 1][1]) : null] }));
  const byCh = groupBy(a.cs, (r) => r.channel);
  const convCh = groupBy(a.cs.filter((r) => r.result === "reserved" || r.result === "converted"), (r) => r.channel);
  const prevCh = groupBy(b.cs, (r) => r.channel);
  const insCs = groupBy(a.cs, (r) => r.insurance);
  const insRo = groupBy(a.ros, (r) => r.insurance);
  const reasons = groupBy(declined, (r) => (r.closeReason ?? "").trim() || "(사유 안 적음)");
  return {
    kpis,
    tables: [
      { key: "funnel", title: "단계별 건수(깔때기)", help: "rep.t.funnel", cols: [{ label: "단계" }, { label: "건수", unit: "건", num: true }, { label: "앞 단계 대비", unit: "%", num: true }], rows: funnel, total: false, note: "상담·입고·출고는 각각 그 기간에 일어난 건수라 앞 기간에서 넘어온 건이 섞입니다." },
      {
        key: "channel",
        title: "유입 경로별",
        help: "rep.t.channel",
        cols: [{ label: "경로" }, { label: "상담", unit: "건", num: true }, { label: "전환", unit: "건", num: true }, { label: "전환율", unit: "%", num: true }, { label: "비교 기간 상담", unit: "건", num: true }],
        rows: [...byCh.entries()].sort((x, y) => y[1] - x[1]).map(([k, n]) => ({ cells: [label(CHANNEL_LABEL, k), n, convCh.get(k) ?? 0, pct(convCh.get(k) ?? 0, n), prevCh.get(k) ?? 0], href: `/consults` })),
        empty: "이 기간 상담이 없습니다.",
      },
      {
        key: "insurance",
        title: "보험/자비",
        help: "rep.t.insurance",
        cols: [{ label: "구분" }, { label: "상담", unit: "건", num: true }, { label: "입고", unit: "대", num: true }],
        rows: Object.keys(INSURANCE_LABEL).map((k) => ({ cells: [label(INSURANCE_LABEL, k), insCs.get(k) ?? 0, insRo.get(k) ?? 0] })),
      },
      {
        key: "declined",
        title: "거절·보류 사유",
        help: "rep.t.declined",
        cols: [{ label: "사유" }, { label: "건수", unit: "건", num: true }],
        rows: [...reasons.entries()].sort((x, y) => y[1] - x[1]).map(([k, n]) => ({ cells: [k, n] })),
        empty: "거절·보류한 상담이 없습니다.",
      },
    ],
    trends: [TREND.consults, TREND.intake, TREND.delivered],
  };
};

/** 3. 매출 분석 */
export const revenue: Builder = async (c) => {
  const load = async (p: { from: string; to: string }) =>
    c.db
      .select({ s: repairStatement, insurance: repairOrder.insurance, insurer: repairOrder.insurer })
      .from(repairStatement)
      .innerJoin(repairOrder, eq(repairOrder.id, repairStatement.repairOrderId))
      .where(and(gte(repairStatement.issuedOn, p.from), lte(repairStatement.issuedOn, p.to), ne(repairOrder.status, "cancelled")));
  const [a, b] = await both(c, load);
  const tot = (x: typeof a) => sum(x, (r) => r.s.totalWon);
  const supply = (x: typeof a) => sum(x, (r) => r.s.partsWon + r.s.laborWon);
  const labor = (x: typeof a) => sum(x, (r) => r.s.laborWon);
  const ins = (x: typeof a) => sum(x.filter((r) => r.insurance !== "self"), (r) => r.s.totalWon);
  const kpis = [
    m("sales", "매출(부가세 포함)", "원", tot(a), tot(b), { better: "up", note: `${a.length}건` }),
    m("supply", "공급가(부가세 뺀 것)", "원", supply(a), supply(b), { better: "up" }),
    m("perCase", "건당 매출", "원", avg(a.map((r) => r.s.totalWon)), avg(b.map((r) => r.s.totalWon)), { better: "up" }),
    m("laborShare", "공임 비중", "%", pct(labor(a), supply(a)), pct(labor(b), supply(b)), { note: "공임 ÷ (공임+부품)" }),
    m("insShare", "보험 수리 비중", "%", pct(ins(a), tot(a)), pct(ins(b), tot(b))),
  ];
  const byIns = new Map<string, { n: number; w: number; parts: number; labor: number }>();
  for (const r of a) {
    const k = r.insurance === "self" ? "자비(고객 부담)" : `${r.insurer?.trim() || "보험사 미기재"} · ${label(INSURANCE_LABEL, r.insurance)}`;
    const g = byIns.get(k) ?? { n: 0, w: 0, parts: 0, labor: 0 };
    g.n++;
    g.w += r.s.totalWon;
    g.parts += r.s.partsWon;
    g.labor += r.s.laborWon;
    byIns.set(k, g);
  }
  // 수리 종류별: 명세서의 견적서에서 승인한 줄
  const estIds = a.map((r) => r.s.estimateId).filter((x): x is string => !!x);
  const lines = estIds.length ? await c.db.select().from(estimateLine).where(and(inArray(estimateLine.estimateId, estIds), eq(estimateLine.approved, true))) : [];
  const byCat = groupBy(lines, (l) => l.category, (l) => l.unitWon * l.qty + l.laborWon);
  const catTotal = sum([...byCat.values()], (x) => x);
  const byMonth = groupBy(a, (r) => r.s.issuedOn.slice(0, 7), (r) => r.s.totalWon);
  return {
    kpis,
    tables: [
      {
        key: "payer",
        title: "보험사·자비별",
        help: "rep.t.payer",
        cols: [{ label: "누가 내나" }, { label: "건수", unit: "건", num: true }, { label: "매출", unit: "원", num: true }, { label: "부품", unit: "원", num: true }, { label: "공임", unit: "원", num: true }, { label: "비중", unit: "%", num: true }],
        rows: [...byIns.entries()].sort((x, y) => y[1].w - x[1].w).map(([k, g]) => ({ cells: [k, g.n, g.w, g.parts, g.labor, pct(g.w, tot(a))] })),
        empty: "이 기간 발급한 정비명세서가 없습니다.",
      },
      {
        key: "category",
        title: "수리 종류별(견적 줄 기준)",
        help: "rep.t.category",
        cols: [{ label: "종류" }, { label: "금액(부가세 제외)", unit: "원", num: true }, { label: "비중", unit: "%", num: true }],
        rows: [...byCat.entries()].sort((x, y) => y[1] - x[1]).map(([k, w]) => ({ cells: [label(LINE_CATEGORIES, k), w, pct(w, catTotal)] })),
        empty: "견적 줄이 없습니다.",
        note: "명세서에 연결된 견적서에서 고객이 승인한 줄을 종류별로 더했습니다.",
      },
      ...(byMonth.size > 1
        ? [{ key: "month", title: "달별", help: "rep.t.month" as const, cols: [{ label: "달" }, { label: "매출", unit: "원" as const, num: true }], rows: [...byMonth.entries()].sort().map(([k, w]) => ({ cells: [k, w] as (string | number)[] })) }]
        : []),
    ],
    trends: [TREND.sales],
  };
};

/** 4. 생산성·작업 */
export const productivity: Builder = async (c) => {
  const load = async (p: { from: string; to: string }) => {
    const { start, end } = tsRange(p);
    return c.db
      .select({ process: workStep.process, std: workStep.stdMinutes, act: workStep.actualMinutes, who: appUser.name, whoId: workStep.assignee })
      .from(workStep)
      .leftJoin(appUser, eq(appUser.id, workStep.assignee))
      .where(and(gte(workStep.endedAt, start), lte(workStep.endedAt, end)));
  };
  const [a, b] = await both(c, load);
  const [o, oq] = await both(c, (p) => opsValues(c.db, p));
  const eff = (x: typeof a) => {
    const w = x.filter((s) => s.act && s.act > 0 && s.std > 0);
    return w.length ? (sum(w, (s) => s.std) / sum(w, (s) => s.act!)) * 100 : null;
  };
  const rw = (x: typeof a) => x.filter((s) => s.process === "rework").length;
  const group = (key: (s: (typeof a)[number]) => string) => {
    const g = new Map<string, typeof a>();
    for (const s of a) g.set(key(s), [...(g.get(key(s)) ?? []), s]);
    return [...g.entries()]
      .map(([k, xs]) => ({ cells: [k, xs.length, round1(sum(xs, (s) => s.act ?? 0) / 60), round1(sum(xs, (s) => s.std) / 60), round1(eff(xs)), xs.filter((s) => s.process === "rework").length] as (string | number | null)[], tone: (eff(xs) ?? 100) < 70 ? ("warn" as const) : undefined }))
      .sort((x, y) => (y.cells[2] as number) - (x.cells[2] as number));
  };
  const cols = (first: string) => [
    { label: first },
    { label: "끝낸 공정", unit: "건" as const, num: true },
    { label: "실제 시간", unit: "시간" as const, num: true },
    { label: "표준 시간", unit: "시간" as const, num: true },
    { label: "효율", unit: "%" as const, num: true },
    { label: "재작업", unit: "건" as const, num: true },
  ];
  return {
    kpis: [
      m("steps", "끝낸 공정", "건", a.length, b.length, { better: "up", href: "/work" }),
      m("hours", "작업 실적 시간", "시간", sum(a, (s) => s.act ?? 0) / 60, sum(b, (s) => s.act ?? 0) / 60),
      m("eff", "작업 효율", "%", eff(a), eff(b), { better: "up", note: "표준 시간 ÷ 실제 시간(100% 넘으면 표준보다 빠름)" }),
      m("rework", "재작업 공정", "건", rw(a), rw(b), { better: "down" }),
      m("lead", "평균 수리 기간", "일", o.lead, oq.lead, { better: "down", note: "입고 → 출고" }),
    ],
    tables: [
      { key: "tech", title: "기술자별", help: "rep.t.tech", cols: cols("기술자"), rows: group((s) => s.who ?? "배정 안 됨"), empty: "이 기간 끝낸 공정이 없습니다.", total: false },
      { key: "process", title: "공정별", help: "rep.t.process", cols: cols("공정"), rows: group((s) => processLabel(s.process)), empty: "이 기간 끝낸 공정이 없습니다.", total: false },
    ],
  };
};

/** 추이 정의(날짜별 값) */
export const TREND = {
  consults: {
    key: "consults",
    label: "상담",
    unit: "건",
    load: async (db, from, to) => {
      const { start, end } = tsRange({ from, to });
      return (await db.select({ at: consultation.at }).from(consultation).where(and(gte(consultation.at, start), lte(consultation.at, end)))).map((x) => ({ on: seoulDate(x.at) }));
    },
  },
  intake: {
    key: "intake",
    label: "입고",
    unit: "대",
    load: async (db, from, to) => {
      const { start, end } = tsRange({ from, to });
      return (await db.select({ at: repairOrder.inAt }).from(repairOrder).where(and(gte(repairOrder.inAt, start), lte(repairOrder.inAt, end), ne(repairOrder.status, "cancelled")))).map((x) => ({ on: seoulDate(x.at) }));
    },
  },
  delivered: {
    key: "delivered",
    label: "출고",
    unit: "대",
    load: async (db, from, to) => {
      const { start, end } = tsRange({ from, to });
      return (
        await db
          .select({ at: repairStatement.deliveredAt })
          .from(repairStatement)
          .innerJoin(repairOrder, eq(repairOrder.id, repairStatement.repairOrderId))
          .where(and(gte(repairStatement.deliveredAt, start), lte(repairStatement.deliveredAt, end), ne(repairOrder.status, "cancelled")))
      ).map((x) => ({ on: seoulDate(x.at!) }));
    },
  },
  sales: {
    key: "sales",
    label: "매출",
    unit: "원",
    load: async (db, from, to) =>
      (await db.select({ on: repairStatement.issuedOn, w: repairStatement.totalWon }).from(repairStatement).where(and(gte(repairStatement.issuedOn, from), lte(repairStatement.issuedOn, to)))).map((x) => ({ on: x.on, w: x.w })),
  },
} satisfies Record<string, import("./kit").TrendDef>;
