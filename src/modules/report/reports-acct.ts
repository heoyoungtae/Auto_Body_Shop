// 회계보고서(지금 자료로 되는 것): 매출채권 연령·매입채무·지급 예정·부가세 집계.
// 손익계산서·재무상태표·현금흐름표·자금일보·계정별 원장은 계정과목·자동 분개가 생기는 4단계에서 만든다.
import { and, eq, gte, inArray, isNotNull, isNull, lte, ne } from "drizzle-orm";
import { expense, insuranceClaim, payable, payment, repairOrder, repairStatement } from "@/db/schema";
import { accruedIn, balancesAt, listPayables } from "@/modules/money/payable";
import { customerReceivables, insurerReceivables } from "@/modules/money/receipts";
import { EVIDENCE_KINDS, EXP_CATEGORIES, PAYABLE_KINDS, RECEIPT_KINDS } from "@/modules/money/rules";
import { addDays, seoulDate } from "@/modules/platform/time";
import { PAY_METHODS } from "@/modules/repair/inspect-rules";
import { type Builder, type Row, avg, both, daysBetween, groupBy, m, sum } from "./kit";

const BUCKETS = [
  { label: "30일 이내", max: 30 },
  { label: "31~60일", max: 60 },
  { label: "61~90일", max: 90 },
  { label: "90일 넘음", max: Infinity },
];
const bucketOf = (d: number | null) => BUCKETS.findIndex((b) => (d ?? 0) <= b.max);
const lbl = (t: Record<string, string>, k: string | null) => (k ? (t[k] ?? k) : "—");

