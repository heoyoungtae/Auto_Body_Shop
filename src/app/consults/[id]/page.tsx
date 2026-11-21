import { can } from "@/modules/auth/permissions";
import Link from "next/link";
import { getDb } from "@/db/runtime";
import { consultFlags, getConsultation, pendingConsent } from "@/modules/customer/service";
import { eq } from "drizzle-orm";
import { customer } from "@/db/schema";
import { portalOrderView } from "@/modules/partner/service";
import { PortalSteps } from "../../portal-orders/portal-steps";
import { portalStepAction } from "../../portal-orders/actions";
import { AssistForm } from "../../_assist";
import { CheckGroup, TextAreaField, TextField } from "../../_input";
import { CHANNEL_LABEL, INSURANCE_LABEL, RESULT_LABEL, seoulParts } from "@/modules/customer/rules";
import { seoulDate } from "@/modules/platform/time";
import { VEHICLE_OPTIONS, type VehicleOption } from "@/modules/customer/generations";
import { dayLabel, koMoney } from "../../_format";
import { SubmitButton } from "../../_submit";
import { requireUser } from "../../_lib/session";
import { Badge, buttonClass, Card, ErrorBox, Notice, PageTitle, fmtTime } from "../../_ui";
import { confirmAction, faqDraftAction, repliedAction, webReplyAction } from "../actions";
import { startRepairAction } from "../../repairs/actions";
import { repairsOfConsults } from "@/modules/repair/service";
import { ConsultZonesView } from "../consult-zones";
import { BODY_TYPES, bodyOf, carOf } from "@/modules/repair/body-map";

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[7rem_1fr] gap-2 py-1.5">
      <dt className="text-[var(--muted)]">{k}</dt>
      <dd>{children || <span className="text-[var(--muted)]">—</span>}</dd>
    </div>
  );
}

/** 답 초안: 손님 이름·다친 곳·예상 금액(상담에 적었으면)·원하는 날을 넣어 둔다. 직원은 고쳐서 보낸다 */
function replyDraft(c: { customer: { name: string }; damageParts: string | null; estMin: number | null; estMax: number | null; wantDate: string | null }) {
  const won = (n: number) => `${Math.round(n / 10000).toLocaleString("ko-KR")}만 원`;
  const est = c.estMin != null || c.estMax != null ? `예상 수리비는 ${[c.estMin, c.estMax].filter((n): n is number => n != null).map(won).join(" ~ ")} 정도입니다.` : "예상 수리비는 ○○만 원 ~ ○○만 원 정도입니다.";
  return [
    `${c.customer.name} 고객님, 보내 주신 사진 잘 보았습니다.`,
    c.damageParts ? `요청하신 곳: ${c.damageParts.split("\n")[0]}` : "",
    `${est} 작업 기간은 ○일 정도 걸립니다.`,
    "사진만 보고 드리는 대략 금액이며, 정식 견적은 차를 직접 보고 확정합니다.",
    c.wantDate ? `원하신 날(${c.wantDate})에 입고 가능합니다. 편하실 때 전화 주시면 예약해 드리겠습니다.` : "방문 가능한 날을 전화나 답장으로 알려 주시면 예약해 드리겠습니다.",
  ]
    .filter(Boolean)
    .join("\n");
}

