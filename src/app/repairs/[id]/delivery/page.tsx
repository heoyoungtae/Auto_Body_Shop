import { can } from "@/modules/auth/permissions";
import Link from "next/link";
import { getDb } from "@/db/runtime";
import { getRepair } from "@/modules/repair/service";
import { statementOf, needDeliverSign } from "@/modules/repair/inspect";
import { DELIVERY_NOTICES, PAY_METHODS } from "@/modules/repair/inspect-rules";
import { RO_STATUS_LABEL } from "@/modules/repair/rules";
import { loadPolicy } from "@/modules/platform/policy";
import { seoulDate } from "@/modules/platform/time";
import { AssistForm } from "../../../_assist";
import { CheckGroup, NumberField, SelectField, TextField } from "../../../_input";
import { SubmitButton } from "../../../_submit";
import { requireUser } from "../../../_lib/session";
import { Badge, buttonClass, Card, ErrorBox, Notice, PageTitle, fmtTime } from "../../../_ui";
import { ShowWhen } from "../../../consults/show-when";
import { SignaturePad } from "../../signature-pad";
import { deliveryAction } from "../../qc-actions";
import { claimView } from "@/modules/repair/claims";
import { creditCheck } from "@/modules/money/credit";
import { RECEIPT_KINDS } from "@/modules/money/rules";

const opts = (o: Record<string, string>) => Object.entries(o).map(([value, label]) => ({ value, label }));

