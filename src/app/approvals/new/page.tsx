import { SubmitButton } from "../../_submit";
import { ErrorBox, Field, Notice, PageTitle, TextArea } from "../../_ui";
import { requireUser } from "../../_lib/session";
import { createRevisionRequestAction } from "../actions";

export default async function NewRevisionRequest({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  await requireUser();
  return (
    <div className="max-w-2xl">
      <PageTitle sub="F-Q-05 · 사내 표준서 Q.5 문서 관리. 결재: 요청 → 품질 담당 검토 → 대표 승인(부록 B)">문서 개정 요청서</PageTitle>
      <form action={createRevisionRequestAction} className="space-y-4">
        <ErrorBox message={error} />
        <Notice>표준서·양식·정책값을 바꾸려면 이 요청서를 먼저 올립니다. 확정되면 받은 번호(R-)를 설정 화면의 변경 근거로 적습니다.</Notice>
        <Field label="제목" name="title" required placeholder="예: 견적 유효기간 14일 → 10일" />
        <Field label="대상 문서·조항·정책값" name="target" required placeholder="예: 부록 D 견적 유효기간(3.2)" />
        <TextArea label="현재 내용" name="current" />
        <TextArea label="바꿀 내용" name="proposed" required />
        <TextArea label="사유" name="reason" required />
        <SubmitButton>상신</SubmitButton>
      </form>
    </div>
  );
}
