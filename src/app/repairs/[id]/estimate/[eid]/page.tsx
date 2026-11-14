import { can } from "@/modules/auth/permissions";
import Link from "next/link";
import { getDb } from "@/db/runtime";
import { resolveApprover } from "@/modules/platform/delegation";
import { rolesOf } from "@/modules/approval/line";
import { ROLE_LABEL } from "@/modules/auth/roles";
import { loadShopInfo, shopMissing } from "@/modules/platform/shop";
import { getEstimate } from "@/modules/repair/estimate";
import { listDamage, listDamagePhotos } from "@/modules/repair/service";
import { EstimateMap } from "../../../estimate-map";
import { carOf } from "@/modules/repair/body-map";
import { ESTIMATE_KIND, ESTIMATE_STATUS_LABEL, estimateIssues, LINE_CATEGORIES, PART_CODES, totals } from "@/modules/repair/estimate-rules";
import { fmtMinutes, gradeWon, laborWon, lineNameOf, PAINT_GRADES, usesGradeCoef, type PaintGrade } from "@/modules/repair/labor";
import { laborCatalog, loadLabor } from "@/modules/repair/labor-store";
import { LaborPick, type PickCoef, type PickItem } from "../../../labor-pick";
import { AssistForm } from "../../../../_assist";
import { DateField, NumberField, SelectField, TextAreaField, TextField } from "../../../../_input";
import { koMoney } from "../../../../_format";
import { SubmitButton } from "../../../../_submit";
import { requireUser } from "../../../../_lib/session";
import { Badge, buttonClass, Card, ErrorBox, Notice, PageTitle, fmtTime } from "../../../../_ui";
import { estimateAction } from "../../../actions";
import { SignaturePad } from "../../../signature-pad";
import { approvalMethodLabel } from "@/modules/repair/estimate-approval";
import { approvalGroups } from "@/modules/repair/estimate-rules";
import { seoulDate } from "@/modules/platform/time";
import { AmountChecklist } from "../../../../_input";

type Est = Awaited<ReturnType<typeof getEstimate>>;

function groupOptions(lines: Est["lines"]) {
  return approvalGroups(lines).map((g) => ({ value: g.key, label: g.names.length > 1 ? `${g.names[0]} 외 ${g.names.length - 1}건` : g.names[0], sub: g.names.length > 1 ? g.names.join(" · ") : undefined, amount: g.sum }));
}

