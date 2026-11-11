import Link from "next/link";
import { AssistForm } from "../../_assist";
import { requireUser } from "../../_lib/session";
import { SubmitButton } from "../../_submit";
import { Card, ErrorBox, PageTitle } from "../../_ui";
import { submitSuggestionAction } from "../actions";
import { SuggestionFields } from "../_form";

/** 개선 제안 쓰기(15.1): 누구나 */
export default async function NewSuggestionPage({ searchParams }: { searchParams: Promise<{ error?: string; problem?: string; jd?: string }> }) {
  const q = await searchParams;
  await requireUser();
  return (
    <>
      <PageTitle
        help="suggestions.new"
        sub="불편하거나 위험하거나 낭비되는 것이 보이면 누구나 제안합니다. 사진은 제출한 뒤 다음 화면에서 올립니다."
        actions={
          <Link href="/suggestions" className="text-sm text-[var(--accent)]">
            ← 개선 제안
          </Link>
        }
      >
        개선 제안 쓰기
      </PageTitle>
      <ErrorBox message={q.error} />
      {q.jd && <p className="mb-3 text-sm text-[var(--muted)]">{q.jd} 업무일지의 건의를 불러왔습니다. 제목과 개선안을 다듬어 제안하면 일지에 제안 번호가 남습니다.</p>}
      <Card title="제안(F-08-06)" help={{ kind: "panel", id: "sg.form" }}>
        <AssistForm id="sg-new" action={submitSuggestionAction} className="grid gap-3 md:grid-cols-2">
          {q.jd && <input type="hidden" name="journalDay" value={q.jd} />}
          <SuggestionFields s={q.problem ? { title: q.problem.split("\n")[0].slice(0, 40), area: null, problem: q.problem, proposal: "", effect: null } : undefined} />
          <div className="md:col-span-2">
            <SubmitButton>제안하기</SubmitButton>
          </div>
        </AssistForm>
      </Card>
    </>
  );
}
