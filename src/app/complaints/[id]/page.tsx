import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/db/runtime";
import { can } from "@/modules/auth/permissions";
import { getComplaint } from "@/modules/cs/service";
import { formatPhone } from "@/modules/messaging/service";
import { CATEGORIES, CHANNELS, CP_STATUS, CP_STEPS, CP_TONE, RESOLUTIONS, SCALE_LABEL, SURVEY_QUESTIONS, VERDICTS, type CpStatus } from "@/modules/cs/rules";
import { NC_STATUS, type NcStatus } from "@/modules/quality/rules";
import { seoulDate } from "@/modules/platform/time";
import { AssistForm } from "../../_assist";
import { NumberField, RadioRow, SelectField, TextAreaField, TextField } from "../../_input";
import { requireUser } from "../../_lib/session";
import { SubmitButton } from "../../_submit";
import { Badge, Card, ErrorBox, fmtTime, Notice, PageTitle } from "../../_ui";
import { PhotoStrip } from "../../photo-strip";
import { complaintAction, removeCpPhotoAction, uploadCpPhotoAction } from "../actions";

const RO_STATUS: Record<string, string> = { intake: "입고", checked: "입고 점검", estimating: "견적", working: "작업 중", inspecting: "검사", ready: "출고 대기", delivered: "출고", cancelled: "취소" };

