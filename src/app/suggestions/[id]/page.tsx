import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/db/runtime";
import { can } from "@/modules/auth/permissions";
import { SG_DECISIONS, SG_STATUS, SG_TONE, type SgStatus } from "@/modules/equipment/rules";
import { getSuggestion } from "@/modules/equipment/suggestion";
import { seoulDate } from "@/modules/platform/time";
import { AssistForm } from "../../_assist";
import { RadioRow, TextAreaField, TextField } from "../../_input";
import { requireUser } from "../../_lib/session";
import { SubmitButton } from "../../_submit";
import { Badge, buttonClass, Card, ErrorBox, fmtTime, Notice, PageTitle } from "../../_ui";
import { PhotoStrip } from "../../photo-strip";
import { removeSgPhotoAction, suggestionAction, uploadSgPhotoAction } from "../actions";
import { SuggestionFields } from "../_form";

/** 개선 제안 한 건: 내용·사진, 공장장 회신, 채택안 실행·효과 확인, 표준서 개정 요청 */
export default async function SuggestionPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; notice?: string }> }) {
  const { id } = await params;
  const q = await searchParams;
  const user = await requireUser();
  const db = await getDb();
  const r = await getSuggestion(db, id).catch(() => null);
  if (!r) notFound();
  const { s, names } = r;
  const decide = can(user, "suggest.decide");
  const mine = s.proposerId === user.id;
  const status = s.status as SgStatus;
  const nm = (u: string | null) => (u ? (names.get(u) ?? "-") : "-");
  const today = seoulDate();
  const row = (k: string, v: React.ReactNode) => (
    <div className="flex gap-2 py-1">
      <dt className="w-28 shrink-0 text-[var(--muted)]">{k}</dt>
      <dd className="min-w-0 whitespace-pre-wrap">{v || "-"}</dd>
    </div>
  );
  return (
    <>
      <PageTitle
        help="suggestions.detail"
        sub={`${s.docNo} · ${nm(s.proposerId)} · ${fmtTime(s.createdAt)}${s.area ? ` · ${s.area}` : ""}`}
        actions={
          <Link href="/suggestions" className="text-sm text-[var(--accent)]">
            ← 개선 제안
          </Link>
        }
      >
        {s.title} <Badge tone={SG_TONE[status]}>{SG_STATUS[status]}</Badge>
      </PageTitle>
      <ErrorBox message={q.error} />
      {q.notice && <Notice>{q.notice}</Notice>}
      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="제안 내용" help={{ kind: "panel", id: "sg.form" }}>
          <dl className="text-sm">
            {row("현재 문제", s.problem)}
            {row("개선안", s.proposal)}
            {row("기대 효과", s.effect)}
          </dl>
          <div className="mt-3">
            <PhotoStrip fields={{ id }} upload={uploadSgPhotoAction} remove={removeSgPhotoAction} photos={s.photos} editable={(mine || decide) && status !== "rejected" && status !== "done"} label="제안" />
          </div>
          {mine && (status === "submitted" || status === "held") && (
            <details className="mt-3">
              <summary className="cursor-pointer text-sm text-[var(--accent)]">고치기</summary>
              <AssistForm id={`sg-edit-${id}`} action={suggestionAction} className="mt-3 grid gap-3 md:grid-cols-2">
                <input type="hidden" name="id" value={id} />
                <input type="hidden" name="intent" value="update" />
                <SuggestionFields s={s} />
                <div className="md:col-span-2">
                  <SubmitButton>저장</SubmitButton>
                </div>
              </AssistForm>
            </details>
          )}
        </Card>

        <Card title="회신·실행" help={{ kind: "panel", id: "sg.reply" }}>
          {s.decidedAt && (
            <dl className="mb-3 text-sm">
              {row("결정", `${SG_DECISIONS[(status === "done" ? "adopted" : status) as keyof typeof SG_DECISIONS] ?? SG_STATUS[status]} · ${nm(s.decidedBy)} · ${fmtTime(s.decidedAt)}`)}
              {row("사유", s.reply)}
              {s.doneAt && row("실행", s.doneNote)}
              {s.doneAt && row("효과", s.effectNote)}
              {s.doneAt && row("실행 확인", `${nm(s.doneBy)} · ${fmtTime(s.doneAt)}`)}
              {s.revisionRef && row("표준 개정", s.revisionRef)}
            </dl>
          )}
          {(status === "submitted" || status === "held") &&
            (decide ? (
              <AssistForm id={`sg-decide-${id}`} action={suggestionAction} className="space-y-3">
                <input type="hidden" name="id" value={id} />
                <input type="hidden" name="intent" value="decide" />
                <p className={`text-sm ${s.replyDue < today ? "font-semibold text-[var(--danger)]" : ""}`}>회신 기한 {s.replyDue}{s.replyDue < today ? " (지남)" : ""}</p>
                <RadioRow
                  help="sg.decision"
                  name="decision"
                  required
                  options={[
                    { value: "adopted", label: SG_DECISIONS.adopted, tone: "ok" },
                    { value: "held", label: SG_DECISIONS.held, tone: "warn" },
                    { value: "rejected", label: SG_DECISIONS.rejected, tone: "danger" },
                  ]}
                />
                <TextAreaField help="sg.reply" name="reply" required rows={2} />
                <SubmitButton>회신</SubmitButton>
              </AssistForm>
            ) : (
              <p className="text-sm text-[var(--muted)]">공장장이 {s.replyDue}까지 회신합니다.</p>
            ))}
          {status === "adopted" &&
            (decide ? (
              <AssistForm id={`sg-done-${id}`} action={suggestionAction} className="grid gap-3">
                <input type="hidden" name="id" value={id} />
                <input type="hidden" name="intent" value="done" />
                <TextAreaField help="sg.doneNote" name="doneNote" required rows={2} />
                <TextAreaField help="sg.effectNote" name="effectNote" required rows={2} />
                <TextField help="sg.revisionRef" name="revisionRef" />
                <div className="flex flex-wrap items-center gap-2">
                  <SubmitButton>실행·효과 확인</SubmitButton>
                  <Link href={`/approvals/new?suggest=${id}`} className={buttonClass("secondary")}>
                    표준서·지침서 개정 요청 쓰기
                  </Link>
                </div>
              </AssistForm>
            ) : (
              <p className="text-sm text-[var(--muted)]">채택했습니다. 공장장이 실행하고 효과를 확인합니다.</p>
            ))}
          {status === "done" && !s.revisionRef && decide && (
            <Link href={`/approvals/new?suggest=${id}`} className="text-sm text-[var(--accent)]">
              표준서·지침서에 반영할 것이 있으면 개정 요청 쓰기 →
            </Link>
          )}
        </Card>
      </div>
    </>
  );
}
