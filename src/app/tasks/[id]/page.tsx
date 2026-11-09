import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/db/runtime";
import { listUsers } from "@/modules/auth/service";
import { ROLE_LABEL, type Role } from "@/modules/auth/roles";
import { seoulDate } from "@/modules/platform/time";
import { getInstruction, markRead, RESULTS, TASK_STATUS, TASK_TONE, type TaskStatus } from "@/modules/task/service";
import { AssistForm } from "../../_assist";
import { CheckGroup, RadioRow, TextAreaField, TextField } from "../../_input";
import { requireUser } from "../../_lib/session";
import { SubmitButton } from "../../_submit";
import { Badge, Card, ErrorBox, fmtTime, Notice, PageTitle } from "../../_ui";
import { PhotoStrip } from "../../photo-strip";
import { removeTaskPhotoAction, taskAction, uploadTaskPhotoAction } from "../actions";

function refHref(type: string | null, id: string | null) {
  if (!type || !id) return null;
  if (type === "repair_order") return `/repairs/${id}`;
  if (type === "equipment") return `/equipment/${id}`;
  if (type === "nonconformance") return `/nc/${id}`;
  if (type === "complaint") return `/complaints/${id}`;
  return null;
}

/** 업무지시 한 건: 지시 내용, 내 일(보고·전달), 내가 확인할 보고, 진행(전달 사슬) */
export default async function TaskPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; notice?: string }> }) {
  const { id } = await params;
  const q = await searchParams;
  const user = await requireUser();
  const db = await getDb();
  await markRead(db, user, id).catch(() => null);
  const r = await getInstruction(db, user, id).catch(() => null);
  if (!r) notFound();
  const { i, tasks, names } = r;
  const nm = (u: string) => names.get(u) ?? "-";
  const today = seoulDate();
  const mine = tasks.filter((t) => t.assigneeId === user.id && t.status === "open");
  const toCheck = tasks.filter((t) => t.fromUserId === user.id && t.status === "reported");
  const users = mine.length ? (await listUsers(db)).filter((u) => u.active && u.id !== user.id && u.id !== i.issuedBy) : [];
  const href = refHref(i.refType, i.refId);
  const depth = (t: (typeof tasks)[number]): number => (t.parentTaskId ? 1 + depth(tasks.find((x) => x.id === t.parentTaskId)!) : 0);
  const ordered: typeof tasks = [];
  const walk = (parent: string | null) => tasks.filter((t) => t.parentTaskId === parent).forEach((t) => (ordered.push(t), walk(t.id)));
  walk(null);
  return (
    <>
      <PageTitle
        help="tasks.detail"
        sub={`${nm(i.issuedBy)} 지시 · ${fmtTime(i.createdAt)} · 기한 ${i.dueOn}${i.needPhoto ? " · 사진 필수" : ""}`}
        actions={
          <Link href="/tasks" className="text-sm text-[var(--accent)]">
            ← 업무지시
          </Link>
        }
      >
        {i.docNo} {i.title} {i.urgent && <Badge tone="danger">긴급</Badge>} {i.dueOn < today && tasks.some((t) => t.status !== "done") && <Badge tone="danger">기한 지남</Badge>}
      </PageTitle>
      <ErrorBox message={q.error} />
      {q.notice && <Notice>{q.notice}</Notice>}
      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="지시 내용" help={{ kind: "panel", id: "task.detail" }}>
          <p className="text-sm whitespace-pre-wrap">{i.body || "(내용 없음)"}</p>
          {i.refLabel && (
            <p className="mt-2 text-sm">
              관련 건: {href ? <Link href={href} className="text-[var(--accent)]">{i.refLabel}</Link> : i.refLabel}
            </p>
          )}
        </Card>

        <Card title="진행" help={{ kind: "panel", id: "task.flow" }}>
          <ul className="space-y-2 text-sm">
            {ordered.map((t) => (
              <li key={t.id} style={{ paddingLeft: `${depth(t) * 1.25}rem` }}>
                <span className="text-[var(--muted)]">{nm(t.fromUserId)} →</span> <b>{nm(t.assigneeId)}</b> <Badge tone={TASK_TONE[t.status as TaskStatus]}>{TASK_STATUS[t.status as TaskStatus]}</Badge>
                <span className="ml-1 text-xs text-[var(--muted)]">{t.readAt ? `읽음 ${fmtTime(t.readAt)}` : "안 읽음"}</span>
                {t.note && <p className="text-xs text-[var(--muted)]">전달 메모: {t.note}</p>}
                {t.returnNote && t.status === "open" && <p className="text-xs text-[var(--danger)]">보완 요청: {t.returnNote}</p>}
                {t.reportedAt && t.report && (
                  <p className="mt-0.5 text-xs whitespace-pre-wrap">
                    {RESULTS[t.result as keyof typeof RESULTS]} · {fmtTime(t.reportedAt)}: {t.report}
                  </p>
                )}
                {t.reportedAt && t.reportPhotos.length > 0 && t.status !== "open" && (
                  <div className="mt-1">
                    <PhotoStrip fields={{ task: t.id, ins: id }} upload={uploadTaskPhotoAction} remove={removeTaskPhotoAction} photos={t.reportPhotos} editable={false} label="보고" />
                  </div>
                )}
              </li>
            ))}
          </ul>
        </Card>

        {mine.map((t) => (
          <Card key={t.id} title="내 일: 결과보고" help={{ kind: "panel", id: "task.report" }} actions={t.returnNote && <Badge tone="danger">보완 요청</Badge>}>
            {t.returnNote && <p className="mb-2 rounded-md bg-[var(--danger-soft)] p-2 text-sm">보완 요청: {t.returnNote}</p>}
            <p className="mb-1 text-xs text-[var(--muted)]">사진{i.needPhoto ? "(완료 보고에 필수)" : "(있으면)"}</p>
            <PhotoStrip fields={{ task: t.id, ins: id }} upload={uploadTaskPhotoAction} remove={removeTaskPhotoAction} photos={t.reportPhotos} editable label="보고" />
            <AssistForm id={`task-rep-${t.id}`} action={taskAction} className="mt-3 space-y-3">
              <input type="hidden" name="ins" value={id} />
              <input type="hidden" name="task" value={t.id} />
              <input type="hidden" name="intent" value="report" />
              <RadioRow help="task.result" name="result" required defaultValue={t.result ?? undefined} options={[
                { value: "done", label: "완료", tone: "ok" },
                { value: "notdone", label: "못함", tone: "danger" },
              ]} />
              <TextAreaField help="task.report" name="report" required rows={3} defaultValue={t.report ?? ""} from={t.report && t.returnNote ? "지난 보고" : undefined} />
              <SubmitButton>결과보고</SubmitButton>
            </AssistForm>
            <details className="mt-4 border-t border-[var(--line)] pt-3">
              <summary className="cursor-pointer text-sm text-[var(--accent)]">다른 사람에게 전달하기</summary>
              <AssistForm id={`task-fwd-${t.id}`} action={taskAction} className="mt-3 space-y-3">
                <input type="hidden" name="ins" value={id} />
                <input type="hidden" name="task" value={t.id} />
                <input type="hidden" name="intent" value="forward" />
                <CheckGroup help="task.forwardTo" name="assigneeIds" options={users.map((u) => ({ value: u.id, label: `${u.name}(${u.roles.map((x) => ROLE_LABEL[x as Role]).join("·")})` }))} />
                <TextField help="task.note" name="note" />
                <SubmitButton variant="secondary">전달</SubmitButton>
              </AssistForm>
            </details>
          </Card>
        ))}

        {toCheck.map((t) => (
          <Card key={t.id} title={`보고 확인: ${nm(t.assigneeId)}`} help={{ kind: "panel", id: "task.confirm" }}>
            <p className="text-sm">
              <Badge tone={t.result === "done" ? "ok" : "danger"}>{RESULTS[t.result as keyof typeof RESULTS]}</Badge> {t.reportedAt && fmtTime(t.reportedAt)}
            </p>
            <p className="mt-1 text-sm whitespace-pre-wrap">{t.report}</p>
            {t.reportPhotos.length > 0 && (
              <div className="mt-2">
                <PhotoStrip fields={{ task: t.id, ins: id }} upload={uploadTaskPhotoAction} remove={removeTaskPhotoAction} photos={t.reportPhotos} editable={false} label="보고" />
              </div>
            )}
            <form action={taskAction} className="mt-3">
              <input type="hidden" name="ins" value={id} />
              <input type="hidden" name="task" value={t.id} />
              <input type="hidden" name="intent" value="confirm" />
              <SubmitButton>확인(끝)</SubmitButton>
            </form>
            <AssistForm id={`task-ret-${t.id}`} action={taskAction} className="mt-3 space-y-2 border-t border-[var(--line)] pt-3">
              <input type="hidden" name="ins" value={id} />
              <input type="hidden" name="task" value={t.id} />
              <input type="hidden" name="intent" value="return" />
              <TextField help="task.returnNote" name="returnNote" required />
              <SubmitButton variant="secondary">보완 요청</SubmitButton>
            </AssistForm>
          </Card>
        ))}
      </div>
    </>
  );
}
