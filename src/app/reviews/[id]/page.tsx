import Link from "next/link";
import { getDb } from "@/db/runtime";
import { can } from "@/modules/auth/permissions";
import { seoulDate } from "@/modules/platform/time";
import {
  getReview,
  REVIEW_ITEMS,
  REVIEW_STATUS,
  SCORE_LABEL,
  skillName,
  suggestScores,
  type Evidence,
  type ReviewItem,
} from "@/modules/staff/review";
import { AssistForm } from "../../_assist";
import { DateField, RadioRow, TextAreaField, TextField } from "../../_input";
import { requireUser, userMessage } from "../../_lib/session";
import { SubmitButton } from "../../_submit";
import { Badge, Card, ErrorBox, fmtTime, Notice, PageTitle } from "../../_ui";
import { reviewAction } from "../actions";

/** 인사평가 한 건: 근거(앱 기록) → 점수·의견 → 면담·본인 의견 → 대표 확정 */
export default async function ReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ notice?: string; error?: string }>;
}) {
  const { id } = await params;
  const q = await searchParams;
  const user = await requireUser();
  let data: Awaited<ReturnType<typeof getReview>>;
  try {
    data = await getReview(await getDb(), user, id);
  } catch (e) {
    return <ErrorBox message={userMessage(e)} />;
  }
  const { r, names, own } = data;
  const e = r.evidence as unknown as Evidence;
  const sug = suggestScores(e);
  const edit = r.status === "draft" && can(user, "review.write") && !own;
  const evidenceText: Record<ReviewItem, string> = {
    competency: e.skills.length
      ? e.skills.map((s) => `${skillName(s.skill)} ${s.level}단계`).join(" · ")
      : "확인된 역량 기록 없음",
    quality: `작업 ${e.steps}공정(수리 건 ${e.orders}) · 재작업 생긴 건 ${e.reworkOrders} · 품질 불만 ${e.complaints}`,
    safety: e.zones.length
      ? e.zones
          .map((z) => `${z.zone}구역 월 평균 ${z.avg}점(${z.months}개월)`)
          .join(" · ")
      : "담당 5S 구역 없음",
    attendance: `결근 ${e.absentDays}일 · 지각·조퇴 ${e.lateCount}회 · 병가 ${e.sickDays}일 · 연차 사용 ${e.annualUsed}일`,
    suggestion: `제안 ${e.suggestions}건 · 채택 ${e.adopted}건 · 교육 이수 ${e.trainingHours}시간`,
  };
  const hidden = (intent: string) => (
    <>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="intent" value={intent} />
    </>
  );
  return (
    <>
      <PageTitle
        help="reviews.detail"
        sub={`${r.docNo} · 평가자 ${r.reviewerId ? names.get(r.reviewerId) : "-"}${r.confirmedAt ? ` · ${fmtTime(r.confirmedAt)} 확정` : ""}`}
        actions={
          !own && (
            <Link
              href={`/reviews?year=${r.year}`}
              className="text-sm text-[var(--accent)]"
            >
              ← 인사평가
            </Link>
          )
        }
      >
        {r.year}년 인사평가 · {names.get(r.userId)}{" "}
        <Badge tone={r.status === "confirmed" ? "ok" : "warn"}>
          {REVIEW_STATUS[r.status as keyof typeof REVIEW_STATUS]}
        </Badge>
        {r.grade && <Badge>{r.grade}등급</Badge>}
      </PageTitle>
      <ErrorBox message={q.error} />
      {q.notice && <Notice>{q.notice}</Notice>}

      {edit ? (
        <Card title="평가(근거 → 점수)" help={{ kind: "panel", id: "rv.form" }}>
          <AssistForm
            id={`rv-${id}`}
            action={reviewAction}
            className="grid gap-4"
          >
            <input type="hidden" name="id" value={id} />
            {(Object.keys(REVIEW_ITEMS) as ReviewItem[]).map((k) => (
              <div
                key={k}
                className="grid gap-2 rounded-md border border-[var(--line)] p-3"
              >
                <p className="text-sm font-medium">
                  {REVIEW_ITEMS[k].label}{" "}
                  <span className="text-xs text-[var(--muted)]">
                    ({REVIEW_ITEMS[k].std})
                  </span>
                </p>
                <p className="text-xs text-[var(--muted)]">
                  근거: {evidenceText[k]} · 제안 {sug[k]}점
                </p>
                <RadioRow
                  help="rv.score"
                  label={`${REVIEW_ITEMS[k].label} 점수`}
                  name={`score_${k}`}
                  required
                  defaultValue={String(r.scores[k] ?? sug[k])}
                  from={r.scores[k] === sug[k] ? "앱 기록 제안" : undefined}
                  options={[5, 4, 3, 2, 1].map((v) => ({
                    value: String(v),
                    label: `${v} ${SCORE_LABEL[v as 5]}`,
                    tone: v >= 4 ? "ok" : v === 3 ? undefined : "danger",
                  }))}
                />
                <TextField
                  help="rv.comment"
                  name={`comment_${k}`}
                  defaultValue={r.comments[k] ?? ""}
                />
              </div>
            ))}
            <TextAreaField
              help="rv.strengths"
              name="strengths"
              rows={2}
              defaultValue={r.strengths ?? ""}
            />
            <TextAreaField
              help="rv.improve"
              name="improve"
              rows={2}
              defaultValue={r.improve ?? ""}
            />
            <TextField
              help="rv.trainingNeeds"
              name="trainingNeeds"
              defaultValue={r.trainingNeeds ?? ""}
            />
            <TextField
              help="rv.wageNote"
              name="wageNote"
              defaultValue={r.wageNote ?? ""}
            />
            <div className="flex flex-wrap gap-2">
              <SubmitButton name="intent" value="save" variant="secondary">
                저장
              </SubmitButton>
              <SubmitButton name="intent" value="submit">
                면담으로 넘기기
              </SubmitButton>
            </div>
          </AssistForm>
          <AssistForm
            id={`rv-refresh-${id}`}
            action={reviewAction}
            guard={false}
            className="mt-2"
          >
            {hidden("refresh")}
            <SubmitButton variant="secondary">근거 다시 모으기</SubmitButton>
          </AssistForm>
        </Card>
      ) : (
        <Card title="평가 결과" help={{ kind: "panel", id: "rv.result" }}>
          <table className="w-full text-sm">
            <tbody>
              {(Object.keys(REVIEW_ITEMS) as ReviewItem[]).map((k) => (
                <tr key={k} className="border-t border-[var(--line)] align-top">
                  <td className="w-32 py-1 pr-2">{REVIEW_ITEMS[k].label}</td>
                  <td className="w-24 py-1 pr-2">
                    {r.scores[k]
                      ? `${r.scores[k]} ${SCORE_LABEL[r.scores[k] as 5]}`
                      : "-"}
                  </td>
                  <td className="py-1 text-xs text-[var(--muted)]">
                    {evidenceText[k]}
                    {r.comments[k] ? ` — ${r.comments[k]}` : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <dl className="mt-3 grid gap-1 text-sm">
            <div>
              평균 {r.total ?? "-"} · {r.grade ?? "-"}등급
            </div>
            {r.strengths && <div>잘한 점: {r.strengths}</div>}
            {r.improve && <div>보완할 점: {r.improve}</div>}
            {r.trainingNeeds && (
              <div>
                필요 교육: {r.trainingNeeds}
                {r.trainingId && (
                  <>
                    {" "}
                    ·{" "}
                    <Link
                      href={`/training/${r.trainingId}`}
                      className="text-[var(--accent)]"
                    >
                      교육 계획
                    </Link>
                  </>
                )}
              </div>
            )}
            {!own && r.wageNote && <div>임금 조정 의견: {r.wageNote}</div>}
            {r.employeeAckAt && (
              <div>
                면담 {r.interviewedOn} · 본인 의견:{" "}
                {r.employeeComment ?? "없음"}
              </div>
            )}
          </dl>
        </Card>
      )}

      {own && r.status === "interview" && !r.employeeAckAt && (
        <Card title="면담 확인" help={{ kind: "panel", id: "rv.ack" }}>
          <AssistForm
            id={`rv-ack-${id}`}
            action={reviewAction}
            className="grid gap-3"
          >
            {hidden("ack")}
            <DateField
              help="rv.interviewedOn"
              name="interviewedOn"
              required
              defaultValue={seoulDate()}
              quick={["today"]}
            />
            <TextAreaField
              help="rv.employeeComment"
              name="employeeComment"
              rows={3}
            />
            <div>
              <SubmitButton>면담했고 결과를 봤습니다</SubmitButton>
            </div>
          </AssistForm>
        </Card>
      )}

      {can(user, "review.confirm") && r.status === "interview" && (
        <Card title="확정" help={{ kind: "panel", id: "rv.confirm" }}>
          <div className="flex flex-wrap gap-2">
            {r.employeeAckAt ? (
              <AssistForm
                id={`rv-conf-${id}`}
                action={reviewAction}
                guard={false}
              >
                {hidden("confirm")}
                <SubmitButton>
                  확정{r.trainingNeeds ? "(필요 교육을 내년 계획에 올림)" : ""}
                </SubmitButton>
              </AssistForm>
            ) : (
              <p className="text-sm text-[var(--muted)]">
                본인 면담 확인을 기다립니다.
              </p>
            )}
            <AssistForm id={`rv-ret-${id}`} action={reviewAction} guard={false}>
              {hidden("return")}
              <SubmitButton variant="danger">
                공장장에게 돌려보내기
              </SubmitButton>
            </AssistForm>
          </div>
        </Card>
      )}
    </>
  );
}
