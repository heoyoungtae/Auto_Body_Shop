import Link from "next/link";
import { getDb } from "@/db/runtime";
import { inbox, myDrafts } from "@/modules/approval/service";
import { listNotifications } from "@/modules/platform/notify";
import { requireUser } from "../_lib/session";
import { Badge, Card, ErrorBox, fmtTime, PageTitle, STATUS_LABEL, STATUS_TONE } from "../_ui";

/** 설계서 5.1 모듈과 단계. 화면이 생기면 링크로 바뀐다 */
const MODULES = [
  { name: "접수·견적", std: "STD-01~03", phase: "1차" },
  { name: "작업·공정", std: "STD-04", phase: "1차" },
  { name: "검사·출고", std: "STD-05", phase: "1차" },
  { name: "설비·TPM(설비대장·일상점검·윤활·3정5S)", std: "STD-08", phase: "1차" },
  { name: "부적합·시정조치", std: "STD-Q", phase: "1차" },
  { name: "고객 만족·불만", std: "STD-06", phase: "2차" },
  { name: "구매·외주·비품", std: "STD-07", phase: "2차" },
  { name: "예방정비·치공구·운전일지", std: "STD-08", phase: "2차" },
  { name: "안전·환경", std: "STD-09~10", phase: "2차" },
  { name: "인사·급여·회계·품질경영", std: "STD-11·12·Q", phase: "3차" },
];

export default async function HomePage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const user = await requireUser();
  const db = await getDb();
  const [todo, mine, notes] = await Promise.all([inbox(db, user.id), myDrafts(db, user.id), listNotifications(db, user.id)]);
  return (
    <>
      <PageTitle sub="오늘 처리할 결재와 알림">내 할 일</PageTitle>
      <ErrorBox message={error} />
      <div className="grid gap-4 md:grid-cols-2">
        <Card title={`결재 대기 ${todo.length}건`} actions={<Link href="/approvals" className="text-sm text-[var(--accent)]">결재함</Link>}>
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
        <Card title="최근 알림" actions={<Link href="/notifications" className="text-sm text-[var(--accent)]">전체</Link>}>
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
        <Card title="내가 올린 문서">
          {mine.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">아직 없습니다.</p>
          ) : (
            <ul className="divide-y divide-[var(--line)] text-sm">
              {mine.slice(0, 6).map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-2 py-2">
                  <Link href={`/approvals/${d.id}`} className="hover:underline">
                    {d.docNo} {d.title}
                  </Link>
                  <Badge tone={STATUS_TONE[d.status]}>{STATUS_LABEL[d.status]}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="업무 모듈">
          <ul className="space-y-1.5 text-sm">
            {MODULES.map((m) => (
              <li key={m.name} className="flex items-center justify-between gap-2">
                <span>
                  {m.name} <span className="text-xs text-[var(--muted)]">{m.std}</span>
                </span>
                <Badge>{m.phase} 개발 예정</Badge>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
