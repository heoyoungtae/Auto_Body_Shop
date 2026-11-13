// 5. 손익분기·예산 대비(보고서 센터 5단계). 자동 분개(4단계) 실적을 연간 예산(대표가 연초에 적음)과 견준다.
// 손익분기: 매출원가는 매출 따라 늘고(변동비), 판관비·영업외 순비용은 매출과 상관없이 나간다(고정비)고 본다. 손익분기 매출 = 고정비 ÷ (1 − 매출원가율).
import { actualVals, BUDGET_ROWS, type BudgetVals, budgetRange, derived, zeroVals, BUDGET_KEYS } from "@/modules/acct/budget";
import { buildJournal, type JEntry, sumBy } from "@/modules/acct/journal";
import { type Builder, type Row, m, pct, round1 } from "./kit";

const ymEnd = (ym: string) => {
  const [y, mo] = ym.split("-").map(Number);
  return `${ym}-${String(new Date(Date.UTC(y, mo, 0)).getUTCDate()).padStart(2, "0")}`;
};
const dayNo = (d: string) => Date.parse(`${d}T00:00:00Z`) / 864e5;
/** 기간에 걸친 달 목록 */
export function monthsIn(from: string, to: string) {
  const out: string[] = [];
  let [y, mo] = from.slice(0, 7).split("-").map(Number);
  const end = to.slice(0, 7);
  for (;;) {
    const ym = `${y}-${String(mo).padStart(2, "0")}`;
    if (ym > end) break;
    out.push(ym);
    mo++;
    if (mo > 12) ((mo = 1), y++);
  }
  return out;
}

/** 기간 예산: 달 예산을 기간에 든 날짜만큼(한 주·하루면 그 달 예산 × 날수 ÷ 그 달 날수) */
export async function budgetFor(db: Parameters<Builder>[0]["db"], p: { from: string; to: string }) {
  const months = monthsIn(p.from, p.to);
  const byYm = await budgetRange(db, months[0], months[months.length - 1]);
  const v = zeroVals();
  let has = false;
  for (const ym of months) {
    const b = byYm.get(ym);
    if (!b) continue;
    has = true;
    const s = `${ym}-01`;
    const e = ymEnd(ym);
    const f = (Math.min(dayNo(e), dayNo(p.to)) - Math.max(dayNo(s), dayNo(p.from)) + 1) / (dayNo(e) - dayNo(s) + 1);
    for (const k of BUDGET_KEYS) v[k] += Math.round(b[k] * f);
  }
  return { v, has, byYm };
}

/** 손익분기 매출(공헌이익률이 0 이하이거나 매출이 없으면 계산 못 함) */
export function breakEven(v: BudgetVals) {
  const cm = v.sales > 0 ? 1 - v.cogs / v.sales : null;
  const fixed = derived(v).fixed;
  return { cm, fixed, bep: cm != null && cm > 0 ? Math.round(fixed / cm) : null };
}

const actualOf = (js: JEntry[], from: string, to: string) => actualVals(sumBy(js, from, to));

