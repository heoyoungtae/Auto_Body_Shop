import Link from "next/link";
import { AssistForm } from "../../_assist";
import { requireUser } from "../../_lib/session";
import { SubmitButton } from "../../_submit";
import { Card, ErrorBox, PageTitle } from "../../_ui";
import { submitSuggestionAction } from "../actions";
import { SuggestionFields } from "../_form";

/** 개선 제안 쓰기(15.1): 누구나 */
export default async function NewSuggestionPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
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
      <Card title="제안(F-08-06)" help={{ kind: "panel", id: "sg.form" }}>
        <AssistForm id="sg-new" action={submitSuggestionAction} className="grid gap-3 md:grid-cols-2">
          <SuggestionFields />
          <div className="md:col-span-2">
            <SubmitButton>제안하기</SubmitButton>
          </div>
        </AssistForm>
      </Card>
    </>
  );
}
