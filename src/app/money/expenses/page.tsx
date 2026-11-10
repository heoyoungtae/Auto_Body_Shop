import Link from "next/link";
import { getDb } from "@/db/runtime";
import { can } from "@/modules/auth/permissions";
import { listExpenses, type ExpenseFilter } from "@/modules/money/expense";
import {
  EVIDENCE_KINDS,
  EXP_CATEGORIES,
  EXP_STATUS,
} from "@/modules/money/rules";
import { requireUser } from "../../_lib/session";
import {
  Badge,
  buttonClass,
  Card,
  Empty,
  ErrorBox,
  Notice,
  PageTitle,
} from "../../_ui";

const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;
const TABS: { f: ExpenseFilter; label: string }[] = [
  { f: "open", label: "진행 중" },
  { f: "unpaid", label: "지급할 것" },
  { f: "paid", label: "지급함" },
  { f: "all", label: "전체" },
];
const TONE = {
  draft: "neutral",
  in_progress: "warn",
  rejected: "danger",
  approved: "accent",
  paid: "ok",
  cancelled: "neutral",
} as const;

/** 지출 결의(F-12-01) 목록 */
export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{ f?: string; notice?: string; error?: string }>;
}) {
  const q = await searchParams;
  const user = await requireUser();
  if (!can(user, "expense.draft") && !can(user, "expense.pay"))
    return (
      <p className="text-sm text-[var(--muted)]">
        지출 결의는 공장장·회계 담당·대표가 봅니다.
      </p>
    );
  const f = (TABS.some((t) => t.f === q.f) ? q.f : "open") as ExpenseFilter;
  const list = await listExpenses(await getDb(), f);
  return (
    <>
      <PageTitle
        help="expenses"
        sub="돈을 내보내려면 근거 전표(입고 끝난 발주서·수용한 외주 의뢰서, 없으면 이 결의서)와 증빙이 있어야 하고, 전결 규정대로 승인받은 뒤에 지급합니다."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/money/payables" className={buttonClass("secondary")}>
              거래처 정산
            </Link>
            {can(user, "expense.draft") && (
              <Link href="/money/expenses/new" className={buttonClass()}>
                지출 결의서 쓰기
              </Link>
            )}
          </div>
        }
      >
        지출 결의
      </PageTitle>
      <ErrorBox message={q.error} />
      {q.notice && <Notice>{q.notice}</Notice>}
      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <Link
            key={t.f}
            href={`/money/expenses?f=${t.f}`}
            className={buttonClass(t.f === f ? "primary" : "secondary")}
          >
            {t.label}
          </Link>
        ))}
      </div>
      <Card title="결의서" help={{ kind: "panel", id: "exp.list" }}>
        {list.length ? (
          <ul className="divide-y divide-[var(--line)] text-sm">
            {list.map((x) => (
              <li key={x.id} className="flex flex-wrap items-center gap-2 py-2">
                <Link
                  href={`/money/expenses/${x.id}`}
                  className="font-medium text-[var(--accent)]"
                >
                  {x.docNo}
                </Link>
                <span>{x.payeeName}</span>
                <span className="font-medium">{won(x.amountWon)}</span>
                <Badge tone={TONE[x.status]}>{EXP_STATUS[x.status]}</Badge>
                <span className="text-xs text-[var(--muted)]">
                  {EXP_CATEGORIES[x.category as keyof typeof EXP_CATEGORIES]} ·{" "}
                  {x.sourceNo ?? "근거 전표 없음"} ·{" "}
                  {
                    EVIDENCE_KINDS[
                      x.evidenceKind as keyof typeof EVIDENCE_KINDS
                    ]
                  }{" "}
                  · {x.byName}
                  {x.paidOn
                    ? ` · ${x.paidOn} 지급`
                    : x.dueOn
                      ? ` · ${x.dueOn} 지급 예정`
                      : ""}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>결의서가 없습니다.</Empty>
        )}
      </Card>
    </>
  );
}
