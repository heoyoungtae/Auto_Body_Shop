import Link from "next/link";
import { getDb } from "@/db/runtime";
import type { approvalDoc } from "@/db/schema";
import { runList, type Q } from "@/modules/listq/core";
import { approvalsList } from "@/modules/listq/defs/work";
import { inbox } from "@/modules/approval/service";
import { requireUser } from "../_lib/session";
import { ListBar, ListPager } from "../_list-bar";
import { buttonClass, Card, Empty, fmtTime, PageTitle, StatusBadge } from "../_ui";

type Row = typeof approvalDoc.$inferSelect;

function List({ rows, empty }: { rows: Row[]; empty: React.ReactNode }) {
  if (!rows.length) return <Empty>{empty}</Empty>;
  return (
    <ul className="divide-y divide-[var(--line)] text-sm">
      {rows.map((d) => (
        <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
          <Link href={`/approvals/${d.id}`} className="hover:underline">
            <span className="font-medium">{d.docNo}</span> {d.title} <span className="text-xs text-[var(--muted)]">{d.formCode}</span>
          </Link>
          <span className="flex items-center gap-2">
            <span className="text-xs text-[var(--muted)]">{fmtTime(d.updatedAt)}</span>
            <StatusBadge status={d.status} />
          </span>
        </li>
      ))}
    </ul>
  );
}

export default async function ApprovalsPage({ searchParams }: { searchParams: Promise<Q> }) {
  const q = await searchParams;
  const user = await requireUser();
  const db = await getDb();
  const [todo, lr] = await Promise.all([inbox(db, user.id), runList(db, approvalsList, user, q)]);
  return (
    <>
      <PageTitle
        help="approvals"
        sub="양식의 결재란이 곧 결재 단계입니다. 확정된 문서는 고칠 수 없고 취소 문서로만 바뀝니다."
        actions={
          <Link href="/approvals/new" className={buttonClass()}>
            문서 개정 요청(F-Q-05)
          </Link>
        }
      >
        결재
      </PageTitle>
      <div className="space-y-4">
        <Card title={`내가 처리할 문서 ${todo.length}건`} help={{ kind: "panel", id: "approvals.todo" }}>
          <List rows={todo} empty="지금 내 차례인 결재가 없습니다. 차례가 오면 알림으로 알려 드립니다." />
        </Card>
        <Card title="모든 문서" help={{ kind: "panel", id: "approvals.recent" }}>
          <ListBar r={lr} bare />
          <List rows={lr.rows} empty={lr.loaded ? "조건에 맞는 문서가 없습니다." : <>아직 문서가 없습니다. 오른쪽 위 &lsquo;문서 개정 요청&rsquo;으로 첫 문서를 올려 보세요.</>} />
          <ListPager r={lr} />
        </Card>
      </div>
    </>
  );
}