/** 10. 매출채권 연령 */
export const ar: Builder = async (c) => {
  const car = await customerReceivables(c.db, c.now);
  const iar = await insurerReceivables(c.db, c.now);
  const cb = BUCKETS.map(() => 0);
  const ib = BUCKETS.map(() => 0);
  for (const r of car) cb[bucketOf(r.days)] += r.remain;
  for (const r of iar) ib[bucketOf(r.days)] += r.claimedWon;
  // 기간 안에 보험사가 입금한 건: 청구 → 입금 일수
  const paid = async (p: { from: string; to: string }) =>
    c.db.select({ insurer: insuranceClaim.insurer, claimedAt: insuranceClaim.claimedAt, paidOn: insuranceClaim.paidOn, paidWon: insuranceClaim.paidWon, claimedWon: insuranceClaim.claimedWon, cut: insuranceClaim.cutWon }).from(insuranceClaim).where(and(gte(insuranceClaim.paidOn, p.from), lte(insuranceClaim.paidOn, p.to)));
  const [a, b] = await both(c, paid);
  const days = (x: typeof a) => x.filter((r) => r.claimedAt && r.paidOn).map((r) => daysBetween(seoulDate(r.claimedAt!), r.paidOn!));
  const byIns = new Map<string, { n: number; w: number; oldest: number; paidDays: number[]; cut: number }>();
  for (const r of iar) {
    const g = byIns.get(r.insurer) ?? { n: 0, w: 0, oldest: 0, paidDays: [], cut: 0 };
    g.n++;
    g.w += r.claimedWon;
    g.oldest = Math.max(g.oldest, r.days);
    byIns.set(r.insurer, g);
  }
  for (const r of a) {
    const g = byIns.get(r.insurer) ?? { n: 0, w: 0, oldest: 0, paidDays: [], cut: 0 };
    if (r.claimedAt && r.paidOn) g.paidDays.push(daysBetween(seoulDate(r.claimedAt), r.paidOn));
    g.cut += r.cut ?? 0;
    byIns.set(r.insurer, g);
  }
  const custTotal = sum(car, (r) => r.remain);
  const insTotal = sum(iar, (r) => r.claimedWon);
  return {
    kpis: [
      m("arCust", "고객 미수", "원", custTotal, null, { now: true, better: "down", href: "/money", note: `${car.length}건` }),
      m("arIns", "보험사 미수", "원", insTotal, null, { now: true, better: "down", href: "/claims", note: `${iar.length}건` }),
      m("ar90", "90일 넘은 미수", "원", cb[3] + ib[3], null, { now: true, better: "down" }),
      m("insPaid", "보험사 입금(기간)", "원", sum(a, (r) => r.paidWon ?? 0), sum(b, (r) => r.paidWon ?? 0), { better: "up" }),
      m("insDays", "청구 → 입금 평균 일수", "일", avg(days(a)), avg(days(b)), { better: "down" }),
      m("insCut", "보험사 삭감액(기간)", "원", sum(a, (r) => r.cut ?? 0), sum(b, (r) => r.cut ?? 0), { better: "down" }),
    ],
    tables: [
      {
        key: "aging",
        title: "연령별 미수(지금 기준)",
        help: "rep.t.aging",
        cols: [{ label: "지난 날수" }, { label: "고객", unit: "원", num: true }, { label: "보험사", unit: "원", num: true }, { label: "합계", unit: "원", num: true }],
        rows: BUCKETS.map((bk, i) => ({ cells: [bk.label, cb[i], ib[i], cb[i] + ib[i]], tone: i >= 2 && cb[i] + ib[i] > 0 ? ("danger" as const) : undefined })),
        now: true,
        note: "고객 미수는 출고일부터, 보험사 미수는 청구일부터 셉니다.",
      },
      {
        key: "insurer",
        title: "보험사별",
        help: "rep.t.insurerAr",
        cols: [{ label: "보험사" }, { label: "미수 건수", unit: "건", num: true }, { label: "미수 금액", unit: "원", num: true }, { label: "가장 오래된(일)", unit: "일", num: true }, { label: "기간 평균 입금 일수", unit: "일", num: true }, { label: "기간 삭감액", unit: "원", num: true }],
        rows: [...byIns.entries()].sort((x, y) => y[1].w - x[1].w).map(([k, g]) => ({ cells: [k, g.n, g.w, g.n ? g.oldest : null, avg(g.paidDays), g.cut], href: "/claims" })),
        empty: "보험사 미수·입금이 없습니다.",
      },
      {
        key: "customer",
        title: "고객 미수 목록(오래된 순)",
        help: "rep.t.customerAr",
        cols: [{ label: "수리 번호" }, { label: "고객·차량" }, { label: "받을 돈", unit: "원", num: true }, { label: "받은 돈", unit: "원", num: true }, { label: "남은 돈", unit: "원", num: true }, { label: "출고 후(일)", unit: "일", num: true }, { label: "약속일" }],
        rows: car.slice(0, 100).map((r) => ({ cells: [r.docNo, r.who, r.due, r.paid, r.remain, r.days, r.promisedOn ?? ""], href: `/money/ro/${r.roId}`, tone: (r.days ?? 0) > 60 ? ("danger" as const) : (r.days ?? 0) > 30 ? ("warn" as const) : undefined })),
        empty: "고객 미수가 없습니다.",
        now: true,
      },
    ],
  };
};

