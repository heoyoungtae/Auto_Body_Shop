// 회계 장부 보고서(보고서 센터 4단계): 6 손익계산서, 7 재무상태표, 8 현금흐름표, 9 자금일보·자금수지 예정, 13 계정별 원장.
// 모두 자동 분개(modules/acct/journal.ts)에서 나온다. 관리용(내부 의사결정용)이며 세무 신고용 장부는 세무사가 따로 만든다.
import { and, eq } from "drizzle-orm";
import { insuranceClaim } from "@/db/schema";
import { ACCOUNTS, ACCT, acctName, type AcctGroup, CASH_CODES, debitNormal, GROUP_LABEL } from "@/modules/acct/accounts";
import { buildJournal, type JEntry, SRC, sumBy, unbalanced } from "@/modules/acct/journal";
import { bankFlows } from "@/modules/bank/service";
import { listExpenses } from "@/modules/money/expense";
import { listPayables } from "@/modules/money/payable";
import { cardDueOn } from "@/modules/money/rules";
import { loadPolicy } from "@/modules/platform/policy";
import { addDays } from "@/modules/platform/time";
import { type Builder, type Ctx, type Row, type TrendDef, m, pct, round1, sum } from "./kit";

type Sums = Map<string, { dr: number; cr: number }>;
/** 그 계정이 늘어나는 쪽 잔액(자산·비용 = 차 − 대, 부채·자본·수익 = 대 − 차) */
const bal = (s: Sums, code: string) => {
  const x = s.get(code);
  if (!x) return 0;
  return debitNormal(code) ? x.dr - x.cr : x.cr - x.dr;
};
const codesOf = (g: AcctGroup) => ACCOUNTS.filter((a) => a.group === g).map((a) => a.code);
const groupSum = (s: Sums, g: AcctGroup) => sum(codesOf(g), (c) => bal(s, c));
const yearStart = (d: string) => `${d.slice(0, 4)}-01-01`;
const maxDay = (a: string, b: string) => (a > b ? a : b);

/** 손익 묶음(매출·원가·판관비·영업외) */
function pl(s: Sums) {
  const sales = groupSum(s, "sales");
  const cogs = groupSum(s, "cogs");
  const sga = groupSum(s, "sga");
  const oi = groupSum(s, "other_inc");
  const oe = groupSum(s, "other_exp");
  return { sales, cogs, gross: sales - cogs, sga, op: sales - cogs - sga, oi, oe, net: sales - cogs - sga + oi - oe };
}

async function journalFor(c: Ctx) {
  return buildJournal(c.db, maxDay(c.p.to, c.q.to), c.now);
}

const linkQs = (c: Ctx) => (c.p.kind === "custom" ? `k=custom&from=${c.p.from}&to=${c.p.to}` : `k=${c.p.kind}&at=${c.p.from}`);
const ledgerHref = (c: Ctx, code: string) => `/reports/ledger?${linkQs(c)}&acct=${code}`;

/** 손익 추이(월별 매출·영업이익) */
const plTrend = (key: "sales" | "op", label: string): TrendDef => ({
  key,
  label,
  unit: "원",
  load: async (db, from, to) => {
    const js = await buildJournal(db, to);
    const out: { on: string; w: number }[] = [];
    for (const e of js) {
      if (e.on < from) continue;
      for (const l of e.lines) {
        const a = ACCT.get(l.code);
        if (!a) continue;
        if (a.group === "sales") out.push({ on: e.on, w: l.cr - l.dr });
        else if (key === "op" && (a.group === "cogs" || a.group === "sga")) out.push({ on: e.on, w: l.cr - l.dr });
      }
    }
    return out;
  },
});

