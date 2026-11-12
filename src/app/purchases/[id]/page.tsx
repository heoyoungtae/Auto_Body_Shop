import Link from "next/link";
import { PAY_TERMS, payTermLabel } from "@/modules/money/rules";
import { ShowWhen } from "../../consults/show-when";
import { notFound } from "next/navigation";
import { getDb } from "@/db/runtime";
import { can } from "@/modules/auth/permissions";
import { ROLE_LABEL, type Role } from "@/modules/auth/roles";
import { getOrder } from "@/modules/purchase/order";
import { lateForRepair, PO_KINDS, PO_STATUS, PO_TONE, RECEIPT_CHECKS, SENT_VIA, SUPPLIER_STATUS, type PoKind, type PoStatus, type SupplierStatus } from "@/modules/purchase/rules";
import { orderableStock } from "@/modules/purchase/stock";
import { supplierBank, supplierOptions } from "@/modules/purchase/supplier";
import { PART_CODES } from "@/modules/repair/estimate-rules";
import { seoulDate } from "@/modules/platform/time";
import { AssistForm } from "../../_assist";
import { CheckGroup, DateField, NumberField, RadioRow, SelectField, TextAreaField, TextField } from "../../_input";
import { requireUser } from "../../_lib/session";
import { SubmitButton } from "../../_submit";
import { Badge, Card, ErrorBox, fmtTime, Notice, PageTitle } from "../../_ui";
import { PhotoStrip } from "../../photo-strip";
import { BankLine } from "../../suppliers/bank-line";
import { orderAction, removeReceiptPhotoAction, uploadReceiptPhotoAction } from "../actions";

const STEPS: PoStatus[] = ["draft", "review", "approved", "sent", "received"];
const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;

