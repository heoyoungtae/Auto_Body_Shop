import Link from "next/link";
import { getDb } from "@/db/runtime";
import { can } from "@/modules/auth/permissions";
import { creditLedger } from "@/modules/money/credit";
import { seoulDate } from "@/modules/platform/time";
import { AssistForm } from "../../../_assist";
import { CheckGroup, TextField } from "../../../_input";
import { requireUser } from "../../../_lib/session";
import { SubmitButton } from "../../../_submit";
import { Badge, buttonClass, Card, Empty, ErrorBox, Notice, PageTitle } from "../../../_ui";
import { createBillAction } from "../actions";

const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;

/** 거래처 원장(매출): 외상 출고 건·청구서·잔액. 청구 안 한 건을 골라 청구서 한 장으로 */
export default async function CreditLedgerPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; notice?: string }> }) {
  const [{ id }, q] = await Promise.all([params, searchParams]);
  const user = await requireUser();
  if (!can(user, "money.view")) return <p className="text-sm text-[var(--muted)]">업체 외상은 상담원·공장장·회계 담당·대표가 봅니다.</p>;
  const r = await creditLedger(await getDb(), id);
  const today = seoulDate();
  const unbilled = r.lines.filter((l) => !l.billId && l.remain > 0);
  const canBill = can(user, "money.close_month");
  return (
    <>
      <PageTitle
        help="credit.account"
        sub={`${r.c.bizNo ?? "사업자번호 없음"} · 결제 조건 ${r.term} · 잔액 ${won(r.summary.balance)}${r.summary.limit != null ? ` / 한도 ${won(r.summary.limit)}` : ""}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href={`/customers/${id}`} className={buttonClass("secondary")}>
              업체 정보·거래 조건
            </Link>
            <Link href="/money/accounts" className="self-center text-sm text-[var(--accent)]">
              ← 업체 외상
            </Link>
          </div>
        }
      >
        {r.c.name} 거래처 원장
      </PageTitle>
      <ErrorBox message={q.error} />
      {q.notice && <Notice>{q.notice}</Notice>}
      {r.c.kind !== "business" && <p className="mb-3 text-sm text-[var(--warn)]">지금은 개인 고객입니다. 외상 출고는 업체 고객만 할 수 있습니다.</p>}
      <div className="grid gap-4 xl:grid-cols-2 xl:items-start">
        <Card title="청구서 만들기" help={{ kind: "panel", id: "credit.bill" }}>
          {unbilled.length ? (
            canBill ? (
              <AssistForm id={`bill-new-${id}`} action={createBillAction} className="space-y-3">
                <input type="hidden" name="customerId" value={id} />
                <CheckGroup
                  help="bill.items"
                  name="st"
                  defaultChecked={r.suggested.length ? r.suggested : unbilled.map((l) => l.statementId)}
                  options={unbilled.map((l) => ({ value: l.statementId, label: `${l.deliveredOn} ${l.roNo} ${l.plateNo} ${won(l.remain)}` }))}
                />
                <TextField help="bill.note" name="note" />
                <SubmitButton>고른 것으로 청구서 만들기</SubmitButton>
              </AssistForm>
            ) : (
              <p className="text-sm text-[var(--muted)]">청구 안 한 외상 {unbilled.length}건 · 청구서는 회계 담당·대표가 만듭니다.</p>
            )
          ) : (
            <Empty>청구할 외상 출고가 없습니다.</Empty>
          )}
        </Card>
        <Card title="청구서" help={{ kind: "panel", id: "credit.bills" }}>
          {r.bills.length ? (
            <ul className="divide-y divide-[var(--line)] text-sm">
              {r.bills.map((b) => (
                <li key={b.id} className="flex flex-wrap items-center gap-2 py-2">
                  <Link href={`/money/accounts/bills/${b.id}`} className="font-semibold text-[var(--accent)]">
                    {b.docNo}
                  </Link>
                  <span>{b.ym} 출고분</span>
                  <b className="tabular-nums">{won(b.totalWon)}</b>
                  {b.cancelledAt ? (
                    <Badge>취소</Badge>
                  ) : b.remain <= 0 ? (
                    <Badge tone="ok">다 받음</Badge>
                  ) : (
                    <Badge tone={b.dueOn < today ? "danger" : "warn"}>
                      남은 {won(b.remain)} · {b.dueOn}
                      {b.dueOn < today ? " 지남" : ""}
                    </Badge>
                  )}
                  {!b.cancelledAt && !b.taxInvoiceNo && <Badge tone="warn">세금계산서 번호 없음</Badge>}
                </li>
              ))}
            </ul>
          ) : (
            <Empty>아직 청구서가 없습니다.</Empty>
          )}
        </Card>
      </div>
      <div className="mt-4">
        <Card title="외상 출고 건" help={{ kind: "panel", id: "credit.lines" }}>
          {r.lines.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-[var(--muted)]">
                  <tr>
                    <th className="py-1.5 pr-2">출고일</th>
                    <th className="pr-2">수리 건</th>
                    <th className="pr-2">정비명세서</th>
                    <th className="pr-2 text-right">금액</th>
                    <th className="pr-2 text-right">받음</th>
                    <th className="pr-2 text-right">남음</th>
                    <th className="pr-2">받을 날</th>
                    <th>청구서</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--line)]">
                  {[...r.lines].reverse().map((l) => (
                    <tr key={l.statementId}>
                      <td className="py-2 pr-2 tabular-nums">{l.deliveredOn}</td>
                      <td className="pr-2">
                        <Link href={`/money/ro/${l.roId}`} className="text-[var(--accent)]">
                          {l.roNo}
                        </Link>{" "}
                        {l.plateNo}
                      </td>
                      <td className="pr-2 text-xs">{l.statementNo}</td>
                      <td className="pr-2 text-right tabular-nums">{won(l.totalWon)}</td>
                      <td className="pr-2 text-right tabular-nums">{won(l.paid)}</td>
                      <td className={`pr-2 text-right tabular-nums ${l.remain > 0 && l.dueOn < today ? "font-bold text-[var(--danger)]" : ""}`}>{won(l.remain)}</td>
                      <td className="pr-2 text-xs">{l.remain > 0 ? l.dueOn : "-"}</td>
                      <td className="text-xs">
                        {l.billId ? (
                          <Link href={`/money/accounts/bills/${l.billId}`} className="text-[var(--accent)]">
                            {l.billNo}
                          </Link>
                        ) : (
                          "청구 안 함"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty>외상으로 출고한 건이 없습니다. 출고 화면에서 수납 방법을 '외상'으로 고르면 여기 쌓입니다.</Empty>
          )}
        </Card>
      </div>
    </>
  );
}
