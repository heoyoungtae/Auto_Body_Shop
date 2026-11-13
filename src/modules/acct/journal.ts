// 자동 분개(보고서 센터 4단계). 앱의 전표에서 그때그때 분개를 만든다. 저장하지 않으므로 전표를 취소하면 분개도 저절로 빠진다.
//  - 기초 잔액(acct_opening): 개업일. 자본금은 자산 − 부채로 맞춘다
//  - 정비명세서 발급: 외상매출금 / 부품 매출·공임 매출·부가세예수금
//  - 입금 전표(고객·보험사): 현금·보통예금 / 외상매출금. 보험 삭감액: 매출 차감 / 외상매출금
//  - 외상(입고·외주 수용): 비용(지출 계정)·부가세대급금 / 외상매입금·미지급금. 지급 결의를 내면: 외상매입금 / 보통예금
//  - 선입금 발주: 낸 날 선급금 / 보통예금, 들어온 날 비용·부가세대급금 / 선급금
//  - 지출 결의(근거 없음): 증빙일 비용·부가세대급금 / 미지급금, 낸 날 미지급금 / 보통예금(카드는 카드 결제일)
//  - 급여: 급여·복리후생비(회사 몫 4대보험) / 예수금·보통예금
//  - 감가상각: 달마다 그 달 끝날 감가상각비 / 감가상각누계액
//  - 재고 움직임(이동평균 금액): 입고 원재료 / 재료비, 사용 재료비 / 원재료, 실사·폐기 재고감모손실 / 원재료, 처음 등록 원재료 / 자본금
//  - 자금 전표: 적은 차변 / 대변
// 월 마감(money/close)과 같은 날짜 기준을 쓴다.
import { and, eq, lte } from "drizzle-orm";
import type { Db } from "@/db/client";
import { acctOpening, fundSlip, insuranceClaim, payment, payrollRun, repairOrder, repairStatement, stockItem, stockMove } from "@/db/schema";
import { depreciationByMonth } from "@/modules/asset/service";
import { listExpenses } from "@/modules/money/expense";
import { listPayables, prepayReceipts, syncPayables } from "@/modules/money/payable";
import { cardDueOn, splitByShare } from "@/modules/money/rules";
import { loadPolicy } from "@/modules/platform/policy";
import { seoulDate } from "@/modules/platform/time";
import { itemExpCategory, VAT } from "@/modules/purchase/rules";
import { employerTotalOfRun } from "@/modules/staff/payroll";
import { type CfKind, debitNormal, expAccount, FUND_KINDS, isFundKind, STOCK_ACCOUNT } from "./accounts";

/** 분개를 만든 전표 종류 */
export const SRC = {
  opening: "기초 잔액",
  statement: "정비명세서",
  payment: "입금 전표",
  cut: "보험 삭감",
  payable: "외상 매입",
  settle: "외상 지급",
  prepay: "선입금",
  expense: "지출 결의",
  expensePay: "지출 지급",
  payroll: "급여",
  dep: "감가상각",
  stock: "재고",
  fund: "자금 전표",
} as const;
export type Src = keyof typeof SRC;

export type JLine = { code: string; dr: number; cr: number };
export type JEntry = { on: string; src: Src; no: string; memo: string; href?: string; lines: JLine[]; /** 현금흐름표 항목 이름(없으면 전표 종류) */ tag?: string; /** 현금흐름표 활동(없으면 상대 계정으로) */ cf?: CfKind };

/** 금액이 음수면 반대쪽에 적는다(취소 전표) */
const dr = (code: string, won: number): JLine => (won >= 0 ? { code, dr: won, cr: 0 } : { code, dr: 0, cr: -won });
const cr = (code: string, won: number): JLine => (won >= 0 ? { code, dr: 0, cr: won } : { code, dr: -won, cr: 0 });

