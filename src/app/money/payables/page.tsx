import Link from "next/link";
import { getDb } from "@/db/runtime";
import { can } from "@/modules/auth/permissions";
import { payables } from "@/modules/money/expense";
import { SOURCE_KINDS } from "@/modules/money/rules";
import { requireUser } from "../../_lib/session";
import { Badge, buttonClass, Card, Empty, PageTitle } from "../../_ui";

const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;

/** 거래처 정산(STD-12 12.2): 업체마다 결의할 금액(입고·수용했는데 결의 안 함)과 지급할 금액(승인했는데 지급 전) */
export default async function PayablesPage() {
  const user = await requireUser();
  if (!can(user, "expense.draft") && !can(user, "expense.pay"))
    return (
      <p className="text-sm text-[var(--muted)]">
        거래처 정산은 공장장·회계 담당·대표가 봅니다.
      </p>
    );
  const list = await payables(await getDb());
  const draft = can(user, "expense.draft");
  return (
    <>
      <PageTitle
        help="payables"
        sub="입고 검수가 끝난 발주서·결과를 수용한 외주 의뢰서는 여기서 바로 지출 결의서로 이어 씁니다. 계좌 확인 전인 업체는 지급하지 않습니다."
        actions={
          <Link href="/money/expenses" className={buttonClass("secondary")}>
            지출 결의 목록
          </Link>
        }
      >
        거래처 정산
      </PageTitle>
      {list.length ? (
        list.map((g) => (
          <Card
            key={g.supplierId ?? g.name}
            help={{ kind: "panel", id: "pay.group" }}
            title={
              <span className="flex flex-wrap items-center gap-2">
                {g.supplierId ? (
                  <Link
                    href={`/suppliers/${g.supplierId}#bank`}
                    className="text-[var(--accent)]"
                  >
                    {g.name}
                  </Link>
                ) : (
                  g.name
                )}
                {g.bankVerified === false && (
                  <Badge tone="danger">계좌 확인 전</Badge>
                )}
                {g.bankVerified && <Badge tone="ok">계좌 확인함</Badge>}
              </span>
            }
          >
            <p className="mb-2 text-sm">
              결의할 금액 <b>{won(g.toDraft)}</b> · 지급할 금액{" "}
              <b>{won(g.toPay)}</b>
              {g.inApproval > 0 && (
                <span className="text-[var(--muted)]">
                  {" "}
                  · 결재 중 {won(g.inApproval)}
                </span>
              )}
            </p>
            <ul className="divide-y divide-[var(--line)] text-sm">
              {g.sources.map((s) => (
                <li
                  key={s.id}
                  className="flex flex-wrap items-center gap-2 py-2"
                >
                  <Link
                    href={
                      s.kind === "po"
                        ? `/purchases/${s.id}`
                        : `/outsource/${s.id}`
                    }
                    className="text-[var(--accent)]"
                  >
                    {SOURCE_KINDS[s.kind]} {s.docNo}
                  </Link>
                  <span>남음 {won(s.remainWon)}</span>
                  {s.on && (
                    <span className="text-xs text-[var(--muted)]">{s.on}</span>
                  )}
                  {s.invoiceNo ? (
                    <span className="text-xs">계산서 {s.invoiceNo}</span>
                  ) : (
                    <Badge tone="warn">계산서 전</Badge>
                  )}
                  {draft && (
                    <Link
                      href={`/money/expenses/new?src=${s.kind}:${s.id}`}
                      className={buttonClass("secondary")}
                    >
                      결의서 쓰기
                    </Link>
                  )}
                </li>
              ))}
              {g.unpaid.map((u) => (
                <li
                  key={u.id}
                  className="flex flex-wrap items-center gap-2 py-2"
                >
                  <Link
                    href={`/money/expenses/${u.id}`}
                    className="text-[var(--accent)]"
                  >
                    {u.docNo}
                  </Link>
                  <span>{won(u.amountWon)}</span>
                  <Badge tone="accent">승인·지급 전</Badge>
                  {u.dueOn && (
                    <span className="text-xs text-[var(--muted)]">
                      {u.dueOn} 예정
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        ))
      ) : (
        <Empty>정산할 것이 없습니다.</Empty>
      )}
    </>
  );
}
