import { can } from "@/modules/auth/permissions";
import Link from "next/link";
import { getDb } from "@/db/runtime";
import { getRepair } from "@/modules/repair/service";
import { statementOf } from "@/modules/repair/inspect";
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
  const snap = (st?.snapshot ?? {}) as { warranty?: { kind: string; until: string }[]; legalFreeDays?: number; byPayer?: { insurance: number; general: number } };

  return (
    <div>
      <PageTitle
        help="repairs.delivery"
        sub={
          <>
            F-05-02 출고 ·{" "}
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
          {ready && desk && !st && (
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
            <Card title="3. 설명·수납·인수 서명" help={{ kind: "panel", id: "dl.handover" }}>
              <AssistForm id={`dld-${id}`} action={deliveryAction} className="space-y-4">
                <input type="hidden" name="roId" value={id} />
                <input type="hidden" name="intent" value="deliver" />
                <CheckGroup help="dl.notices" name="notices" options={opts({ ...DELIVERY_NOTICES, care: `도장 후 ${policy["delivery.no_wash_days"]}일 동안 세차·왁스 금지 안내를 받았습니다` })} />
                <SelectField help="dl.payMethod" name="payMethod" required defaultValue={r.insurance !== "self" ? "insurance" : ""} placeholder="고르기" options={opts(PAY_METHODS)} />
                <ShowWhen field="receiver" initial="self" cases={{ proxy: <TextField help="dl.proxyNote" name="proxyNote" required /> }}>
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
                <TextField help="dl.receiverName" name="receiverName" required defaultValue={r.customer.name} from="고객 기록" />
                <SignaturePad hint="인수하는 분이 차량 상태를 확인하고 이 칸에 서명합니다" />
                <SubmitButton>인수 서명 받고 출고</SubmitButton>
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
        <div className="space-y-4 xl:sticky xl:top-4">
          {cv && (
            <Card title="고객에게 받을 금액" help={{ kind: "panel", id: "dl.collect" }}>
              {cv.claim ? (
                <div className="space-y-1 text-sm">
                  <p className="text-lg font-semibold tabular-nums">{cv.amounts.customerDue.toLocaleString("ko-KR")}원</p>
                  <p className="text-xs">
                    일반 항목 {cv.amounts.generalWon.toLocaleString("ko-KR")}원 + 자기부담금 {cv.claim.deductibleWon.toLocaleString("ko-KR")}원
                    {cv.claim.customerExtraWon > 0 && ` + 미승인분 합의 ${cv.claim.customerExtraWon.toLocaleString("ko-KR")}원`}
                  </p>
                  <p className="text-xs text-[var(--muted)]">
                    보험사 몫 {cv.amounts.insurerDue.toLocaleString("ko-KR")}원은 출고 뒤 청구합니다.{" "}
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
