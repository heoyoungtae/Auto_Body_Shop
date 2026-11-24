import { can } from "@/modules/auth/permissions";
import Link from "next/link";
import { getDb } from "@/db/runtime";
import { freshFor } from "@/modules/platform/fresh";
import { claimView } from "@/modules/repair/claims";
import { AOS_STEPS, CLAIM_DOCS, CLAIM_STATUS_LABEL, COVERAGE_LABEL, DISPUTE_LABEL, DUN_DAYS, NOTE_KIND_LABEL, OTHER_PAYER, SETTLE_LABEL } from "@/modules/repair/claim-rules";
import { INSURER_KIND_LABEL, listInsurers, pctText } from "@/modules/repair/insurers";
import { RO_STATUS_LABEL } from "@/modules/repair/rules";
import { seoulDate } from "@/modules/platform/time";
import { AssistForm } from "../../../_assist";
import { HelpButton } from "../../../_help-drawer";
import { CheckGroup, DateField, NumberField, SelectField, TextField } from "../../../_input";
import { koMoney } from "../../../_format";
import { SubmitButton } from "../../../_submit";
import { requireUser } from "../../../_lib/session";
import { Badge, Card, ErrorBox, Notice, PageTitle, fmtTime } from "../../../_ui";
import { claimAction } from "../../claim-actions";

const opts = (o: Record<string, string>) => Object.entries(o).map(([value, label]) => ({ value, label }));
const won = (n: number | null | undefined) => (n == null ? "—" : `${n.toLocaleString("ko-KR")}원`);
const box = "h-10 w-full rounded-md border border-[var(--line-strong)] bg-[var(--surface)] px-2 text-right text-base tabular-nums outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/15";

function Hidden({ roId, intent, seq }: { roId: string; intent: string; seq: number }) {
  return (
    <>
      <input type="hidden" name="roId" value={roId} />
      <input type="hidden" name="intent" value={intent} />
      <input type="hidden" name="seq" value={seq} />
    </>
  );
}

function Done({ children }: { children: React.ReactNode }) {
  return <div className="space-y-1 rounded-md bg-[var(--accent-soft)] px-3 py-2 text-sm">{children}</div>;
}

function Row({ k, v, strong }: { k: React.ReactNode; v: React.ReactNode; strong?: boolean }) {
  return (
    <div className={`flex justify-between gap-2 ${strong ? "border-t border-[var(--line)] pt-1.5 font-semibold" : ""}`}>
      <dt>{k}</dt>
      <dd className="tabular-nums">{v}</dd>
    </div>
  );
}

