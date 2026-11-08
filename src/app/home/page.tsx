import Link from "next/link";
import { getDb } from "@/db/runtime";
import { inbox, myDrafts } from "@/modules/approval/service";
import { listNotifications } from "@/modules/platform/notify";
import { requireUser } from "../_lib/session";
import { Card, ErrorBox, fmtTime, PageTitle, StatusBadge } from "../_ui";



export default async function HomePage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const user = await requireUser();
  const db = await getDb();
  const [todo, mine, notes] = await Promise.all([inbox(db, user.id), myDrafts(db, user.id), listNotifications(db, user.id)]);
  return (
    <>
      <PageTitle help="home" sub="오늘 처리할 결재와 알림">내 할 일</PageTitle>
      <ErrorBox message={error} />
      {todo.length === 0 && mine.length === 0 && (
        <div className="mb-4 rounded-md border border-[var(--accent)]/30 bg-[var(--accent-soft)] px-3 py-2.5 text-sm">
          처음 쓰시나요? <Link href="/help" className="font-medium text-[var(--accent)]">도움말 센터</Link>에서 내 역할의 &lsquo;처음 할 일&rsquo;을 보세요. 화면 제목·패널 제목·입력 칸 이름 옆의 ? 를 누르면 오른쪽에 그 도움말이 열립니다.
        </div>
      )}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Card title={`결재 대기 ${todo.length}건`} help={{ kind: "panel", id: "home.todo" }} actions={<Link href="/approvals" className="text-sm text-[var(--accent)]">결재함</Link>}>
          {todo.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">처리할 결재가 없습니다.</p>
          ) : (
            <ul className="divide-y divide-[var(--line)] text-sm">
              {todo.slice(0, 6).map((d) => (
                <li key={d.id} className="py-2">
                  <Link href={`/approvals/${d.id}`} className="hover:underline">
                    {d.docNo} {d.title}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="최근 알림" help={{ kind: "panel", id: "home.notes" }} actions={<Link href="/notifications" className="text-sm text-[var(--accent)]">전체</Link>}>
          {notes.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">알림이 없습니다.</p>
          ) : (
            <ul className="divide-y divide-[var(--line)] text-sm">
              {notes.slice(0, 6).map((n) => (
                <li key={n.id} className="flex justify-between gap-2 py-2">
                  {n.link ? <Link href={n.link} className={n.readAt ? "text-[var(--muted)]" : "font-medium"}>{n.title}</Link> : <span>{n.title}</span>}
                  <span className="shrink-0 text-xs text-[var(--muted)]">{fmtTime(n.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="내가 올린 문서" help={{ kind: "panel", id: "home.mine" }}>
          {mine.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">아직 없습니다.</p>
          ) : (
            <ul className="divide-y divide-[var(--line)] text-sm">
              {mine.slice(0, 6).map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-2 py-2">
                  <Link href={`/approvals/${d.id}`} className="hover:underline">
                    {d.docNo} {d.title}
                  </Link>
                  <StatusBadge status={d.status} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
