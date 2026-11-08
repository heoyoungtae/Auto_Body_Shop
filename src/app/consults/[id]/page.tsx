import Link from "next/link";
import { getDb } from "@/db/runtime";
import { consultFlags, getConsultation, pendingConsent } from "@/modules/customer/service";
import { CHANNEL_LABEL, INSURANCE_LABEL, RESULT_LABEL, seoulParts } from "@/modules/customer/rules";
import { seoulDate } from "@/modules/platform/time";
import { dayLabel, koMoney } from "../../_format";
import { SubmitButton } from "../../_submit";
import { requireUser } from "../../_lib/session";
import { Badge, buttonClass, Card, ErrorBox, Notice, PageTitle, fmtTime } from "../../_ui";
import { confirmAction, repliedAction } from "../actions";

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[7rem_1fr] gap-2 py-1.5">
      <dt className="text-[var(--muted)]">{k}</dt>
      <dd>{children || <span className="text-[var(--muted)]">—</span>}</dd>
    </div>
  );
}

export default async function ConsultDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; notice?: string }> }) {
  const [{ id }, { error, notice }] = await Promise.all([params, searchParams]);
  const user = await requireUser();
  const db = await getDb();
  const c = await getConsultation(db, id);
  const pending = c.consent.required ? null : await pendingConsent(db, c.customer.id);
  const today = seoulDate();
  const canWrite = user.roles.some((r) => r === "owner" || r === "plant_manager" || r === "advisor");
  const flags = consultFlags(c, today);
  const v = c.vehicle;
  const resv = c.reservedAt ? seoulParts(c.reservedAt) : null;

  return (
    <div>
      <PageTitle
        help="consults.detail"
        sub={
          <>
            F-01-01 · {fmtTime(c.at)} · {CHANNEL_LABEL[c.channel]} · 상담원 {c.advisor ?? "—"}
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
              <Row k="차량">{v && [v.plateNo, v.maker, v.model, v.year && `${v.year}년식`].filter(Boolean).join(" · ")}</Row>
              <Row k="색상 코드">{v?.colorCode}</Row>
              <Row k="차대번호">{v?.vin}</Row>
              <Row k="주행거리">{c.mileage != null ? `${c.mileage.toLocaleString("ko-KR")}km(고객 말)` : v?.mileage != null ? `${v.mileage.toLocaleString("ko-KR")}km(${v.mileageOn})` : null}</Row>
            </dl>
          </Card>
          <Card title="상담 내용" help={{ kind: "panel", id: "consult.content" }}>
            <dl className="grid text-sm sm:grid-cols-2 sm:gap-x-6">
              <Row k="손상 유형">{c.damageTypes.join(", ")}</Row>
              <Row k="부위">{c.damageParts}</Row>
              <Row k="경위">{c.cause}</Row>
              <Row k="받은 사진">{c.photoCount ? `${c.photoCount}장${c.photoCount < 3 ? " (3장 미만 — 더 요청)" : ""}` : ""}</Row>
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
          </Card>
        </div>
        <div className="space-y-4">
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
