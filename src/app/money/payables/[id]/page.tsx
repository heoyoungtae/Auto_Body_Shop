import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/db/runtime";
import { can } from "@/modules/auth/permissions";
import { supplierLedger } from "@/modules/money/payable";
import { EXP_CATEGORIES, PAYABLE_KINDS, payTermLabel } from "@/modules/money/rules";
import { seoulDate } from "@/modules/platform/time";
import { CheckGroup } from "../../../_input";
import { requireUser } from "../../../_lib/session";
import { Badge, buttonClass, Card, Empty, PageTitle } from "../../../_ui";

const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;

/** 거래처 원장과 지급 결의: 아직 결의 안 한 채무를 골라 지급 결의서 한 장으로 */
export default async function SupplierPayablePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  if (!can(user, "expense.draft") && !can(user, "expense.pay"))
    return <p className="text-sm text-[var(--muted)]">외상매입금·미지급금은 공장장·회계 담당·대표가 봅니다.</p>;
  const r = await supplierLedger(await getDb(), id);
  if (!r) notFound();
  const today = seoulDate();
  const draft = can(user, "expense.draft");
  const dueIds = r.open.filter((x) => x.dueOn <= today || x.dueOn.slice(0, 7) === today.slice(0, 7)).map((x) => x.id);
  return (
    <>
      <PageTitle
        help="payables.supplier"
        sub={`결제 조건 ${payTermLabel(r.s.payTerm, r.s.payDay)} · 잔액 ${won(r.balance)}${r.prepaid.length ? ` · 선급금 잔액(미입고) ${won(r.prepaid.reduce((a, x) => a + x.balance, 0))}` : ""}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href={`/suppliers/${id}#bank`} className={buttonClass("secondary")}>
              업체 정보·계좌
            </Link>
            <Link href="/money/payables" className="self-center text-sm text-[var(--accent)]">
              ← 외상매입금·미지급금
            </Link>
          </div>
        }
      >
        {r.s.name} 거래처 원장
      </PageTitle>
      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="지급 결의할 것" help={{ kind: "panel", id: "pay.settle" }}>
          {r.open.length ? (
            draft ? (
              <form action="/money/expenses/new" method="get" className="space-y-3">
                <input type="hidden" name="src" value={`settle:${id}`} />
                <CheckGroup
                  help="pay.items"
                  name="p"
                  defaultChecked={dueIds.length ? dueIds : r.open.map((x) => x.id)}
                  options={r.open.map((x) => ({
                    value: x.id,
                    label: `${x.sourceNo} ${won(x.amountWon)} · ${PAYABLE_KINDS[x.kind as keyof typeof PAYABLE_KINDS]}(${EXP_CATEGORIES[x.category as keyof typeof EXP_CATEGORIES] ?? x.category}) · 기한 ${x.dueOn}${x.dueOn < today ? " 지남" : ""}`,
                  }))}
                />
                <button type="submit" className={buttonClass()}>
                  고른 것으로 지급 결의서 쓰기
                </button>
              </form>
            ) : (
              <ul className="text-sm">
                {r.open.map((x) => (
                  <li key={x.id}>
                    {x.sourceNo} {won(x.amountWon)} · 기한 {x.dueOn}
                  </li>
                ))}
              </ul>
            )
          ) : (
            <Empty>아직 결의하지 않은 외상이 없습니다.</Empty>
          )}
          {r.inSettle.length > 0 && (
            <p className="mt-3 text-xs text-[var(--muted)]">
              결의·지급 중:{" "}
              {[...new Set(r.inSettle.map((x) => x.settleNo))].map((no) => (
                <Badge key={no} tone="accent">
                  {no}
                </Badge>
              ))}
            </p>
          )}
        </Card>
        <Card title="원장(최근 것부터)" help={{ kind: "panel", id: "pay.ledger" }}>
          {r.ledger.length ? (
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-[var(--muted)]">
                <tr>
                  <th className="py-1 pr-2">날짜</th>
                  <th className="pr-2">내용</th>
                  <th className="pr-2 text-right">생김</th>
                  <th className="pr-2 text-right">지급</th>
                  <th className="text-right">잔액</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line)]">
                {r.ledger.map((l, i) => (
                  <tr key={i}>
                    <td className="py-1.5 pr-2 text-xs whitespace-nowrap">{l.on}</td>
                    <td className="pr-2 text-xs">
                      <Link href={l.href} className="text-[var(--accent)]">
                        {l.what}
                      </Link>
                    </td>
                    <td className="pr-2 text-right tabular-nums">{l.plus ? won(l.plus) : ""}</td>
                    <td className="pr-2 text-right tabular-nums">{l.minus ? won(l.minus) : ""}</td>
                    <td className="text-right font-medium tabular-nums">{won(l.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <Empty>거래 기록이 없습니다.</Empty>
          )}
        </Card>
      </div>
    </>
  );
}
