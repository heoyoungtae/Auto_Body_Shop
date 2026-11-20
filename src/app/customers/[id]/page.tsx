import { can } from "@/modules/auth/permissions";
import Link from "next/link";
import { getDb } from "@/db/runtime";
import { freshFor, freshForMany } from "@/modules/platform/fresh";
import { VEHICLE_OPTIONS, type VehicleOption } from "@/modules/customer/generations";
import { vehicleHints, getCustomer, pendingConsent, revealPhone } from "@/modules/customer/service";
import { formatPhone } from "@/modules/messaging/service";
import { CONSENT_METHOD_LABEL, RESULT_LABEL, seoulParts } from "@/modules/customer/rules";
import { repairsOfConsults } from "@/modules/repair/service";
import { RO_STATUS_LABEL } from "@/modules/repair/rules";
import { AssistForm } from "../../_assist";
import { TextAreaField, TextField } from "../../_input";
import { SubmitButton } from "../../_submit";
import { requireUser } from "../../_lib/session";
import { Badge, buttonClass, Card, Empty, ErrorBox, fmtTime, Notice, PageTitle } from "../../_ui";
import { ConsentFields, NewVehicleFields } from "../../consults/consult-form";
import { businessAction, consentAction, moveVehicleAction, updateCustomerAction, vehicleAction } from "../actions";
import { BusinessFields } from "../business-fields";
import { RadioRow } from "../../_input";
import { ShowWhen } from "../../consults/show-when";
import { creditCheck } from "@/modules/money/credit";
import { carbookStatus } from "@/modules/carbook/service";
import { inviteCarbookAction } from "../../settings/carbook/actions";
import { portalOrders } from "@/modules/partner/service";
import { CUSTOMER_KINDS, INVOICE_MODES, PORTALS, PORTAL_STEPS } from "@/modules/money/credit-rules";

