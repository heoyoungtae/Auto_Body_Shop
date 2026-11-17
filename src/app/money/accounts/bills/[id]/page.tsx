import Link from "next/link";
import { getDb } from "@/db/runtime";
import { can } from "@/modules/auth/permissions";
import { receiptPrefill } from "@/modules/bank/service";
import { billView } from "@/modules/money/credit";
import { PAY_IN_METHODS, payTermLabel } from "@/modules/money/rules";
import { loadShopInfo, shopAddressLine } from "@/modules/platform/shop";
import { seoulDate } from "@/modules/platform/time";
import { AssistForm } from "../../../../_assist";
import { DateField, NumberField, SelectField, TextField } from "../../../../_input";
import { requireUser } from "../../../../_lib/session";
import { SubmitButton } from "../../../../_submit";
import { Badge, Card, ErrorBox, Notice, PageTitle } from "../../../../_ui";
import { PrintButton } from "../../../../reports/print-button";
import { billAction } from "../../actions";

const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;

/** 거래처 청구서(BL): 인쇄해 업체에 보내고, 월 합계 세금계산서 번호와 입금을 적는다 */
export default async function BillPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; notice?: string; tx?: string }> }) {
  const [{ id }, q] = await Promise.all([params, searchParams]);
  const user = await requireUser();
  if (!can(user, "money.view")) return <p className="text-sm text-[var(--muted)]">거래처 청구서는 상담원·공장장·회계 담당·대표가 봅니다.</p>;
  const db = await getDb();
  const v = await billView(db, id);
  const shop = await loadShopInfo(db);
  const today = seoulDate();
  // 통장 입금에서 열었으면 금액·날짜·입금자를 채운다
  const pre = q.tx ? await receiptPrefill(db, user, q.tx) : null;
  const live = !v.b.cancelledAt;
  return (
    <>
      <div className="print:hidden">
        <PageTitle
          help="credit.bill"
          sub={
            <>
              <Link href={`/money/accounts/${v.c.id}`} className="text-[var(--accent)]">
                {v.c.name} 거래처 원장
              </Link>{" "}
              · {v.b.ym} 출고분 · 받을 날 {v.b.dueOn}
            </>
          }
          actions={<PrintButton />}
        >
          청구서 {v.b.docNo}
        </PageTitle>
        <ErrorBox message={q.error} />
        {q.notice && <Notice>{q.notice}</Notice>}
        <div className="mb-3 flex flex-wrap gap-2 text-sm">
          {v.b.cancelledAt ? <Badge>취소 — {v.b.cancelReason}</Badge> : v.remain <= 0 ? <Badge tone="ok">다 받음</Badge> : <Badge tone={v.b.dueOn < today ? "danger" : "warn"}>남은 {won(v.remain)}{v.b.dueOn < today ? " · 받을 날 지남" : ""}</Badge>}
          {v.b.taxInvoiceNo ? <Badge tone="ok">세금계산서 {v.b.taxInvoiceNo} ({v.b.taxInvoiceOn})</Badge> : live && <Badge tone="warn">세금계산서 {v.invoiceDeadline}까지 발행</Badge>}
        </div>
      </div>

      {/* 인쇄되는 청구서 */}
      <section className="rounded-lg border border-[var(--line)] bg-[var(--surface)] p-5 text-sm print:border-0 print:p-0">
        <h2 className="mb-4 text-center text-2xl font-bold tracking-widest">청 구 서</h2>
        <div className="mb-4 grid gap-4 md:grid-cols-2">
          <div>
            <p className="text-lg font-semibold">{v.c.name} 귀하</p>
            <p>사업자등록번호 {v.c.bizNo ?? "-"}</p>
            {v.c.contactName && <p>담당 {v.c.contactName}</p>}
            <p className="mt-2">
              청구 번호 {v.b.docNo} · 발행일 {v.b.issuedOn}
            </p>
            <p>
              청구 기간 {v.b.ym} · 결제 조건 {payTermLabel(v.b.payTerm, v.c.payDay)}
            </p>
            <p className="font-semibold">입금 기한 {v.b.dueOn}</p>
          </div>
          <div className="md:text-right">
            <p className="font-semibold">{shop.name || "(사업장 정보 미입력)"}</p>
            <p>사업자등록번호 {shop.bizNo || "-"} · 대표 {shop.ceo || "-"}</p>
            <p>{shopAddressLine(shop)}</p>
            <p>{shop.phone}</p>
          </div>
        </div>
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-y border-[var(--line-strong)] text-left">
              <th className="py-1.5 pr-2">출고일</th>
              <th className="pr-2">차량번호</th>
              <th className="pr-2">수리 번호</th>
              <th className="pr-2">정비명세서</th>
              <th className="pr-2 text-right">공급가</th>
              <th className="pr-2 text-right">부가세</th>
              <th className="text-right">합계</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--line)]">
            {v.lines.map((l) => (
              <tr key={l.statementId}>
                <td className="py-1.5 pr-2 tabular-nums">{l.deliveredOn}</td>
                <td className="pr-2">{l.plateNo}</td>
                <td className="pr-2">{l.roNo}</td>
                <td className="pr-2">{l.statementNo}</td>
                <td className="pr-2 text-right tabular-nums">{won(l.supplyWon)}</td>
                <td className="pr-2 text-right tabular-nums">{won(l.vatWon)}</td>
                <td className="text-right tabular-nums">{won(l.totalWon)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-[var(--line-strong)] font-semibold">
              <td colSpan={4} className="py-2">
                합계 {v.lines.length}건
              </td>
              <td className="pr-2 text-right tabular-nums">{won(v.b.supplyWon)}</td>
              <td className="pr-2 text-right tabular-nums">{won(v.b.vatWon)}</td>
              <td className="text-right tabular-nums">{won(v.b.totalWon)}</td>
            </tr>
            {v.paid > 0 && (
              <tr>
                <td colSpan={6} className="text-right">
                  받은 금액
                </td>
                <td className="text-right tabular-nums">{won(v.paid)}</td>
              </tr>
            )}
            {v.paid > 0 && (
              <tr className="font-semibold">
                <td colSpan={6} className="text-right">
                  남은 금액
                </td>
                <td className="text-right tabular-nums">{won(v.remain)}</td>
              </tr>
            )}
          </tfoot>
        </table>
        {v.b.note && <p className="mt-3 whitespace-pre-line">{v.b.note}</p>}
      </section>

      {live && (
        <div className="mt-4 grid gap-4 xl:grid-cols-3 xl:items-start print:hidden">
          <Card title="입금 적기" help={{ kind: "panel", id: "credit.pay" }}>
            {v.remain > 0 && can(user, "money.receive") ? (
              <AssistForm id={`bill-pay-${id}`} action={billAction} className="space-y-3">
                <input type="hidden" name="billId" value={id} />
                <input type="hidden" name="intent" value="pay" />
                {pre && <input type="hidden" name="tx" value={q.tx} />}
                <NumberField help="bill.amount" name="amountWon" unit="원" required min={1} max={v.remain} defaultValue={pre?.amount ?? v.remain} from={pre?.from ?? `청구서 ${v.b.docNo} 남은 금액`} />
                <DateField help="bill.receivedOn" name="receivedOn" required defaultValue={pre?.on ?? today} quick={["today"]} />
                <SelectField help="bill.method" name="method" required defaultValue="transfer" options={Object.entries(PAY_IN_METHODS).map(([value, label]) => ({ value, label }))} />
                <TextField help="bill.payerName" name="payerName" defaultValue={pre?.payer || v.c.name} />
                <TextField help="bill.payNote" name="note" />
                <SubmitButton>입금 적기(수리 건별 입금 전표)</SubmitButton>
              </AssistForm>
            ) : (
              <p className="text-sm text-[var(--muted)]">{v.remain > 0 ? "입금은 수납 권한이 있는 사람이 적습니다." : "다 받았습니다."}</p>
            )}
            {v.pays.length > 0 && (
              <ul className="mt-3 divide-y divide-[var(--line)] text-xs">
                {v.pays.map((p) => (
                  <li key={p.id} className="flex flex-wrap gap-2 py-1">
                    <Link href={`/money/ro/${p.repairOrderId}`} className="text-[var(--accent)]">
                      {p.docNo}
                    </Link>
                    <span>{p.receivedOn}</span>
                    <b className="tabular-nums">{won(p.amountWon)}</b>
                    <span className="text-[var(--muted)]">{p.note}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="월 합계 세금계산서" help={{ kind: "panel", id: "credit.invoice" }}>
            {can(user, "money.close_month") ? (
              <AssistForm id={`bill-tax-${id}`} action={billAction} className="space-y-3">
                <input type="hidden" name="billId" value={id} />
                <input type="hidden" name="intent" value="invoice" />
                <p className="text-xs text-[var(--muted)]">
                  공급가 {won(v.b.supplyWon)} · 부가세 {won(v.b.vatWon)} · 작성일자는 {v.b.ym}의 말일, 발급은 {v.invoiceDeadline}까지
                </p>
                <TextField help="bill.taxInvoiceNo" name="taxInvoiceNo" required defaultValue={v.b.taxInvoiceNo ?? ""} />
                <DateField help="bill.taxInvoiceOn" name="taxInvoiceOn" required defaultValue={v.b.taxInvoiceOn ?? today} quick={["today"]} />
                <SubmitButton variant="secondary">세금계산서 번호 저장</SubmitButton>
              </AssistForm>
            ) : (
              <p className="text-sm text-[var(--muted)]">세금계산서는 회계 담당·대표가 적습니다.</p>
            )}
          </Card>
          {can(user, "money.close_month") && v.pays.length === 0 && (
            <Card title="청구서 취소" help={{ kind: "panel", id: "credit.cancel" }}>
              <AssistForm id={`bill-cancel-${id}`} action={billAction} className="space-y-3">
                <input type="hidden" name="billId" value={id} />
                <input type="hidden" name="customerId" value={v.c.id} />
                <input type="hidden" name="intent" value="cancel" />
                <TextField help="bill.cancelReason" name="reason" required />
                <SubmitButton variant="secondary">청구서 취소</SubmitButton>
              </AssistForm>
            </Card>
          )}
        </div>
      )}
    </>
  );
}