/** 6. 손익계산서 */
export const plReport: Builder = async (c) => {
  const js = await journalFor(c);
  const a = pl(sumBy(js, c.p.from, c.p.to));
  const b = pl(sumBy(js, c.q.from, c.q.to));
  const sa = sumBy(js, c.p.from, c.p.to);
  const sb = sumBy(js, c.q.from, c.q.to);
  const ytdFrom = yearStart(c.p.to);
  const sy = sumBy(js, ytdFrom, c.p.to);
  const y = pl(sy);
  const rows: Row[] = [];
  const head = (label: string, va: number, vb: number, vy: number, tone?: Row["tone"]) => rows.push({ cells: [label, va, vb, vy, round1(pct(va, a.sales))], tone });
  const acctRows = (g: AcctGroup) => {
    for (const code of codesOf(g)) {
      const va = bal(sa, code);
      const vb = bal(sb, code);
      const vy = bal(sy, code);
      if (!va && !vb && !vy) continue;
      rows.push({ cells: [`  ${code} ${acctName(code)}`, va, vb, vy, round1(pct(va, a.sales))], href: ledgerHref(c, code) });
    }
  };
  head("Ⅰ. 매출액", a.sales, b.sales, y.sales);
  acctRows("sales");
  head("Ⅱ. 매출원가", a.cogs, b.cogs, y.cogs);
  acctRows("cogs");
  head("Ⅲ. 매출총이익", a.gross, b.gross, y.gross, a.gross < 0 ? "danger" : undefined);
  head("Ⅳ. 판매비와관리비", a.sga, b.sga, y.sga);
  acctRows("sga");
  head("Ⅴ. 영업이익", a.op, b.op, y.op, a.op < 0 ? "danger" : "ok");
  head("Ⅵ. 영업외수익", a.oi, b.oi, y.oi);
  acctRows("other_inc");
  head("Ⅶ. 영업외비용", a.oe, b.oe, y.oe);
  acctRows("other_exp");
  head("Ⅷ. 소득세(법인세) 차감 전 이익", a.net, b.net, y.net, a.net < 0 ? "danger" : "ok");
  return {
    kpis: [
      m("sales", "매출액", "원", a.sales, b.sales, { better: "up", note: "부가세 뺀 금액, 정비명세서 발급일 기준" }),
      m("gross", "매출총이익", "원", a.gross, b.gross, { better: "up", note: "매출 − 부품·도료·소모품·외주(쓴 만큼)" }),
      m("grossPct", "매출총이익률", "%", round1(pct(a.gross, a.sales)), round1(pct(b.gross, b.sales)), { better: "up" }),
      m("op", "영업이익", "원", a.op, b.op, { better: "up" }),
      m("opPct", "영업이익률", "%", round1(pct(a.op, a.sales)), round1(pct(b.op, b.sales)), { better: "up" }),
      m("net", "세전 이익", "원", a.net, b.net, { better: "up", note: "소득세·법인세 빼기 전" }),
    ],
    tables: [
      {
        key: "plTable",
        title: "손익계산서",
        help: "rep.t.plTable",
        cols: [{ label: "과목" }, { label: "이번 기간", unit: "원", num: true }, { label: "비교 기간", unit: "원", num: true }, { label: `올해 누계(${ytdFrom.slice(0, 4)}.1.1~)`, unit: "원", num: true }, { label: "매출 대비", unit: "%", num: true }],
        rows,
        total: false,
        note: "관리용 손익입니다. 계정 줄을 누르면 그 계정의 전표(계정별 원장)가 열립니다.",
      },
    ],
    trends: [plTrend("sales", "매출액"), plTrend("op", "영업이익")],
    notes: ["재고로 산 부품·도료·소모품은 산 때가 아니라 쓴 때 매출원가가 됩니다(재고 움직임의 이동평균 금액). 소득세·법인세는 세무사 신고 때 정해지므로 넣지 않았습니다."],
  };
};

