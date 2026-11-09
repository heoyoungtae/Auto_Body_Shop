import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/db/runtime";
import { can } from "@/modules/auth/permissions";
import { ROLE_LABEL, type Role } from "@/modules/auth/roles";
import { getOutsource } from "@/modules/purchase/outsource";
import { OS_STATUS, OS_STEPS, OS_TONE, OUT_TYPES, type OsStatus, type OutType } from "@/modules/purchase/rules";
import { supplierOptions } from "@/modules/purchase/supplier";
import { seoulDate } from "@/modules/platform/time";
import { AssistForm } from "../../_assist";
import { NumberField, TextAreaField, TextField } from "../../_input";
import { requireUser } from "../../_lib/session";
import { SubmitButton } from "../../_submit";
import { Badge, buttonClass, Card, ErrorBox, fmtTime, Notice, PageTitle } from "../../_ui";
import { PhotoStrip } from "../../photo-strip";
import { outsourceAction, removeOsPhotoAction, uploadOsPhotoAction } from "../actions";
import { OutsourceFields } from "../_fields";

const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;
const STEP_LABEL: Record<string, string> = { draft: "작성", review: "승인", approved: "의뢰", requested: "고객 알림·반출", out: "결과·반입", returned: "확인", accepted: "끝" };

/** 외주 의뢰서(F-07-03): 승인 → 의뢰 → 고객 알림·반출 → 결과·반입(사진·성적서) → 수용 또는 재작업 */
export default async function OutsourcePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; notice?: string }> }) {
  const { id } = await params;
  const q = await searchParams;
  const user = await requireUser();
  const db = await getDb();
  const r = await getOutsource(db, id).catch(() => null);
  if (!r) notFound();
  const { j, supplier: sup, ro, names } = r;
  const status = j.status as OsStatus;
  const order = can(user, "purchase.order");
  const notice = can(user, "outsource.notice");
  const today = seoulDate();
  const nm = (u: string | null) => (u ? (names.get(u) ?? "-") : "-");
  const approverRole = j.approverRole as Role | null;
  const canApprove = status === "review" && approverRole && (user.roles.includes(approverRole) || user.roles.includes("owner")) && (j.createdBy !== user.id || user.roles.includes("owner"));
  const sups = status === "draft" && order ? await supplierOptions(db, "outsource") : [];
  const row = (k: string, v: React.ReactNode) => (
    <div className="flex gap-2 py-1">
      <dt className="w-28 shrink-0 text-[var(--muted)]">{k}</dt>
      <dd className="min-w-0 whitespace-pre-wrap">{v || "-"}</dd>
    </div>
  );
  return (
    <>
      <PageTitle
        help="outsource.detail"
        sub={`${OUT_TYPES[j.workType as OutType]} · ${sup.name} · 납기 ${j.dueOn} · ${won(j.amountWon)}`}
        actions={
          <Link href="/outsource" className="text-sm text-[var(--accent)]">
            ← 외주
          </Link>
        }
      >
        {j.docNo} <Badge tone={OS_TONE[status]}>{OS_STATUS[status]}</Badge> {j.redoCount > 0 && <Badge tone="warn">재작업 {j.redoCount}회</Badge>}
      </PageTitle>
      <ErrorBox message={q.error} />
      {q.notice && <Notice>{q.notice}</Notice>}
      {status !== "cancelled" && (
        <ol className="mb-4 flex flex-wrap gap-1 text-xs">
          {OS_STEPS.filter((s) => j.moveOut || s !== "out").map((s, i) => (
            <li key={s} className={`rounded-full px-2.5 py-1 ${OS_STEPS.indexOf(status) >= OS_STEPS.indexOf(s) ? "bg-[var(--accent-soft)] font-semibold text-[var(--accent)]" : "bg-[var(--surface-2)] text-[var(--muted)]"}`}>
              {i + 1}. {STEP_LABEL[s]}
            </li>
          ))}
        </ol>
      )}
      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="의뢰 내용" help={{ kind: "panel", id: "os.form" }}>
          <dl className="text-sm">
            {row(
              "수리 건",
              <Link href={`/repairs/${ro.id}`} className="text-[var(--accent)]">
                {ro.plateNo} {ro.model} · {ro.docNo} · {ro.customerName}
              </Link>,
            )}
            {row("업체", <Link href={`/suppliers/${sup.id}`} className="text-[var(--accent)]">{sup.name}{sup.phone ? ` · ${sup.phone}` : ""}</Link>)}
            {row("작업 범위", j.scope)}
            {row("요구 결과", j.required)}
            {row("차량 이동", j.moveOut ? "업체로 옮김" : "출장 작업")}
            {row("작성", `${nm(j.createdBy)} · ${fmtTime(j.createdAt)}`)}
            {j.approvedAt && row("승인", `${nm(j.approvedBy)} · ${fmtTime(j.approvedAt)}`)}
            {j.requestedAt && row("의뢰", fmtTime(j.requestedAt))}
            {j.redoNote && row("재작업 요청", <span className="text-[var(--danger)]">{j.redoNote}</span>)}
            {j.cancelReason && row("취소 이유", j.cancelReason)}
          </dl>
          {status === "draft" && j.returnNote && <p className="mt-2 text-sm text-[var(--danger)]">되돌림: {j.returnNote}</p>}
          {status === "draft" && order && (
            <AssistForm id={`os-edit-${id}`} action={outsourceAction} className="mt-3 grid gap-3 md:grid-cols-2">
              <input type="hidden" name="id" value={id} />
              <input type="hidden" name="intent" value="resubmit" />
              <OutsourceFields v={j} suppliers={sups} today={today} />
              <div className="md:col-span-2">
                <SubmitButton>고쳐서 다시 승인 요청</SubmitButton>
              </div>
            </AssistForm>
          )}
        </Card>

        <Card title="지금 할 일" help={{ kind: "panel", id: "os.flow" }}>
          {status === "review" &&
            (canApprove ? (
              <AssistForm id={`os-approve-${id}`} action={outsourceAction} className="space-y-3">
                <input type="hidden" name="id" value={id} />
                <input type="hidden" name="intent" value="approve" />
                <TextField help="os.decideNote" name="decideNote" />
                <div className="flex flex-wrap gap-2">
                  <SubmitButton name="ok" value="1">승인</SubmitButton>
                  <SubmitButton name="ok" value="0" variant="danger" noValidate>
                    되돌리기
                  </SubmitButton>
                </div>
              </AssistForm>
            ) : (
              <p className="text-sm text-[var(--muted)]">{approverRole ? ROLE_LABEL[approverRole] : "승인자"} 승인을 기다립니다(전결 '발주·외주').</p>
            ))}
          {status === "approved" &&
            (order ? (
              <AssistForm id={`os-req-${id}`} action={outsourceAction} guard={false} className="space-y-2">
                <input type="hidden" name="id" value={id} />
                <input type="hidden" name="intent" value="request" />
                <p className="text-sm">업체에 범위·요구 결과·납기·금액을 전하고 의뢰했으면 기록하세요.{j.moveOut ? " 상담원에게 고객 사전 알림을 요청합니다." : ""}</p>
                <SubmitButton>의뢰함</SubmitButton>
              </AssistForm>
            ) : (
              <p className="text-sm text-[var(--muted)]">승인됐습니다. 공장장이 업체에 의뢰합니다.</p>
            ))}
          {j.moveOut && (status === "approved" || status === "requested") && (
            <div className="mt-3 space-y-2 border-t border-[var(--line)] pt-3">
              <p className="text-sm font-semibold">반출 전 고객 알림(STD-07 8.2)</p>
              {j.customerNoticeAt ? (
                <p className="text-sm">
                  {nm(j.customerNoticeBy)} · {fmtTime(j.customerNoticeAt)} — {j.customerNoticeNote}
                </p>
              ) : notice ? (
                <AssistForm id={`os-notice-${id}`} action={outsourceAction} className="space-y-2">
                  <input type="hidden" name="id" value={id} />
                  <input type="hidden" name="intent" value="notice" />
                  {!ro.agreeMove && <p className="text-sm text-[var(--warn)]">입고 때 차량 이동 동의를 받지 않았습니다. 이번에 동의를 받으세요.</p>}
                  <Link href={`/messages/send?scope=one&cid=${ro.customerId}`} className={buttonClass("secondary")}>
                    문자로 알리기
                  </Link>
                  <TextAreaField help="os.noticeNote" name="noticeNote" required rows={2} />
                  <SubmitButton variant="secondary">알렸음</SubmitButton>
                </AssistForm>
              ) : (
                <p className="text-sm text-[var(--muted)]">상담원이 고객에게 알립니다.</p>
              )}
            </div>
          )}
          {status === "requested" && j.moveOut && notice && j.customerNoticeAt && (
            <AssistForm id={`os-out-${id}-${j.redoCount}`} action={outsourceAction} className="mt-3 flex flex-wrap items-end gap-2 border-t border-[var(--line)] pt-3">
              <input type="hidden" name="id" value={id} />
              <input type="hidden" name="intent" value="out" />
              <NumberField help="os.outKm" name="outKm" required min={ro.mileage ?? 0} unit="km" current={ro.mileage ?? undefined} defaultValue={j.inKm ?? ro.mileage ?? null} from={ro.mileage != null ? "입고 기록" : undefined} />
              <SubmitButton>반출함</SubmitButton>
            </AssistForm>
          )}
          {j.outAt && row("반출", `${fmtTime(j.outAt)} · ${j.outKm?.toLocaleString("ko-KR")}km`)}
          {((status === "out" && j.moveOut) || (status === "requested" && !j.moveOut)) && (order || notice) && (
            <AssistForm id={`os-result-${id}-${j.redoCount}`} action={outsourceAction} className="mt-3 space-y-2 border-t border-[var(--line)] pt-3">
              <input type="hidden" name="id" value={id} />
              <input type="hidden" name="intent" value="result" />
              <TextAreaField help="os.resultNote" name="resultNote" required rows={2} />
              {j.moveOut && <NumberField help="os.inKm" name="inKm" required min={j.outKm ?? 0} unit="km" current={j.outKm ?? undefined} />}
              <SubmitButton>{j.moveOut ? "결과 받고 반입함" : "결과 받음"}</SubmitButton>
            </AssistForm>
          )}
          {j.resultAt && (
            <dl className="mt-2 text-sm">
              {row("결과", j.resultNote)}
              {j.inAt && row("반입", `${fmtTime(j.inAt)} · ${j.inKm?.toLocaleString("ko-KR")}km`)}
              {row("기록", `${nm(j.resultBy)} · ${fmtTime(j.resultAt)}`)}
            </dl>
          )}
          {status === "returned" &&
            (order ? (
              <div className="mt-3 space-y-2 border-t border-[var(--line)] pt-3">
                <AssistForm id={`os-accept-${id}`} action={outsourceAction} guard={false}>
                  <input type="hidden" name="id" value={id} />
                  <input type="hidden" name="intent" value="accept" />
                  <SubmitButton>수용(사진·성적서 확인함)</SubmitButton>
                </AssistForm>
                <AssistForm id={`os-redo-${id}`} action={outsourceAction} className="space-y-2">
                  <input type="hidden" name="id" value={id} />
                  <input type="hidden" name="intent" value="redo" />
                  <TextField help="os.redoNote" name="redoNote" required />
                  <SubmitButton variant="danger">재작업 요청</SubmitButton>
                </AssistForm>
              </div>
            ) : (
              <p className="mt-2 text-sm text-[var(--muted)]">공장장이 결과를 확인합니다.</p>
            ))}
          {status === "accepted" && <p className="text-sm">{nm(j.acceptedBy)}이(가) {fmtTime(j.acceptedAt)} 수용했습니다. 최종 검사(F-05-01)에서 함께 확인합니다.</p>}
          {status === "requested" && j.dueOn < today && <p className="mt-2 text-sm font-semibold text-[var(--danger)]">납기({j.dueOn})가 지났습니다. 업체에 확인하세요.</p>}
        </Card>

        {["requested", "out", "returned", "accepted"].includes(status) && (
          <Card title="결과 사진·보정 성적서" help={{ kind: "panel", id: "os.photos" }}>
            <PhotoStrip fields={{ id }} upload={uploadOsPhotoAction} remove={removeOsPhotoAction} photos={j.resultPhotos} editable={status !== "accepted" && (order || notice)} label="외주 결과" />
          </Card>
        )}

        {order && ["draft", "review", "approved", "requested"].includes(status) && (
          <Card title="외주 취소" help={{ kind: "panel", id: "os.cancel" }}>
            <AssistForm id={`os-cancel-${id}`} action={outsourceAction} className="flex flex-wrap items-end gap-2">
              <input type="hidden" name="id" value={id} />
              <input type="hidden" name="intent" value="cancel" />
              <TextField help="os.cancelReason" name="cancelReason" required />
              <SubmitButton variant="danger">취소</SubmitButton>
            </AssistForm>
          </Card>
        )}
      </div>
    </>
  );
}