/** 계정별 몫(부가세 포함 금액)을 공급가로 나눠 비용 줄로 */
function costLines(parts: { category: string; won: number }[], fallback: string, supply: number): JLine[] {
  const sp = parts.length ? splitByShare(parts, supply) : [];
  const list = sp.length ? sp : [{ category: parts.length === 1 ? parts[0].category : fallback, won: supply }];
  return list.map((p) => dr(expAccount(p.category), p.won));
}

/** 설비·공구(유형자산)가 절반 넘는 매입이면 현금흐름표에서 투자활동 */
function isInvest(parts: { category: string; won: number }[], category: string) {
  if (!parts.length) return category === "equipment";
  const tot = parts.reduce((a, p) => a + p.won, 0);
  return parts.filter((p) => p.category === "equipment").reduce((a, p) => a + p.won, 0) * 2 > tot;
}

const ymEnd = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return seoulDate(new Date(Date.UTC(y, m, 0, 3)));
};

/** to 날까지의 모든 분개(날짜순). 보고서는 기간으로 걸러 쓴다 */
export async function buildJournal(db: Db, to: string, now = new Date()): Promise<JEntry[]> {
  const out: JEntry[] = [];
  const push = (e: JEntry) => {
    if (e.on > to) return;
    const lines = e.lines.filter((l) => l.dr || l.cr);
    if (lines.length) out.push({ ...e, lines });
  };

  // 기초 잔액
  const op = await db.select().from(acctOpening);
  if (op.length) {
    const lines = op.map((r) => (debitNormal(r.code) && r.code !== "213" ? dr(r.code, r.won) : cr(r.code, r.won)));
    const gap = lines.reduce((a, l) => a + l.dr - l.cr, 0);
    lines.push(cr("331", gap));
    push({ on: op[0].on, src: "opening", no: "기초", memo: "개업일 기초 잔액(자본금 = 자산 − 부채)", href: "/money/books", lines });
  }

  // 매출: 정비명세서
  const sts = await db.select({ s: repairStatement, roNo: repairOrder.docNo }).from(repairStatement).innerJoin(repairOrder, eq(repairOrder.id, repairStatement.repairOrderId)).where(lte(repairStatement.issuedOn, to));
  for (const { s, roNo } of sts)
    push({
      on: s.issuedOn,
      src: "statement",
      no: s.docNo,
      memo: `${roNo} 정비명세서`,
      href: `/repairs/${s.repairOrderId}`,
      lines: [dr("108", s.totalWon), cr("401", s.partsWon), cr("404", s.totalWon - s.vatWon - s.partsWon), cr("255", s.vatWon)],
    });

  // 입금 전표(고객 수납·보험사 입금, 취소 전표는 음수)
  const pays = await db.select().from(payment).where(lte(payment.receivedOn, to));
  for (const p of pays)
    push({
      on: p.receivedOn,
      src: "payment",
      no: p.docNo,
      memo: `${p.payer === "insurer" ? "보험사 입금" : "고객 수납"}${p.payerName ? ` · ${p.payerName}` : ""}`,
      href: `/money/ro/${p.repairOrderId}`,
      lines: [dr(p.method === "cash" ? "101" : "103", p.amountWon), cr("108", p.amountWon)],
    });
  // 보험 삭감
  const cuts = await db.select().from(insuranceClaim).where(and(eq(insuranceClaim.status, "paid"), lte(insuranceClaim.paidOn, to)));
  for (const c of cuts) if (c.cutWon && c.paidOn) push({ on: c.paidOn, src: "cut", no: c.docNo, memo: `보험 삭감${c.cutReason ? ` · ${c.cutReason}` : ""}`, href: `/repairs/${c.repairOrderId}`, lines: [dr("403", c.cutWon), cr("108", c.cutWon)] });

  // 외상매입금·미지급금·선급금
  await syncPayables(db, now);
  const pays2 = await listPayables(db);
  for (const x of pays2) {
    const href = x.sourceKind === "po" ? `/purchases/${x.sourceId}` : `/outsource/${x.sourceId}`;
    const liab = x.kind === "trade" ? "251" : "253";
    if (x.kind === "prepay") {
      if (x.status === "paid" && x.paidOn) push({ on: x.paidOn, src: "prepay", no: x.settleNo ?? x.sourceNo, memo: `${x.payeeName} 선입금(${x.sourceNo})`, href, lines: [dr("131", x.amountWon), cr("103", x.amountWon)] });
      continue;
    }
    push({ on: x.accruedOn, src: "payable", no: x.sourceNo, memo: `${x.payeeName} 입고${x.invoiceNo ? ` · 계산서 ${x.invoiceNo}` : ""}`, href, lines: [...costLines(x.split, x.category, x.supplyWon), dr("135", x.vatWon), cr(liab, x.amountWon)] });
    if (x.status === "paid" && x.paidOn) push({ on: x.paidOn, src: "settle", no: x.settleNo ?? x.sourceNo, memo: `${x.payeeName} 외상 지급(${x.sourceNo})`, href: "/money/payables", lines: [dr(liab, x.amountWon), cr("103", x.amountWon)], ...(isInvest(x.split, x.category) ? { cf: "investing" as const, tag: "설비·공구 산 돈" } : {}) });
  }
  for (const r of await prepayReceipts(db)) {
    if (r.on > to || r.won <= 0) continue;
    const supply = Math.round(r.won / (1 + VAT));
    push({ on: r.on, src: "prepay", no: r.payable.sourceNo, memo: `${r.payable.payeeName} 선입금 물건 들어옴`, href: `/purchases/${r.poId}`, lines: [...costLines(r.parts, r.payable.category, supply), dr("135", r.won - supply), cr("131", r.won)] });
  }

  // 지출 결의(근거 없음 = 결의서 자체가 근거. 예전 방식 발주·외주 결의는 지급한 날)
  const cardDay = (await loadPolicy(db, seoulDate(now)))["money.card_pay_day"];
  for (const e of await listExpenses(db, "all")) {
    if (e.status !== "approved" && e.status !== "paid") continue;
    if (e.sourceKind === "settle") continue;
    const cash = e.payMethod === "cash" ? "101" : "103";
    const cost = [...costLines(e.split ?? [], e.category, e.supplyWon), dr("135", e.vatWon)];
    const href = `/money/expenses/${e.id}`;
    if (e.sourceKind === "none") {
      push({ on: e.evidenceOn ?? seoulDate(e.createdAt), src: "expense", no: e.docNo, memo: `${e.payeeName} · ${e.purpose}`, href, lines: [...cost, cr("253", e.amountWon)] });
      if (e.paidOn) {
        const on = e.payMethod === "card" ? cardDueOn(e.paidOn, cardDay) : e.paidOn;
        push({ on, src: "expensePay", no: e.docNo, memo: `${e.payeeName} 지급${e.payMethod === "card" ? "(카드 결제일)" : ""}`, href, lines: [dr("253", e.amountWon), cr(cash, e.amountWon)], ...(isInvest(e.split ?? [], e.category) ? { cf: "investing" as const, tag: "설비·공구 산 돈" } : {}) });
      }
    } else if ((e.sourceKind === "po" || e.sourceKind === "outsource") && e.paidOn) {
      push({ on: e.paidOn, src: "expense", no: e.docNo, memo: `${e.payeeName} · ${e.purpose}`, href, lines: [...cost, cr(cash, e.amountWon)], ...(isInvest(e.split ?? [], e.category) ? { cf: "investing" as const, tag: "설비·공구 산 돈" } : {}) });
    }
  }

  // 급여
  const runs = await db.select().from(payrollRun).where(and(eq(payrollRun.status, "paid"), lte(payrollRun.payDate, to)));
  for (const r of runs) {
    const emp = await employerTotalOfRun(db, r.id);
    push({ on: r.payDate, src: "payroll", no: r.docNo, memo: `${r.ym} 급여 ${r.headcount}명`, href: `/payroll/${r.ym}`, lines: [dr("801", r.totalGross), dr("811", emp), cr("254", r.totalDeduct + emp), cr("103", r.totalNet)] });
  }

  // 재고 움직임
  const moves = await db.select({ m: stockMove, kind: stockItem.kind, expCategory: stockItem.expCategory, name: stockItem.name }).from(stockMove).innerJoin(stockItem, eq(stockItem.id, stockMove.itemId)).where(lte(stockMove.at, new Date(`${to}T23:59:59.999+09:00`)));
  for (const { m, kind, expCategory, name } of moves) {
    const w = m.amountWon ?? 0;
    if (!w) continue;
    const cat = expCategory ? expAccount(itemExpCategory({ kind, expCategory })) : (STOCK_ACCOUNT[kind] ?? "503");
    const on = seoulDate(m.at);
    const base = { on, src: "stock" as const, no: m.ref ?? "재고", href: `/stock/${m.itemId}` };
    if (m.reason === "receive") push({ ...base, memo: `${name} 입고 → 재고`, lines: [dr("153", w), cr(cat, w)] });
    else if (m.reason === "use") push({ ...base, memo: `${name} 사용`, lines: [dr(cat, -w), cr("153", -w)] });
    else if (m.reason === "count" && (m.note ?? "").startsWith("처음 등록")) push({ ...base, memo: `${name} 처음 등록(개업 전 재고)`, lines: [dr("153", w), cr("331", w)] });
    else push({ ...base, memo: `${name} ${m.reason === "discard" ? "폐기" : "실사 조정"}`, lines: [dr("545", -w), cr("153", -w)] });
  }

  // 자금 전표
  const fs = await db.select().from(fundSlip).where(lte(fundSlip.on, to));
  for (const f of fs) push({ on: f.on, src: "fund", no: f.docNo, memo: f.memo ?? "", href: "/money/books", tag: isFundKind(f.kind) && f.kind !== "other" ? FUND_KINDS[f.kind].label : undefined, lines: [dr(f.drCode, f.amountWon), cr(f.crCode, f.amountWon)] });

  // 감가상각(달마다, 그 달 끝날)
  // 기초 잔액이 있으면 개업한 달부터(그 전 상각은 기초 잔액의 감가상각누계액에 들어 있음), 없으면 첫 전표 달부터
  const first = op.length ? op[0].on : out.reduce((a, e) => (e.on < a ? e.on : a), to);
  const toYm = to.slice(0, 7);
  const depMonths = await depreciationByMonth(db, first.slice(0, 7), toYm);
  for (const [ym, w] of depMonths) {
    const end = ymEnd(ym);
    if (end > to) continue;
    push({ on: end, src: "dep", no: `${ym} 상각`, memo: `${ym} 감가상각`, href: "/money/depreciation", lines: [dr("818", w), cr("213", w)] });
  }

  return out.sort((a, b) => a.on.localeCompare(b.on) || a.src.localeCompare(b.src));
}

/** 계정별 잔액(차변 − 대변). from 을 주면 그날부터만 */
export function sumBy(entries: JEntry[], from?: string, to?: string) {
  const m = new Map<string, { dr: number; cr: number }>();
  for (const e of entries) {
    if ((from && e.on < from) || (to && e.on > to)) continue;
    for (const l of e.lines) {
      const x = m.get(l.code) ?? (m.set(l.code, { dr: 0, cr: 0 }), m.get(l.code)!);
      x.dr += l.dr;
      x.cr += l.cr;
    }
  }
  return m;
}

/** 분개마다 차변 합 = 대변 합인지(테스트·화면 경고) */
export const unbalanced = (entries: JEntry[]) => entries.filter((e) => e.lines.reduce((a, l) => a + l.dr - l.cr, 0) !== 0);