export const budgetReport: Builder = async (c) => {
  const to = c.p.to > c.q.to ? c.p.to : c.q.to;
  const js = (await buildJournal(c.db, to, c.now)).filter((e) => e.src !== "opening");
  const a = actualOf(js, c.p.from, c.p.to);
  const b = actualOf(js, c.q.from, c.q.to);
  // 진행 중인 기간은 실적이 오늘까지이므로 예산도 오늘까지 날수만큼 견준다
  const running = c.p.from <= c.today && c.today < c.p.to;
  const [bud, budQ] = await Promise.all([budgetFor(c.db, running ? { from: c.p.from, to: c.today } : c.p), budgetFor(c.db, c.q)]);
  const be = breakEven(a);
  const beQ = breakEven(b);
  const da = derived(a);
  const dq = derived(b);
  const dBud = derived(bud.v);
  const target = (n: number) => (bud.has ? n : undefined);

  const rows: Row[] = [];
  const line = (label: string, budget: number, actual: number, cost: boolean, strong = false) => {
    const over = cost ? actual > budget : actual < budget;
    rows.push({ cells: [strong ? label : `  ${label}`, bud.has ? budget : null, actual, bud.has ? actual - budget : null, bud.has ? round1(pct(actual, budget)) : null], tone: bud.has && budget && over ? (strong ? "danger" : "warn") : undefined });
  };
  for (const r of BUDGET_ROWS) {
    line(r.label, bud.v[r.key], a[r.key], r.sign < 0, r.key === "sales");
    if (r.key === "cogs") line("매출총이익", dBud.gross, da.gross, false, true);
  }
  const opIdx = rows.length - 1;
  rows.splice(opIdx, 0, { cells: ["영업이익", bud.has ? dBud.op : null, da.op, bud.has ? da.op - dBud.op : null, bud.has ? round1(pct(da.op, dBud.op)) : null], tone: bud.has && da.op < dBud.op ? "danger" : "ok" });
  rows.push({ cells: ["세전 이익", bud.has ? dBud.net : null, da.net, bud.has ? da.net - dBud.net : null, bud.has ? round1(pct(da.net, dBud.net)) : null], tone: da.net < 0 ? "danger" : "ok" });

  const months = monthsIn(c.p.from, c.p.to);
  const qs = (ym: string) => `/reports/budget?k=month&at=${ym}-01`;
  const monthRows: Row[] = months.map((ym) => {
    const from = ym === c.p.from.slice(0, 7) ? c.p.from : `${ym}-01`;
    const till = ym === c.p.to.slice(0, 7) ? c.p.to : ymEnd(ym);
    const v = actualOf(js, from, till);
    const bm = bud.byYm.get(ym);
    const e = breakEven(v);
    return {
      cells: [ym, bm ? bm.sales : null, v.sales, e.bep, bm ? derived(bm).op : null, derived(v).op],
      href: months.length > 1 ? qs(ym) : undefined,
      tone: e.bep != null && v.sales < e.bep ? "warn" : undefined,
    };
  });

  const notes: string[] = [];
  if (running && bud.has) notes.push(`진행 중인 기간이라 예산도 오늘(${c.today})까지 날수만큼만 견줍니다. 달별 표의 예산은 그 달 전체입니다.`);
  if (!bud.has) notes.push("이 기간 예산이 없습니다. 돈 › 연간 예산에서 적으면 예산 대비가 나옵니다.");
  notes.push("관리용 계산입니다. 매출원가(부품·도료·소모품·외주)는 매출 따라 늘고, 인건비·임차료·그 밖의 판관비·영업외 순비용은 고정비로 봅니다.");

  return {
    kpis: [
      m("sales", "매출액", "원", a.sales, b.sales, { better: "up", target: target(bud.v.sales), ok: bud.has ? a.sales >= bud.v.sales : null, note: bud.has ? `예산 ${bud.v.sales.toLocaleString("ko-KR")}원` : "예산 없음", href: "/reports/pl" }),
      m("salesAch", "매출 예산 달성률", "%", bud.has ? round1(pct(a.sales, bud.v.sales)) : null, budQ.has ? round1(pct(b.sales, budQ.v.sales)) : null, { better: "up", target: bud.has ? 100 : undefined, ok: bud.has ? a.sales >= bud.v.sales : null }),
      m("op", "영업이익", "원", da.op, dq.op, { better: "up", target: target(dBud.op), ok: bud.has ? da.op >= dBud.op : null }),
      m("fixed", "고정비", "원", be.fixed, beQ.fixed, { better: "down", note: "인건비 + 임차료 + 그 밖의 판관비 + 영업외 순비용" }),
      m("cmPct", "공헌이익률", "%", be.cm == null ? null : round1(be.cm * 100), beQ.cm == null ? null : round1(beQ.cm * 100), { better: "up", note: "1 − 매출원가 ÷ 매출. 매출 1원에 고정비를 갚는 몫" }),
      m("bep", "손익분기 매출", "원", be.bep, beQ.bep, { better: "down", note: be.bep == null ? "매출이 없거나 원가가 매출보다 커서 계산 못 함" : "고정비 ÷ 공헌이익률" }),
      m("bepPct", "손익분기 대비 매출", "%", be.bep ? round1(pct(a.sales, be.bep)) : null, beQ.bep ? round1(pct(b.sales, beQ.bep)) : null, { better: "up", target: 100, ok: be.bep ? a.sales >= be.bep : null, note: "100% 넘으면 이익" }),
    ],
    tables: [
      {
        key: "budgetTable",
        title: "예산 대비 실적",
        help: "rep.t.budgetTable",
        cols: [{ label: "항목" }, { label: "예산", unit: "원", num: true }, { label: "실적", unit: "원", num: true }, { label: "차이(실적 − 예산)", unit: "원", num: true }, { label: "달성률", unit: "%", num: true }],
        rows,
        total: false,
        note: bud.has ? "비용 줄은 예산보다 많이 쓰면, 매출·이익 줄은 예산보다 적으면 색이 바뀝니다. 한 주·하루를 보면 그 달 예산을 날수로 나눠 견줍니다." : undefined,
      },
      {
        key: "bepMonths",
        title: "달별 손익분기",
        help: "rep.t.bepMonths",
        cols: [{ label: "달" }, { label: "매출 예산", unit: "원", num: true }, { label: "매출 실적", unit: "원", num: true }, { label: "손익분기 매출", unit: "원", num: true }, { label: "영업이익 예산", unit: "원", num: true }, { label: "영업이익 실적", unit: "원", num: true }],
        rows: monthRows,
        total: false,
        note: "매출 실적이 손익분기 매출보다 적은 달은 색이 바뀝니다.",
      },
    ],
    notes,
  };
};