/** 재무상태표 한 시점 */
function bsAt(js: JEntry[], day: string) {
  const s = sumBy(js, undefined, day);
  const before = sumBy(js, undefined, addDays(yearStart(day), -1));
  const ar = bal(s, "108");
  const lines: { side: "asset" | "liab" | "equity"; group: string; code: string; name: string; won: number }[] = [];
  for (const a of ACCOUNTS) {
    if (a.type === "revenue" || a.type === "expense" || a.code === "375") continue;
    let won = bal(s, a.code);
    if (a.code === "213") won = -(s.get("213") ? s.get("213")!.cr - s.get("213")!.dr : 0);
    if (a.code === "338") won = -(s.get("338") ? s.get("338")!.dr - s.get("338")!.cr : 0);
    if (a.code === "108" && ar < 0) continue;
    if (!won) continue;
    lines.push({ side: a.type === "asset" ? "asset" : a.type === "liability" ? "liab" : "equity", group: GROUP_LABEL[a.group], code: a.code, name: a.code === "338" ? "인출금(대표가 가져간 돈 −)" : a.code === "213" ? "감가상각누계액(−)" : a.name, won });
  }
  // 고객이 명세서 전에 먼저 낸 돈은 선수금(부채)
  if (ar < 0) lines.push({ side: "liab", group: GROUP_LABEL.cur_liab, code: "259", name: "선수금(먼저 받은 수리비)", won: -ar });
  const retained = pl(before).net;
  const thisYear = pl(sumBy(js, yearStart(day), day)).net;
  if (retained) lines.push({ side: "equity", group: "자본", code: "375", name: "이익잉여금(지난해까지 손익)", won: retained });
  if (thisYear) lines.push({ side: "equity", group: "자본", code: "", name: "올해 손익(세전)", won: thisYear });
  const asset = sum(lines.filter((l) => l.side === "asset"), (l) => l.won);
  const liab = sum(lines.filter((l) => l.side === "liab"), (l) => l.won);
  const equity = sum(lines.filter((l) => l.side === "equity"), (l) => l.won);
  const curA = sum(lines.filter((l) => l.side === "asset" && (l.group === "유동자산" || l.group === "재고자산")), (l) => l.won);
  const curL = sum(lines.filter((l) => l.side === "liab" && l.group === "유동부채"), (l) => l.won);
  return { lines, asset, liab, equity, curA, curL };
}

/** 7. 재무상태표 */
export const bsReport: Builder = async (c) => {
  const js = await journalFor(c);
  const a = bsAt(js, c.p.to);
  const b = bsAt(js, c.q.to);
  const prevOf = new Map(b.lines.map((l) => [`${l.side}:${l.code}:${l.name}`, l.won]));
  const table = (side: "asset" | "liab" | "equity", title: string, key: string, total: number, totalB: number) => ({
    key,
    title,
    help: "rep.t.bsTable" as const,
    cols: [{ label: "구분" }, { label: "과목" }, { label: `${c.p.to}`, unit: "원" as const, num: true }, { label: `${c.q.to}`, unit: "원" as const, num: true }],
    rows: a.lines.filter((l) => l.side === side).map((l) => ({ cells: [l.group, l.code ? `${l.code} ${l.name}` : l.name, l.won, prevOf.get(`${l.side}:${l.code}:${l.name}`) ?? 0], href: l.code && ACCT.has(l.code) && l.code !== "375" ? ledgerHref(c, l.code) : undefined })),
    total: ["합계", null, total, totalB],
    empty: "기록이 없습니다.",
  });
  const gap = a.asset - a.liab - a.equity;
  return {
    kpis: [
      m("asset", "자산 총계", "원", a.asset, b.asset, { note: `${c.p.to} 끝 기준` }),
      m("liab", "부채 총계", "원", a.liab, b.liab, { better: "down" }),
      m("equity", "자본 총계", "원", a.equity, b.equity, { better: "up" }),
      m("debtRatio", "부채비율", "%", round1(pct(a.liab, a.equity)), round1(pct(b.liab, b.equity)), { better: "down", note: "부채 ÷ 자본(200% 아래가 보통 건전)" }),
      m("curRatio", "유동비율", "%", round1(pct(a.curA, a.curL)), round1(pct(b.curA, b.curL)), { better: "up", note: "1년 안에 돈 될 자산 ÷ 1년 안에 갚을 부채(100% 넘어야 함)" }),
    ],
    tables: [table("asset", "자산", "bsAsset", a.asset, b.asset), table("liab", "부채", "bsLiab", a.liab, b.liab), table("equity", "자본", "bsEquity", a.equity, b.equity)],
    notes: [
      gap ? `자산과 부채 + 자본이 ${gap.toLocaleString("ko-KR")}원 차이 납니다. 계정별 원장의 '맞지 않는 분개'를 확인하세요.` : "자산 = 부채 + 자본이 맞습니다.",
      "개업일 기초 잔액을 넣어야 현금·통장·자본금이 맞습니다(회계 › 회계 장부).",
    ],
  };
};

