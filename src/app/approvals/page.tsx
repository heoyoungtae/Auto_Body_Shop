import Link from "next/link";
import { desc } from "drizzle-orm";
import { getDb } from "@/db/runtime";
import { approvalDoc } from "@/db/schema";
import { inbox } from "@/modules/approval/service";
import { requireUser } from "../_lib/session";
import { Badge, buttonClass, Card, fmtTime, PageTitle, STATUS_LABEL, STATUS_TONE } from "../_ui";

type Row = typeof approvalDoc.$inferSelect;

function List({ rows, empty }: { rows: Row[]; empty: string }) {
  if (!rows.length) return <p className="text-sm text-[var(--muted)]">{empty}</p>;
  return (
    <ul className="divide-y divide-[var(--line)] text-sm">
      {rows.map((d) => (
        <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
          <Link href={`/approvals/${d.id}`} className="hover:underline">
            <span className="font-medium">{d.docNo}</span> {d.title} <span className="text-xs text-[var(--muted)]">{d.formCode}</span>
          </Link>
          <span className="flex items-center gap-2">
            <span className="text-xs text-[var(--muted)]">{fmtTime(d.updatedAt)}</span>
            <Badge tone={STATUS_TONE[d.status]}>{STATUS_LABEL[d.status]}</Badge>
          </span>
        </li>
      ))}
    </ul>
  );
}

export default async function ApprovalsPage() {
  const user = await requireUser();
  const db = await getDb();
  const [todo, all] = await Promise.all([inbox(db, user.id), db.select().from(approvalDoc).orderBy(desc(approvalDoc.updatedAt)).limit(50)]);
  return (
    <>
      <PageTitle
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
        <Card title={`내가 처리할 문서 ${todo.length}건`}>
          <List rows={todo} empty="처리할 결재가 없습니다." />
        </Card>
        <Card title="최근 문서">
          <List rows={all} empty="아직 문서가 없습니다." />
        </Card>
      </div>
    </>
  );
}
