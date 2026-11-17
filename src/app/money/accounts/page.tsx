import Link from "next/link";
import { getDb } from "@/db/runtime";
import { can } from "@/modules/auth/permissions";
import { creditAccounts } from "@/modules/money/credit";
import { requireUser } from "../../_lib/session";
import { Badge, buttonClass, Card, Empty, PageTitle } from "../../_ui";

const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;

/** 업체 외상(외상매출금): 업체 고객마다 잔액·연체·청구 안 한 금액·한도. 협력업체 외상매입금 화면과 같은 모양 */
export default async function CreditAccountsPage() {
  const user = await requireUser();
  if (!can(user, "money.view")) return <p className="text-sm text-[var(--muted)]">업체 외상은 상담원·공장장·회계 담당·대표가 봅니다.</p>;
  const rows = await creditAccounts(await getDb());
  const sum = (k: "balance" | "overdue" | "unbilled") => rows.reduce((s, r) => s + r[k], 0);
  const tile = (label: string, v: number, tone = "") => (
    <div className="rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 py-2">
      <p className="text-xs text-[var(--muted)]">{label}</p>
      <p className={`text-lg font-semibold tabular-nums ${tone}`}>{won(v)}</p>
    </div>
  );
  return (
    <>
      <PageTitle
        help="credit"
        sub="업체 고객은 결제 없이 출고하고(외상), 달이 끝나면 업체별 청구서 한 장으로 받습니다. 정비명세서를 발급·출고한 날 매출과 외상매출금이 생기고, 입금을 적으면 줄어듭니다."
        actions={
          <Link href="/customers/new" className={buttonClass("secondary")}>
            업체 고객 등록
          </Link>
        }
      >
        업체 외상(외상매출금)
      </PageTitle>
      <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-4">
        {tile("외상매출금 잔액", sum("balance"))}
        {tile("받을 날 지남", sum("overdue"), sum("overdue") ? "text-[var(--danger)]" : "")}
        {tile("청구서 안 만든 금액", sum("unbilled"), sum("unbilled") ? "text-[var(--warn)]" : "")}
        {tile("업체 고객", rows.length)}
      </div>
      <Card title="업체별" help={{ kind: "panel", id: "credit.group" }}>
        {rows.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-[var(--muted)]">
                <tr>
                  <th className="py-1.5 pr-2">업체</th>
                  <th className="pr-2">결제 조건</th>
                  <th className="pr-2 text-right">잔액</th>
                  <th className="pr-2 text-right">한도</th>
                  <th className="pr-2 text-right">받을 날 지남</th>
                  <th className="pr-2 text-right">청구 안 함</th>
                  <th>가까운 받을 날</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line)]">
                {rows.map((r) => (
                  <tr key={r.c.id}>
                    <td className="py-2 pr-2">
                      <Link href={`/money/accounts/${r.c.id}`} className="font-semibold text-[var(--accent)]">
                        {r.c.name}
                      </Link>{" "}
                      {r.c.portal && <Badge>주문 앱</Badge>}
                    </td>
                    <td className="pr-2 text-xs">{r.term}</td>
                    <td className="pr-2 text-right tabular-nums">{won(r.balance)}</td>
                    <td className={`pr-2 text-right tabular-nums ${r.limit != null && r.balance > r.limit ? "font-bold text-[var(--danger)]" : ""}`}>{r.limit != null ? won(r.limit) : "없음"}</td>
                    <td className={`pr-2 text-right tabular-nums ${r.overdue ? "font-bold text-[var(--danger)]" : ""}`}>{won(r.overdue)}</td>
                    <td className="pr-2 text-right tabular-nums">
                      {won(r.unbilled)}
                      {r.unbilledCount > 0 && <span className="text-xs text-[var(--muted)]"> ({r.unbilledCount}건)</span>}
                    </td>
                    <td className="text-xs">{r.nextDue ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty action={<Link href="/customers/new" className={buttonClass()}>업체 고객 등록</Link>}>업체 고객이 없습니다. 외상으로 거래하는 업체를 먼저 등록하세요.</Empty>
        )}
      </Card>
    </>
  );
}
