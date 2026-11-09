import Link from "next/link";
import { getDb } from "@/db/runtime";
import { canInstruct, listInstructions, TASK_STATUS, TASK_TONE, type TaskStatus, type TaskTab } from "@/modules/task/service";
import { seoulDate } from "@/modules/platform/time";
import { requireUser } from "../_lib/session";
import { Badge, buttonClass, Card, Empty, Notice, PageTitle } from "../_ui";

/** 업무지시 목록: 받은 지시 / 보낸 지시 / 전체(대표) */
export default async function TasksPage({ searchParams }: { searchParams: Promise<{ tab?: string; notice?: string }> }) {
  const q = await searchParams;
  const user = await requireUser();
  const db = await getDb();
  const owner = user.roles.includes("owner");
  const tab: TaskTab = q.tab === "sent" ? "sent" : q.tab === "all" && owner ? "all" : "received";
  const [rows, issuer] = await Promise.all([listInstructions(db, user, tab), canInstruct(db, user)]);
  const today = seoulDate();
  const tabs: [TaskTab, string][] = [["received", "받은 지시"], ["sent", "보낸 지시"], ...(owner ? [["all", "전체"] as [TaskTab, string]] : [])];
  return (
    <>
      <PageTitle
        help="tasks"
        sub="지시를 받으면 내 할 일에 올라오고, 하고 나서 결과를 보고합니다. 받은 지시는 아랫사람에게 전달할 수 있고, 전달받은 사람들의 보고는 확인하면 위로 저절로 올라갑니다."
        actions={
          issuer && (
            <Link href="/tasks/new" className={buttonClass()}>
              업무지시 하기
            </Link>
          )
        }
      >
        업무지시
      </PageTitle>
      {q.notice && <Notice>{q.notice}</Notice>}
      <Card title="지시 목록" help={{ kind: "panel", id: "task.list" }}>
        <div className="mb-3 flex flex-wrap gap-1.5 text-sm">
          {tabs.map(([k, label]) => (
            <Link key={k} href={`/tasks?tab=${k}`} className={`rounded-full border px-3 py-1 ${tab === k ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]" : "border-[var(--line)]"}`}>
              {label}
            </Link>
          ))}
        </div>
        {rows.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-[var(--muted)]">
                <tr>
                  <th className="py-1.5 pr-2">번호</th>
                  <th className="pr-2">제목</th>
                  <th className="pr-2">지시</th>
                  <th className="pr-2">기한</th>
                  <th className="pr-2">진행</th>
                  <th>{tab === "received" ? "내 상태" : "확인할 보고"}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line)]">
                {rows.map((r) => (
                  <tr key={r.i.id}>
                    <td className="py-2 pr-2 font-mono text-xs whitespace-nowrap">
                      <Link href={`/tasks/${r.i.id}`} className="text-[var(--accent)]">
                        {r.i.docNo}
                      </Link>
                      {r.i.urgent && <Badge tone="danger">긴급</Badge>}
                    </td>
                    <td className="pr-2">
                      {r.i.title}
                      {r.i.refLabel && <span className="ml-1 text-xs text-[var(--muted)]">· {r.i.refLabel}</span>}
                    </td>
                    <td className="pr-2 text-xs whitespace-nowrap">{r.issuer}</td>
                    <td className={`pr-2 text-xs whitespace-nowrap ${!r.closed && r.i.dueOn < today ? "font-bold text-[var(--danger)]" : ""}`}>{r.i.dueOn}</td>
                    <td className="pr-2 text-xs whitespace-nowrap">{r.closed ? <Badge tone="ok">끝</Badge> : `${r.doneCount}/${r.total}명 확인`}</td>
                    <td className="whitespace-nowrap">
                      {tab === "received" && r.mine ? <Badge tone={TASK_TONE[r.mine.status as TaskStatus]}>{TASK_STATUS[r.mine.status as TaskStatus]}</Badge> : r.waitingMe ? <Badge tone="warn">{r.waitingMe}건</Badge> : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty>{tab === "received" ? "받은 지시가 없습니다." : "보낸 지시가 없습니다."}</Empty>
        )}
      </Card>
    </>
  );
}