export default async function ConsultDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; notice?: string }> }) {
  const [{ id }, { error, notice }] = await Promise.all([params, searchParams]);
  const user = await requireUser();
  const db = await getDb();
  const c = await getConsultation(db, id);
  const pending = c.consent.required ? null : await pendingConsent(db, c.customer.id);
  // 업체 주문 앱: 이어진 주문(테크베이에서 불러온 것 포함) 또는 주문번호 잇기
  const portal = await portalOrderView(db, { consultationId: id });
  const [bizCu] = await db.select({ kind: customer.kind, portal: customer.portal, portalUrl: customer.portalUrl }).from(customer).where(eq(customer.id, c.customer.id));
  const today = seoulDate();
  const canWrite = can(user, "consult.write");
  const flags = consultFlags(c, today);
  const v = c.vehicle;
  const resv = c.reservedAt ? seoulParts(c.reservedAt) : null;
  const ro = (await repairsOfConsults(db, [c.id])).get(c.id);

  return (
    <div>
      <PageTitle
        help="consults.detail" std="F-01-01"
        sub={
          <>
            {fmtTime(c.at)} · {c.source === "web" ? "홈페이지 견적 요청" : CHANNEL_LABEL[c.channel]} · 상담원 {c.advisor ?? "—"}
            {c.from && (
              <>
                {" "}· <Link href={`/consults/${c.from.id}`} className="text-[var(--accent)]">{c.from.docNo}</Link>에서 불러옴
              </>
            )}
          </>
        }
        actions={
          canWrite && (
            <>
              {ro ? (
                <Link href={`/repairs/${ro.id}`} className={buttonClass()}>
                  수리 건 {ro.docNo}
                </Link>
              ) : (
                c.result !== "declined" && (
                  <form action={startRepairAction}>
                    <input type="hidden" name="consultId" value={c.id} />
                    <SubmitButton>입고 시작</SubmitButton>
                  </form>
                )
              )}
              {c.result !== "converted" && (
                <Link href={`/consults/${c.id}/edit`} className={buttonClass("secondary")}>
                  고치기·결과 바꾸기
                </Link>
              )}
              <Link href={`/consults/new?from=${c.id}`} className={buttonClass("secondary")} title="이 상담의 고객·차량·손상·보험을 불러와 새 상담을 씁니다">
                이 값으로 새 상담
              </Link>
            </>
          )
        }
      >
        상담 {c.docNo}
      </PageTitle>
      <ErrorBox message={error} />
      {notice && <Notice>{notice}</Notice>}
      <div className="mt-4 grid gap-4 xl:grid-cols-3 xl:items-start">
        <div className="space-y-4 xl:col-span-2">
          <Card title="고객·차량" help={{ kind: "panel", id: "consult.who" }}>
            <dl className="grid text-sm sm:grid-cols-2 sm:gap-x-6">
              <Row k="고객">
                <Link href={`/customers/${c.customer.id}`} className="font-medium text-[var(--accent)] hover:underline">
                  {c.customer.name}
                </Link>{" "}
                <span className="text-[var(--muted)]">{c.customer.phone ?? "연락처 없음"}</span>
              </Row>
              <Row k="개인정보 동의">
                {c.consent.required ? <Badge tone="ok">필수 동의</Badge> : pending ? <Badge tone="warn">링크 동의 대기 · {fmtTime(pending.expiresAt)}까지</Badge> : <Badge tone="danger">필수 동의 없음</Badge>} {c.consent.marketing && <Badge>광고 문자 동의</Badge>} {c.consent.photo && <Badge>사진 홍보 동의</Badge>}
              </Row>
              <Row k="차량">{v && [v.plateNo, v.maker, [v.model, v.generation].filter(Boolean).join(" "), v.trim, v.year && `${v.year}년식`].filter(Boolean).join(" · ")}</Row>
              <Row k="차형">{v && `${BODY_TYPES[bodyOf(v)]}${v.bodyType ? "" : " (차종 이름으로 짐작)"}`}</Row>
              <Row k="수리 사양">{v?.options?.length ? v.options.map((o) => VEHICLE_OPTIONS[o as VehicleOption] ?? o).join(", ") : null}</Row>
              <Row k="색상 코드">{v?.colorCode}</Row>
              <Row k="차대번호">{v?.vin}</Row>
              <Row k="주행거리">{c.mileage != null ? `${c.mileage.toLocaleString("ko-KR")}km(고객 말)` : v?.mileage != null ? `${v.mileage.toLocaleString("ko-KR")}km(${v.mileageOn})` : null}</Row>
            </dl>
          </Card>
          {(portal || (bizCu?.kind === "business" && bizCu.portal)) && (
            <Card title="업체 주문 앱" help={{ kind: "panel", id: "consult.portal" }}>
              {portal ? (
                <div className="space-y-2 text-sm">
                  <p>
                    {portal.platformLabel} 주문 <b>{portal.o.extNo ?? portal.o.extId}</b>
                    {portal.o.requestedAt && ` · 요청 ${portal.o.requestedAt.slice(0, 10)}`}
                  </p>
                  {portal.ro ? (
                    <PortalSteps v={portal} back={`/consults/${id}`} />
                  ) : (
                    <p className="text-xs text-[var(--muted)]">입고 접수를 하면 그쪽 앱에 등록할 진행 상태(입고·작업 시작·수리 완료·출고)를 챙겨 드립니다.</p>
                  )}
                </div>
              ) : (
                can(user, "portal.order") && (
                  <AssistForm id={`portal-link-${id}`} action={portalStepAction} className="flex flex-wrap items-end gap-2">
                    <input type="hidden" name="intent" value="link" />
                    <input type="hidden" name="consultationId" value={id} />
                    <input type="hidden" name="back" value={`/consults/${id}`} />
                    <div className="min-w-56 flex-1">
                      <TextField help="portal.extNo" name="extNo" required />
                    </div>
                    <SubmitButton variant="secondary">주문번호 잇기</SubmitButton>
                    {bizCu?.portalUrl && (
                      <a href={bizCu.portalUrl} target="_blank" rel="noopener noreferrer" className="self-center text-xs text-[var(--accent)]">
                        그쪽 앱 열기 ↗
                      </a>
                    )}
                  </AssistForm>
                )
              )}
            </Card>
          )}
          <Card title="상담 내용" help={{ kind: "panel", id: "consult.content" }}>
            <dl className="grid text-sm sm:grid-cols-2 sm:gap-x-6">
              <Row k="손상 유형">{c.damageTypes.join(", ")}</Row>
              <Row k="부위"><span className="whitespace-pre-line">{c.damageParts}</span></Row>
              <Row k="경위">{c.cause}</Row>
              <Row k="받은 사진">
                {c.photoCount ? `${c.photoCount}장${c.photoCount < 3 ? " (3장 미만 — 더 요청)" : ""}` : ""}
                {(c.photos ?? []).length > 0 && (
                  <span className="mt-1 flex flex-wrap gap-1">
                    {(c.photos ?? []).map((p) => (
                      <a key={p} href={`/api/files/${p}`} target="_blank" rel="noreferrer" title="고객이 내 차 수첩에서 보낸 사진">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={`/api/files/${p}`} alt="고객이 보낸 사진" className="size-20 rounded border border-[var(--line)] object-cover" />
                      </a>
                    ))}
                  </span>
                )}
              </Row>
              <Row k="예비 판단">
                {c.methods.join(", ")}
                {c.structural && <Badge tone="warn">구조물 손상 의심</Badge>}
              </Row>
              <Row k="보험">
                {INSURANCE_LABEL[c.insurance]}
                {c.insurer && ` · ${c.insurer}`}
                {c.claimNo && ` · 접수 ${c.claimNo}`}
              </Row>
              <Row k="희망 납기">{c.wantDate && dayLabel(c.wantDate, today)}</Row>
              <Row k="부품·대차">{[c.partsPref, c.rental && "대차 필요"].filter(Boolean).join(" · ")}</Row>
              <Row k="기타 요구">{c.needs}</Row>
              <Row k="예상 금액">
                {c.estMin != null || c.estMax != null ? (
                  <>
                    {c.estMin != null ? koMoney(c.estMin) : "?"} ~ {c.estMax != null ? koMoney(c.estMax) : "?"} {c.estNoticed && <Badge tone="ok">확정 아님 안내함</Badge>}
                  </>
                ) : null}
              </Row>
            </dl>
            <ConsultZonesView zones={c.damageZones ?? []} car={carOf(v)} text={c.damageParts} />
          </Card>
        </div>
        <div className="space-y-4">
          {c.channel === "online" && (
            <Card title="손님에게 답변(비밀)" help={{ kind: "panel", id: "consult.webReply" }}>
              <div className="space-y-2 text-sm">
                <p className="text-[var(--muted)]">요청한 손님만 내 차 수첩에서 휴대폰 문자 인증 뒤 봅니다. 처음 답하면 알림톡(안 되면 문자)으로 알립니다.</p>
                {c.webReplyAt && (
                  <p>
                    <Badge tone="ok">답함 {fmtTime(c.webReplyAt)}</Badge>
                  </p>
                )}
                {canWrite ? (
                  <AssistForm id={`web-reply-${c.id}`} action={webReplyAction} className="space-y-3">
                    <input type="hidden" name="id" value={c.id} />
                    <TextAreaField help="consult.webReply" name="reply" rows={7} required defaultValue={c.webReply ?? replyDraft(c)} />
                    {c.webReplyAt && <CheckGroup help="consult.webReplyNotify" name="notify" options={[{ value: "1", label: "고친 답을 다시 알리기" }]} />}
                    <SubmitButton>{c.webReplyAt ? "답 고치기" : "답 보내기"}</SubmitButton>
                  </AssistForm>
                ) : (
                  <p className="whitespace-pre-line">{c.webReply ?? "아직 답이 없습니다."}</p>
                )}
                {canWrite && c.webReplyAt && (
                  <form action={faqDraftAction} className="border-t border-[var(--line)] pt-2">
                    <input type="hidden" name="id" value={c.id} />
                    <button className="text-sm text-[var(--accent)] underline" title="이 요청과 답으로 '자주 묻는 질문' 초안을 만듭니다(이름·번호는 가리고 공개 안 함으로)">
                      자주 묻는 질문 초안으로 만들기
                    </button>
                  </form>
                )}
              </div>
            </Card>
          )}
          <Card title="결과·예약" help={{ kind: "panel", id: "consult.result" }}>
            <div className="space-y-2 text-sm">
              <p className="flex flex-wrap items-center gap-1.5">
                <Badge tone={c.result === "reserved" ? "accent" : c.result === "recontact" ? "warn" : "neutral"}>{RESULT_LABEL[c.result]}</Badge>
                {flags.map((x) => (
                  <Badge key={x.label} tone={x.tone}>
                    {x.label}
                  </Badge>
                ))}
              </p>
              {resv && (
                <p>
                  입고 <b>{dayLabel(resv.date, today)}</b> {resv.time}
                  {c.overCapacityOk && <span className="text-[var(--warn)]"> · 한도 넘김(공장장 동의)</span>}
                </p>
              )}
              {c.result === "recontact" && c.recontactOn && <p>재연락 {dayLabel(c.recontactOn, today)}</p>}
              {c.closeReason && <p>사유: {c.closeReason}</p>}
              {c.replyDue && <p className="text-xs text-[var(--muted)]">회신 기한 {c.replyDue} · {c.repliedAt ? `회신함 ${fmtTime(c.repliedAt)}` : "아직 회신 안 함"}</p>}
              {canWrite && !c.repliedAt && (
                <form action={repliedAction}>
                  <input type="hidden" name="id" value={c.id} />
                  <SubmitButton variant="secondary">회신함으로 표시</SubmitButton>
                </form>
              )}
            </div>
          </Card>
          {c.result === "reserved" && (
            <Card title="고객 안내" help={{ kind: "panel", id: "consult.notice" }}>
              <div className="space-y-2 text-sm">
                <p>예약 확인: {c.confirmSentAt ? <Badge tone="ok">보냄 {fmtTime(c.confirmSentAt)}</Badge> : <Badge tone="warn">아직 안 보냄</Badge>}</p>
                <p>전날 안내: {c.reminderSentAt ? <Badge tone="ok">보냄 {fmtTime(c.reminderSentAt)}</Badge> : <span className="text-[var(--muted)]">입고 전날 16시에 자동으로 보냅니다</span>}</p>
                {canWrite && c.customer.hasPhone && (
                  <form action={confirmAction}>
                    <input type="hidden" name="id" value={c.id} />
                    <SubmitButton variant={c.confirmSentAt ? "secondary" : "primary"}>{c.confirmSentAt ? "예약 확인 다시 보내기" : "예약 확인 보내기"}</SubmitButton>
                  </form>
                )}
                <p className="text-xs text-[var(--muted)]">
                  알림톡이 준비된 템플릿이면 알림톡으로, 아니면 같은 문구를 문자로 보냅니다. <Link href="/messages/log" className="text-[var(--accent)]">발송 이력</Link>
                </p>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
