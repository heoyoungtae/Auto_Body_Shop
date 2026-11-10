import Link from "next/link";
import { getDb } from "@/db/runtime";
import { can } from "@/modules/auth/permissions";
import { listAssessments } from "@/modules/safety/hazard";
import { HA_KIND, HA_STATUS, type HaKind } from "@/modules/safety/rules";
import { requireUser } from "../_lib/session";
import {
  Badge,
  buttonClass,
  Card,
  Empty,
  ErrorBox,
  fmtTime,
  Notice,
  PageTitle,
} from "../_ui";

/** 위험성평가 목록(F-09-01). 확정한 평가는 모든 작업자가 본다(결과 공유) */
export default async function HazardsPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; error?: string }>;
}) {
  const q = await searchParams;
  const user = await requireUser();
  const { list, tally } = await listAssessments(await getDb());
  const manage = can(user, "safety.manage");
  const shown = manage ? list : list.filter((x) => x.status === "done");
  return (
    <>
      <PageTitle
        help="hazards"
        sub="공정별 유해·위험 요인을 가능성×중대성으로 매기고, 4점 이상은 감소 대책을 세웁니다. 개업 전 최초, 매년 1월 정기, 설비·도료·공법이 바뀌거나 사고가 나면 수시로 합니다."
        actions={
          manage && (
            <Link href="/hazards/new" className={buttonClass()}>
              평가 시작
            </Link>
          )
        }
      >
        위험성평가
      </PageTitle>
      <ErrorBox message={q.error} />
      {q.notice && <Notice>{q.notice}</Notice>}
      <Card title="평가 목록" help={{ kind: "panel", id: "haz.list" }}>
        {shown.length ? (
          <ul className="divide-y divide-[var(--line)]">
            {shown.map((x) => {
              const t = tally(x.id);
              return (
                <li key={x.id} className="py-2 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/hazards/${x.id}`}
                      className="font-medium text-[var(--accent)]"
                    >
                      {x.docNo}
                    </Link>
                    <Badge>{HA_KIND[x.kind as HaKind]}</Badge>
                    <Badge tone={x.status === "done" ? "ok" : "warn"}>
                      {HA_STATUS[x.status as keyof typeof HA_STATUS]}
                    </Badge>
                    <span className="text-xs text-[var(--muted)]">
                      {x.doneAt
                        ? `${fmtTime(x.doneAt)} 확정`
                        : `${fmtTime(x.createdAt)} 시작`}{" "}
                      · {t.rows}줄 · 4점 이상 {t.high} · 대책 남음 {t.open}
                    </span>
                  </div>
                  {x.reason && (
                    <p className="text-xs text-[var(--muted)]">{x.reason}</p>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <Empty>
            {manage
              ? "아직 평가가 없습니다. 개업 전 최초 평가부터 시작하세요."
              : "공유된 평가가 없습니다."}
          </Empty>
        )}
      </Card>
    </>
  );
}