/** 현금이 움직인 분개를 활동별로 */
function cashFlows(js: JEntry[], from: string, to: string) {
  const items = new Map<string, { kind: "operating" | "investing" | "financing"; label: string; inW: number; outW: number }>();
  for (const e of js) {
    if (e.on < from || e.on > to || e.src === "opening") continue;
    const cash = sum(e.lines.filter((l) => (CASH_CODES as readonly string[]).includes(l.code)), (l) => l.dr - l.cr);
    const other = e.lines.filter((l) => !(CASH_CODES as readonly string[]).includes(l.code));
    if (!other.length) continue; // 현금 ↔ 통장
    let kind = e.cf;
    if (!kind || kind === "cash") {
      const k = ACCT.get(other[0].code)?.cf;
      kind = k === "investing" || k === "financing" ? k : "operating";
    }
    if (!cash) continue;
    const label = e.tag ?? SRC[e.src];
    const key = `${kind}:${label}`;
    const x = items.get(key) ?? (items.set(key, { kind: kind as "operating" | "investing" | "financing", label, inW: 0, outW: 0 }), items.get(key)!);
    if (cash > 0) x.inW += cash;
    else x.outW -= cash;
  }
  const by = (k: string) => [...items.values()].filter((x) => x.kind === k);
  const net = (k: string) => sum(by(k), (x) => x.inW - x.outW);
  return { items: [...items.values()], op: net("operating"), inv: net("investing"), fin: net("financing") };
}
const cashBal = (js: JEntry[], day: string) => {
  const s = sumBy(js, undefined, day);
  return bal(s, "101") + bal(s, "103");
};
/** 기간 첫날 전 끝 잔액. 기초 잔액(개업일)이 기간 안이면 기초로 넣는다 */
const openSums = (js: JEntry[], from: string, to: string) => sumBy(js.filter((e) => e.on < from || (e.src === "opening" && e.on <= to)));
const cashOpen = (js: JEntry[], from: string, to: string) => {
  const s = openSums(js, from, to);
  return bal(s, "101") + bal(s, "103");
};

/** 8. 현금흐름표(직접법) */
export const cashflow: Builder = async (c) => {
  const js = await journalFor(c);
  const a = cashFlows(js, c.p.from, c.p.to);
  const b = cashFlows(js, c.q.from, c.q.to);
  const open = cashOpen(js, c.p.from, c.p.to);
  const close = cashBal(js, c.p.to);
  const KL = { operating: "영업활동", investing: "투자활동", financing: "재무활동" } as const;
  const order = { operating: 0, investing: 1, financing: 2 } as const;
  return {
    kpis: [
      m("open", "기초 현금·통장", "원", open, cashOpen(js, c.q.from, c.q.to), { note: `${addDays(c.p.from, -1)} 끝(개업일 기초 잔액 포함)` }),
      m("op", "영업활동 현금흐름", "원", a.op, b.op, { better: "up", note: "수리비 받은 돈 − 매입·경비·급여·세금 낸 돈" }),
      m("inv", "투자활동 현금흐름", "원", a.inv, b.inv, { note: "설비·공구 사기, 보증금" }),
      m("fin", "재무활동 현금흐름", "원", a.fin, b.fin, { note: "자본금·대출·대표 입출금" }),
      m("close", "기말 현금·통장", "원", close, cashBal(js, c.q.to), { note: `${c.p.to} 끝` }),
    ],
    tables: [
      {
        key: "cfTable",
        title: "활동별 들어온 돈·나간 돈",
        help: "rep.t.cfTable",
        cols: [{ label: "활동" }, { label: "항목" }, { label: "들어옴", unit: "원", num: true }, { label: "나감", unit: "원", num: true }, { label: "순", unit: "원", num: true }],
        rows: a.items
          .sort((x, y) => order[x.kind] - order[y.kind] || y.inW + y.outW - (x.inW + x.outW))
          .map((x) => ({ cells: [KL[x.kind], x.label, x.inW, x.outW, x.inW - x.outW] })),
        total: ["합계", null, sum(a.items, (x) => x.inW), sum(a.items, (x) => x.outW), a.op + a.inv + a.fin],
        empty: "이 기간 현금·통장 움직임이 없습니다.",
        note: "기초 + 순 합계 = 기말. 카드 매출은 카드사 입금 전에도 통장에 들어온 것으로 봅니다.",
      },
    ],
  };
};

