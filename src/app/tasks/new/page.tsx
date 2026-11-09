import Link from "next/link";
import { getDb } from "@/db/runtime";
import { listUsers } from "@/modules/auth/service";
import { ROLE_LABEL, type Role } from "@/modules/auth/roles";
import { addDays, seoulDate } from "@/modules/platform/time";
import { canInstruct } from "@/modules/task/service";
import { AssistForm } from "../../_assist";
import { CheckGroup, DateField, RadioRow, TextAreaField, TextField } from "../../_input";
import { requireUser } from "../../_lib/session";
import { SubmitButton } from "../../_submit";
import { Card, ErrorBox, PageTitle } from "../../_ui";
import { issueAction } from "../actions";

/** 업무지시 하기. 수리 건·설비·부적합 화면에서 열면 관련 건이 채워져 온다(?refType=&refId=&refLabel=) */
export default async function NewTaskPage({ searchParams }: { searchParams: Promise<{ refType?: string; refId?: string; refLabel?: string; to?: string; error?: string }> }) {
  const q = await searchParams;
  const user = await requireUser();
  const db = await getDb();
  const allowed = await canInstruct(db, user);
  const users = (await listUsers(db)).filter((u) => u.active && u.id !== user.id);
  const today = seoulDate();
  return (
    <>
      <PageTitle
        help="tasks.new"
        sub="받는 사람의 내 할 일에 올라가고 알림이 갑니다. 여러 명을 고르면 사람마다 따로 보고합니다."
        actions={
          <Link href="/tasks" className="text-sm text-[var(--accent)]">
            ← 업무지시
          </Link>
        }
      >
        업무지시 하기
      </PageTitle>
      <ErrorBox message={q.error} />
      {!allowed ? (
        <p className="text-sm text-[var(--muted)]">업무지시 권한이 없습니다(설정 › 권한표 '업무지시'). 받은 지시는 그 화면에서 '전달'할 수 있습니다.</p>
      ) : (
        <Card title="지시 내용" help={{ kind: "panel", id: "task.new" }}>
          <AssistForm id={`task-new-${q.refId ?? "x"}`} action={issueAction} className="grid gap-3 md:grid-cols-2">
            <input type="hidden" name="refType" value={q.refType ?? ""} />
            <input type="hidden" name="refId" value={q.refId ?? ""} />
            <input type="hidden" name="refLabel" value={q.refLabel ?? ""} />
            <div className="md:col-span-2">
              <TextField help="task.title" name="title" required />
            </div>
            <div className="md:col-span-2">
              <TextAreaField help="task.body" name="body" rows={3} />
            </div>
            {q.refLabel && <p className="text-sm md:col-span-2">관련 건: <b>{q.refLabel}</b> <span className="text-xs text-[var(--muted)]">(앞 화면에서 불러옴)</span></p>}
            <div className="md:col-span-2">
              <CheckGroup help="task.assignees" name="assigneeIds" defaultChecked={q.to ? [q.to] : []} options={users.map((u) => ({ value: u.id, label: `${u.name}(${u.roles.map((r) => ROLE_LABEL[r as Role]).join("·")})` }))} />
            </div>
            <DateField help="task.dueOn" name="dueOn" required min={today} defaultValue={addDays(today, 1)} quick={["today", "tomorrow", "week"]} />
            <RadioRow help="task.urgent" name="urgent" required defaultValue="0" options={[
              { value: "0", label: "보통" },
              { value: "1", label: "긴급", tone: "danger" },
            ]} />
            <RadioRow help="task.needPhoto" name="needPhoto" required defaultValue="0" options={[
              { value: "0", label: "글로만" },
              { value: "1", label: "사진 필수" },
            ]} />
            <div className="md:col-span-2">
              <SubmitButton>지시하기</SubmitButton>
            </div>
          </AssistForm>
        </Card>
      )}
    </>
  );
}
