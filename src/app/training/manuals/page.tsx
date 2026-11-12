import Link from "next/link";
import { getDb } from "@/db/runtime";
import { can } from "@/modules/auth/permissions";
import { listManuals } from "@/modules/staff/elearning";
import { requireUser } from "../../_lib/session";
import { Badge, buttonClass, Card, Empty, fmtTime, Notice, PageTitle } from "../../_ui";

const STATUS: Record<string, [string, "ok" | "warn" | "neutral"]> = { draft: ["승인 대기", "warn"], approved: ["사용 중", "ok"], retired: ["폐기", "neutral"] };

/** 사내 교재 목록(TM-): 우리만의 내용은 교재로 만들고, 공공 자료는 교육 자료에 링크로 건다 */
export default async function ManualsPage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const q = await searchParams;
  const user = await requireUser();
  const rows = await listManuals(await getDb());
  return (
    <>
      <PageTitle
        help="training.manuals"
        std="STD-11 5절"
        sub="우리 표준서·공정·설비·사용 도료처럼 우리 정비소만의 방법을 교재로 만듭니다. 대표가 승인하면 교육 자료로 씁니다. 공공 자료(안전보건공단 등)는 교재로 만들지 않고 교육 화면에서 링크로 겁니다."
        actions={
          <div className="flex gap-2">
            <Link href="/training" className={buttonClass("secondary")}>
              교육 훈련
            </Link>
            {can(user, "training.manage") && (
              <Link href="/training/manuals/new" className={buttonClass()}>
                교재 만들기
              </Link>
            )}
          </div>
        }
      >
        사내 교재
      </PageTitle>
      {q.notice && <Notice>{q.notice}</Notice>}
      <Card title="교재 목록" help={{ kind: "panel", id: "tm.list" }}>
        {rows.length ? (
          <ul className="divide-y divide-[var(--line)] text-sm">
            {rows.map(({ m, changed }) => (
              <li key={m.id} className="flex flex-wrap items-center gap-2 py-2">
                <Link href={`/training/manuals/${m.id}`} className="font-mono text-[var(--accent)]">
                  {m.no}
                </Link>
                <span className="font-medium">{m.title}</span>
                <span className="text-xs text-[var(--muted)]">{m.rev ? `${m.rev}판` : "초안"}</span>
                <Badge tone={STATUS[m.status]?.[1] ?? "neutral"}>{STATUS[m.status]?.[0] ?? m.status}</Badge>
                {changed.length > 0 && <Badge tone="danger">개정 필요({changed.map((c) => c.no).join(", ")})</Badge>}
                <span className="ml-auto text-xs text-[var(--muted)]">{m.stdRevs.map((s) => s.no).join(", ")} · {fmtTime(m.updatedAt)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>아직 사내 교재가 없습니다.</Empty>
        )}
      </Card>
    </>
  );
}
