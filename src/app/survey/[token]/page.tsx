import { getDb } from "@/db/runtime";
import { surveyView } from "@/modules/cs/service";
import { SCALE, SCALE_LABEL, SURVEY_QUESTIONS } from "@/modules/cs/rules";
import { AssistForm } from "../../_assist";
import { RadioRow, TextAreaField } from "../../_input";
import { SubmitButton } from "../../_submit";
import { ErrorBox, Notice, PageTitle } from "../../_ui";
import { answerSurveyAction } from "./actions";

/** 고객용 만족도 설문(F-06-01). 출고 뒤 문자·알림톡 링크로 열린다. 로그인 없음 */
export default async function SurveyPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ error?: string; done?: string }> }) {
  const [{ token }, q] = await Promise.all([params, searchParams]);
  const v = q.done ? null : await surveyView(await getDb(), token);
  return (
    <div className="mx-auto max-w-2xl">
      <PageTitle help="public.survey" sub="1분이면 끝납니다">
        수리 서비스 만족도 설문
      </PageTitle>
      {q.done === "ok" && <Notice>답해 주셔서 감사합니다. 더 나은 서비스로 보답하겠습니다. 이 창은 닫으셔도 됩니다.</Notice>}
      {q.done === "low" && <Notice>소중한 의견 감사합니다. 불편하셨던 점은 담당자가 확인해 1영업일 안에 연락드리겠습니다. 이 창은 닫으셔도 됩니다.</Notice>}
      {v && v.state !== "open" && <Notice>{v.state === "done" ? "이미 답해 주신 설문입니다. 감사합니다." : v.state === "expired" ? "설문 기간이 지났습니다. 의견이 있으시면 정비소로 연락해 주세요." : "올바르지 않은 링크입니다. 받으신 문자의 링크를 다시 열어 주세요."}</Notice>}
      {v?.state === "open" && (
        <div className="space-y-4">
          <ErrorBox message={q.error} />
          <div className="rounded-lg border border-[var(--line)] bg-[var(--surface)] p-4 text-sm">
            {v.name} 고객님, <b>{v.plateNo}</b> {v.model} 차량 수리{v.deliveredOn ? `(${v.deliveredOn} 출고)` : ""}는 어떠셨나요? 1점(매우 불만)부터 5점(매우 만족)까지 골라 주세요.
          </div>
          <AssistForm id={`survey-${token.slice(0, 8)}`} action={answerSurveyAction} className="space-y-4 rounded-lg border border-[var(--line)] bg-[var(--surface)] p-4">
            <input type="hidden" name="token" value={token} />
            {SURVEY_QUESTIONS.map((x, i) => (
              <RadioRow key={i} help="survey.q" label={`${i + 1}. ${x.q}`} name={`q${i}`} required options={SCALE.map((s) => ({ value: String(s), label: `${s} ${s === 1 || s === 5 ? SCALE_LABEL[s] : ""}`.trim(), tone: s <= 2 ? "danger" : s === 3 ? "warn" : "ok" }))} />
            ))}
            <TextAreaField help="survey.comment" name="comment" rows={3} />
            <SubmitButton full>보내기</SubmitButton>
          </AssistForm>
        </div>
      )}
    </div>
  );
}
