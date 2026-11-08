import { can } from "@/modules/auth/permissions";
import Link from "next/link";
import { getDb } from "@/db/runtime";
import { FIELD_HELP } from "@/modules/help/fields";
import { claimView } from "@/modules/repair/claims";
import { CLAIM_DOCS, CLAIM_STATUS_LABEL, COVERAGE_LABEL, DUN_DAYS } from "@/modules/repair/claim-rules";
import { RO_STATUS_LABEL } from "@/modules/repair/rules";
import { seoulDate } from "@/modules/platform/time";
import { AssistForm } from "../../../_assist";
import { CheckGroup, DateField, NumberField, SelectField, TextField } from "../../../_input";
import { koMoney } from "../../../_format";
import { SubmitButton } from "../../../_submit";
import { requireUser } from "../../../_lib/session";
import { Badge, Card, ErrorBox, Notice, PageTitle, fmtTime } from "../../../_ui";
import { claimAction } from "../../claim-actions";

const opts = (o: Record<string, string>) => Object.entries(o).map(([value, label]) => ({ value, label }));
const won = (n: number | null | undefined) => (n == null ? "—" : `${n.toLocaleString("ko-KR")}원`);
const INSURERS = (FIELD_HELP["consult.insurer"] as { templates: string[] }).templates;

function Hidden({ roId, intent }: { roId: string; intent: string }) {
  return (
    <>
      <input type="hidden" name="roId" value={roId} />
      <input type="hidden" name="intent" value={intent} />
    </>
  );
}

function Done({ children }: { children: React.ReactNode }) {
  return <div className="space-y-1 rounded-md bg-[var(--accent-soft)] px-3 py-2 text-sm">{children}</div>;
}

