import Link from "next/link";
import { getDb } from "@/db/runtime";
import { can } from "@/modules/auth/permissions";
import { payableGroups } from "@/modules/money/payable";
import { seoulDate } from "@/modules/platform/time";
import { requireUser } from "../../_lib/session";
import { Badge, buttonClass, Card, Empty, PageTitle } from "../../_ui";

const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;

/** 외상매입금·미지급금(STD-12 12.2): 업체별 잔액·기한, 결의서로 승인한 지출의 미지급, 카드 결제일 전 금액 */
export default async function PayablesPage() {
  const user = await requireUser();
  if (!can(user, "expense.draft") && !can(user, "expense.pay"))
    return <p className="text-sm text-[var(--muted)]">외상매입금·미지급금은 공장장·회계 담당·대표가 봅니다.</p>;
  const { groups, direct, card, totals } = await payableGroups(await getDb());
  const today = seoulDate();
  const tile = (label: string, v: number, tone?: string) => (
    <div className="rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 py-2">
      <p className="text-xs text-[var(--muted)]">{label}</p>
      <p className={`text-lg font-semibold tabular-nums ${tone ?? ""}`}>{won(v)}</p>
    </div>
  );
  return (
    <>
      <PageTitle
        help="payables"
        sub="입고 검수가 끝난 발주서·결과를 수용한 외주는 그날 외상매입금(또는 미지급금)이 됩니다. 기한이 되면 업체별로 지급 결의 한 장을 올려 냅니다. 계좌 확인 전인 업체에는 지급하지 않습니다."
        actions={
          <Link href="/money/expenses" className={buttonClass("secondary")}>
            지출 결의 목록
          </Link>
        }
      >
        외상매입금·미지급금
      </PageTitle>
      <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-6">
        {tile("외상매입금", totals.trade)}
        {tile("미지급금", totals.other)}
        {tile("미지급금(카드)", totals.card)}
        {tile("기한 지남", totals.overdue, totals.overdue ? "text-[var(--danger)]" : "")}
        {tile("이번 달 낼 돈", totals.dueThisMonth)}
        {tile("다음 달 낼 돈", totals.dueNextMonth)}
      </div>
      <Card title="업체별" help={{ kind: "panel", id: "pay.group" }}>
        {groups.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-[var(--muted)]">
                <tr>
                  <th className="py-1.5 pr-2">업체</th>
                  <th className="pr-2 text-right">외상매입금</th>
                  <th className="pr-2 text-right">미지급금</th>
                  <th className="pr-2 text-right">기한 지남</th>
                  <th className="pr-2 text-right">이번 달</th>
                  <th className="pr-2 text-right">다음 달</th>
                  <th className="pr-2">가까운 기한</th>
                  <th>지급 결의</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line)]">
                {groups.map((g) => {
                  const next = g.items.find((x) => x.status === "open")?.dueOn ?? g.items[0]?.dueOn;
                  return (
                    <tr key={g.supplierId ?? g.name}>
                      <td className="py-2 pr-2">
                        {g.supplierId ? (
                          <Link href={`/money/payables/${g.supplierId}`} className="font-semibold text-[var(--accent)]">
                            {g.name}
                          </Link>
                        ) : (
                          g.name
                        )}{" "}
                        {g.bankVerified === false && <Badge tone="danger">계좌 확인 전</Badge>}
                      </td>
                      <td className="pr-2 text-right tabular-nums">{won(g.trade)}</td>
                      <td className="pr-2 text-right tabular-nums">{won(g.other)}</td>
                      <td className={`pr-2 text-right tabular-nums ${g.overdue ? "font-bold text-[var(--danger)]" : ""}`}>{won(g.overdue)}</td>
                      <td className="pr-2 text-right tabular-nums">{won(g.dueThisMonth)}</td>
                      <td className="pr-2 text-right tabular-nums">{won(g.dueNextMonth)}</td>
                      <td className={`pr-2 text-xs ${next && next < today ? "font-bold text-[var(--danger)]" : ""}`}>{next ?? "-"}</td>
                      <td className="text-xs">
                        {g.toSettle > 0 ? <span>결의할 {won(g.toSettle)}</span> : null}
                        {g.inSettle > 0 && <Badge tone="accent">결의·지급 중 {won(g.inSettle)}</Badge>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>갚을 외상매입금이 없습니다.</Empty>
        )}
      </Card>
      {(direct.length > 0 || card.length > 0) && (
        <div className="mt-4">
          <Card title="결의서로 승인한 지출·카드" help={{ kind: "panel", id: "pay.direct" }}>
            <ul className="divide-y divide-[var(--line)] text-sm">
              {direct.map(({ e }) => (
                <li key={e.id} className="flex flex-wrap items-center gap-2 py-2">
                  <Link href={`/money/expenses/${e.id}`} className="text-[var(--accent)]">
                    {e.docNo}
                  </Link>
                  <span>{e.payeeName}</span>
                  <b>{won(e.amountWon)}</b>
                  <Badge>미지급금</Badge>
                  {e.dueOn && <span className={`text-xs ${e.dueOn < today ? "font-bold text-[var(--danger)]" : "text-[var(--muted)]"}`}>{e.dueOn} 예정</span>}
                </li>
              ))}
              {card.map(({ e, dueOn }) => (
                <li key={e.id} className="flex flex-wrap items-center gap-2 py-2">
                  <Link href={`/money/expenses/${e.id}`} className="text-[var(--accent)]">
                    {e.docNo}
                  </Link>
                  <span>{e.payeeName}</span>
                  <b>{won(e.amountWon)}</b>
                  <Badge tone="warn">미지급금(카드)</Badge>
                  <span className="text-xs text-[var(--muted)]">{dueOn} 카드 대금으로 빠짐</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}
    </>
  );
}
