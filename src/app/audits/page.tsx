import Link from "next/link";
import { getDb } from "@/db/runtime";
import { can } from "@/modules/auth/permissions";
import { listAudits } from "@/modules/quality/audit";
import {
  AUDIT_STATUS,
  AUDIT_TONE,
  type AuditStatus,
} from "@/modules/quality/risk-rules";
import { seoulDate } from "@/modules/platform/time";
import { requireUser } from "../_lib/session";
import {
  Badge,
  buttonClass,
  Card,
  Empty,
  ErrorBox,
  Notice,
  PageTitle,
} from "../_ui";

/** 내부심사(F-Q-08, 총람 Q.7): 연도별 심사 목록과 아직 범위에 없는 장 */
export default async function AuditsPage({
  searchParams,
}: {
  searchParams: Promise<{ y?: string; notice?: string; error?: string }>;
}) {
  const q = await searchParams;
  const user = await requireUser();
  const db = await getDb();
  const thisYear = Number(seoulDate(new Date()).slice(0, 4));
  const year =
    Number(q.y) >= 2026 && Number(q.y) <= thisYear + 1 ? Number(q.y) : thisYear;
  const { list, names, tally, left } = await listAudits(db, year);
  return (
    <>
      <PageTitle
        help="audits"
        sub="연 1회(11월) 표준서의 모든 장을 심사합니다. 심사자는 자기 업무를 심사하지 않고, 부적합 판정은 부적합 보고서로 바로 넘어갑니다."
        actions={
          <div className="flex flex-wrap items-center gap-3 text-sm">
            {year > 2026 && (
              <Link
                href={`/audits?y=${year - 1}`}
                className="text-[var(--accent)]"
              >
                ← {year - 1}년
              </Link>
            )}
            {year < thisYear + 1 && (
              <Link
                href={`/audits?y=${year + 1}`}
                className="text-[var(--accent)]"
              >
                {year + 1}년 →
              </Link>
            )}
            {can(user, "audit.manage") && (
              <Link href="/audits/new" className={buttonClass()}>
                심사 계획
              </Link>
            )}
          </div>
        }
      >
        내부 심사 {year}년
      </PageTitle>
      <ErrorBox message={q.error} />
      {q.notice && <Notice>{q.notice}</Notice>}
      <Card
        title="아직 범위에 없는 장"
        help={{ kind: "panel", id: "audit.coverage" }}
      >
        {left.length ? (
          <div className="flex flex-wrap gap-1.5">
            {left.map((c) => (
              <Badge key={c} tone="warn">
                {c}
              </Badge>
            ))}
          </div>
        ) : (
          <p className="text-sm text-[var(--ok)]">
            올해 모든 장이 심사 범위에 들어 있습니다.
          </p>
        )}
      </Card>
      <Card title="심사 목록" help={{ kind: "panel", id: "audit.list" }}>
        {list.length ? (
          <ul className="divide-y divide-[var(--line)]">
            {list.map((x) => {
              const t = tally(x.id);
              return (
                <li key={x.id} className="py-2 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      href={`/audits/${x.id}`}
                      className="font-medium text-[var(--accent)]"
                    >
                      {x.docNo}
                    </Link>
                    <span>{x.plannedOn}</span>
                    <Badge tone={AUDIT_TONE[x.status as AuditStatus]}>
                      {AUDIT_STATUS[x.status as AuditStatus]}
                    </Badge>
                    <span className="text-xs text-[var(--muted)]">
                      심사자{" "}
                      {x.auditorId
                        ? names.get(x.auditorId)
                        : `${x.externalAuditor}(외부)`}
                    </span>
                    <span className="text-xs text-[var(--muted)]">
                      적합 {t.ok} · 개선 권고 {t.improve} · 부적합 {t.nc}
                    </span>
                  </div>
                  <p className="text-xs text-[var(--muted)]">
                    {x.scope.join(", ")}
                  </p>
                </li>
              );
            })}
          </ul>
        ) : (
          <Empty>{year}년 심사 계획이 없습니다.</Empty>
        )}
      </Card>
    </>
  );
}
