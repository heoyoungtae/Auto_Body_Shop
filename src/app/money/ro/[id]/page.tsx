import Link from "next/link";
import { getDb } from "@/db/runtime";
import { can } from "@/modules/auth/permissions";
import { receiptView } from "@/modules/money/receipts";
import { receiptPrefill } from "@/modules/bank/service";
import {
  AR_DUN_DAYS,
  CASH_RECEIPT_MUST,
  daysBetween,
  PAY_IN_METHODS,
  RECEIPT_KINDS,
} from "@/modules/money/rules";
import { seoulDate } from "@/modules/platform/time";
import { AssistForm } from "../../../_assist";
import {
  DateField,
  NumberField,
  RadioRow,
  SelectField,
  TextField,
} from "../../../_input";
import { requireUser, userMessage } from "../../../_lib/session";
import { SubmitButton } from "../../../_submit";
import {
  Badge,
  Card,
  Empty,
  ErrorBox,
  fmtTime,
  Notice,
  PageTitle,
} from "../../../_ui";
import { paymentAction } from "../../actions";

const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;

/** 수리 건 한 건의 수납(STD-12 12.1): 받을 금액·받은 전표·남은 금액, 수납·취소 전표·독촉 */
export default async function RoMoneyPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ notice?: string; error?: string; tx?: string }>;
}) {
  const { id } = await params;
  const q = await searchParams;
  const user = await requireUser();
  if (!can(user, "money.view"))
    return (
      <p className="text-sm text-[var(--muted)]">
        수납은 상담원·공장장·회계 담당·대표가 봅니다.
      </p>
    );
  let v: Awaited<ReturnType<typeof receiptView>>;
  try {
    v = await receiptView(await getDb(), id);
  } catch (e) {
    return <ErrorBox message={userMessage(e)} />;
  }
  const today = seoulDate();
  const may = can(user, "money.receive");
  // 통장 입금에서 왔으면(?tx=) 금액·날짜·입금자를 그 입금에서 채운다
  const txPre = q.tx ? await receiptPrefill(await getDb(), user, q.tx) : null;
  const method = (
    txPre
      ? "transfer"
      : v.deliveredMethod && v.deliveredMethod in PAY_IN_METHODS
      ? v.deliveredMethod
      : "card"
  ) as keyof typeof PAY_IN_METHODS;
  const days = v.deliveredOn ? daysBetween(v.deliveredOn, today) : null;
  const hidden = (intent: string) => (
    <>
      <input type="hidden" name="roId" value={id} />
      <input type="hidden" name="intent" value={intent} />
    </>
  );
  return (
    <>
      <PageTitle
        help="money.ro"
        sub={`${v.customerName} · ${v.plateNo}${v.deliveredOn ? ` · ${v.deliveredOn} 출고` : ""}`}
        actions={
          <Link
            href={`/repairs/${id}`}
            className="text-sm text-[var(--accent)]"
          >
            수리 건 보기
          </Link>
        }
      >
        {v.ro.docNo} 수납
      </PageTitle>
      <ErrorBox message={q.error} />
      {q.notice && <Notice>{q.notice}</Notice>}

      <Card title="받을 금액" help={{ kind: "panel", id: "money.due" }}>
        <dl className="grid gap-2 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs text-[var(--muted)]">받을 금액(고객)</dt>
            <dd className="text-lg font-semibold">{won(v.due.due)}</dd>
            <dd className="text-xs text-[var(--muted)]">
              {v.due.from ?? "견적 승인 전이라 아직 없습니다"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--muted)]">받은 금액</dt>
            <dd className="text-lg font-semibold">{won(v.paid)}</dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--muted)]">남은 금액</dt>
            <dd
              className={`text-lg font-semibold ${v.remain > 0 ? "text-[var(--warn)]" : ""}`}
            >
              {won(v.remain)}
            </dd>
            {days != null && v.remain > 0 && (
              <dd>
                <Badge tone={days >= AR_DUN_DAYS ? "danger" : "neutral"}>
                  출고 {days}일
                </Badge>
              </dd>
            )}
          </div>
        </dl>
        {v.ro.insurance !== "self" && (
          <p className="mt-2 text-xs text-[var(--muted)]">
            보험사 몫 {won(v.due.insurerDue)}은{" "}
            <Link
              href={`/repairs/${id}/claim`}
              className="text-[var(--accent)]"
            >
              보험 청구
            </Link>
            에서 청구·입금 확인합니다
            {v.claim?.paidWon ? ` (입금 ${won(v.claim.paidWon)})` : ""}.
          </p>
        )}
      </Card>

      {may && v.remain > 0 && v.due.from && (
        <div id="pay">
        <Card title="수납 적기" help={{ kind: "panel", id: "money.pay" }}>
          <AssistForm
            id={`pay-${id}`}
            action={paymentAction}
            className="grid gap-3 md:grid-cols-2"
          >
            {hidden("pay")}
            {txPre && (
              <>
                <input type="hidden" name="tx" value={txPre.t.id} />
                <p className="rounded-md bg-[var(--accent-soft)] px-3 py-2 text-xs md:col-span-2">
                  {txPre.from} {txPre.payer}. 저장하면 이 입금과 이어집니다. 증빙만 고르세요.
                </p>
              </>
            )}
            <RadioRow
              help="money.method"
              name="method"
              required
              defaultValue={method}
              from={txPre ? txPre.from : v.deliveredMethod ? "출고 때 고른 수납 방법" : undefined}
              options={Object.entries(PAY_IN_METHODS).map(([value, label]) => ({
                value,
                label,
              }))}
            />
            <NumberField
              help="money.amount"
              name="amountWon"
              required
              unit="원"
              min={1}
              max={v.remain}
              defaultValue={txPre ? Math.min(txPre.amount, v.remain) : v.remain}
              from={txPre ? txPre.from : "남은 금액"}
            />
            <DateField
              help="money.receivedOn"
              name="receivedOn"
              required
              defaultValue={txPre?.on ?? today}
              from={txPre ? txPre.from : undefined}
              quick={["today"]}
            />
            <SelectField
              help="money.receiptKind"
              name="receiptKind"
              required
              defaultValue={method === "card" ? "card_slip" : "cash_receipt"}
              options={Object.entries(RECEIPT_KINDS).map(([value, label]) => ({
                value,
                label,
              }))}
            />
            <TextField help="money.receiptNo" name="receiptNo" />
            <TextField
              help="money.payerName"
              name="payerName"
              defaultValue={txPre?.payer || v.customerName}
              from={txPre?.payer ? txPre.from : "고객"}
            />
            <div className="md:col-span-2">
              <TextField help="money.note" name="note" />
            </div>
            <p className="text-xs text-[var(--muted)] md:col-span-2">
              현금·계좌 이체로 {won(CASH_RECEIPT_MUST)} 이상 받으면 현금영수증을
              꼭 발행합니다(고객이 원하지 않으면 국세청 지정 번호 010-000-1234).
              그날 일일 마감을 했으면 그 날짜로는 적을 수 없습니다.
            </p>
            <div className="md:col-span-2">
              <SubmitButton>수납 저장</SubmitButton>
            </div>
          </AssistForm>
        </Card>
        </div>
      )}

      <Card title="입금 전표" help={{ kind: "panel", id: "money.payments" }}>
        {v.payments.length ? (
          <ul className="divide-y divide-[var(--line)] text-sm">
            {v.payments.map((p) => (
              <li key={p.id} className="space-y-2 py-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{p.docNo}</span>
                  <span className="text-xs text-[var(--muted)]">
                    {p.receivedOn}
                  </span>
                  <span
                    className={
                      p.amountWon < 0 ? "text-[var(--danger)]" : "font-medium"
                    }
                  >
                    {won(p.amountWon)}
                  </span>
                  <Badge>
                    {PAY_IN_METHODS[p.method as keyof typeof PAY_IN_METHODS]}
                  </Badge>
                  <span className="text-xs">
                    {RECEIPT_KINDS[p.receiptKind as keyof typeof RECEIPT_KINDS]}
                    {p.receiptNo ? ` ${p.receiptNo}` : ""}
                  </span>
                  {p.reversalOf && <Badge tone="danger">취소 전표</Badge>}
                  {p.reversed && <Badge tone="neutral">취소됨</Badge>}
                  <span className="text-xs text-[var(--muted)]">
                    {p.byName} · {fmtTime(p.createdAt)}
                  </span>
                </div>
                {p.note && (
                  <p className="text-xs text-[var(--muted)]">{p.note}</p>
                )}
                {may && !p.reversalOf && !p.reversed && (
                  <details>
                    <summary className="cursor-pointer text-xs text-[var(--accent)]">
                      취소 전표 적기
                    </summary>
                    <AssistForm
                      id={`rev-${p.id}`}
                      action={paymentAction}
                      className="mt-2 flex flex-wrap items-end gap-2"
                    >
                      {hidden("reverse")}
                      <input type="hidden" name="paymentId" value={p.id} />
                      <div className="min-w-64 flex-1">
                        <TextField
                          help="money.reverseReason"
                          name="reason"
                          required
                        />
                      </div>
                      <SubmitButton variant="danger">
                        취소 전표 저장
                      </SubmitButton>
                    </AssistForm>
                  </details>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <Empty>아직 입금 전표가 없습니다.</Empty>
        )}
      </Card>

      {(v.remain > 0 || v.follows.length > 0) && v.due.final && (
        <div id="follow">
          <Card title="미수 독촉" help={{ kind: "panel", id: "money.follow" }}>
            {v.follows.length > 0 && (
              <ul className="mb-3 space-y-1 text-sm">
                {v.follows.map((f) => (
                  <li key={f.id}>
                    <span className="text-xs text-[var(--muted)]">
                      {fmtTime(f.at)}
                    </span>{" "}
                    {f.byName} · {f.note}
                    {f.promisedOn && ` · 약속 ${f.promisedOn}`}
                  </li>
                ))}
              </ul>
            )}
            {may && v.remain > 0 && (
              <AssistForm
                id={`follow-${id}`}
                action={paymentAction}
                className="grid gap-3 md:grid-cols-2"
              >
                {hidden("follow")}
                <TextField help="money.followNote" name="note" required />
                <DateField
                  help="money.promisedOn"
                  name="promisedOn"
                  quick={["tomorrow", "week"]}
                />
                <div className="md:col-span-2">
                  <SubmitButton variant="secondary">독촉 기록</SubmitButton>
                </div>
              </AssistForm>
            )}
          </Card>
        </div>
      )}
    </>
  );
}