/** 발주서(F-07-02): 품목 → 승인(전결) → 보내기·납기 회신 → 입고 검수(합격·불합격) → 반품 처리 → 세금계산서 */
export default async function PurchasePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; notice?: string }> }) {
  const { id } = await params;
  const q = await searchParams;
  const user = await requireUser();
  const db = await getDb();
  const r = await getOrder(db, id).catch(() => null);
  if (!r) notFound();
  const { o, lines, receipts, supplier: sup, ro, roDue, estimate: est, items, names } = r;
  const status = o.status as PoStatus;
  const order = can(user, "purchase.order");
  const draft = status === "draft" && order;
  const today = seoulDate();
  const nm = (u: string | null) => (u ? (names.get(u) ?? "-") : "-");
  const approverRole = o.approverRole as Role | null;
  const canApprove = status === "review" && approverRole && (user.roles.includes(approverRole) || user.roles.includes("owner")) && (o.createdBy !== user.id || user.roles.includes("owner"));
  const [sups, stock] = draft ? await Promise.all([supplierOptions(db, o.kind === "repair" ? "parts" : undefined), o.kind === "stock" ? orderableStock(db) : Promise.resolve([])]) : [[], []];
  const bank = sup && can(user, "supplier.bank") && (status === "partial" || status === "received") ? await supplierBank(db, user, sup.id) : undefined;
  const lineName = new Map(lines.map((l) => [l.id, l.name]));
  const anyPaint = lines.some((l) => l.stockItemId && items.get(l.stockItemId)?.expiryTracked);
  const left = lines.filter((l) => l.qty > l.receivedQty);
  const late = lateForRepair(o.replyDueOn, roDue);
  const row = (k: string, v: React.ReactNode) => (
    <div className="flex gap-2 py-1">
      <dt className="w-28 shrink-0 text-[var(--muted)]">{k}</dt>
      <dd className="min-w-0 whitespace-pre-wrap">{v || "-"}</dd>
    </div>
  );
  return (
    <>
      <PageTitle
        help="purchases.detail"
        sub={`${PO_KINDS[o.kind as PoKind]} · 만든 때 ${fmtTime(o.createdAt)} · ${nm(o.createdBy)}`}
        actions={
          <Link href="/purchases" className="text-sm text-[var(--accent)]">
            ← 발주·입고
          </Link>
        }
      >
        {o.docNo} <Badge tone={PO_TONE[status]}>{PO_STATUS[status]}</Badge>
      </PageTitle>
      <ErrorBox message={q.error} />
      {q.notice && <Notice>{q.notice}</Notice>}
      {status !== "cancelled" && (
        <ol className="mb-4 flex flex-wrap gap-1 text-xs">
          {STEPS.map((s, i) => {
            const at = status === "partial" ? 3 : STEPS.indexOf(status);
            return (
              <li key={s} className={`rounded-full px-2.5 py-1 ${at >= i ? "bg-[var(--accent-soft)] font-semibold text-[var(--accent)]" : "bg-[var(--surface-2)] text-[var(--muted)]"}`}>
                {i + 1}. {["작성", "승인", "발주서 보내기", "입고 검수", "입고 끝"][i]}
              </li>
            );
          })}
        </ol>
      )}
      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="발주서 머리" help={{ kind: "panel", id: "po.header" }}>
          <dl className="mb-2 text-sm">
            {ro &&
              row(
                "수리 건",
                <Link href={`/repairs/${ro.id}`} className="text-[var(--accent)]">
                  {ro.plateNo} {ro.model} · {ro.docNo} · {ro.customerName}
                </Link>,
              )}
            {est && row("견적", `${est.docNo}(고객 승인 부품에서 불러옴)`)}
            {roDue && row("출고 약속", roDue)}
            {!draft && row("업체", sup ? <Link href={`/suppliers/${sup.id}`} className="text-[var(--accent)]">{sup.name}{sup.status !== "registered" ? ` (${SUPPLIER_STATUS[sup.status as SupplierStatus]})` : ""}</Link> : null)}
            {!draft && row("요청 납기", o.dueOn)}
            {o.replyDueOn && row("업체 회신 납기", <span className={late ? "font-bold text-[var(--danger)]" : ""}>{o.replyDueOn}{late ? " — 출고 약속보다 늦음" : ""}</span>)}
            {row("금액", `${won(o.supplyWon)} + 부가세 = ${won(o.totalWon)}`)}
            {!draft && row("메모", o.note)}
            {!draft && o.payTerm && row("결제 조건", payTermLabel(o.payTerm, o.payDay))}
            {o.returnNote && status === "draft" && row("되돌림", <span className="text-[var(--danger)]">{o.returnNote}</span>)}
            {o.cancelReason && row("취소 이유", o.cancelReason)}
          </dl>
          {draft && (
            <AssistForm id={`po-head-${id}`} action={orderAction} className="grid gap-3 md:grid-cols-2">
              <input type="hidden" name="id" value={id} />
              <input type="hidden" name="intent" value="header" />
              <SelectField help="po.supplierId" name="supplierId" defaultValue={o.supplierId ?? ""} placeholder="업체 고르기" options={sups.map((s) => ({ value: s.id, label: `${s.name}${s.status === "registered" ? "" : ` (${SUPPLIER_STATUS[s.status as SupplierStatus]}${s.emergencyOn ? " · 긴급 사용함" : ""})`}${s.leadDays != null ? ` · 보통 ${s.leadDays}일` : ""}` }))} />
              <DateField help="po.dueOn" name="dueOn" min={today} defaultValue={o.dueOn ?? ""} from={o.estimateId && o.dueOn ? "출고 약속일" : undefined} quick={["tomorrow", "week"]} />
              {(() => {
                const sp = sups.find((x) => x.id === o.supplierId);
                return (
                  <>
                    <ShowWhen field="payTerm" initial={o.payTerm ?? ""} cases={{ next_day: <NumberField help="po.payDay" name="payDay" unit="일" min={1} max={31} required defaultValue={o.payDay ?? sp?.payDay ?? 10} /> }}>
                    <SelectField
                      help="po.payTerm"
                      name="payTerm"
                      defaultValue={o.payTerm ?? ""}
                      placeholder={sp ? `업체 조건 따름(${payTermLabel(sp.payTerm, sp.payDay)})` : "업체 조건 따름"}
                      from={!o.payTerm && sp ? "업체" : undefined}
                      options={Object.entries(PAY_TERMS).map(([value, label]) => ({ value, label }))}
                    />
                    </ShowWhen>
                  </>
                );
              })()}
              <div className="md:col-span-2">
                <TextAreaField help="po.note" name="note" rows={2} defaultValue={o.note ?? ""} />
              </div>
              <div className="md:col-span-2">
                <SubmitButton variant="secondary">머리 저장</SubmitButton>
              </div>
            </AssistForm>
          )}
        </Card>

        <Card title="승인·발주" help={{ kind: "panel", id: "po.approve" }}>
          {status === "draft" &&
            (order ? (
              <AssistForm id={`po-submit-${id}`} action={orderAction} className="space-y-3" guard={false}>
                <input type="hidden" name="id" value={id} />
                <input type="hidden" name="intent" value="submit" />
                <p className="text-sm text-[var(--muted)]">업체·납기·품목을 채운 뒤 승인을 요청합니다. 승인자는 금액(부가세 포함)으로 정해집니다(전결 '발주·외주').</p>
                {sup && sup.status !== "registered" && (
                  <RadioRow help="po.emergency" name="emergency" required options={[
                    { value: "1", label: "긴급 사용(1회)", tone: "warn" },
                    { value: "0", label: "등록 뒤에 발주" },
                  ]} />
                )}
                <SubmitButton>승인 요청</SubmitButton>
              </AssistForm>
            ) : (
              <p className="text-sm text-[var(--muted)]">공장장이 작성하고 있습니다.</p>
            ))}
          {status === "review" &&
            (canApprove ? (
              <AssistForm id={`po-approve-${id}`} action={orderAction} className="space-y-3">
                <input type="hidden" name="id" value={id} />
                <input type="hidden" name="intent" value="approve" />
                <p className="text-sm">
                  {won(o.totalWon)} · {sup?.name} · 요청 {fmtTime(o.submittedAt)} {nm(o.createdBy)}
                </p>
                <TextField help="po.decideNote" name="decideNote" />
                <div className="flex flex-wrap gap-2">
                  <SubmitButton name="ok" value="1">승인</SubmitButton>
                  <SubmitButton name="ok" value="0" variant="danger" noValidate>
                    되돌리기
                  </SubmitButton>
                </div>
              </AssistForm>
            ) : (
              <p className="text-sm text-[var(--muted)]">{approverRole ? ROLE_LABEL[approverRole] : "승인자"} 승인을 기다립니다(전결 규정). 승인 전에는 발주서를 보낼 수 없습니다.</p>
            ))}
          {status === "approved" &&
            (order ? (
              <AssistForm id={`po-send-${id}`} action={orderAction} className="space-y-3">
                <input type="hidden" name="id" value={id} />
                <input type="hidden" name="intent" value="send" />
                <p className="text-sm">
                  {nm(o.approvedBy)}이(가) {fmtTime(o.approvedAt)} 승인했습니다. 업체에 발주서를 보내고 기록하세요.
                </p>
                <RadioRow help="po.via" name="via" required options={Object.entries(SENT_VIA).map(([value, label]) => ({ value, label }))} />
                <DateField help="po.replyDueOn" name="replyDueOn" min={today} defaultValue={o.dueOn ?? ""} quick={["tomorrow", "week"]} />
                <SubmitButton>보냈음</SubmitButton>
              </AssistForm>
            ) : (
              <p className="text-sm text-[var(--muted)]">승인됐습니다. 공장장이 발주서를 보냅니다.</p>
            ))}
          {(status === "sent" || status === "partial" || status === "received") && (
            <dl className="text-sm">
              {row("승인", `${nm(o.approvedBy)} · ${fmtTime(o.approvedAt)}`)}
              {row("보냄", `${SENT_VIA[o.sentVia as keyof typeof SENT_VIA] ?? "-"} · ${nm(o.sentBy)} · ${fmtTime(o.sentAt)}`)}
            </dl>
          )}
          {(status === "sent" || status === "partial") && order && (
            <AssistForm id={`po-reply-${id}`} action={orderAction} className="mt-2 flex flex-wrap items-end gap-2">
              <input type="hidden" name="id" value={id} />
              <input type="hidden" name="intent" value="reply" />
              <DateField help="po.replyDueOn" name="replyDueOn" required defaultValue={o.replyDueOn ?? ""} quick={["tomorrow", "week"]} />
              <SubmitButton variant="secondary">납기 회신 저장</SubmitButton>
            </AssistForm>
          )}
        </Card>

        <div className="xl:col-span-2">
          <Card title={`품목 ${lines.length}줄`} help={{ kind: "panel", id: "po.lines" }}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-[var(--muted)]">
                  <tr>
                    <th className="py-1.5 pr-2">#</th>
                    <th className="pr-2">품명</th>
                    <th className="pr-2">품번·규격</th>
                    <th className="pr-2">구분</th>
                    <th className="pr-2 text-right">수량</th>
                    <th className="pr-2 text-right">단가</th>
                    <th className="pr-2 text-right">금액</th>
                    <th>입고(불합격)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--line)]">
                  {lines.map((l) => (
                    <tr key={l.id}>
                      <td className="py-2 pr-2 text-xs">{l.seq}</td>
                      <td className="pr-2">
                        {l.name}
                        {l.estimateLineId && <span className="ml-1 text-xs text-[var(--muted)]">(견적)</span>}
                        {l.stockItemId && <span className="ml-1 text-xs text-[var(--muted)]">(재고)</span>}
                        {draft && (
                          <details className="mt-1">
                            <summary className="cursor-pointer text-xs text-[var(--accent)]">고치기</summary>
                            <AssistForm id={`po-line-${l.id}`} action={orderAction} className="mt-2 grid gap-2 md:grid-cols-3">
                              <input type="hidden" name="id" value={id} />
                              <input type="hidden" name="intent" value="line" />
                              <input type="hidden" name="lineId" value={l.id} />
                              <input type="hidden" name="stockItemId" value={l.stockItemId ?? ""} />
                              <TextField help="po.lineName" name="name" required defaultValue={l.name} />
                              <TextField help="po.partNo" name="partNo" defaultValue={l.partNo ?? ""} />
                              <TextField help="po.spec" name="spec" defaultValue={l.spec ?? ""} />
                              {o.kind === "repair" && <SelectField help="po.partCode" name="partCode" required defaultValue={l.partCode ?? ""} from={l.estimateLineId ? "견적" : undefined} options={Object.entries(PART_CODES).map(([value, label]) => ({ value, label }))} />}
                              <NumberField help="po.qty" name="qty" required min={1} unit={l.stockItemId ? (items.get(l.stockItemId)?.unit ?? "개") : "개"} defaultValue={l.qty} />
                              <NumberField help="po.unitWon" name="unitWon" required min={0} unit="원" defaultValue={l.unitWon} />
                              <div className="flex gap-2 md:col-span-3">
                                <SubmitButton variant="secondary">줄 저장</SubmitButton>
                                <SubmitButton name="intent" value="removeLine" variant="danger" noValidate>
                                  줄 지우기
                                </SubmitButton>
                              </div>
                            </AssistForm>
                          </details>
                        )}
                      </td>
                      <td className="pr-2 text-xs">{[l.partNo, l.spec].filter(Boolean).join(" · ") || "-"}</td>
                      <td className="pr-2 text-xs">{l.partCode ?? "-"}</td>
                      <td className="pr-2 text-right">{l.qty}</td>
                      <td className="pr-2 text-right">{l.unitWon.toLocaleString("ko-KR")}</td>
                      <td className="pr-2 text-right">{(l.qty * l.unitWon).toLocaleString("ko-KR")}</td>
                      <td className={`text-xs ${l.receivedQty >= l.qty ? "text-[var(--ok)]" : ""}`}>
                        {l.receivedQty}/{l.qty}
                        {l.rejectedQty > 0 && <span className="text-[var(--danger)]"> ({l.rejectedQty})</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {draft && (
              <details className="mt-3" open={!lines.length}>
                <summary className="cursor-pointer text-sm text-[var(--accent)]">품목 더하기</summary>
                <AssistForm id={`po-addline-${id}`} action={orderAction} className="mt-2 grid gap-2 md:grid-cols-3">
                  <input type="hidden" name="id" value={id} />
                  <input type="hidden" name="intent" value="line" />
                  {o.kind === "stock" && (
                    <div className="md:col-span-3">
                      <SelectField help="po.stockItem" name="stockItemId" placeholder="재고 품목 고르기(없으면 품명만)" options={stock.map((s) => ({ value: s.id, label: `${s.name}${s.spec ? ` ${s.spec}` : ""} · 지금 ${s.qty}${s.unit}${s.low ? " (미달)" : ""}` }))} />
                    </div>
                  )}
                  <TextField help="po.lineName" name="name" required />
                  <TextField help="po.partNo" name="partNo" />
                  <TextField help="po.spec" name="spec" />
                  {o.kind === "repair" && <SelectField help="po.partCode" name="partCode" required options={Object.entries(PART_CODES).map(([value, label]) => ({ value, label }))} />}
                  <NumberField help="po.qty" name="qty" required min={1} unit="개" defaultValue={1} />
                  <NumberField help="po.unitWon" name="unitWon" required min={0} unit="원" />
                  <div className="md:col-span-3">
                    <SubmitButton variant="secondary">더하기</SubmitButton>
                  </div>
                </AssistForm>
              </details>
            )}
          </Card>
        </div>

        {(status === "sent" || status === "partial") && can(user, "purchase.receive") && (
          <div className="xl:col-span-2">
            <Card title="입고 검수" help={{ kind: "panel", id: "po.receive" }}>
              <AssistForm id={`po-rcv-${id}-${receipts.length}`} action={orderAction} className="space-y-3">
                <input type="hidden" name="id" value={id} />
                <input type="hidden" name="intent" value="receive" />
                {left.map((l) => {
                  const it = l.stockItemId ? items.get(l.stockItemId) : null;
                  return (
                    <fieldset key={l.id} className="grid gap-2 rounded-md border border-[var(--line)] p-2 md:grid-cols-3 2xl:grid-cols-5">
                      <input type="hidden" name="lineId" value={l.id} />
                      <legend className="px-1 text-sm font-semibold">
                        {l.name} <span className="text-xs font-normal text-[var(--muted)]">남은 {l.qty - l.receivedQty}{it?.unit ?? "개"}{l.partNo ? ` · ${l.partNo}` : ""}</span>
                      </legend>
                      <NumberField help="po.rcvOk" name={`ok_${l.id}`} min={0} max={l.qty - l.receivedQty} unit={it?.unit ?? "개"} defaultValue={l.qty - l.receivedQty} />
                      <NumberField help="po.rcvBad" name={`bad_${l.id}`} min={0} unit={it?.unit ?? "개"} defaultValue={0} />
                      {it?.expiryTracked && (
                        <>
                          <TextField help="po.lot" name={`lot_${l.id}`} />
                          <DateField help="po.expiresOn" name={`exp_${l.id}`} min={today} quick={[]} />
                        </>
                      )}
                      {it && <TextField help="po.location" name={`loc_${l.id}`} defaultValue={it.location ?? ""} from={it.location ? "재고 품목" : undefined} />}
                    </fieldset>
                  );
                })}
                <CheckGroup help="po.checks" name="checks" options={Object.entries(RECEIPT_CHECKS).filter(([, c]) => !("paint" in c) || anyPaint).map(([value, c]) => ({ value, label: c.label }))} />
                <TextAreaField help="po.badNote" name="badNote" rows={2} />
                <RadioRow help="po.needNc" name="needNc" defaultValue="0" options={[
                  { value: "0", label: "발행 안 함" },
                  { value: "1", label: "부적합 발행", tone: "warn" },
                ]} />
                <SubmitButton>검수 저장</SubmitButton>
              </AssistForm>
            </Card>
          </div>
        )}

        {receipts.length > 0 && (
          <Card title={`검수 기록 ${receipts.length}회`} help={{ kind: "panel", id: "po.receipts" }}>
            <ul className="divide-y divide-[var(--line)] text-sm">
              {receipts.map((rc) => (
                <li key={rc.id} className="space-y-1 py-2">
                  <p>
                    {fmtTime(rc.receivedAt)} · {nm(rc.receivedBy)} · {rc.lines.map((x) => `${lineName.get(x.lineId) ?? "?"} 합격 ${x.ok}${x.bad ? `·불합격 ${x.bad}` : ""}${x.lot ? `(로트 ${x.lot}, ~${x.expiresOn})` : ""}`).join(" / ")}
                  </p>
                  {rc.badNote && (
                    <p className="text-[var(--danger)]">
                      불합격: {rc.badNote}
                      {rc.ncId && (
                        <>
                          {" "}
                          ·{" "}
                          <Link href={`/nc/${rc.ncId}`} className="text-[var(--accent)]">
                            부적합 보고서
                          </Link>
                        </>
                      )}
                    </p>
                  )}
                  {rc.badNote && (rc.returnDoneAt ? (
                    <p className="text-xs text-[var(--muted)]">반품·교환: {rc.returnNote} ({fmtTime(rc.returnDoneAt)})</p>
                  ) : order ? (
                    <AssistForm id={`po-ret-${rc.id}`} action={orderAction} className="flex flex-wrap items-end gap-2">
                      <input type="hidden" name="id" value={id} />
                      <input type="hidden" name="intent" value="returnDone" />
                      <input type="hidden" name="receiptId" value={rc.id} />
                      <TextField help="po.returnNote" name="returnNote" required />
                      <SubmitButton variant="secondary">반품·교환 처리함</SubmitButton>
                    </AssistForm>
                  ) : (
                    <Badge tone="warn">반품 대기</Badge>
                  ))}
                  <PhotoStrip fields={{ receiptId: rc.id }} upload={uploadReceiptPhotoAction} remove={removeReceiptPhotoAction} photos={rc.photos} editable={can(user, "purchase.receive")} label="검수" />
                </li>
              ))}
            </ul>
          </Card>
        )}

        {(status === "partial" || status === "received") && (
          <Card title="세금계산서·거래명세서" help={{ kind: "panel", id: "po.invoice" }}>
            {bank !== undefined && sup && (
              <div className="mb-3 rounded-md bg-[var(--surface-2)] p-2">
                <p className="mb-1 text-xs text-[var(--muted)]">대금 입금 계좌(협력업체 대장에서 불러옴)</p>
                <BankLine bank={bank} supplierId={sup.id} />
              </div>
            )}
            {o.invoiceNo ? (
              <dl className="text-sm">
                {row("번호", o.invoiceNo)}
                {row("발행일", o.invoiceOn)}
                {row("연결", nm(o.invoiceBy))}
              </dl>
            ) : can(user, "purchase.invoice") ? (
              <AssistForm id={`po-iv-${id}`} action={orderAction} className="grid gap-3 md:grid-cols-2">
                <input type="hidden" name="id" value={id} />
                <input type="hidden" name="intent" value="invoice" />
                <p className="text-sm md:col-span-2">발주 금액 {won(o.totalWon)}과 세금계산서 금액이 같은지 확인하세요.</p>
                <TextField help="po.invoiceNo" name="invoiceNo" required />
                <DateField help="po.invoiceOn" name="invoiceOn" required defaultValue={today} quick={["today"]} />
                <div className="md:col-span-2">
                  <SubmitButton>연결</SubmitButton>
                </div>
              </AssistForm>
            ) : (
              <p className="text-sm text-[var(--muted)]">회계 담당이 세금계산서를 받으면 연결합니다.</p>
            )}
          </Card>
        )}

        {order && ["draft", "review", "approved", "sent"].includes(status) && (
          <Card title="발주 취소" help={{ kind: "panel", id: "po.cancel" }}>
            <AssistForm id={`po-cancel-${id}`} action={orderAction} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="id" value={id} />
              <input type="hidden" name="intent" value="cancel" />
              <TextField help="po.cancelReason" name="cancelReason" required />
              <SubmitButton variant="danger">취소</SubmitButton>
            </AssistForm>
            {status === "sent" && <p className="mt-1 text-xs text-[var(--muted)]">이미 보낸 발주서입니다. 업체에도 취소를 알리세요.</p>}
          </Card>
        )}
      </div>
    </>
  );
}
