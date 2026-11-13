// 회계 묶음 목록 정의(조회줄): 지출 결의 …
import { can } from "@/modules/auth/permissions";
import { listExpenses, type ExpenseFilter } from "@/modules/money/expense";
import { EVIDENCE_KINDS, EXP_CATEGORIES, EXP_STATUS } from "@/modules/money/rules";
import type { ListDef } from "../core";
import { isoOf } from "../core";

const pick = <T extends string>(v: string | undefined, ok: readonly T[], dflt: T): T => (ok.includes(v as T) ? (v as T) : dflt);

type Exp = Awaited<ReturnType<typeof listExpenses>>[number];
export const EXPENSE_TABS = ["open", "unpaid", "paid", "all"] as const satisfies readonly ExpenseFilter[];
export const expensesList: ListDef<Exp> = {
  key: "expenses",
  title: "지출 결의",
  href: "/money/expenses",
  allowed: (u) => can(u, "expense.draft") || can(u, "expense.pay"),
  load: (db, _u, q) => listExpenses(db, pick(q.f, EXPENSE_TABS, "open")),
  tabs: { param: "f", options: [{ v: "open", label: "진행 중" }, { v: "unpaid", label: "지급할 것" }, { v: "paid", label: "지급함" }, { v: "all", label: "전체" }] },
  dates: [
    { key: "created", label: "작성일", get: (r) => r.createdAt },
    { key: "paid", label: "지급일", get: (r) => r.paidOn },
    { key: "due", label: "지급 예정일", get: (r) => r.dueOn },
  ],
  text: (r) => [r.docNo, r.payeeName, r.sourceNo, r.byName, EXP_CATEGORIES[r.category as keyof typeof EXP_CATEGORIES]],
  cols: [
    { label: "번호", get: (r) => r.docNo },
    { label: "작성일", get: (r) => isoOf(r.createdAt) },
    { label: "지급처", get: (r) => r.payeeName },
    { label: "계정", get: (r) => EXP_CATEGORIES[r.category as keyof typeof EXP_CATEGORIES] },
    { label: "공급가액", get: (r) => r.supplyWon, sum: true, unit: "원" },
    { label: "부가세", get: (r) => r.vatWon, sum: true, unit: "원" },
    { label: "금액", get: (r) => r.amountWon, sum: true, unit: "원" },
    { label: "상태", get: (r) => EXP_STATUS[r.status] },
    { label: "증빙", get: (r) => EVIDENCE_KINDS[r.evidenceKind as keyof typeof EVIDENCE_KINDS] },
    { label: "근거 전표", get: (r) => r.sourceNo },
    { label: "지급 예정일", get: (r) => r.dueOn },
    { label: "지급일", get: (r) => r.paidOn },
    { label: "작성자", get: (r) => r.byName },
  ],
};

// ── 입금 전표 ──
import { listPayments } from "@/modules/money/receipts";
import { PAY_IN_METHODS, RECEIPT_KINDS } from "@/modules/money/rules";
type Pay = Awaited<ReturnType<typeof listPayments>>[number];
export const paymentsList: ListDef<Pay> = {
  key: "payments",
  title: "입금 전표",
  href: "/money",
  allowed: (u) => can(u, "money.view"),
  load: (db, _u, _q, lq) => listPayments(db, lq.from ?? "2000-01-01", lq.to ?? "9999-12-31"),
  preset: "month",
  dates: [{ key: "received", label: "입금일", get: (r) => r.p.receivedOn }],
  text: (r) => [r.p.docNo, r.roDocNo, r.customerName, r.plateNo, r.p.payerName, r.p.note],
  cols: [
    { label: "전표 번호", get: (r) => r.p.docNo },
    { label: "입금일", get: (r) => r.p.receivedOn },
    { label: "수리 건", get: (r) => r.roDocNo },
    { label: "고객", get: (r) => r.customerName },
    { label: "차량번호", get: (r) => r.plateNo },
    { label: "낸 곳", get: (r) => (r.p.payer === "insurer" ? `보험사 ${r.p.payerName ?? ""}` : "고객") },
    { label: "금액", get: (r) => r.p.amountWon, sum: true, unit: "원" },
    { label: "결제 수단", get: (r) => PAY_IN_METHODS[r.p.method as keyof typeof PAY_IN_METHODS] },
    { label: "증빙", get: (r) => RECEIPT_KINDS[r.p.receiptKind as keyof typeof RECEIPT_KINDS] },
    { label: "취소 전표", get: (r) => (r.p.reversalOf ? "예" : "") },
    { label: "메모", get: (r) => r.p.note },
  ],
};