/** 9. 자금일보·자금수지 예정 */
export const funds: Builder = async (c) => {
  const js = await buildJournal(c.db, maxDay(c.p.to, c.today), c.now);
  const days = new Map<string, { cashIn: number; cashOut: number; bankIn: number; bankOut: number }>();
  for (const e of js) {
    if (e.on < c.p.from || e.on > c.p.to) continue;
    for (const l of e.lines) {
      if (l.code !== "101" && l.code !== "103") continue;
      if (e.src === "opening") continue;
      const d = days.get(e.on) ?? (days.set(e.on, { cashIn: 0, cashOut: 0, bankIn: 0, bankOut: 0 }), days.get(e.on)!);
      if (l.code === "101") {
        d.cashIn += l.dr;
        d.cashOut += l.cr;
      } else {
        d.bankIn += l.dr;
        d.bankOut += l.cr;
      }
    }
  }
  const s0 = openSums(js, c.p.from, c.p.to);
  let cash = bal(s0, "101");
  let bank = bal(s0, "103");
  const openCash = cash;
  const openBank = bank;
  const dayRows: Row[] = [...days.entries()]
    .sort((x, y) => x[0].localeCompare(y[0]))
    .map(([on, d]) => {
      cash += d.cashIn - d.cashOut;
      bank += d.bankIn - d.bankOut;
      return { cells: [on, d.cashIn, d.cashOut, cash, d.bankIn, d.bankOut, bank], tone: cash < 0 || bank < 0 ? ("danger" as const) : undefined };
    });
  // 앞으로 4주 낼 돈: 외상 지급 기한, 결의했는데 안 낸 돈, 카드 결제일
  const until = addDays(c.today, 28);
  const plan: { on: string; what: string; who: string; won: number; href?: string }[] = [];
  for (const x of await listPayables(c.db)) if (x.status !== "paid" && x.kind !== "prepay" && x.dueOn <= until) plan.push({ on: x.dueOn < c.today ? c.today : x.dueOn, what: x.dueOn < c.today ? `외상 지급(기한 ${x.dueOn} 지남)` : "외상 지급 기한", who: x.payeeName, won: x.amountWon, href: "/money/payables" });
  const cardDay = (await loadPolicy(c.db, c.today))["money.card_pay_day"];
  for (const e of await listExpenses(c.db, "all")) {
    if (e.sourceKind === "settle") continue;
    if (e.status === "approved" && e.dueOn && e.dueOn <= until) plan.push({ on: e.dueOn < c.today ? c.today : e.dueOn, what: "결의한 지출 지급", who: e.payeeName, won: e.amountWon, href: `/money/expenses/${e.id}` });
    if (e.status === "paid" && e.payMethod === "card" && e.paidOn) {
      const due = cardDueOn(e.paidOn, cardDay);
      if (due > c.today && due <= until) plan.push({ on: due, what: "카드 대금 결제일", who: e.payeeName, won: e.amountWon, href: `/money/expenses/${e.id}` });
    }
  }
  plan.sort((x, y) => x.on.localeCompare(y.on));
  const claims = await c.db.select().from(insuranceClaim).where(and(eq(insuranceClaim.status, "claimed")));
  const claimWon = sum(claims, (x) => x.claimedWon ?? 0);
  const bf = await bankFlows(c.db, c.p.from, c.p.to);
  const sNow = sumBy(js, undefined, c.p.to);
  const bookBank = bal(sNow, "103");
  const actual = sum(bf.balances, (b) => b.bal);
  return {
    kpis: [
      m("cash", "현금 시재", "원", bal(sNow, "101"), openCash, { note: `${c.p.to} 끝(비교 칸 = 기간 첫날 전)` }),
      m("bank", "통장 잔액(장부)", "원", bookBank, openBank, { note: "앱 전표로 계산한 보통예금" }),
      m("bankActual", "통장 실제 잔액(마지막 내역)", "원", bf.balances.length ? actual : null, null, { now: true, href: "/money/bank", note: bf.balances.length ? bf.balances.map((b) => `${b.label} ${b.on}`).join(", ") : "통장 내역을 올리면 장부와 맞춰 봅니다" }),
      m("out4w", "앞으로 4주 낼 돈", "원", sum(plan, (x) => x.won), null, { now: true, better: "down" }),
      m("claim", "보험사에서 받을 돈(청구 중)", "원", claimWon, null, { now: true, href: "/claims" }),
    ],
    tables: [
      {
        key: "fundDays",
        title: "날짜별 입금·지급·잔액",
        help: "rep.t.fundDays",
        cols: [{ label: "날짜" }, { label: "현금 들어옴", unit: "원", num: true }, { label: "현금 나감", unit: "원", num: true }, { label: "현금 잔액", unit: "원", num: true }, { label: "통장 들어옴", unit: "원", num: true }, { label: "통장 나감", unit: "원", num: true }, { label: "통장 잔액", unit: "원", num: true }],
        rows: dayRows,
        total: ["합계", sum([...days.values()], (d) => d.cashIn), sum([...days.values()], (d) => d.cashOut), cash, sum([...days.values()], (d) => d.bankIn), sum([...days.values()], (d) => d.bankOut), bank],
        empty: "이 기간 현금·통장 움직임이 없습니다.",
      },
      {
        key: "fundPlan",
        title: "앞으로 4주 낼 돈(지금 기준)",
        help: "rep.t.fundPlan",
        now: true,
        cols: [{ label: "날짜" }, { label: "무엇" }, { label: "누구에게" }, { label: "금액", unit: "원", num: true }],
        rows: plan.map((x) => ({ cells: [x.on, x.what, x.who, x.won], href: x.href, tone: x.what.includes("지남") ? ("danger" as const) : undefined })),
        empty: "4주 안에 낼 돈이 없습니다.",
      },
    ],
    notes: bf.balances.length && actual !== bookBank ? [`통장 실제 잔액과 장부가 ${(actual - bookBank).toLocaleString("ko-KR")}원 다릅니다. 통장 내역에서 아직 안 맞춘 거래(대출·이자·수수료·대표 입출금 등)를 자금 전표로 적으세요.`] : [],
  };
};