/** 11. 매입채무·지급 예정 */
export const ap: Builder = async (c) => {
  const bal = await balancesAt(c.db, c.today, c.now);
  const [a, b] = await both(c, (p) => accruedIn(c.db, p.from, p.to));
  const byCat = new Map<string, number>();
  for (const x of a) {
    const parts = x.split.length ? x.split : [{ category: x.category, won: x.amountWon }];
    for (const s of parts) byCat.set(s.category, (byCat.get(s.category) ?? 0) + s.won);
  }
  const open = (await listPayables(c.db)).filter((x) => x.kind !== "prepay" && x.status !== "paid");
  const horizon = addDays(c.today, 28);
  const upcoming = open.filter((x) => x.dueOn <= horizon).sort((x, y) => x.dueOn.localeCompare(y.dueOn));
  const late = open.filter((x) => x.dueOn < c.today);
  const total = (x: typeof a) => sum(x, (r) => r.amountWon);
  return {
    kpis: [
      m("trade", "외상매입금", "원", bal.trade, null, { now: true, href: "/money/payables" }),
      m("other", "미지급금", "원", bal.other, null, { now: true, href: "/money/payables" }),
      m("card", "카드 결제 예정", "원", bal.card, null, { now: true }),
      m("prepaid", "선급금(낸 돈 중 물건 안 온 것)", "원", bal.prepaid, null, { now: true }),
      m("late", "지급 기한 지난 것", "원", sum(late, (x) => x.amountWon), null, { now: true, better: "down", note: `${late.length}건` }),
      m("accrued", "기간에 생긴 매입·비용", "원", total(a), total(b), { better: "down", note: "입고 검수일 기준" }),
    ],
    tables: [
      {
        key: "supplier",
        title: "업체별 잔액(지금 기준)",
        help: "rep.t.supplierAp",
        cols: [{ label: "업체" }, { label: "외상매입금", unit: "원", num: true }, { label: "미지급금", unit: "원", num: true }, { label: "합계", unit: "원", num: true }],
        rows: bal.bySupplier.map((s) => ({ cells: [s.name, s.trade, s.other, s.trade + s.other] })),
        empty: "갚을 돈이 없습니다.",
        now: true,
      },
      {
        key: "due",
        title: "앞으로 4주 지급 예정(기한 지난 것 포함)",
        help: "rep.t.payDue",
        cols: [{ label: "지급 예정일" }, { label: "업체" }, { label: "구분" }, { label: "근거 전표" }, { label: "금액", unit: "원", num: true }, { label: "지급 결의" }],
        rows: upcoming.map((x) => ({ cells: [x.dueOn, x.payeeName, lbl(PAYABLE_KINDS, x.kind), x.sourceNo, x.amountWon, x.settleNo ?? "아직"], href: x.supplierId ? `/money/payables/${x.supplierId}` : "/money/payables", tone: x.dueOn < c.today ? ("danger" as const) : undefined })),
        empty: "4주 안에 낼 돈이 없습니다.",
        now: true,
      },
      {
        key: "category",
        title: "기간에 생긴 매입·비용(계정별)",
        help: "rep.t.accrued",
        cols: [{ label: "계정" }, { label: "금액(부가세 포함)", unit: "원", num: true }],
        rows: [...byCat.entries()].sort((x, y) => y[1] - x[1]).map(([k, w]) => ({ cells: [lbl(EXP_CATEGORIES, k), w] })),
        empty: "이 기간 생긴 매입이 없습니다.",
      },
    ],
  };
};