/** 보험 청구(STD-03 6절): 접수 확인 → 손해사정 요청 → 승인 범위 → (작업·출고) → 청구 → 입금 확인 */
export default async function ClaimPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; notice?: string }> }) {
  const [{ id }, { error, notice }] = await Promise.all([params, searchParams]);
  const user = await requireUser();
  const db = await getDb();
  const v = await claimView(db, id);
  const { ro: r, claim: c, amounts: a, due } = v;
  const desk = can(user, "claim.desk");
  const money = can(user, "claim.money");
  const today = seoulDate();
  const locked = c?.status === "claimed" || c?.status === "paid";
  const late = (d: string | null) => (d && d < today ? <Badge tone="danger">기한 지남</Badge> : null);

  return (
    <div>
      <PageTitle
        help="repairs.claim"
        sub={
          <>
            STD-03 6절 · {c ? `${c.docNo} · ` : ""}
            <Link href={`/repairs/${id}`} className="text-[var(--accent)]">
              수리 건 {r.docNo}
            </Link>{" "}
            · {RO_STATUS_LABEL[r.status]}
          </>
        }
        actions={<Badge tone={v.status === "paid" ? "ok" : v.status === "none" ? "warn" : "accent"}>{CLAIM_STATUS_LABEL[v.status]}</Badge>}
      >
        보험 청구
      </PageTitle>
      <ErrorBox message={error} />
      {notice && <Notice>{notice}</Notice>}

      <div className="mt-4 grid gap-4 xl:grid-cols-3 xl:items-start">
        <div className="space-y-4 xl:col-span-2">
          <Card title="1. 접수 확인" help={{ kind: "panel", id: "claim.info" }}>
            {desk && !locked ? (
              <AssistForm id={`claim-info-${id}`} action={claimAction} className="space-y-3">
                <Hidden roId={id} intent="info" />
                <div className="grid gap-3 md:grid-cols-3">
                  <TextField help="claim.insurer" name="insurer" required defaultValue={c?.insurer ?? r.insurer ?? ""} from={!c && r.insurer ? "상담·수리 건" : undefined} suggestions={INSURERS.map((x) => ({ value: x }))} />
                  <TextField help="claim.claimNo" name="claimNo" required defaultValue={c?.claimNo ?? r.claimNo ?? ""} from={!c && r.claimNo ? "상담·수리 건" : undefined} />
                  <SelectField help="claim.coverage" name="coverage" required defaultValue={c?.coverage ?? (r.insurance === "own" || r.insurance === "other" ? r.insurance : "")} placeholder="고르기" options={opts(COVERAGE_LABEL)} from={!c ? "상담·수리 건" : undefined} />
                </div>
                <div className="grid gap-3 md:grid-cols-4">
                  <NumberField help="claim.deductibleWon" name="deductibleWon" unit="원" min={0} required defaultValue={c?.deductibleWon ?? null} />
                  <NumberField help="claim.faultPct" name="faultPct" unit="%" min={0} max={100} defaultValue={c?.faultPct ?? null} />
                  <TextField help="claim.adjusterName" name="adjusterName" defaultValue={c?.adjusterName ?? ""} />
                  <TextField help="claim.adjusterPhone" name="adjusterPhone" inputMode="tel" defaultValue={c?.adjusterPhone ?? ""} />
                </div>
                <SubmitButton>{c ? "접수 정보 고치기" : "접수 정보 저장"}</SubmitButton>
              </AssistForm>
            ) : c ? (
              <Done>
                <p>
                  {c.insurer} · 접수 {c.claimNo} · {COVERAGE_LABEL[c.coverage as keyof typeof COVERAGE_LABEL]}
                  {c.faultPct != null && ` · 우리 고객 과실 ${c.faultPct}%`}
                </p>
                <p>
                  자기부담금 {won(c.deductibleWon)} · 손해사정사 {c.adjusterName ?? "—"} {c.adjusterPhone ?? ""}
                </p>
              </Done>
            ) : (
              <p className="text-sm text-[var(--muted)]">아직 접수 정보가 없습니다.</p>
            )}
          </Card>

          <Card title="2. 손해사정 요청" help={{ kind: "panel", id: "claim.request" }}>
            {c?.requestedAt && (
              <Done>
                <p>
                  {fmtTime(c.requestedAt)} · {c.requestNote}
                </p>
              </Done>
            )}
            {desk && c && !locked && (
              <AssistForm id={`claim-req-${id}`} action={claimAction} className="mt-3 space-y-3">
                <Hidden roId={id} intent="request" />
                <p className="text-sm">
                  기한 {due.requestBy}(입고 후 1영업일) {!c.requestedAt && late(due.requestBy)}
                </p>
                <TextField help="claim.requestNote" name="requestNote" required defaultValue={c.requestNote ?? ""} />
                <SubmitButton variant={c.requestedAt ? "secondary" : "primary"}>{c.requestedAt ? "요청 기록 고치기" : "손해사정 요청함"}</SubmitButton>
              </AssistForm>
            )}
            {!c && <p className="text-sm text-[var(--muted)]">1단계를 먼저 저장합니다.</p>}
          </Card>

          <Card title="3. 승인 범위 확인" help={{ kind: "panel", id: "claim.scope" }}>
            {c?.scopedAt && (
              <Done>
                <p>
                  손해사정 금액 {won(c.adjustedWon)} · 미승인 {won(a.unapproved)} 중 고객 부담 합의 {won(c.customerExtraWon)}
                </p>
                {c.scopeNote && <p>{c.scopeNote}</p>}
              </Done>
            )}
            {desk && c?.requestedAt && !locked && (
              <AssistForm id={`claim-scope-${id}`} action={claimAction} className="mt-3 space-y-3">
                <Hidden roId={id} intent="scope" />
                <p className="text-sm">
                  견적의 보험 항목 합계 <b>{won(a.insuranceWon)}</b> <span className="text-xs text-[var(--muted)]">({a.from ?? "견적 없음"}에서 불러옴)</span>
                </p>
                <div className="grid gap-3 md:grid-cols-2">
                  <NumberField help="claim.adjustedWon" name="adjustedWon" unit="원" min={0} required defaultValue={c.adjustedWon ?? a.insuranceWon} from={c.adjustedWon == null ? "견적 보험 항목" : undefined} />
                  <NumberField help="claim.customerExtraWon" name="customerExtraWon" unit="원" min={0} defaultValue={c.customerExtraWon || null} />
                </div>
                <CheckGroup help="claim.extraAgreed" name="extraAgreed" options={[{ value: "1", label: "미승인 금액 중 고객이 낼 금액을 고객에게 설명하고 합의했습니다" }]} defaultChecked={c.customerExtraWon > 0 ? ["1"] : []} />
                <TextField help="claim.scopeNote" name="scopeNote" defaultValue={c.scopeNote ?? ""} />
                <SubmitButton variant={c.scopedAt ? "secondary" : "primary"}>{c.scopedAt ? "승인 범위 고치기" : "승인 범위 저장"}</SubmitButton>
              </AssistForm>
            )}
            {c && !c.requestedAt && <p className="text-sm text-[var(--muted)]">2단계 손해사정 요청을 먼저 기록합니다.</p>}
          </Card>

          <Card title="4. 청구" help={{ kind: "panel", id: "claim.submit" }}>
            {c?.claimedAt ? (
              <Done>
                <p>
                  {fmtTime(c.claimedAt)} · 청구 {won(c.claimedWon)} · 서류 {c.docs.map((k) => CLAIM_DOCS[k as keyof typeof CLAIM_DOCS] ?? k).join(", ")}
                </p>
              </Done>
            ) : c?.status === "scoped" && r.status === "delivered" && desk ? (
              <AssistForm id={`claim-sub-${id}`} action={claimAction} className="space-y-3">
                <Hidden roId={id} intent="claim" />
                <p className="text-sm">
                  기한 {due.claimBy}(출고 후 3영업일) {late(due.claimBy)}
                </p>
                <CheckGroup help="claim.docs" name="docs" options={opts(CLAIM_DOCS)} />
                <NumberField help="claim.claimedWon" name="claimedWon" unit="원" min={1} max={a.insurerDue} required defaultValue={a.insurerDue} from="손해사정 금액 − 자기부담금" />
                <SubmitButton>청구함</SubmitButton>
              </AssistForm>
            ) : (
              <p className="text-sm text-[var(--muted)]">{!c?.scopedAt ? "3단계 승인 범위를 확인한 뒤," : ""} 출고(인수 서명)하면 청구합니다. 정비명세서가 청구 서류에 들어갑니다.</p>
            )}
          </Card>

          <Card title="5. 입금 확인" help={{ kind: "panel", id: "claim.paid" }}>
            {c?.status === "paid" ? (
              <Done>
                <p>
                  {c.paidOn} 입금 {won(c.paidWon)}
                  {c.cutWon ? ` · 감액 ${won(c.cutWon)} — ${c.cutReason}` : " · 감액 없음"}
                </p>
              </Done>
            ) : c?.status === "claimed" && money ? (
              <div className="space-y-4">
                {due.dunFrom && due.dunFrom <= today && (
                  <AssistForm id={`claim-dun-${id}`} action={claimAction} className="space-y-2 rounded-md border border-[var(--warn)] bg-[var(--warn-soft)] p-3">
                    <Hidden roId={id} intent="dun" />
                    <p className="text-sm font-medium">
                      청구 후 {DUN_DAYS}일이 지났습니다({due.dunFrom}부터). 보험사·손해사정사에 독촉합니다.
                      {c.dunnedAt && ` 마지막 독촉 ${fmtTime(c.dunnedAt)} — ${c.dunNote}`}
                    </p>
                    <TextField help="claim.dunNote" name="dunNote" required />
                    <SubmitButton variant="secondary">독촉 기록</SubmitButton>
                  </AssistForm>
                )}
                <AssistForm id={`claim-paid-${id}`} action={claimAction} className="space-y-3">
                  <Hidden roId={id} intent="paid" />
                  <div className="grid gap-3 md:grid-cols-2">
                    <DateField help="claim.paidOn" name="paidOn" required defaultValue={today} quick={["today"]} />
                    <NumberField help="claim.paidWon" name="paidWon" unit="원" min={1} max={c.claimedWon ?? undefined} required defaultValue={c.claimedWon} from="청구 금액" />
                  </div>
                  <TextField help="claim.cutReason" name="cutReason" />
                  <SubmitButton>입금 확인</SubmitButton>
                </AssistForm>
              </div>
            ) : (
              <p className="text-sm text-[var(--muted)]">{c?.status === "claimed" ? "회계 담당이 입금을 확인합니다." : "청구한 뒤에 회계 담당이 입금을 확인합니다."}</p>
            )}
          </Card>
        </div>

        <div className="space-y-4 xl:sticky xl:top-4">
          <Card title="누가 얼마를 내나" help={{ kind: "panel", id: "claim.split" }}>
            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between">
                <dt>보험 항목 합계</dt>
                <dd className="tabular-nums">{won(a.insuranceWon)}</dd>
              </div>
              <div className="flex justify-between">
                <dt>손해사정 금액</dt>
                <dd className="tabular-nums">{c?.adjustedWon != null ? won(c.adjustedWon) : <span className="text-[var(--muted)]">회신 전(보험 항목으로 봄)</span>}</dd>
              </div>
              <div className="flex justify-between border-t border-[var(--line)] pt-1.5 font-semibold">
                <dt>보험사가 낼 금액</dt>
                <dd className="tabular-nums">{won(a.insurerDue)}</dd>
              </div>
              <div className="flex justify-between font-semibold">
                <dt>고객이 낼 금액</dt>
                <dd className="tabular-nums">{won(a.customerDue)}</dd>
              </div>
              <p className="text-xs text-[var(--muted)]">
                = 일반 항목 {won(a.generalWon)} + 자기부담금 {won(c?.deductibleWon ?? 0)}
                {c?.customerExtraWon ? ` + 미승인분 합의 ${won(c.customerExtraWon)}` : ""}
                {a.customerDue > 0 && ` (${koMoney(a.customerDue)})`}
              </p>
              {a.shopLoss > 0 && <p className="rounded-md bg-[var(--warn-soft)] px-2 py-1 text-xs">보험사가 인정하지 않고 고객도 내지 않는 {won(a.shopLoss)}은 정비소 손실(감액)입니다. 연말 공임 기준표 개정 때 봅니다.</p>}
              <p className="text-xs text-[var(--muted)]">금액 출처: {a.from ?? "견적 없음"}. 자기부담금·미승인분은 출고 때 고객에게 받습니다(STD-12). 자기부담금 면제 약속은 금지입니다.</p>
            </dl>
          </Card>
        </div>
      </div>
    </div>
  );
}