/** 13. 계정별 원장 */
export const ledger: Builder = async (c) => {
  const js = await journalFor(c);
  const open = sumBy(js, undefined, addDays(c.p.from, -1));
  const per = sumBy(js, c.p.from, c.p.to);
  const perB = sumBy(js, c.q.from, c.q.to);
  const nat = (code: string, x?: { dr: number; cr: number }) => (x ? (debitNormal(code) ? x.dr - x.cr : x.cr - x.dr) : 0);
  const sumRows: Row[] = [];
  for (const a of ACCOUNTS) {
    const o = nat(a.code, open.get(a.code));
    const p = per.get(a.code) ?? { dr: 0, cr: 0 };
    if (!o && !p.dr && !p.cr) continue;
    const isPl = a.type === "revenue" || a.type === "expense";
    const o2 = isPl ? 0 : o;
    sumRows.push({ cells: [`${a.code} ${a.name}`, GROUP_LABEL[a.group], o2, p.dr, p.cr, o2 + (debitNormal(a.code) ? p.dr - p.cr : p.cr - p.dr)], href: ledgerHref(c, a.code), tone: c.opt?.acct === a.code ? "ok" : undefined });
  }
  const inP = js.filter((e) => e.on >= c.p.from && e.on <= c.p.to);
  const inQ = js.filter((e) => e.on >= c.q.from && e.on <= c.q.to);
  const bad = unbalanced(js);
  const tables: import("./kit").RTable[] = [
    {
      key: "ledgerSum",
      title: "계정별 합계",
      help: "rep.t.ledgerSum",
      cols: [{ label: "계정" }, { label: "구분" }, { label: "기초 잔액", unit: "원", num: true }, { label: "차변", unit: "원", num: true }, { label: "대변", unit: "원", num: true }, { label: "기말 잔액", unit: "원", num: true }],
      rows: sumRows,
      total: ["합계", null, null, sum([...per.values()], (x) => x.dr), sum([...per.values()], (x) => x.cr), null],
      empty: "이 기간 분개가 없습니다.",
      note: "손익 계정(매출·비용)은 기간 합계만 봅니다. 계정을 누르면 아래에 그 계정의 전표가 나옵니다.",
    },
  ];
  const code = c.opt?.acct;
  if (code && ACCT.has(code)) {
    const a = ACCT.get(code)!;
    const isPl = a.type === "revenue" || a.type === "expense";
    let run = isPl ? 0 : nat(code, open.get(code));
    const detail: Row[] = [{ cells: [addDays(c.p.from, -1), "", isPl ? "(기간 합계만 봄)" : "기초 잔액", null, null, run, null] }];
    for (const e of inP)
      for (const l of e.lines.filter((x) => x.code === code)) {
        run += debitNormal(code) ? l.dr - l.cr : l.cr - l.dr;
        const other = e.lines.filter((x) => x.code !== code && (l.dr ? x.cr : x.dr)).map((x) => acctName(x.code));
        detail.push({ cells: [e.on, `${SRC[e.src]} ${e.no}`, e.memo, l.dr || null, l.cr || null, run, [...new Set(other)].join(", ")], href: e.href });
      }
    tables.push({
      key: "ledgerDetail",
      title: `${a.code} ${a.name} 원장`,
      help: "rep.t.ledgerDetail",
      cols: [{ label: "날짜" }, { label: "전표" }, { label: "적요" }, { label: "차변", unit: "원", num: true }, { label: "대변", unit: "원", num: true }, { label: "잔액", unit: "원", num: true }, { label: "상대 계정" }],
      rows: detail,
      total: false,
    });
  }
  if (bad.length)
    tables.push({
      key: "ledgerBad",
      title: "차변·대변이 맞지 않는 분개",
      help: "rep.t.ledgerBad",
      cols: [{ label: "날짜" }, { label: "전표" }, { label: "적요" }, { label: "차이", unit: "원", num: true }],
      rows: bad.map((e) => ({ cells: [e.on, `${SRC[e.src]} ${e.no}`, e.memo, sum(e.lines, (l) => l.dr - l.cr)], href: e.href, tone: "danger" as const })),
      total: false,
    });
  return {
    kpis: [
      m("entries", "분개 수", "건", inP.length, inQ.length),
      m("dr", "차변 합계", "원", sum([...per.values()], (x) => x.dr), sum([...perB.values()], (x) => x.dr)),
      m("cr", "대변 합계", "원", sum([...per.values()], (x) => x.cr), sum([...perB.values()], (x) => x.cr)),
      m("bad", "맞지 않는 분개", "건", bad.length, null, { now: true, better: "down", note: "0이어야 합니다" }),
    ],
    tables,
  };
};