/** 12. 부가세 집계(신고 참고용) */
export const vat: Builder = async (c) => {
  const load = async (p: { from: string; to: string }) => {
    const st = await c.db
      .select({ s: repairStatement, insurance: repairOrder.insurance })
      .from(repairStatement)
      .innerJoin(repairOrder, eq(repairOrder.id, repairStatement.repairOrderId))
      .where(and(gte(repairStatement.issuedOn, p.from), lte(repairStatement.issuedOn, p.to), ne(repairOrder.status, "cancelled")));
    const pays = await c.db.select().from(payment).where(and(gte(payment.receivedOn, p.from), lte(payment.receivedOn, p.to), eq(payment.payer, "customer")));
    const pay = await c.db.select().from(payable).where(and(gte(payable.accruedOn, p.from), lte(payable.accruedOn, p.to), ne(payable.kind, "prepay")));
    // 채무를 거치지 않고 바로 낸 지출(설비·임차료 등): 적격 증빙만 매입세액
    const ex = await c.db
      .select()
      .from(expense)
      .where(and(eq(expense.sourceKind, "none"), isNull(expense.cancelledAt), isNotNull(expense.paidOn), gte(expense.paidOn, p.from), lte(expense.paidOn, p.to), inArray(expense.evidenceKind, ["tax_invoice", "card", "cash_receipt"])));
    const outVat = sum(st, (r) => r.s.vatWon);
    const inVat = sum(pay, (r) => r.vatWon) + sum(ex, (r) => r.vatWon);
    return { st, pays, pay, ex, outVat, inVat };
  };
  const [a, b] = await both(c, load);
  const byMethod = groupBy(a.st, (r) => r.s.payMethod ?? "", (r) => r.s.totalWon);
  const byReceipt = groupBy(a.pays, (r) => r.receiptKind, (r) => r.amountWon);
  const inRows: Row[] = [
    { cells: ["외상 매입(입고 검수)·외주", sum(a.pay.filter((x) => x.kind !== "other"), (x) => x.supplyWon), sum(a.pay.filter((x) => x.kind !== "other"), (x) => x.vatWon)] },
    { cells: ["미지급 비용(채무로 잡힌 것)", sum(a.pay.filter((x) => x.kind === "other"), (x) => x.supplyWon), sum(a.pay.filter((x) => x.kind === "other"), (x) => x.vatWon)] },
    ...[...new Set(a.ex.map((x) => x.evidenceKind ?? ""))].map((k) => {
      const xs = a.ex.filter((x) => (x.evidenceKind ?? "") === k);
      return { cells: [`바로 낸 지출 · ${lbl(EVIDENCE_KINDS, k)}`, sum(xs, (x) => x.supplyWon), sum(xs, (x) => x.vatWon)] };
    }),
  ];
  return {
    kpis: [
      m("out", "매출세액", "원", a.outVat, b.outVat, { note: "정비명세서 부가세" }),
      m("in", "매입세액(어림)", "원", a.inVat, b.inVat, { note: "세금계산서·카드·현금영수증 받은 매입" }),
      m("due", "낼 부가세(어림)", "원", a.outVat - a.inVat, b.outVat - b.inVat, { better: "down", note: "매출세액 − 매입세액, 공제·가산세 전" }),
      m("supply", "과세 매출 공급가", "원", sum(a.st, (r) => r.s.partsWon + r.s.laborWon), sum(b.st, (r) => r.s.partsWon + r.s.laborWon)),
    ],
    tables: [
      {
        key: "outMethod",
        title: "매출: 결제 방법별(명세서 기준)",
        help: "rep.t.vatOut",
        cols: [{ label: "결제 방법" }, { label: "합계(부가세 포함)", unit: "원", num: true }],
        rows: [...byMethod.entries()].sort((x, y) => y[1] - x[1]).map(([k, w]) => ({ cells: [lbl(PAY_METHODS, k || null), w] })),
        empty: "이 기간 발급한 명세서가 없습니다.",
      },
      {
        key: "outReceipt",
        title: "고객 수납: 증빙별",
        help: "rep.t.vatReceipt",
        cols: [{ label: "증빙" }, { label: "받은 돈", unit: "원", num: true }],
        rows: [...byReceipt.entries()].sort((x, y) => y[1] - x[1]).map(([k, w]) => ({ cells: [lbl(RECEIPT_KINDS, k), w] })),
        empty: "이 기간 고객 수납이 없습니다.",
        note: "신용카드매출전표 등 발행 금액 집계표와 현금영수증 발행분을 맞춰 볼 때 씁니다.",
      },
      { key: "in", title: "매입세액", help: "rep.t.vatIn", cols: [{ label: "구분" }, { label: "공급가", unit: "원", num: true }, { label: "세액", unit: "원", num: true }], rows: inRows },
    ],
    notes: ["부가세 신고는 세무사가 홈택스 자료와 맞춰 확정합니다. 이 보고서는 신고 전 어림 값입니다(간이영수증·증빙 못 받은 지출은 매입세액에서 뺐습니다)."],
  };
};