/** 출고(STD-05 7·8절): 완료 안내 → 정비명세서 발급 → 설명·수납·인수 서명 */
export default async function DeliveryPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; notice?: string }> }) {
  const [{ id }, { error, notice }] = await Promise.all([params, searchParams]);
  const user = await requireUser();
  const db = await getDb();
  const r = await getRepair(db, id);
  const st = await statementOf(db, id);
  const policy = await loadPolicy(db, seoulDate());
  const desk = can(user, "delivery.do");
  const ready = r.status === "ready";
  const cv = r.insurance !== "self" ? await claimView(db, id) : null;
  // 업체 고객: 외상 현황(잔액·한도·연체)과 이번 출고를 더했을 때의 경고
  const credit = r.insurance === "self" ? await creditCheck(db, r.customer.id, st?.totalWon ?? 0) : null;
  const biz = credit?.business ? credit : null;
  const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;
  const snap = (st?.snapshot ?? {}) as { warranty?: { kind: string; until: string }[]; legalFreeDays?: number; byPayer?: { insurance: number; general: number } };

  // 간소화 '출고 인수 서명 생략': 자비 건 본인 인수면 서명 없이, 대리인을 고르면 서명란이 나온다
  const sign = needDeliverSign(policy, r, false);
  const autoPay = policy["simple.deliver_payment"] === 1 && can(user, "money.receive");
  const cashReceipt = (
    <>
      <SelectField help="dl.receiptKind" name="receiptKind" defaultValue="cash_receipt" options={opts(Object.fromEntries(Object.entries(RECEIPT_KINDS).filter(([k]) => k !== "card_slip")))} />
      <TextField help="dl.receiptNo" name="receiptNo" />
    </>
  );
  const pad = <SignaturePad hint="인수하는 분이 차량 상태를 확인하고 이 칸에 서명합니다" />;
  // 설명·수납·받는 사람 칸(인도). 간소화 '정비명세서 발급·인도 한 화면'이면 명세서 발급 칸과 한 양식에 둔다
  const handover = (
    <>
      <CheckGroup help="dl.notices" name="notices" options={opts({ ...DELIVERY_NOTICES, care: `도장 후 ${policy["delivery.no_wash_days"]}일 동안 세차·왁스 금지 안내를 받았습니다` })} allLabel={policy["simple.check_all"] === 1 ? "모두 안내함" : undefined} />
      <ShowWhen
        field="payMethod"
        initial={r.insurance !== "self" ? "insurance" : biz ? "credit" : ""}
        cases={{
          ...(biz?.warnings.length ? { credit: <CheckGroup help="dl.creditOk" name="creditOk" options={[{ value: "ok", label: "경고를 확인하고 외상 출고(대표에게 알림)" }]} /> } : {}),
          // 간소화 '출고 때 입금 전표 자동': 현금·이체면 증빙을 여기서 받아 입금 전표까지 한 번에 적는다(카드는 카드 전표)
          ...(autoPay ? { cash: cashReceipt, transfer: cashReceipt } : {}),
        }}
      >
        <SelectField
          help="dl.payMethod"
          name="payMethod"
          required
          defaultValue={r.insurance !== "self" ? "insurance" : biz ? "credit" : ""}
          from={biz ? "업체 결제 조건" : undefined}
          placeholder="고르기"
          options={opts(biz ? PAY_METHODS : Object.fromEntries(Object.entries(PAY_METHODS).filter(([k]) => k !== "credit")))}
        />
      </ShowWhen>
      <ShowWhen field="receiver" initial="self" cases={{
          proxy: (
            <>
              <TextField help="dl.proxyNote" name="proxyNote" required />
              {!sign && pad}
            </>
          ),
        }}
      >
        <SelectField
          help="dl.receiver"
          name="receiver"
          defaultValue="self"
          options={[
            { value: "self", label: "고객 본인" },
            { value: "proxy", label: "대리인" },
          ]}
        />
      </ShowWhen>
      <TextField help="dl.receiverName" name="receiverName" required defaultValue={biz?.customer.contactName ?? r.customer.name} from={biz?.customer.contactName ? "업체 담당자" : "고객 기록"} />
    </>
  );
  const oneStep = policy["simple.statement_deliver"] === 1;

  return (
    <div>
      <PageTitle
        help="repairs.delivery" std="F-05-02 출고"
        sub={
          <>
            <Link href={`/repairs/${id}`} className="text-[var(--accent)]">
              수리 건 {r.docNo}
            </Link>{" "}
            · {r.customer.name} · {r.vehicle.plateNo}
          </>
        }
        actions={
          <>
            <Badge tone={r.status === "delivered" ? "ok" : ready ? "warn" : "neutral"}>{RO_STATUS_LABEL[r.status]}</Badge>
            {st && (
              <Link href={`/repairs/${id}/statement`} className={buttonClass()} target="_blank">
                정비명세서 인쇄
              </Link>
            )}
          </>
        }
      >
        출고
      </PageTitle>
      <ErrorBox message={error} />
      {notice && <Notice>{notice}</Notice>}
      {!ready && r.status !== "delivered" && <p className="mt-3 text-sm text-[var(--muted)]">최종 검사에 합격하면 출고 대기가 됩니다.</p>}

      <div className="mt-4 grid gap-4 xl:grid-cols-3 xl:items-start">
        <div className="space-y-4 xl:col-span-2">
          {ready && desk && (
            <Card title="1. 완료 안내" help={{ kind: "panel", id: "dl.notice" }}>
              <form action={deliveryAction} className="space-y-2 text-sm">
                <input type="hidden" name="roId" value={id} />
                <input type="hidden" name="intent" value="notice" />
                {r.readyNoticeAt && <p>보냄 {fmtTime(r.readyNoticeAt)}</p>}
                <SubmitButton variant={r.readyNoticeAt ? "secondary" : "primary"}>{r.readyNoticeAt ? "다시 보내기" : "수리 완료 안내 보내기(알림톡·문자)"}</SubmitButton>
              </form>
            </Card>
          )}
          {ready && desk && !st && oneStep && (
            <Card title="2. 정비명세서 발급·설명·수납·인수" help={{ kind: "panel", id: "dl.oneStep" }}>
              <AssistForm id={`dlx-${id}`} action={deliveryAction} className="space-y-4">
                <input type="hidden" name="roId" value={id} />
                <input type="hidden" name="intent" value="issue_deliver" />
                <NumberField help="dl.mileageOut" name="mileageOut" unit="km" min={r.mileage ?? 0} defaultValue={r.mileage} from={r.mileage != null ? "입고 점검" : undefined} required />
                {handover}
                {sign && pad}
                <SubmitButton>정비명세서 발급하고 출고</SubmitButton>
              </AssistForm>
            </Card>
          )}
          {ready && desk && !st && !oneStep && (
            <Card title="2. 정비명세서 발급" help={{ kind: "panel", id: "dl.statement" }}>
              <AssistForm id={`dli-${id}`} action={deliveryAction} className="space-y-3">
                <input type="hidden" name="roId" value={id} />
                <input type="hidden" name="intent" value="issue" />
                <NumberField help="dl.mileageOut" name="mileageOut" unit="km" min={r.mileage ?? 0} defaultValue={r.mileage} from={r.mileage != null ? "입고 점검" : undefined} required />
                <SubmitButton>정비명세서 발급</SubmitButton>
              </AssistForm>
            </Card>
          )}
          {ready && desk && st && (
            <Card title={sign ? "3. 설명·수납·인수 서명" : "3. 설명·수납·인수"} help={{ kind: "panel", id: "dl.handover" }}>
              <AssistForm id={`dld-${id}`} action={deliveryAction} className="space-y-4">
                <input type="hidden" name="roId" value={id} />
                <input type="hidden" name="intent" value="deliver" />
                {handover}
                {sign && pad}
                <SubmitButton>{sign ? "인수 서명 받고 출고" : "출고"}</SubmitButton>
              </AssistForm>
            </Card>
          )}
          {r.status === "delivered" && st && (
            <Card title="출고 기록" help={{ kind: "panel", id: "dl.done" }}>
              <div className="space-y-1 text-sm">
                <p>
                  출고 {st.deliveredAt && fmtTime(st.deliveredAt)} · 인수 {st.receiverName}
                  {st.proxy ? `(대리인 — ${st.proxyNote})` : "(본인)"} · 수납 {PAY_METHODS[st.payMethod as keyof typeof PAY_METHODS] ?? st.payMethod}
                </p>
                {st.signature && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`/api/files/${st.signature}`} alt="인수 서명" className="h-20 rounded border border-[var(--line)] bg-white" />
                )}
              </div>
            </Card>
          )}
        </div>
        <div className="space-y-4 xl:sticky xl:top-[4.5rem]">
          {biz && (
            <Card title="업체 외상 현황" help={{ kind: "panel", id: "dl.credit" }}>
              <div className="space-y-1 text-sm">
                <p>
                  <b>{biz.customer.name}</b> · 결제 조건 {biz.term}
                  {biz.customer.portal && <Badge tone="accent">주문 앱 있음</Badge>}
                </p>
                <p className="tabular-nums">
                  외상 잔액 {won(biz.balance)}
                  {biz.limit != null && ` / 한도 ${won(biz.limit)}`}
                </p>
                {st && r.status !== "delivered" && (
                  <p className="text-xs text-[var(--muted)]">
                    이번 출고 {won(st.totalWon)}를 외상으로 하면 받을 날은 {biz.dueOn}입니다(월말 청구서에 묶이면 청구서의 받을 날).
                  </p>
                )}
                {biz.warnings.map((w) => (
                  <p key={w} className="text-xs font-semibold text-[var(--danger)]">
                    ⚠ {w}
                  </p>
                ))}
                <Link href={`/money/accounts/${biz.customer.id}`} className="text-xs text-[var(--accent)] hover:underline">
                  거래처 원장 보기
                </Link>
              </div>
            </Card>
          )}
          {cv && (
            <Card title="고객에게 받을 금액" help={{ kind: "panel", id: "dl.collect" }}>
              {cv.claim ? (
                <div className="space-y-1 text-sm">
                  <p className="text-lg font-semibold tabular-nums">{cv.amounts.customerDue.toLocaleString("ko-KR")}원</p>
                  <p className="text-xs">
                    일반 항목 {cv.amounts.generalWon.toLocaleString("ko-KR")}원 + 자기부담금 {cv.amounts.deductibleTotal.toLocaleString("ko-KR")}원
                    {cv.amounts.depreciationTotal > 0 && ` + 감가상각 ${cv.amounts.depreciationTotal.toLocaleString("ko-KR")}원`}
                    {cv.amounts.extraTotal > 0 && ` + 미승인분 합의 ${cv.amounts.extraTotal.toLocaleString("ko-KR")}원`}
                  </p>
                  <p className="text-xs text-[var(--muted)]">
                    보험사 몫 {cv.amounts.insurerDueTotal.toLocaleString("ko-KR")}원은 출고 뒤 청구합니다.{" "}
                    <Link href={`/repairs/${id}/claim`} className="text-[var(--accent)]">
                      보험 청구 {cv.claim.docNo}
                    </Link>
                  </p>
                  {!cv.claim.scopedAt && <p className="rounded-md bg-[var(--warn-soft)] px-2 py-1 text-xs">보험사 손해사정 금액을 아직 적지 않았습니다. 미승인분이 생기면 고객 부담이 바뀔 수 있습니다.</p>}
                </div>
              ) : (
                <p className="rounded-md bg-[var(--warn-soft)] px-2 py-1 text-sm">
                  보험 수리인데 접수 정보(자기부담금)가 없습니다. 출고 전에{" "}
                  <Link href={`/repairs/${id}/claim`} className="text-[var(--accent)]">
                    보험 청구 화면
                  </Link>
                  에서 확인해 주세요.
                </p>
              )}
            </Card>
          )}
          {st && (
            <Card title="정비명세서" help={{ kind: "panel", id: "dl.summary" }}>
              <div className="space-y-1 text-sm">
                <p>
                  {st.docNo} · 발급 {st.issuedOn} · 출고 주행 {st.mileageOut?.toLocaleString("ko-KR")}km
                </p>
                <p className="font-semibold">총액 {st.totalWon.toLocaleString("ko-KR")}원(부가세 포함)</p>
                {snap.byPayer && snap.byPayer.insurance > 0 && (
                  <p className="text-xs">
                    보험 {snap.byPayer.insurance.toLocaleString("ko-KR")}원 · 일반 {snap.byPayer.general.toLocaleString("ko-KR")}원
                  </p>
                )}
                {snap.warranty?.map((w) => (
                  <p key={w.kind} className="text-xs">
                    사내 보증 {w.kind}: {w.until}까지
                  </p>
                ))}
                {snap.legalFreeDays && <p className="text-xs text-[var(--muted)]">법정 무상 점검·정비: 정비일부터 {snap.legalFreeDays}일</p>}
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
