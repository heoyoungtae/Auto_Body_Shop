// 사내 교재 쓰기·고치기 칸(새 교재·개정 공용)
import type { trainingManual } from "@/db/schema";
import { AssistForm } from "../../_assist";
import { CheckGroup, TextAreaField, TextField } from "../../_input";
import { SubmitButton } from "../../_submit";
import { EvidenceFiles } from "../../money/evidence-files";
import { manualAction } from "../actions";

/** 새 교재의 뼈대(우리 정비소만의 내용을 이 순서로 채운다) */
export const MANUAL_TEMPLATE = `1. 목적
이 교재로 무엇을 할 수 있게 되는지 한 줄로.

2. 근거
표준서 번호·조항(예: STD-05 5.3 도장 전 탈지).

3. 준비물·보호구
-

4. 작업 순서(사진 번호와 맞춤)
1)
2)
3)

5. 자주 하는 실수와 확인 방법
-

6. 안전 주의
-`;

export function ManualForm({ m, docs }: { m?: typeof trainingManual.$inferSelect; docs: { value: string; label: string }[] }) {
  return (
    <AssistForm id={`manual-${m?.id ?? "new"}`} action={manualAction} draft={!m} className="grid gap-3">
      <input type="hidden" name="id" value={m?.id ?? ""} />
      <input type="hidden" name="intent" value="save" />
      <TextField help="tm.title" name="title" required defaultValue={m?.title ?? ""} />
      <CheckGroup help="tm.docIds" name="docIds" defaultChecked={m?.stdRevs.map((s) => s.docId) ?? []} options={docs} />
      <TextAreaField help="tm.body" name="body" required rows={16} defaultValue={m?.body || MANUAL_TEMPLATE} />
      <EvidenceFiles help="tm.files" name="manualFiles" pickLabel="+ 사진·PDF 붙이기" saved={m?.files.length ?? 0} />
      <TextField help="tm.videoUrl" name="videoUrl" type="url" inputMode="url" defaultValue={m?.videoUrl ?? ""} />
      {m && m.rev > 0 && <TextField help="tm.changeNote" name="changeNote" required defaultValue="" />}
      <div>
        <SubmitButton>{m ? (m.rev > 0 ? "개정안 저장(승인 요청)" : "저장(승인 요청)") : "저장(승인 요청)"}</SubmitButton>
      </div>
    </AssistForm>
  );
}
