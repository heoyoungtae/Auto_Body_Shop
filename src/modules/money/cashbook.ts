// 입출금(대표 결정 2026-11-20 '입금·출금이 여러 화면에 나뉘어 헷갈림' → '입출금 화면 새로'):
// 돈이 들어오고 나간 전표를 한 목록으로 모은다. 전표 자체는 지금 양식(입금 전표·지출 결의·급여대장)이 그대로 만들고,
// 여기서는 모아 보여 주기만 한다(장부 처리가 돈 종류마다 달라 양식을 합치지 않는다).
//  - 들어옴: 입금 전표 PM(고객 수납·보험사 입금·거래처 청구서 입금, 취소 전표는 음수)
//  - 나감: 지급한 지출 결의(업체별 지급 결의 포함) · 지급한 급여(실지급액 합계)
//  - 통장: 통장 내역과 이어졌으면 '통장 맞음'
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import type { Db } from "@/db/client";
import { bankTx, payrollRun } from "@/db/schema";
import { seoulDate } from "@/modules/platform/time";
import { listExpenses } from "./expense";
import { listPayments } from "./receipts";
import { EXP_CATEGORIES, EXP_PAY_METHODS, PAY_IN_METHODS } from "./rules";

export const CASH_KINDS = {
  customer: "고객 수납",
  insurer: "보험사 입금",
  bill: "업체 외상 입금",
  expense: "지출",
  settle: "협력업체 대금",
  payroll: "급여",
} as const;
export type CashKind = keyof typeof CASH_KINDS;

export type CashRow = {
  id: string;
  dir: "in" | "out";
  on: string;
  docNo: string;
  kind: CashKind;
  /** 상대(고객·보험사·업체·지급처) */
  party: string;
  /** 무엇(수리 건·차량, 결의 목적, 급여 달) */
  what: string;
  /** 들어옴은 +, 나감도 + (dir 로 구분). 취소 전표는 음수 */
  amountWon: number;
  method: string;
  href: string;
  reversal: boolean;
  /** 통장 내역과 이어짐 */
  bank: boolean;
  branchId: string | null;
};

const label = <T extends Record<string, string>>(m: T, k: string | null | undefined) => (k && k in m ? m[k as keyof T] : (k ?? ""));

/** 기간의 입출금 전표(날짜 최근 순) */
export async function cashbook(db: Db, from: string, to: string): Promise<CashRow[]> {
  const [pays, exps, runs, links] = await Promise.all([
    listPayments(db, from, to),
    listExpenses(db, "paid"),
    db.select().from(payrollRun).where(eq(payrollRun.status, "paid")),
    db
      .select({ k: bankTx.matchKind, id: bankTx.matchId })
      .from(bankTx)
      .where(and(isNotNull(bankTx.matchId), inArray(bankTx.matchKind, ["payment", "expense", "payroll", "bill"]))),
  ]);
  const linked = new Set(links.map((l) => `${l.k}:${l.id}`));
  const out: CashRow[] = [];
  for (const { p, roDocNo, plateNo, customerName } of pays) {
    const kind: CashKind = p.billId ? "bill" : p.payer === "insurer" ? "insurer" : "customer";
    out.push({
      id: p.id,
      dir: "in",
      on: p.receivedOn,
      docNo: p.docNo,
      kind,
      party: kind === "insurer" ? (p.payerName ?? "보험사") : customerName,
      what: `${roDocNo} ${plateNo}`,
      amountWon: p.amountWon,
      method: label(PAY_IN_METHODS, p.method),
      href: kind === "insurer" ? `/repairs/${p.repairOrderId}/claim` : kind === "bill" ? `/money/accounts/bills/${p.billId}` : `/money/ro/${p.repairOrderId}`,
      reversal: !!p.reversalOf,
      bank: linked.has(`payment:${p.id}`) || (!!p.billId && linked.has(`bill:${p.billId}`)),
      branchId: p.branchId,
    });
  }
  for (const e of exps) {
    if (!e.paidOn || e.paidOn < from || e.paidOn > to) continue;
    out.push({
      id: e.id,
      dir: "out",
      on: e.paidOn,
      docNo: e.docNo,
      kind: e.sourceKind === "settle" ? "settle" : "expense",
      party: e.payeeName,
      what: `${label(EXP_CATEGORIES, e.category)} · ${e.purpose}`,
      amountWon: e.amountWon,
      method: label(EXP_PAY_METHODS, e.payMethod),
      href: `/money/expenses/${e.id}`,
      reversal: false,
      bank: linked.has(`expense:${e.id}`),
      branchId: e.branchId,
    });
  }
  for (const r of runs) {
    const on = r.payDate || (r.paidAt ? seoulDate(r.paidAt) : "");
    if (!on || on < from || on > to) continue;
    out.push({
      id: r.id,
      dir: "out",
      on,
      docNo: r.docNo,
      kind: "payroll",
      party: `직원 ${r.headcount}명`,
      what: `${r.ym} 급여(실지급액)`,
      amountWon: r.totalNet,
      method: "계좌 이체",
      href: `/payroll/${r.ym}`,
      reversal: false,
      bank: linked.has(`payroll:${r.id}`),
      branchId: null,
    });
  }
  return out.sort((a, b) => (a.on === b.on ? a.docNo.localeCompare(b.docNo) * -1 : a.on < b.on ? 1 : -1));
}

/** 합계: 들어옴·나감·차이 */
export function cashTotals(rows: CashRow[]) {
  const inWon = rows.filter((r) => r.dir === "in").reduce((a, r) => a + r.amountWon, 0);
  const outWon = rows.filter((r) => r.dir === "out").reduce((a, r) => a + r.amountWon, 0);
  return { inWon, outWon, netWon: inWon - outWon, unbanked: rows.filter((r) => !r.bank && !r.reversal && throughBank(r)).length };
}

/** 통장을 거치는 돈인가(계좌·자동 이체). 카드·현금은 통장과 맞추지 않는다 */
export function throughBank(r: Pick<CashRow, "method">) {
  return r.method === PAY_IN_METHODS.transfer || r.method === EXP_PAY_METHODS.auto;
}
