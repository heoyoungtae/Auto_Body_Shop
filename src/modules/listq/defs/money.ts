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
