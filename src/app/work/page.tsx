import Link from "next/link";
import { getDb } from "@/db/runtime";
import { workBoard } from "@/modules/repair/work";
import { WO_STATUS_LABEL, processLabel } from "@/modules/repair/work-rules";
import { requireUser } from "../_lib/session";
import { Badge, Card, Empty, PageTitle } from "../_ui";

/** 작업 현황판(STD-04): 차량별 지금 공정, 출고 약속일 지연, 지시서가 아직 없는 승인 건 */
export default async function WorkBoardPage() {
  await requireUser();
  const { board, needOrder } = await workBoard(await getDb());
  return (
    <>
      <PageTitle help="work" std="F-04-01 · STD-04" sub="작업 지시서를 만들고 공정 진행을 봅니다.">
        작업·공정
      </PageTitle>
      <div className="mt-4 space-y-4">
        {needOrder.length > 0 && (
          <Card title="작업 지시 대기" help={{ kind: "panel", id: "work.needOrder" }}>
            <ul className="divide-y divide-[var(--line)] text-sm">
              {needOrder.map((n) => (
                <li key={n.roId} className="flex flex-wrap items-center gap-2 py-2">
                  <Link href={`/repairs/${n.roId}#work`} className="font-medium text-[var(--accent)] hover:underline">
                    {n.roNo}
                  </Link>
                  {n.customerName} · {n.plateNo}
                  <span className="ml-auto text-[var(--muted)]">고객 승인 끝 — 공장장이 작업 지시서를 만듭니다</span>
                </li>
              ))}
            </ul>
          </Card>
        )}
        <Card title="진행 중인 작업" help={{ kind: "panel", id: "work.board" }}>
          {board.length ? (
            <ul className="grid gap-3 md:grid-cols-2 2xl:grid-cols-4">
              {board.map((b) => (
                <li key={b.id} className={`rounded-lg border p-3 text-sm ${b.late ? "border-[var(--danger)]" : "border-[var(--line)]"}`}>
                  <div className="flex items-center gap-2">
                    <Link href={`/work/${b.id}`} className="font-semibold text-[var(--accent)] hover:underline">
                      {b.plateNo}
                    </Link>
                    <span className="text-[var(--muted)]">{b.model}</span>
                    <Badge tone={b.status === "working" ? "accent" : "warn"}>{WO_STATUS_LABEL[b.status]}</Badge>
                  </div>
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    {b.docNo} · {b.roNo} · {b.customerName}
                  </p>
                  <div className="mt-2 h-2 overflow-hidden rounded bg-[var(--bg)]" aria-label={`공정 ${b.done}/${b.total}`}>
                    <div className="h-full bg-[var(--accent)]" style={{ width: `${b.total ? (b.done / b.total) * 100 : 0}%` }} />
                  </div>
                  <p className="mt-2">
                    {b.current ? (
                      <>
                        지금: <b>{processLabel(b.current.process)}</b> {b.current.started ? "작업 중" : "대기"} · {b.current.assignee ?? <span className="text-[var(--warn)]">담당 미정</span>}
                      </>
                    ) : (
                      "모든 공정 끝"
                    )}
                  </p>
                  <p className={`text-xs ${b.late ? "font-semibold text-[var(--danger)]" : "text-[var(--muted)]"}`}>
                    공정 {b.done}/{b.total} · 출고 약속 {b.dueDate ?? "미정"}
                    {b.late ? " (지남)" : ""}
                    {b.unassigned > 0 && ` · 담당 미정 ${b.unassigned}`}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>진행 중인 작업이 없습니다. 고객이 견적을 승인하면 수리 건에서 공장장이 작업 지시서를 만듭니다.</Empty>
          )}
        </Card>
      </div>
    </>
  );
}