export default async function CustomerDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; notice?: string; show?: string }> }) {
  const [{ id }, q] = await Promise.all([params, searchParams]);
  const user = await requireUser();
  const db = await getDb();
  const c = await getCustomer(db, id);
  // 동시 수정 확인 표
  const [freshCust, freshBiz, freshVeh] = await Promise.all([freshFor(db, "customer", id), freshFor(db, "customer.biz", id), freshForMany(db, "vehicle", c.vehicles.map((v) => v.id))]);
  const ros = await repairsOfConsults(db, c.consults.map((x) => x.id));
  const [hints, pending] = await Promise.all([vehicleHints(db), pendingConsent(db, id)]);
  const canWrite = can(user, "customer.write");
  // 전체 번호는 누를 때만, 본 기록이 남는다(설계서 9.2)
  const full = q.show === "phone" && canWrite ? await revealPhone(db, user.id, id) : null;
  const biz = c.kind === "business" ? c.biz : null;
  const credit = biz ? await creditCheck(db, c.id, 0) : null;
  const orders = biz?.portal ? (await portalOrders(db, 300)).filter((o) => o.o.customerId === c.id).slice(0, 20) : [];
  const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;
  const cb = await carbookStatus(db, c.id);

  return (
    <div>
      <PageTitle
        help="customers.detail"
        sub={`등록 ${fmtTime(c.createdAt)} · 상담 ${c.consults.length}건`}
        actions={
          canWrite && (
            <Link href={`/consults/new?customer=${c.id}${c.vehicles[0] ? `&vehicle=${c.vehicles[0].id}` : ""}`} className={buttonClass()}>
              이 고객으로 새 상담
            </Link>
          )
        }
      >
        {c.name}
      </PageTitle>
      <ErrorBox message={q.error} />
      {q.notice && <Notice>{q.notice}</Notice>}
      <div className="mt-4 grid gap-4 xl:grid-cols-3 xl:items-start">
        <div className="space-y-4 xl:col-span-2">
          <Card title="고객 정보" help={{ kind: "panel", id: "customer.info" }}>
            <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
              연락처 <b className="tabular-nums">{full ? formatPhone(full) : (c.phone ?? "없음")}</b>
              {c.phone && !full && canWrite && (
                <form method="get">
                  <input type="hidden" name="show" value="phone" />
                  <button className="text-xs text-[var(--accent)] hover:underline">전체 번호 보기(기록 남음)</button>
                </form>
              )}
            </div>
            {canWrite && (
              <AssistForm id={`customer-${c.id}`} action={updateCustomerAction} fresh={freshCust} className="space-y-4">
                <input type="hidden" name="id" value={c.id} />
                <div className="grid gap-4 sm:grid-cols-2">
                  <TextField help="cust.name" name="name" required defaultValue={c.name} />
                  <TextField help="cust.phone" name="phone" label="연락처 바꾸기" placeholder="바꿀 때만 적기" inputMode="tel" autoComplete="off" />
                </div>
                <TextAreaField help="cust.memo" name="memo" rows={2} defaultValue={c.memo ?? undefined} />
                <SubmitButton variant="secondary">고객 정보 저장</SubmitButton>
              </AssistForm>
            )}
          </Card>

          <Card title={biz ? "업체 정보·거래 조건" : "고객 구분"} help={{ kind: "panel", id: "customer.terms" }}>
            {biz && credit && (
              <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
                <Badge tone="accent">업체</Badge>
                <span>사업자 {biz.bizNo}</span>
                <span>· 결제 {credit.term}</span>
                <span>· 세금계산서 {INVOICE_MODES[biz.invoiceMode as keyof typeof INVOICE_MODES] ?? biz.invoiceMode}</span>
                <span className="tabular-nums">
                  · 외상 잔액 <b>{won(credit.balance)}</b>
                  {credit.limit != null && ` / 한도 ${won(credit.limit)}`}
                </span>
                {credit.overdue > 0 && <Badge tone="danger">연체 {won(credit.overdue)}</Badge>}
                {can(user, "money.view") && (
                  <Link href={`/money/accounts/${c.id}`} className="text-[var(--accent)] hover:underline">
                    거래처 원장
                  </Link>
                )}
              </div>
            )}
            {canWrite ? (
              <AssistForm id={`biz-${c.id}`} action={businessAction} fresh={freshBiz} className="space-y-4">
                <input type="hidden" name="id" value={c.id} />
                <ShowWhen field="kind" initial={c.kind} cases={{ business: <BusinessFields v={biz ?? undefined} /> }}>
                  <RadioRow help="cust.kind" name="kind" required defaultValue={c.kind} options={Object.entries(CUSTOMER_KINDS).map(([value, label]) => ({ value, label }))} />
                </ShowWhen>
                <SubmitButton variant="secondary">구분·거래 조건 저장</SubmitButton>
              </AssistForm>
            ) : (
              <p className="text-sm">{CUSTOMER_KINDS[c.kind as keyof typeof CUSTOMER_KINDS] ?? c.kind} 고객</p>
            )}
          </Card>

          {biz?.portal && (
            <Card
              title={`주문 앱 — ${PORTALS[biz.portal as keyof typeof PORTALS] ?? biz.portal}`}
              help={{ kind: "panel", id: "customer.portal" }}
              actions={
                <span className="flex flex-wrap gap-2">
                  {biz.portalUrl && (
                    <a href={biz.portalUrl} target="_blank" rel="noopener noreferrer" className={buttonClass("secondary")}>
                      앱 열기 ↗
                    </a>
                  )}
                  {biz.portal === "techbay" && can(user, "portal.order") && (
                    <Link href={`/portal-orders?customer=${c.id}`} className={buttonClass()}>
                      주문 불러오기
                    </Link>
                  )}
                </span>
              }
            >
              {biz.portalNote && <p className="mb-2 whitespace-pre-line text-xs text-[var(--muted)]">{biz.portalNote}</p>}
              {orders.length ? (
                <ul className="divide-y divide-[var(--line)] text-sm">
                  {orders.map((o) => (
                    <li key={o.o.id} className="flex flex-wrap items-center gap-2 py-2">
                      <span className="tabular-nums">주문 {o.o.extNo ?? o.o.extId}</span>
                      <b>{o.o.plateNo}</b>
                      {o.ro ? (
                        <Link href={`/repairs/${o.ro.id}#portal`} className="text-[var(--accent)] hover:underline">
                          {o.ro.docNo}
                        </Link>
                      ) : (
                        o.o.consultationId && (
                          <Link href={`/consults/${o.o.consultationId}`} className="text-[var(--accent)] hover:underline">
                            상담
                          </Link>
                        )
                      )}
                      {o.todo.length > 0 ? <Badge tone="warn">등록할 상태: {o.todo.map((s) => PORTAL_STEPS[s]).join("·")}</Badge> : o.posted.length > 0 && <Badge tone="ok">등록 {o.posted.length}단계</Badge>}
                    </li>
                  ))}
                </ul>
              ) : (
                <Empty>아직 이은 주문이 없습니다. {biz.portal === "techbay" ? "'주문 불러오기'로 테크베이 주문을 가져오세요." : "상담 화면에서 그쪽 주문번호를 이어 두세요."}</Empty>
              )}
            </Card>
          )}

          <Card title={`차량 ${c.vehicles.length}대`} help={{ kind: "panel", id: "customer.vehicles" }}>
            <div className="space-y-3">
              {c.vehicles.map((v) => (
                <details key={v.id} className="rounded-md border border-[var(--line)]">
                  <summary className="flex cursor-pointer flex-wrap items-center gap-2 px-3 py-2 text-sm">
                    <b>{v.plateNo}</b> {[v.maker, [v.model, v.generation].filter(Boolean).join(" "), v.trim, v.year && `${v.year}년식`, v.colorCode, v.options?.length && v.options.map((o) => VEHICLE_OPTIONS[o as VehicleOption] ?? o).join("·"), v.mileage != null && `${v.mileage.toLocaleString("ko-KR")}km(${v.mileageOn})`].filter(Boolean).join(" · ")}
                    {v.vin && <span className="text-xs text-[var(--muted)]">차대 {v.vin}</span>}
                    {canWrite && <span className="ml-auto text-xs text-[var(--accent)]">고치기</span>}
                  </summary>
                  {canWrite && (
                    <div className="space-y-4 border-t border-[var(--line)] p-3">
                      <AssistForm id={`veh-${v.id}`} action={vehicleAction} fresh={freshVeh[v.id]} className="space-y-4">
                        <input type="hidden" name="id" value={c.id} />
                        <input type="hidden" name="vehicleId" value={v.id} />
                        <NewVehicleFields v={v} hints={hints} />
                        <SubmitButton variant="secondary">차량 저장</SubmitButton>
                      </AssistForm>
                      <AssistForm id={`move-${v.id}`} action={moveVehicleAction} className="flex flex-wrap items-end gap-2">
                        <input type="hidden" name="id" value={c.id} />
                        <input type="hidden" name="vehicleId" value={v.id} />
                        <div className="min-w-56 flex-1">
                          <TextField help="cust.phone" name="toPhone" label="새 주인 연락처(주인이 바뀐 경우)" required inputMode="tel" autoComplete="off" />
                        </div>
                        <SubmitButton variant="secondary">새 주인에게 옮기기</SubmitButton>
                      </AssistForm>
                    </div>
                  )}
                </details>
              ))}
              {canWrite && (
                <details className="rounded-md border border-dashed border-[var(--line-strong)]">
                  <summary className="cursor-pointer px-3 py-2 text-sm text-[var(--accent)]">+ 차량 더하기</summary>
                  <AssistForm id={`veh-new-${c.id}`} action={vehicleAction} className="space-y-4 border-t border-[var(--line)] p-3">
                    <input type="hidden" name="id" value={c.id} />
                    <NewVehicleFields hints={hints} />
                    <SubmitButton variant="secondary">차량 더하기</SubmitButton>
                  </AssistForm>
                </details>
              )}
            </div>
          </Card>

          <Card title="상담·수리 이력" help={{ kind: "panel", id: "customer.history" }}>
            {c.consults.length ? (
              <ul className="divide-y divide-[var(--line)] text-sm">
                {c.consults.map((x) => (
                  <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <Link href={`/consults/${x.id}`} className="hover:underline">
                      <b>{x.docNo}</b> {seoulParts(x.at).date} {x.plateNo ?? ""} {x.damageParts ?? ""}
                    </Link>
                    {ros.get(x.id) ? (
                      <Link href={`/repairs/${ros.get(x.id)!.id}`} className="text-[var(--accent)] hover:underline">
                        수리 건 {ros.get(x.id)!.docNo} · {RO_STATUS_LABEL[ros.get(x.id)!.status as keyof typeof RO_STATUS_LABEL]}
                      </Link>
                    ) : (
                      <Badge>{RESULT_LABEL[x.result]}</Badge>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>상담 기록이 없습니다.</Empty>
            )}
          </Card>
        </div>

        <div className="space-y-4">
        {biz ? (
          <Card title="개인정보 동의(F-13-01)" help={{ kind: "panel", id: "customer.consent" }}>
            <p className="text-sm text-[var(--muted)]">업체 고객은 개인정보 동의 대상이 아닙니다(업체 대표번호·담당 업무 연락). 담당자 개인 휴대폰을 따로 받으면 메모에 적지 말고 개인 고객으로 동의를 받아 주세요.</p>
          </Card>
        ) : (
        <Card title="개인정보 동의(F-13-01)" help={{ kind: "panel", id: "customer.consent" }}>
          <div className="space-y-3 text-sm">
            <p className="flex flex-wrap gap-1">
              {c.consent.required ? <Badge tone="ok">필수 동의</Badge> : <Badge tone="danger">필수 동의 없음</Badge>}
              <Badge tone={c.consent.photo ? "accent" : "neutral"}>사진 홍보 {c.consent.photo ? "동의" : "안 함"}</Badge>
              <Badge tone={c.consent.marketing ? "accent" : "neutral"}>광고 문자 {c.consent.marketing ? "동의" : "안 함"}</Badge>
              {c.consent.required && !c.consent.current && <Badge tone="warn">동의서 판이 바뀜</Badge>}
              {!c.consent.required && pending && <Badge tone="warn">링크 동의 대기 · {fmtTime(pending.expiresAt)}까지</Badge>}
            </p>
            {canWrite && (
              <AssistForm id={`consent-${c.id}`} action={consentAction} className="space-y-3">
                <input type="hidden" name="id" value={c.id} />
                <ConsentFields narrow checked={[...(c.consent.required ? ["required"] : []), ...(c.consent.photo ? ["photo"] : []), ...(c.consent.marketing ? ["marketing"] : [])]} />
                <SubmitButton variant="secondary">동의 저장(체크를 풀면 철회)</SubmitButton>
              </AssistForm>
            )}
            <ul className="divide-y divide-[var(--line)] text-xs text-[var(--muted)]">
              {c.consents.map((x) => (
                <li key={x.id} className="py-1.5">
                  {fmtTime(x.at)} · {x.withdrawal ? "철회 포함" : "동의"} · 필수 {x.required ? "○" : "×"} 사진 {x.photo ? "○" : "×"} 광고 {x.marketing ? "○" : "×"} · {CONSENT_METHOD_LABEL[x.method]} · {x.by ?? "고객"} · {x.version}
                </li>
              ))}
            </ul>
          </div>
        </Card>
        )}
        {!biz && (
          <Card title="내 차 수첩" help={{ kind: "panel", id: "carbook.customer" }}>
            <div className="space-y-2 text-sm">
              {cb.since ? (
                <p>
                  <Badge tone="ok">사용 중</Badge> 처음 {fmtTime(cb.since)} · 마지막 {cb.seen ? fmtTime(cb.seen) : "—"} · 로그인한 휴대폰 {cb.devices}대
                </p>
              ) : (
                <p className="text-[var(--muted)]">아직 문자 인증으로 들어온 적이 없습니다{cb.seen ? `(링크로 마지막 ${fmtTime(cb.seen)})` : ""}.</p>
              )}
              {cb.sold.map((x) => (
                <p key={x.plateNo}>
                  <Badge tone="warn">판 차</Badge> {x.plateNo} · {x.soldOn} 고객이 알림 — 다음 입고 때 소유자를 바꾸세요
                </p>
              ))}
              {canWrite && cb.canInvite && (
                <form action={inviteCarbookAction}>
                  <input type="hidden" name="customerId" value={c.id} />
                  <SubmitButton variant="secondary">초대 문자 보내기</SubmitButton>
                </form>
              )}
            </div>
          </Card>
        )}
        </div>
      </div>
    </div>
  );
}
