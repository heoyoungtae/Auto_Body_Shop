import Link from "next/link";
import { getDb } from "@/db/runtime";
import { resolveApprover } from "@/modules/platform/delegation";
import { rolesOf } from "@/modules/approval/line";
import { ROLE_LABEL } from "@/modules/auth/roles";
import { loadShopInfo, shopMissing } from "@/modules/platform/shop";
import { getEstimate } from "@/modules/repair/estimate";
import { ESTIMATE_KIND, ESTIMATE_STATUS_LABEL, estimateIssues, LINE_CATEGORIES, PART_CODES, totals } from "@/modules/repair/estimate-rules";
import { fmtMinutes, PAINT_GRADES } from "@/modules/repair/labor";
import { AssistForm } from "../../../../_assist";
import { DateField, NumberField, SelectField, TextAreaField, TextField } from "../../../../_input";
import { koMoney } from "../../../../_format";
import { SubmitButton } from "../../../../_submit";
import { requireUser } from "../../../../_lib/session";
import { Badge, buttonClass, Card, ErrorBox, Notice, PageTitle, fmtTime } from "../../../../_ui";
import { estimateAction } from "../../../actions";

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

function LineFields({ l, kind }: { l?: Line; kind: string }) {
  return (
    <div className="space-y-3">
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
  const canWrite = user.roles.some((r) => r === "advisor" || r === "plant_manager" || r === "owner");
  const draft = e.status === "draft" && canWrite;
  const t = totals(e.lines);
  const issues = estimateIssues(e.lines, { registeredOn: e.vehicle.registeredOn, mileage: e.ro.mileage });
  const reviewer = await resolveApprover(db, "estimate", e.totalWon, e.createdBy ? await rolesOf(db, e.createdBy) : []);
  const canReview = e.status === "review" && (user.roles.includes(reviewer) || user.roles.includes("owner"));
  const missingShop = shopMissing(shop);
  const v = e.vehicle;

  return (
    <div>
      <PageTitle
        help="repairs.estimate"
        sub={
          <>
            F-03-02 · 법정 서식 별지 제89호의3 · {e.rev}차 견적 · 작성 {e.writer ?? "—"} ·{" "}
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
            <div className="overflow-x-auto">
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
                    <tr key={l.id} className="align-top">
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
                              <LineFields l={l} kind={e.kind} />
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
                <summary className="cursor-pointer text-sm font-semibold text-[var(--accent)]">+ 항목 넣기(분해 중 찾은 부품, 청소 등)</summary>
                <AssistForm id={`est-new-${eid}`} action={estimateAction} className="mt-3 space-y-3 rounded-md border border-[var(--line)] p-3">
                  <Hidden roId={roId} id={eid} intent="line" />
                  <LineFields kind={e.kind} />
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
                  발급 {e.issuedOn} · 유효 {e.validUntil}까지 · 고객 승인은 다음 개발(승인 링크·매장 서명)
                </p>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