/** 불만 처리부(F-06-02): 접수 → 접수 안내 → 현물 확인·판정 → 고객 동의·처리(보증 수리·보상) → 만족 확인·종결 */
export default async function ComplaintPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; notice?: string }> }) {
  const { id } = await params;
  const { error, notice } = await searchParams;
  const user = await requireUser();
  const db = await getDb();
  const today = seoulDate();
  const r = await getComplaint(db, id, today).catch(() => null);
  if (!r) notFound();
  const { c, names, ro } = r;
  const nm = (u: string | null) => (u ? (names.get(u) ?? "-") : "-");
  const contact = can(user, "complaint.contact");
  const judge = can(user, "complaint.judge");
  const owner = can(user, "complaint.compensate");
  const status = c.status as CpStatus;
  const closed = status === "closed";
  const late = (due: string, done: boolean) => !done && due < today;
  const hasComp = !!(c.compWon || c.compNote);
  const row = (k: string, v: React.ReactNode) => (
    <div className="flex gap-2 py-1">
      <dt className="w-28 shrink-0 text-[var(--muted)]">{k}</dt>
      <dd className="min-w-0 whitespace-pre-wrap">{v || "-"}</dd>
    </div>
  );
  return (
    <>
      <PageTitle
        help="complaints.detail"
        sub={`${CHANNELS[c.channel as keyof typeof CHANNELS]} · ${CATEGORIES[c.category as keyof typeof CATEGORIES]} · 접수 ${fmtTime(c.receivedAt)} · ${c.receivedBy ? nm(c.receivedBy) : "설문 자동 접수"}`}
        actions={
          <Link href="/complaints" className="text-sm text-[var(--accent)]">
            ← 불만·보증 목록
          </Link>
        }
      >
        {c.docNo} <Badge tone={CP_TONE[status] ?? "neutral"}>{CP_STATUS[status]}</Badge> {c.urgent && <Badge tone="danger">긴급</Badge>}
      </PageTitle>
      <ErrorBox message={error} />
      {notice && <Notice>{notice}</Notice>}
      <ol className="mb-4 flex flex-wrap gap-1 text-xs">
        {CP_STEPS.map((s, i) => (
          <li key={s} className={`rounded-full px-2.5 py-1 ${CP_STEPS.indexOf(status) >= i ? "bg-[var(--accent-soft)] font-semibold text-[var(--accent)]" : "bg-[var(--surface-2)] text-[var(--muted)]"}`}>
            {i + 1}. {["접수", "접수 안내", "현물 확인·판정", "고객 동의·처리", "만족 확인·종결"][i]}
          </li>
        ))}
      </ol>
      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="접수 내용" help={{ kind: "panel", id: "cp.issue" }}>
          <dl className="text-sm">
            {row(
              "고객·차량",
              ro ? (
                <>
                  <Link href={`/repairs/${ro.id}`} className="text-[var(--accent)]">
                    {ro.plateNo} {ro.model} · {ro.docNo}
                  </Link>{" "}
                  · {ro.customerName}
                </>
              ) : (
                c.who
              ),
            )}
            {contact && row("연락처", r.phone ? formatPhone(r.phone) : null)}
            {ro && row("명세서·출고", ro.statement ? `${ro.statement.docNo} · 출고 ${ro.statement.deliveredOn ?? "-"}` : "명세서 없음")}
            {ro &&
              row(
                "보증",
                ro.warranty.all.length ? (
                  <span className="flex flex-wrap gap-1">
                    {ro.warranty.all.map((w) => (
                      <Badge key={w.kind} tone={w.until >= today ? "ok" : "neutral"}>
                        {w.kind} {w.until}까지{w.until >= today ? "" : "(지남)"}
                      </Badge>
                    ))}
                  </span>
                ) : (
                  "명세서에 적힌 보증 없음"
                ),
              )}
            {row("불만 내용", c.content)}
            {row("원하는 처리", c.wish)}
            {row("기한", `접수 안내 ${c.ackDue} · 판정 ${c.judgeDue} · 회신 ${c.replyDue}`)}
          </dl>
          {r.survey?.scores && (
            <div className="mt-2 rounded-md bg-[var(--surface-2)] p-2 text-xs">
              <p className="mb-1 font-semibold">설문 응답</p>
              {SURVEY_QUESTIONS.map((q, i) => (
                <p key={i} className={r.survey!.scores![i] <= 3 ? "text-[var(--danger)]" : ""}>
                  {i + 1}. {q.q} — {r.survey!.scores![i]}점({SCALE_LABEL[r.survey!.scores![i]]})
                </p>
              ))}
            </div>
          )}
          <div className="mt-2">
            <p className="mb-1 text-xs text-[var(--muted)]">현물 사진(출고 검사 사진과 같은 각도)</p>
            <PhotoStrip fields={{ id }} upload={uploadCpPhotoAction} remove={removeCpPhotoAction} photos={c.photos} editable={!closed && (contact || judge)} label="현물" />
          </div>
        </Card>

        <Card title="접수 안내" help={{ kind: "panel", id: "cp.ack" }} actions={late(c.ackDue, !!c.ackAt) && <Badge tone="danger">기한 지남</Badge>}>
          {c.ackAt ? (
            <dl className="text-sm">
              {row("안내", `${fmtTime(c.ackAt)} · ${nm(c.ackBy)}`)}
              {row("내용", c.ackNote)}
            </dl>
          ) : contact ? (
            <AssistForm id={`cp-ack-${id}`} action={complaintAction} className="space-y-3">
              <input type="hidden" name="id" value={id} />
              <input type="hidden" name="intent" value="ack" />
              <TextAreaField help="cp.ackNote" name="ackNote" required rows={2} />
              <SubmitButton>접수 안내함</SubmitButton>
            </AssistForm>
          ) : (
            <p className="text-sm text-[var(--muted)]">상담원이 {c.ackDue}까지 고객에게 접수 확인과 담당자를 안내합니다.</p>
          )}
        </Card>

        <Card title="현물 확인·판정" help={{ kind: "panel", id: "cp.judge" }} actions={late(c.judgeDue, !!c.judgedAt) && <Badge tone="danger">기한 지남</Badge>}>
          {judge && (status === "acked" || status === "judged") ? (
            <AssistForm id={`cp-judge-${id}`} action={complaintAction} className="space-y-3">
              <input type="hidden" name="id" value={id} />
              <input type="hidden" name="intent" value="judge" />
              {ro && (
                <p className="text-xs text-[var(--muted)]">
                  출고 당시 기록과 비교:{" "}
                  <Link href={`/repairs/${ro.id}/inspect`} className="text-[var(--accent)]">
                    최종 검사(F-05-01)
                  </Link>{" "}
                  ·{" "}
                  <Link href={`/repairs/${ro.id}`} className="text-[var(--accent)]">
                    수리 건 사진
                  </Link>
                </p>
              )}
              <TextAreaField help="cp.inspectNote" name="inspectNote" required rows={3} defaultValue={c.inspectNote ?? ""} />
              <RadioRow help="cp.verdict" name="verdict" required defaultValue={c.verdict ?? undefined} options={[
                { value: "covered", label: VERDICTS.covered, tone: "ok" },
                { value: "partial", label: VERDICTS.partial, tone: "warn" },
                { value: "not", label: VERDICTS.not, tone: "danger" },
                { value: "none", label: VERDICTS.none },
              ]} />
              <TextAreaField help="cp.verdictReason" name="verdictReason" required rows={2} defaultValue={c.verdictReason ?? ""} />
              {!c.ncId && (
                <RadioRow help="cp.needNc" name="needNc" required defaultValue={c.category === "quality" ? "1" : "0"} options={[
                  { value: "1", label: "필요(부적합 발행)" },
                  { value: "0", label: "불필요" },
                ]} />
              )}
              <SubmitButton>{c.judgedAt ? "판정 고쳐 저장" : "판정 저장"}</SubmitButton>
            </AssistForm>
          ) : c.judgedAt ? null : (
            <p className="text-sm text-[var(--muted)]">{status === "received" ? "상담원이 접수 안내를 한 뒤 " : ""}품질 담당이 {c.judgeDue}까지 차를 확인하고 보증 해당 여부를 판정합니다.</p>
          )}
          {c.judgedAt && !(judge && status === "judged") && (
            <dl className="text-sm">
              {row("현물 확인", c.inspectNote)}
              {row("판정", <Badge tone={c.verdict === "covered" ? "ok" : c.verdict === "partial" ? "warn" : c.verdict === "not" ? "danger" : "neutral"}>{VERDICTS[c.verdict as keyof typeof VERDICTS]}</Badge>)}
              {row("근거", c.verdictReason)}
              {row("판정한 사람", `${nm(c.judgedBy)} · ${fmtTime(c.judgedAt)}`)}
            </dl>
          )}
          {r.nc && (
            <p className="mt-2 text-sm">
              시정 조치:{" "}
              <Link href={`/nc/${r.nc.id}`} className="text-[var(--accent)]">
                {r.nc.docNo}
              </Link>{" "}
              <Badge>{NC_STATUS[r.nc.status as NcStatus]}</Badge>
            </p>
          )}
        </Card>

        <Card title="고객 동의·처리" help={{ kind: "panel", id: "cp.agree" }}>
          {c.agreedAt && (
            <dl className="mb-3 text-sm">
              {row("처리 방안", c.plan)}
              {row("처리", RESOLUTIONS[c.resolution as keyof typeof RESOLUTIONS])}
              {c.resolution === "warranty_repair" &&
                row(
                  "보증 수리 건",
                  r.warrantyRo ? (
                    <Link href={`/repairs/${r.warrantyRo.id}`} className="text-[var(--accent)]">
                      {r.warrantyRo.docNo} ({RO_STATUS[r.warrantyRo.status] ?? r.warrantyRo.status})
                    </Link>
                  ) : (
                    "아직 연결 안 함"
                  ),
                )}
              {hasComp && row("보상", `${c.compNote ?? ""}${c.compWon ? ` ${c.compWon.toLocaleString("ko-KR")}원` : ""} — ${c.compApprovedAt ? `대표 승인(${nm(c.compApprovedBy)} · ${fmtTime(c.compApprovedAt)})` : "대표 승인 대기"}`)}
              {row("동의 받은 사람", `${nm(c.agreedBy)} · ${fmtTime(c.agreedAt)}`)}
            </dl>
          )}
          {contact && (status === "judged" || status === "agreed") ? (
            <AssistForm id={`cp-agree-${id}`} action={complaintAction} className="space-y-3">
              <input type="hidden" name="id" value={id} />
              <input type="hidden" name="intent" value="agree" />
              <TextAreaField help="cp.plan" name="plan" required rows={2} defaultValue={c.plan ?? ""} />
              <RadioRow help="cp.resolution" name="resolution" required defaultValue={c.resolution ?? (c.verdict === "covered" || c.verdict === "partial" ? "warranty_repair" : "explain")} from={c.resolution ? undefined : "판정"} options={Object.entries(RESOLUTIONS).map(([value, label]) => ({ value, label }))} />
              {(c.verdict === "covered" || c.verdict === "partial") && (
                <div>
                  <SelectField help="cp.warrantyRo" name="warrantyRoId" defaultValue={c.warrantyRoId ?? (r.candidates.length === 1 ? r.candidates[0].id : "")} from={!c.warrantyRoId && r.candidates.length === 1 ? "이 차의 새 수리 건" : undefined} placeholder="아직 없음(접수 후 연결)" options={r.candidates.map((x) => ({ value: x.id, label: `${x.docNo} · ${RO_STATUS[x.status] ?? x.status}` }))} />
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    보증 수리는 새 상담·접수로 수리 건을 만들고(보증 표시) 여기에 연결합니다.{" "}
                    <Link href="/consults/new" className="text-[var(--accent)]">
                      새 상담 쓰기
                    </Link>
                  </p>
                </div>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                <TextField help="cp.compNote" name="compNote" defaultValue={c.compNote ?? ""} />
                <NumberField help="cp.compWon" name="compWon" unit="원" min={0} defaultValue={c.compWon} />
              </div>
              <SubmitButton>{c.agreedAt ? "고쳐 저장" : "고객 동의 받음"}</SubmitButton>
            </AssistForm>
          ) : !c.agreedAt ? (
            <p className="text-sm text-[var(--muted)]">판정이 나오면 상담원이 고객에게 설명하고 처리 방안에 동의를 받습니다.</p>
          ) : null}
          {owner && hasComp && !c.compApprovedAt && (
            <form action={complaintAction} className="mt-3">
              <input type="hidden" name="id" value={id} />
              <input type="hidden" name="intent" value="comp" />
              <SubmitButton variant="secondary">보상 승인(대표)</SubmitButton>
            </form>
          )}
        </Card>

        <Card title="만족 확인·종결" help={{ kind: "panel", id: "cp.close" }}>
          {c.satisfied === false && !closed && (
            <p className="mb-2 rounded-md bg-[var(--danger-soft)] p-2 text-sm">고객 미수용: {c.closeNote} — 대표 면담, 합의가 안 되면 소비자 분쟁 조정 절차를 안내합니다.</p>
          )}
          {closed ? (
            <dl className="text-sm">
              {row("만족 확인", c.closeNote ?? "만족")}
              {row("종결", `${nm(c.closedBy)} · ${c.closedAt && fmtTime(c.closedAt)}`)}
            </dl>
          ) : contact && status === "agreed" ? (
            <AssistForm id={`cp-close-${id}`} action={complaintAction} className="space-y-3">
              <input type="hidden" name="id" value={id} />
              <input type="hidden" name="intent" value="close" />
              {hasComp && !c.compApprovedAt && <p className="text-xs text-[var(--danger)]">보상은 대표 승인 뒤에 종결할 수 있습니다.</p>}
              {c.resolution === "warranty_repair" && r.warrantyRo?.status !== "delivered" && <p className="text-xs text-[var(--danger)]">보증 수리를 검사·출고한 뒤 종결할 수 있습니다.</p>}
              <RadioRow help="cp.satisfied" name="satisfied" required options={[
                { value: "1", label: "만족", tone: "ok" },
                { value: "0", label: "불만족(대표 면담)", tone: "danger" },
              ]} />
              <TextAreaField help="cp.closeNote" name="closeNote" rows={2} />
              <SubmitButton>종결</SubmitButton>
            </AssistForm>
          ) : (
            <p className="text-sm text-[var(--muted)]">처리가 끝나면 상담원이 고객에게 만족 여부를 확인하고 종결합니다.</p>
          )}
        </Card>
      </div>
    </>
  );
}