/** 고객 승인(STD-03 5절): 링크 보내기·매장 서명·보험사 회신, 받은 뒤에는 기록 */
function Approval({ e, roId, canWrite, today }: { e: Est; roId: string; canWrite: boolean; today: string }) {
  const answered = e.status === "accepted" || e.status === "partial" || e.status === "declined";
  if (answered) {
    const ok = totals(e.lines, true);
    return (
      <div className="space-y-2 text-sm">
        <p>
          <Badge tone={e.status === "declined" ? "danger" : e.status === "partial" ? "warn" : "ok"}>{ESTIMATE_STATUS_LABEL[e.status]}</Badge> {e.approvedAt && fmtTime(e.approvedAt)}
        </p>
        <p>
          {approvalMethodLabel(e.approvalMethod)} · 승인자 <b>{e.approverName}</b>
        </p>
        <p className="text-xs text-[var(--muted)]">본인 확인: {e.approvalRef}</p>
        <ul className="space-y-0.5">
          {approvalGroups(e.lines).map((g) => (
            <li key={g.key} className={g.approved ? "" : "text-[var(--muted)] line-through"}>
              {g.approved ? "✓" : "✗"} {g.names.join(" · ")} <span className="tabular-nums">{won(g.sum)}원</span>
            </li>
          ))}
        </ul>
        <p className="font-semibold">승인 금액 {won(ok.total)}원(부가세 포함)</p>
        {e.approvalSignature && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/api/files/${e.approvalSignature}`} alt="고객 서명" className="h-20 rounded border border-[var(--line)] bg-white" />
        )}
      </div>
    );
  }
  if (e.status !== "sent") return null;
  const expired = !!e.validUntil && e.validUntil < today;
  if (expired) return <p className="text-sm text-[var(--danger)]">유효기간({e.validUntil})이 지나 승인을 받을 수 없습니다. 고객이 원하면 수리 건에서 새 차수로 다시 견적합니다.</p>;
  if (!canWrite) return <p className="text-sm text-[var(--muted)]">상담원이 고객 승인을 받습니다.</p>;
  const opts = groupOptions(e.lines);
  return (
    <div className="space-y-3 text-sm">
      <p className="text-[var(--muted)]">전화로만 받은 승인은 인정하지 않습니다. 링크나 서명으로 받습니다.</p>
      <form action={estimateAction} className="space-y-1">
        <Hidden roId={roId} id={e.id} intent="sendLink" />
        {e.approvalSentAt && (
          <p>
            {e.approvalSentOk ? "링크 보냄" : "⚠ 링크 발송 실패"} {fmtTime(e.approvalSentAt)} — 다시 보내면 앞 링크는 닫힙니다
          </p>
        )}
        <SubmitButton variant={e.approvalSentAt ? "secondary" : "primary"}>{e.approvalSentAt ? "승인 링크 다시 보내기" : "승인 링크 보내기(문자·알림톡)"}</SubmitButton>
      </form>
      <details>
        <summary className="cursor-pointer font-semibold text-[var(--accent)]">매장에서 서명 받기</summary>
        <AssistForm id={`est-store-${e.id}`} action={estimateAction} className="mt-2 space-y-3">
          <Hidden roId={roId} id={e.id} intent="store" />
          <AmountChecklist help="approve.groups" name="groups" totalLabel="고른 작업(부가세 별도)" options={opts} />
          <TextField help="approve.name" name="approverName" required defaultValue={e.customer.name} from="고객 기록" />
          <SignaturePad hint="고객이 이 칸에 서명합니다(태블릿을 건네 주세요)" />
          <SubmitButton>승인 기록</SubmitButton>
        </AssistForm>
      </details>
      {e.kind === "insurance" && (
        <details>
          <summary className="cursor-pointer font-semibold text-[var(--accent)]">보험사 회신 기록</summary>
          <AssistForm id={`est-ins-${e.id}`} action={estimateAction} className="mt-2 space-y-3">
            <Hidden roId={roId} id={e.id} intent="insurer" />
            <AmountChecklist help="approve.groups" name="groups" totalLabel="보험사가 인정한 작업(부가세 별도)" options={opts} />
            <TextField help="approve.insurerName" name="approverName" required />
            <TextField help="approve.insurerRef" name="insurerRef" required />
            <SubmitButton>회신 기록</SubmitButton>
          </AssistForm>
        </details>
      )}
    </div>
  );
}

const opts = (o: Record<string, string>) => Object.entries(o).map(([value, label]) => ({ value, label }));
const won = (n: number) => n.toLocaleString("ko-KR");
type Line = Awaited<ReturnType<typeof getEstimate>>["lines"][number];

function Hidden({ roId, id, intent }: { roId: string; id: string; intent: string }) {
  return (
    <>
      <input type="hidden" name="roId" value={roId} />
      <input type="hidden" name="estimateId" value={id} />
      <input type="hidden" name="intent" value={intent} />
    </>
  );
}

/** 견적 줄 고르기 목록: 숨긴 항목은 빼고(이미 그 항목인 줄은 보이게), 금액은 지금 도장 등급으로 */
async function pickList(db: Awaited<ReturnType<typeof getDb>>, grade: PaintGrade): Promise<Pick> {
  const [all, t] = await Promise.all([laborCatalog(db), loadLabor(db)]);
  const items = all
    .filter((d) => d.cat)
    .map((d) => {
      const v = t[d.code];
      const minutes = d.kind === "hours" ? v : null;
      const amount = d.kind === "hours" ? laborWon(v, t) : usesGradeCoef(d.code) ? gradeWon(v, grade, t) : v;
      return { code: d.code, label: `${d.section} › ${d.name} — ${minutes != null ? `${fmtMinutes(minutes)} · ` : ""}${amount.toLocaleString("ko-KR")}원`, name: lineNameOf(d), cat: d.cat!, minutes, won: amount, hiddenOnly: d.hidden };
    });
  const coefs = all.filter((d) => d.kind === "pct" && d.code.startsWith("PDR-") && !d.hidden).map((d) => ({ code: d.code, name: d.name, pct: t[d.code] }));
  return { items, coefs, rate: t.RATE };
}

type Pick = { items: PickItem[]; coefs: PickCoef[]; rate: number };

function LineFields({ l, kind, pick }: { l?: Line; kind: string; pick: Pick }) {
  return (
    <div className="space-y-3">
      {l?.category !== "part" && <LaborPick items={pick.items.filter((i) => !i.hiddenOnly || i.code === l?.laborCode)} coefs={pick.coefs} rate={pick.rate} current={l?.laborCode} />}
      <div className="grid gap-3 md:grid-cols-3">
        <SelectField help="est.payer" name="payer" defaultValue={l?.payer ?? kind} options={opts(ESTIMATE_KIND)} />
        <SelectField help="est.category" name="category" required defaultValue={l?.category ?? ""} placeholder="고르기" options={opts(LINE_CATEGORIES)} />
        <TextField help="est.name" name="name" required defaultValue={l?.name ?? ""} />
      </div>
      <div className="grid gap-3 md:grid-cols-4">
        <SelectField help="est.partCode" name="partCode" defaultValue={l?.partCode ?? ""} placeholder="부품일 때만" options={opts(PART_CODES)} />
        <TextField help="est.partNo" name="partNo" defaultValue={l?.partNo ?? ""} />
        <NumberField help="est.qty" name="qty" unit="개" min={1} max={99} defaultValue={l?.qty ?? 1} />
        <NumberField help="est.unitWon" name="unitWon" unit="원" min={0} defaultValue={l?.unitWon ?? null} />
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <NumberField help="est.laborMinutes" name="laborMinutes" unit="분" min={0} max={6000} defaultValue={l?.laborMinutes || null} />
        <NumberField help="est.laborWon" name="laborWon" unit="원" min={0} defaultValue={l?.laborWon || null} />
        <TextField help="est.lineNote" name="lineNote" defaultValue={l?.note ?? ""} />
      </div>
    </div>
  );
}

export default async function EstimatePage({ params, searchParams }: { params: Promise<{ id: string; eid: string }>; searchParams: Promise<{ error?: string; notice?: string }> }) {
  const [{ id: roId, eid }, { error, notice }] = await Promise.all([params, searchParams]);
  const user = await requireUser();
  const db = await getDb();
  const e = await getEstimate(db, eid);
  const shop = await loadShopInfo(db);
  const [damages, damagePhotos] = await Promise.all([listDamage(db, e.repairOrderId), listDamagePhotos(db, e.repairOrderId)]);
  const canWrite = can(user, "estimate.write");
  const draft = e.status === "draft" && canWrite;
  const t = totals(e.lines);
  const issues = estimateIssues(e.lines, { registeredOn: e.vehicle.registeredOn, mileage: e.ro.mileage });
  const reviewer = await resolveApprover(db, "estimate", e.totalWon, e.createdBy ? await rolesOf(db, e.createdBy) : []);
  const canReview = e.status === "review" && (user.roles.includes(reviewer) || user.roles.includes("owner"));
  const missingShop = shopMissing(shop);
  const pick = draft ? await pickList(db, e.paintGrade as PaintGrade) : { items: [], coefs: [], rate: 0 };
  const v = e.vehicle;
  const today = seoulDate();

  return (
    <div>
      <PageTitle
        help="repairs.estimate" std="F-03-02 · 별지 제89호의3"
        sub={
          <>
            {e.rev}차 견적 · 작성 {e.writer ?? "—"} ·{" "}
            <Link href={`/repairs/${roId}`} className="text-[var(--accent)]">
              수리 건 {e.ro.docNo}
            </Link>
            의 진단에서 불러옴
          </>
        }
        actions={
          <>
            <Badge tone={e.status === "draft" ? "warn" : e.status === "sent" ? "ok" : "accent"}>{ESTIMATE_STATUS_LABEL[e.status]}</Badge>
            {(e.status === "sent" || e.status === "accepted" || e.status === "partial") && (
              <Link href={`/repairs/${roId}/estimate/${eid}/print`} className={buttonClass()} target="_blank">
                견적서 인쇄
              </Link>
            )}
          </>
        }
      >
        견적 {e.docNo}
      </PageTitle>
      <ErrorBox message={error} />
      {notice && <Notice>{notice}</Notice>}
      <p className="mt-3 text-sm">
        {e.customer.name} · <b>{v.plateNo}</b> {[v.maker, v.model, v.generation].filter(Boolean).join(" ")} · 주행 {e.ro.mileage != null ? `${won(e.ro.mileage)}km` : "—"} · 차대번호 {v.vin ?? "—"}
      </p>

      <div className="mt-4 grid gap-4 xl:grid-cols-3 xl:items-start">
        <div className="space-y-4 xl:col-span-2">
          <Card title="견적 머리" help={{ kind: "panel", id: "est.header" }}>
            {draft ? (
              <AssistForm id={`est-h-${eid}`} action={estimateAction} className="space-y-3">
                <Hidden roId={roId} id={eid} intent="header" />
                <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-4">
                  <SelectField help="est.kind" name="kind" defaultValue={e.kind} options={opts(ESTIMATE_KIND)} from={`수리 건 ${e.ro.docNo}`} />
                  <SelectField help="est.paintGrade" name="paintGrade" defaultValue={e.paintGrade} options={opts(PAINT_GRADES)} />
                  <DateField help="est.registeredOn" name="registeredOn" defaultValue={v.registeredOn ?? ""} from={v.registeredOn ? "차량 기록" : undefined} quick={[]} required />
                  <DateField help="est.dueDate" name="dueDate" defaultValue={e.dueDate ?? ""} quick={["tomorrow", "week"]} />
                </div>
                <TextAreaField help="est.note" name="note" rows={2} defaultValue={e.note ?? undefined} />
                <SubmitButton variant="secondary">머리 저장</SubmitButton>
              </AssistForm>
            ) : (
              <dl className="grid gap-1 text-sm sm:grid-cols-2">
                <div>견적구분: {ESTIMATE_KIND[e.kind as keyof typeof ESTIMATE_KIND]}</div>
                <div>도장 등급: {PAINT_GRADES[e.paintGrade as keyof typeof PAINT_GRADES]}</div>
                <div>등록년월일: {v.registeredOn ?? "—"}</div>
                <div>출고 예정: {e.dueDate ?? "—"}</div>
                {e.note && <div className="sm:col-span-2 whitespace-pre-line">메모: {e.note}</div>}
              </dl>
            )}
          </Card>

          <Card title="견적 내용" help={{ kind: "panel", id: "est.lines" }}>
            <EstimateMap damages={damages} photos={damagePhotos} scope={`est-lines-${e.id}`} car={carOf(e.vehicle)} />
            <div className="overflow-x-auto" id={`est-lines-${e.id}`}>
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-[var(--muted)]">
                  <tr>
                    <th className="py-1.5 pr-2 font-medium">구분</th>
                    <th className="py-1.5 pr-2 font-medium">항목</th>
                    <th className="py-1.5 pr-2 font-medium">코드</th>
                    <th className="py-1.5 pr-2 text-right font-medium">수량</th>
                    <th className="py-1.5 pr-2 text-right font-medium">단가</th>
                    <th className="py-1.5 pr-2 text-right font-medium">부품 계</th>
                    <th className="py-1.5 pr-2 text-right font-medium">공임</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--line)]">
                  {e.lines.map((l) => (
                    <tr key={l.id} className="align-top transition-colors" data-damage={l.damageId ?? undefined}>
                      <td className="py-1.5 pr-2 whitespace-nowrap">{ESTIMATE_KIND[l.payer as keyof typeof ESTIMATE_KIND]}</td>
                      <td className="py-1.5 pr-2">
                        {draft ? (
                          <details>
                            <summary className="cursor-pointer">
                              {l.name} <span className="text-xs text-[var(--muted)]">{LINE_CATEGORIES[l.category as keyof typeof LINE_CATEGORIES]}</span>
                            </summary>
                            <AssistForm id={`est-l-${l.id}`} action={estimateAction} className="mt-2 space-y-3 rounded-md border border-[var(--line)] p-3">
                              <Hidden roId={roId} id={eid} intent="line" />
                              <input type="hidden" name="lineId" value={l.id} />
                              <LineFields l={l} kind={e.kind} pick={pick} />
                              <SubmitButton>이 항목 저장</SubmitButton>
                            </AssistForm>
                            <form action={estimateAction} className="mt-1">
                              <Hidden roId={roId} id={eid} intent="removeLine" />
                              <input type="hidden" name="lineId" value={l.id} />
                              <SubmitButton variant="danger">이 항목 지우기</SubmitButton>
                            </form>
                          </details>
                        ) : (
                          <>
                            {l.name} <span className="text-xs text-[var(--muted)]">{LINE_CATEGORIES[l.category as keyof typeof LINE_CATEGORIES]}</span>
                          </>
                        )}
                        {l.partNo && <span className="block text-xs text-[var(--muted)]">부품번호 {l.partNo}</span>}
                      </td>
                      <td className="py-1.5 pr-2">{l.partCode}</td>
                      <td className="py-1.5 pr-2 text-right tabular-nums">{l.category === "part" ? l.qty : ""}</td>
                      <td className={`py-1.5 pr-2 text-right tabular-nums ${l.category === "part" && !l.unitWon ? "text-[var(--danger)]" : ""}`}>{l.category === "part" ? (l.unitWon ? won(l.unitWon) : "단가 없음") : ""}</td>
                      <td className="py-1.5 pr-2 text-right tabular-nums">{l.category === "part" ? won(l.qty * l.unitWon) : ""}</td>
                      <td className="py-1.5 pr-2 text-right tabular-nums">
                        {l.category === "part" ? "" : won(l.laborWon)}
                        {l.laborMinutes > 0 && <span className="block text-xs text-[var(--muted)]">{fmtMinutes(l.laborMinutes)}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t-2 border-[var(--line-strong)] text-sm">
                  <tr>
                    <td colSpan={5} className="py-1.5 pr-2 text-right">부품 · 공임</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">{won(t.parts)}</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">{won(t.labor)}</td>
                  </tr>
                  <tr>
                    <td colSpan={6} className="py-1 pr-2 text-right">계</td>
                    <td className="py-1 pr-2 text-right tabular-nums">{won(t.sum)}</td>
                  </tr>
                  <tr>
                    <td colSpan={6} className="py-1 pr-2 text-right">부가가치세(10%)</td>
                    <td className="py-1 pr-2 text-right tabular-nums">{won(t.vat)}</td>
                  </tr>
                  <tr className="font-bold">
                    <td colSpan={6} className="py-1.5 pr-2 text-right">총액</td>
                    <td className="py-1.5 pr-2 text-right tabular-nums">
                      {won(t.total)}원<span className="block text-xs font-normal text-[var(--muted)]">{koMoney(t.total)}</span>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
            {draft && (
              <details className="mt-3">
                <summary className="cursor-pointer text-sm font-semibold text-[var(--accent)]">+ 항목 넣기(기준표에서 고르거나 직접 적기)</summary>
                <AssistForm id={`est-new-${eid}`} action={estimateAction} className="mt-3 space-y-3 rounded-md border border-[var(--line)] p-3">
                  <Hidden roId={roId} id={eid} intent="line" />
                  <LineFields kind={e.kind} pick={pick} />
                  <SubmitButton>넣기</SubmitButton>
                </AssistForm>
              </details>
            )}
          </Card>
        </div>

        <div className="space-y-4 xl:sticky xl:top-4">
          <Card title="검토·발급" help={{ kind: "panel", id: "est.flow" }}>
            <div className="space-y-3 text-sm">
              <p>
                검토자: <b>{ROLE_LABEL[reviewer]}</b> <span className="text-[var(--muted)]">(전결 규정, 총액 {won(e.totalWon)}원)</span>
              </p>
              {e.status === "draft" &&
                (issues.length ? (
                  <div className="rounded-md border border-[var(--warn)] bg-[var(--warn-soft)] px-3 py-2.5">
                    <p className="font-semibold text-[var(--warn)]">아직 검토를 요청할 수 없습니다({issues.length}건)</p>
                    <ul className="mt-1 space-y-0.5">
                      {issues.map((i) => (
                        <li key={i.msg}>⚠ {i.msg}</li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <p className="rounded-md border border-[var(--line)] bg-[var(--ok-soft)] px-3 py-2 text-[var(--ok)]">검토를 요청할 수 있습니다.</p>
                ))}
              {draft && (
                <form action={estimateAction}>
                  <Hidden roId={roId} id={eid} intent="submit" />
                  <SubmitButton>검토 요청</SubmitButton>
                </form>
              )}
              {e.status === "review" &&
                (canReview ? (
                  <AssistForm id={`est-r-${eid}`} action={estimateAction} className="space-y-2">
                    <input type="hidden" name="roId" value={roId} />
                    <input type="hidden" name="estimateId" value={eid} />
                    <TextAreaField help="est.reviewNote" name="reviewNote" rows={2} />
                    <div className="flex flex-wrap gap-2">
                      <SubmitButton name="intent" value="approve">
                        검토 끝(발급 가능)
                      </SubmitButton>
                      <SubmitButton name="intent" value="return" variant="secondary">
                        되돌리기
                      </SubmitButton>
                    </div>
                  </AssistForm>
                ) : (
                  <p className="text-[var(--muted)]">{ROLE_LABEL[reviewer]}의 검토를 기다립니다.</p>
                ))}
              {e.status === "approved" && (
                <>
                  <p>
                    <Badge tone="ok">검토 끝</Badge> {e.reviewer} {e.reviewedAt && fmtTime(e.reviewedAt)}
                  </p>
                  {missingShop.length > 0 && (
                    <p className="rounded-md border border-[var(--warn)] bg-[var(--warn-soft)] px-3 py-2">
                      ⚠ <Link href="/settings/shop" className="underline">사업장 정보</Link>에 {missingShop.join("·")}이(가) 비어 있어 발급할 수 없습니다.
                    </p>
                  )}
                  {canWrite && (
                    <form action={estimateAction}>
                      <Hidden roId={roId} id={eid} intent="issue" />
                      <SubmitButton>법정 견적서 발급</SubmitButton>
                    </form>
                  )}
                </>
              )}
              {e.issuedOn && (
                <p>
                  발급 {e.issuedOn} · 유효 {e.validUntil}까지
                </p>
              )}
            </div>
          </Card>
          {e.issuedOn && e.status !== "void" && (
            <div id="approval">
              <Card title="고객 승인" help={{ kind: "panel", id: "est.approval" }}>
                <Approval e={e} roId={roId} canWrite={canWrite} today={today} />
              </Card>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