/** 보험 청구(STD-03 6절): 접수 확인 → 손해사정 요청 → 승인 범위(정산) → (작업·출고) → 청구 → 입금 확인. 청구처가 여럿이면 위 탭으로 고른다 */
export default async function ClaimPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; notice?: string; c?: string }> }) {
  const [{ id }, { error, notice, c: cq }] = await Promise.all([params, searchParams]);
  const user = await requireUser();
  const db = await getDb();
  const want = Math.max(1, Number(cq) || 1);
  const v0 = await claimView(db, id, want);
  // 없는 청구처 번호면 '다음 청구처 더하기' 칸으로
  const seq = v0.claim || want === 1 ? want : v0.nextSeq;
  const v = seq === want ? v0 : await claimView(db, id, seq);
  const { ro: r, claim: c, amounts: a, due } = v;
  const desk = can(user, "claim.desk");
  const money = can(user, "claim.money");
  const today = seoulDate();
  const locked = c?.status === "claimed" || c?.status === "paid";
  const late = (d: string | null) => (d && d < today ? <Badge tone="danger">기한 지남</Badge> : null);
  const insurers = await listInsurers(db, { activeOnly: true });
  const ins = v.insurer;
  const href = (n: number) => `/repairs/${id}/claim${n > 1 ? `?c=${n}` : ""}`;
  const multi = v.claims.length > 1 || seq > 1;
  // 부품 할인 제안: 보험 부품 금액(부가세 별도) × 보험사 할인율, 부가세 포함
  const discSuggest = ins?.partsDiscountX10 ? Math.round((a.insPartsWon * ins.partsDiscountX10) / 1000 * 1.1 / 10) * 10 : null;
  const adj = c?.lineAdjust ?? {};

  const infoTitle = seq === 1 ? "1. 접수 확인" : `1. 접수 확인(${seq}번째 청구처)`;
  return (
    <div>
      <PageTitle
        help="repairs.claim" std="STD-03 6절"
        sub={
          <>
            {c ? `${c.docNo} · ` : ""}
            <Link href={`/repairs/${id}`} className="text-[var(--accent)]">
              수리 건 {r.docNo}
            </Link>{" "}
            · {RO_STATUS_LABEL[r.status]}
          </>
        }
        actions={
          <div className="flex flex-wrap gap-3">
            <Badge tone={v.status === "paid" ? "ok" : v.status === "none" ? "warn" : "accent"}>{CLAIM_STATUS_LABEL[v.status]}</Badge>
            <Link href="/money/cash" className="self-center text-sm text-[var(--accent)]">← 입출금</Link>
          </div>
        }
      >
        보험 청구
      </PageTitle>
      <ErrorBox message={error} />
      {notice && <Notice>{notice}</Notice>}

      {(multi || (desk && v.claims.length > 0)) && (
        <nav className="mt-3 flex flex-wrap items-center gap-2 text-sm" aria-label="청구처">
          {v.claims.map((x) => (
            <Link key={x.seq} href={href(x.seq)} className={`rounded-md border px-3 py-1.5 ${x.seq === seq ? "border-[var(--accent)] bg-[var(--accent-soft)] font-semibold" : "border-[var(--line)]"}`}>
              {x.seq}. {x.insurer} · {COVERAGE_LABEL[x.coverage as keyof typeof COVERAGE_LABEL] ?? x.coverage} · {CLAIM_STATUS_LABEL[x.status as keyof typeof CLAIM_STATUS_LABEL]}
            </Link>
          ))}
          {seq === v.nextSeq && v.claims.length > 0 && <span className="rounded-md border border-[var(--accent)] bg-[var(--accent-soft)] px-3 py-1.5 font-semibold">{seq}. 새 청구처</span>}
          {desk && seq !== v.nextSeq && v.claims.length > 0 && (
            <Link href={href(v.nextSeq)} className="px-2 text-[var(--accent)]">
              + 청구처 더하기(쌍방 과실)
            </Link>
          )}
          <HelpButton topic={{ kind: "panel", id: "claim.payers" }} name="청구처" />
        </nav>
      )}

      <div className="mt-4 grid gap-4 xl:grid-cols-3 xl:items-start">
        <div className="space-y-4 xl:col-span-2">
          <Card title={infoTitle} help={{ kind: "panel", id: "claim.info" }}>
            {desk && !locked ? (
              <AssistForm id={`claim-info-${id}-${seq}`} action={claimAction} fresh={c ? await freshFor(db, "claim.info", c.id) : undefined} className="space-y-3">
                <Hidden roId={id} intent="info" seq={seq} />
                <div className="grid gap-3 md:grid-cols-3">
                  <TextField
                    help="claim.insurer"
                    name="insurer"
                    required
                    defaultValue={c?.insurer ?? (seq === 1 ? (r.insurer ?? "") : "")}
                    from={!c && seq === 1 && r.insurer ? "상담·수리 건" : undefined}
                    suggestions={insurers.map((x) => ({ value: x.name, label: `${x.name} (${INSURER_KIND_LABEL[x.kind]})` }))}
                  />
                  <TextField help="claim.claimNo" name="claimNo" required defaultValue={c?.claimNo ?? (seq === 1 ? (r.claimNo ?? "") : "")} from={!c && seq === 1 && r.claimNo ? "상담·수리 건" : undefined} />
                  <SelectField
                    help="claim.coverage"
                    name="coverage"
                    required
                    defaultValue={c?.coverage ?? (seq === 1 && (r.insurance === "own" || r.insurance === "other") ? r.insurance : seq > 1 ? (v.claims[0]?.coverage === "own" ? "other" : "own") : "")}
                    placeholder="고르기"
                    options={opts(COVERAGE_LABEL)}
                    from={!c ? (seq === 1 ? "상담·수리 건" : "첫 청구처의 반대") : undefined}
                  />
                </div>
                <div className="grid gap-3 md:grid-cols-4">
                  <NumberField help="claim.deductibleWon" name="deductibleWon" unit="원" min={0} required defaultValue={c?.deductibleWon ?? null} />
                  <NumberField help="claim.faultPct" name="faultPct" unit="%" min={0} max={100} defaultValue={c?.faultPct ?? null} />
                  <TextField help="claim.adjusterName" name="adjusterName" defaultValue={c?.adjusterName ?? ins?.contacts[0]?.name ?? ""} from={!c?.adjusterName && ins?.contacts[0] ? "보험사 목록" : undefined} />
                  <TextField help="claim.adjusterPhone" name="adjusterPhone" inputMode="tel" defaultValue={c?.adjusterPhone ?? ins?.contacts[0]?.phone ?? ""} from={!c?.adjusterPhone && ins?.contacts[0]?.phone ? "보험사 목록" : undefined} />
                </div>
                {ins && ins.contacts.length > 1 && (
                  <p className="text-xs text-[var(--muted)]">
                    {ins.name} 담당자: {ins.contacts.map((x) => `${x.name}${x.role ? `(${x.role})` : ""} ${x.phone ?? ""}`).join(" · ")}
                  </p>
                )}
                <SubmitButton>{c ? "접수 정보 고치기" : seq > 1 ? "청구처 더하기" : "접수 정보 저장"}</SubmitButton>
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
              <AssistForm id={`claim-req-${id}-${seq}`} action={claimAction} className="mt-3 space-y-3">
                <Hidden roId={id} intent="request" seq={seq} />
                <p className="text-sm">
                  기한 {due.requestBy}(입고 후 1영업일) {!c.requestedAt && late(due.requestBy)}
                </p>
                <TextField help="claim.requestNote" name="requestNote" required defaultValue={c.requestNote ?? ""} />
                <SubmitButton variant={c.requestedAt ? "secondary" : "primary"}>{c.requestedAt ? "요청 기록 고치기" : "손해사정 요청함"}</SubmitButton>
              </AssistForm>
            )}
            {!c && <p className="text-sm text-[var(--muted)]">1단계를 먼저 저장합니다.</p>}
          </Card>

          <Card title="3. 승인 범위 확인(정산)" help={{ kind: "panel", id: "claim.scope" }}>
            {c?.scopedAt && (
              <Done>
                <p>
                  손해사정 금액 {won(c.adjustedWon)} · 미승인 {won(a.unapproved)} 중 고객 부담 합의 {won(c.customerExtraWon)} · 결과 <b>{DISPUTE_LABEL[c.dispute as keyof typeof DISPUTE_LABEL] ?? c.dispute}</b>
                </p>
                {(c.depreciationWon > 0 || c.partsDiscountWon > 0 || c.salvageWon > 0 || c.otherDeductWon > 0) && (
                  <p>
                    공제: 감가상각 {won(c.depreciationWon)} · 부품 할인 {won(c.partsDiscountWon)} · 잔존물 {won(c.salvageWon)}
                    {c.otherDeductWon > 0 && ` · 기타 ${won(c.otherDeductWon)}(${c.otherDeductNote}, ${OTHER_PAYER[c.otherDeductPayer as keyof typeof OTHER_PAYER]})`}
                  </p>
                )}
                {c.scopeNote && <p>{c.scopeNote}</p>}
                {c.dispute === "disputed" && c.disputeNote && (
                  <p className="rounded-md bg-[var(--warn-soft)] px-2 py-1">
                    이의 제기({c.disputedAt ? fmtTime(c.disputedAt) : ""}): {c.disputeNote}
                  </p>
                )}
              </Done>
            )}
            {desk && c?.requestedAt && !locked && (
              <AssistForm id={`claim-scope-${id}-${seq}`} action={claimAction} className="mt-3 space-y-3">
                <Hidden roId={id} intent="scope" seq={seq} />
                <p className="text-sm">
                  견적의 보험 항목 합계 <b>{won(a.insuranceWon)}</b> <span className="text-xs text-[var(--muted)]">({a.from ?? "견적 없음"}에서 불러옴)</span>
                </p>
                {a.insLines.length > 0 && (
                  <details className="rounded-md border border-[var(--line)] p-2" open={Object.keys(adj).length > 0}>
                    <summary className="cursor-pointer text-sm font-medium">줄마다 보험사 인정 금액 적기(깎인 줄만, 부가세 별도)</summary>
                    <div className="mt-2 overflow-x-auto">
                      <table className="w-full min-w-[40rem] text-sm">
                        <thead className="text-left text-xs text-[var(--muted)]">
                          <tr>
                            <th className="py-1 pr-2 font-medium">항목</th>
                            <th className="w-32 py-1 pr-2 text-right font-medium">우리 견적</th>
                            <th className="w-40 py-1 pr-2 font-medium">
                              <span className="inline-flex items-center gap-1">
                                보험사 인정 <HelpButton topic={{ kind: "field", id: "claim.lineAdjust" }} name="보험사 인정" />
                              </span>
                            </th>
                            <th className="py-1 pr-2 font-medium">
                              <span className="inline-flex items-center gap-1">
                                깎인 이유 <HelpButton topic={{ kind: "field", id: "claim.lineAdjustNote" }} name="깎인 이유" />
                              </span>
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {a.insLines.map((l) => (
                            <tr key={l.id}>
                              <td className="py-1 pr-2">{l.name}</td>
                              <td className="py-1 pr-2 text-right tabular-nums">{l.amount.toLocaleString("ko-KR")}</td>
                              <td className="py-1 pr-2">
                                <input data-assist="grid" aria-label={`${l.name} 보험사 인정 금액`} name={`adj:${l.id}`} inputMode="numeric" defaultValue={adj[l.id]?.won ?? ""} placeholder="전액" className={box} />
                              </td>
                              <td className="py-1 pr-2">
                                <input data-assist="grid" aria-label={`${l.name} 깎인 이유`} name={`adjNote:${l.id}`} defaultValue={adj[l.id]?.note ?? ""} className={box.replace("text-right ", "")} />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p className="mt-1 text-xs text-[var(--muted)]">줄을 적고 아래 손해사정 금액 칸을 비우면, 깎인 금액에 부가세를 더해 손해사정 금액을 계산합니다.</p>
                  </details>
                )}
                <div className="grid gap-3 md:grid-cols-2">
                  <NumberField help="claim.adjustedWon" name="adjustedWon" unit="원" min={0} defaultValue={c.adjustedWon ?? (multi ? null : a.insuranceWon)} from={c.adjustedWon == null && !multi ? "견적 보험 항목" : undefined} />
                  <NumberField help="claim.customerExtraWon" name="customerExtraWon" unit="원" min={0} defaultValue={c.customerExtraWon || null} />
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                  <NumberField help="claim.depreciationWon" name="depreciationWon" unit="원" min={0} defaultValue={c.depreciationWon || null} />
                  <NumberField help="claim.partsDiscountWon" name="partsDiscountWon" unit="원" min={0} defaultValue={c.scopedAt ? c.partsDiscountWon || null : discSuggest} from={!c.scopedAt && discSuggest ? `${ins?.name} 할인율 ${pctText(ins?.partsDiscountX10)}%` : undefined} />
                  <NumberField help="claim.salvageWon" name="salvageWon" unit="원" min={0} defaultValue={c.salvageWon || null} />
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                  <NumberField help="claim.otherDeductWon" name="otherDeductWon" unit="원" min={0} defaultValue={c.otherDeductWon || null} />
                  <SelectField help="claim.otherDeductPayer" name="otherDeductPayer" defaultValue={c.otherDeductPayer} options={opts(OTHER_PAYER)} />
                  <TextField help="claim.otherDeductNote" name="otherDeductNote" defaultValue={c.otherDeductNote ?? ""} />
                </div>
                <CheckGroup help="claim.extraAgreed" name="extraAgreed" options={[{ value: "1", label: "고객이 낼 금액(미승인분 합의·감가상각)을 고객에게 설명하고 합의했습니다" }]} defaultChecked={c.customerExtraWon > 0 || c.depreciationWon > 0 ? ["1"] : []} />
                <TextField help="claim.scopeNote" name="scopeNote" defaultValue={c.scopeNote ?? ""} />
                <div className="grid gap-3 md:grid-cols-3">
                  <SelectField help="claim.dispute" name="dispute" defaultValue={c.dispute === "disputed" ? "disputed" : "agreed"} options={[{ value: "agreed", label: "동의" }, { value: "disputed", label: "이의 제기" }]} />
                  <div className="md:col-span-2">
                    <TextField help="claim.disputeNote" name="disputeNote" defaultValue={c.disputeNote ?? ""} />
                  </div>
                </div>
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
            ) : c?.status === "scoped" && c.dispute === "disputed" ? (
              <p className="text-sm text-[var(--muted)]">손해사정에 이의 제기 중입니다. 보험사 답을 받아 3단계에서 &lsquo;동의&rsquo;로 고친 뒤 청구합니다.</p>
            ) : c?.status === "scoped" && r.status === "delivered" && desk ? (
              <AssistForm id={`claim-sub-${id}-${seq}`} action={claimAction} className="space-y-3">
                <Hidden roId={id} intent="claim" seq={seq} />
                <p className="text-sm">
                  기한 {due.claimBy}(출고 후 3영업일) {late(due.claimBy)}
                </p>
                <CheckGroup help="claim.docs" name="docs" options={opts(CLAIM_DOCS)} />
                <NumberField help="claim.claimedWon" name="claimedWon" unit="원" min={1} max={a.insurerDue} required defaultValue={a.insurerDue} from="손해사정 금액 − 자기부담금 − 공제" />
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
                  <AssistForm id={`claim-dun-${id}-${seq}`} action={claimAction} className="space-y-2 rounded-md border border-[var(--warn)] bg-[var(--warn-soft)] p-3">
                    <Hidden roId={id} intent="dun" seq={seq} />
                    <p className="text-sm font-medium">
                      청구 후 {DUN_DAYS}일이 지났습니다({due.dunFrom}부터). 보험사·손해사정사에 독촉합니다.
                      {c.dunnedAt && ` 마지막 독촉 ${fmtTime(c.dunnedAt)} — ${c.dunNote}`}
                    </p>
                    <TextField help="claim.dunNote" name="dunNote" required />
                    <SubmitButton variant="secondary">독촉 기록</SubmitButton>
                  </AssistForm>
                )}
                <AssistForm id={`claim-paid-${id}-${seq}`} action={claimAction} className="space-y-3">
                  <Hidden roId={id} intent="paid" seq={seq} />
                  <div className="grid gap-3 md:grid-cols-2">
                    <DateField help="claim.paidOn" name="paidOn" required defaultValue={today} quick={["today"]} />
                    <NumberField help="claim.paidWon" name="paidWon" unit="원" min={1} max={c.claimedWon ?? undefined} required defaultValue={c.claimedWon} from="청구 금액" />
                  </div>
                  <TextField help="claim.cutReason" name="cutReason" />
                  <SubmitButton>입금 확인</SubmitButton>
                </AssistForm>
                <p className="text-xs text-[var(--muted)]">
                  AOS 보험금 지급 조회 엑셀이 있으면{" "}
                  <Link href="/claims/aos-paid" className="text-[var(--accent)]">
                    한꺼번에 맞추기
                  </Link>
                  로 여러 건을 같이 확인할 수 있습니다.
                </p>
              </div>
            ) : (
              <p className="text-sm text-[var(--muted)]">{c?.status === "claimed" ? "회계 담당이 입금을 확인합니다." : "청구한 뒤에 회계 담당이 입금을 확인합니다."}</p>
            )}
          </Card>

          {c && (
            <Card title="6. 연락 기록(미결 관리)" help={{ kind: "panel", id: "claim.notes" }}>
              {(desk || money) && c.status !== "paid" && (
                <AssistForm id={`claim-note-${id}-${seq}`} action={claimAction} className="mb-3 space-y-3">
                  <Hidden roId={id} intent="note" seq={seq} />
                  <div className="grid gap-3 md:grid-cols-4">
                    <SelectField help="claim.noteKind" name="kind" required defaultValue="memo" options={[{ value: "memo", label: NOTE_KIND_LABEL.memo }, { value: "reply", label: NOTE_KIND_LABEL.reply }, { value: "agreed", label: SETTLE_LABEL.agreed }, { value: "disagreed", label: SETTLE_LABEL.disagreed }]} />
                    <div className="md:col-span-3">
                      <TextField help="claim.note" name="note" required />
                    </div>
                  </div>
                  <SubmitButton variant="secondary">기록 남기기</SubmitButton>
                </AssistForm>
              )}
              {c.settle && (
                <p className="mb-2 text-sm">
                  미결 결과: <Badge tone={c.settle === "agreed" ? "ok" : "warn"}>{SETTLE_LABEL[c.settle as keyof typeof SETTLE_LABEL]}</Badge>
                </p>
              )}
              {v.notes.length ? (
                <ul className="space-y-1 text-sm">
                  {v.notes.map((n) => (
                    <li key={n.id} className="flex flex-wrap gap-x-2">
                      <span className="text-[var(--muted)] tabular-nums">{fmtTime(n.at)}</span>
                      <Badge>{NOTE_KIND_LABEL[n.kind as keyof typeof NOTE_KIND_LABEL] ?? n.kind}</Badge>
                      <span>{n.note}</span>
                      {n.byName && <span className="text-[var(--muted)]">· {n.byName}</span>}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-[var(--muted)]">아직 기록이 없습니다. 보험사·손해사정사와 주고받은 것을 여기에 남깁니다.</p>
              )}
            </Card>
          )}
        </div>

        <div className="space-y-4 xl:sticky xl:top-[4.5rem]">
          <Card title="누가 얼마를 내나" help={{ kind: "panel", id: "claim.split" }}>
            <dl className="space-y-1.5 text-sm">
              <Row k="보험 항목 합계" v={won(a.insuranceWon)} />
              {v.claims.length > 1 ? (
                v.claims.map((x) => <Row key={x.seq} k={`${x.insurer} 사정 금액`} v={x.adjustedWon != null ? won(x.adjustedWon) : <span className="text-[var(--muted)]">회신 전(어림 {won(x.adjustedEst)})</span>} />)
              ) : (
                <Row k="손해사정 금액" v={c?.adjustedWon != null ? won(c.adjustedWon) : <span className="text-[var(--muted)]">회신 전(보험 항목으로 봄)</span>} />
              )}
              {v.claims.length > 1 ? (
                v.claims.map((x, i) => <Row key={`d${x.seq}`} strong={i === 0} k={`${x.insurer}가 낼 금액`} v={won(x.insurerDue)} />)
              ) : (
                <Row strong k="보험사가 낼 금액" v={won(a.insurerDueTotal)} />
              )}
              <Row k={<b>고객이 낼 금액</b>} v={<b>{won(a.customerDue)}</b>} />
              <p className="text-xs text-[var(--muted)]">
                = 일반 항목 {won(a.generalWon)} + 자기부담금 {won(a.deductibleTotal)}
                {a.depreciationTotal > 0 && ` + 감가상각 ${won(a.depreciationTotal)}`}
                {a.extraTotal > 0 && ` + 미승인분 합의 ${won(a.extraTotal)}`}
                {a.customerDue > 0 && ` (${koMoney(a.customerDue)})`}
              </p>
              {a.shopDeduct > 0 && <p className="rounded-md bg-[var(--surface-2)] px-2 py-1 text-xs">부품 할인·잔존물 등 {won(a.shopDeduct)}은 공업사가 떠안는 공제입니다.</p>}
              {a.shopLoss > 0 && <p className="rounded-md bg-[var(--warn-soft)] px-2 py-1 text-xs">보험사가 인정하지 않고 고객도 내지 않는 {won(a.shopLoss)}은 공업사 손실(감액)입니다. 연말 공임 기준표 개정 때 봅니다.</p>}
              <p className="text-xs text-[var(--muted)]">금액 출처: {a.from ?? "견적 없음"}. 자기부담금·감가상각·미승인분은 출고 때 고객에게 받습니다(STD-12). 자기부담금 면제 약속은 금지입니다.</p>
            </dl>
          </Card>

          {ins && (
            <Card title={`${ins.name} 정보`} help={{ kind: "panel", id: "claim.insurerInfo" }}>
              <dl className="space-y-1 text-sm">
                <Row k="시간당 공임(계약)" v={ins.rateWon ? won(ins.rateWon) : <span className="text-[var(--muted)]">공임 기준표 값</span>} />
                <Row k="부품 할인율" v={ins.partsDiscountX10 != null ? `${pctText(ins.partsDiscountX10)}%` : "—"} />
                {ins.contacts.map((x, i) => (
                  <Row key={i} k={`${x.name}${x.role ? `(${x.role})` : ""}`} v={x.phone ?? x.email ?? ""} />
                ))}
              </dl>
              <Link href="/settings/insurers" className="mt-2 inline-block text-xs text-[var(--accent)]">
                보험사 목록 고치기
              </Link>
            </Card>
          )}

          <Card title="사진 한 번에 내려받기" help={{ kind: "panel", id: "claim.photos" }}>
            <p className="text-sm text-[var(--muted)]">입고·진단·작업 사진을 찍은 차례와 부위 이름을 붙여 한 파일(zip)로 받습니다. AOS 사진 등록 화면이나 보험사 메일에 그대로 끌어다 놓습니다.</p>
            <a href={`/repairs/${id}/photos`} className="mt-2 inline-block text-sm text-[var(--accent)]" download>
              사진 내려받기(zip)
            </a>
          </Card>

          {v.aos && c && (
            <Card title="AOS 진행" help={{ kind: "panel", id: "claim.aos" }}>
              <ul className="space-y-2 text-sm">
                {(Object.keys(AOS_STEPS) as (keyof typeof AOS_STEPS)[]).map((k) => {
                  const at = c.aos[k];
                  return (
                    <li key={k} className="flex items-center justify-between gap-2">
                      <span>
                        {AOS_STEPS[k]} {at ? <Badge tone="ok">{fmtTime(at)}</Badge> : <Badge>아직</Badge>}
                      </span>
                      {desk && (
                        <form action={claimAction}>
                          <Hidden roId={id} intent="aos" seq={seq} />
                          <input type="hidden" name="step" value={k} />
                          <input type="hidden" name="done" value={at ? "0" : "1"} />
                          <SubmitButton variant="secondary">{at ? "지우기" : "했음"}</SubmitButton>
                        </form>
                      )}
                    </li>
                  );
                })}
              </ul>
              <p className="mt-2 text-xs text-[var(--muted)]">기록하지 않아도 앱의 다른 일은 막히지 않습니다. 할 일에 알림만 뜹니다.</p>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
