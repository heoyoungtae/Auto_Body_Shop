import Link from "next/link";
import { getDb } from "@/db/runtime";
import {
  incidentStats,
  listIncidents,
  type IncidentFilter,
} from "@/modules/safety/incident";
import {
  INC_KIND,
  INC_SEVERITY,
  INC_STATUS,
  INC_TONE,
  type IncKind,
  type IncSeverity,
  type IncStatus,
} from "@/modules/safety/rules";
import { seoulDate } from "@/modules/platform/time";
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

const TABS: [IncidentFilter, string][] = [
  ["open", "처리 중"],
  ["accident", "사고"],
  ["near", "아차사고"],
  ["all", "전체"],
];

/** 사고·아차사고 목록(F-09-03) */
export default async function IncidentsPage({
  searchParams,
}: {
  searchParams: Promise<{ f?: string; notice?: string; error?: string }>;
}) {
  const q = await searchParams;
  await requireUser();
  const db = await getDb();
  const f = (TABS.find(([k]) => k === q.f)?.[0] ?? "open") as IncidentFilter;
  const list = await listIncidents(db, f);
  const year = Number(seoulDate(new Date()).slice(0, 4));
  const st = await incidentStats(db, year);
  return (
    <>
      <PageTitle
        help="incidents"
        sub="다치거나 다칠 뻔한 일은 누구나 바로 보고합니다. 사고는 부적합으로 이어져 원인과 재발 방지를 기록하고, 위험성평가를 다시 봅니다."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link
              href="/incidents/new?kind=near"
              className={buttonClass("secondary")}
            >
              아차사고 보고
            </Link>
            <Link href="/incidents/new?kind=accident" className={buttonClass()}>
              사고 보고
            </Link>
          </div>
        }
      >
        사고·아차사고
      </PageTitle>
      <ErrorBox message={q.error} />
      {q.notice && <Notice>{q.notice}</Notice>}
      <p className="mb-3 text-sm">
        {year}년 사고 {st.accident}건(휴업 이상 {st.lostTime}건 · 목표 0건) ·
        아차사고 {st.near}건
      </p>
      <Card title="보고서" help={{ kind: "panel", id: "inc.list" }}>
        <div className="mb-3 flex flex-wrap gap-1.5 text-sm">
          {TABS.map(([k, label]) => (
            <Link
              key={k}
              href={`/incidents?f=${k}`}
              className={`rounded-full border px-3 py-1 ${f === k ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]" : "border-[var(--line)]"}`}
            >
              {label}
            </Link>
          ))}
        </div>
        {list.length ? (
          <ul className="divide-y divide-[var(--line)]">
            {list.map((x) => (
              <li key={x.id} className="py-2 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/incidents/${x.id}`}
                    className="font-medium text-[var(--accent)]"
                  >
                    {x.docNo}
                  </Link>
                  <Badge tone={x.kind === "accident" ? "danger" : "warn"}>
                    {INC_KIND[x.kind as IncKind]}
                  </Badge>
                  <Badge tone={INC_TONE[x.status as IncStatus]}>
                    {INC_STATUS[x.status as IncStatus]}
                  </Badge>
                  <span className="text-xs text-[var(--muted)]">
                    {fmtTime(x.occurredAt)} · {x.place}
                    {x.process && ` · ${x.process}`} ·{" "}
                    {INC_SEVERITY[x.severity as IncSeverity]}
                  </span>
                </div>
                <p className="text-xs text-[var(--muted)]">
                  {x.description.slice(0, 120)}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>보고서가 없습니다.</Empty>
        )}
      </Card>
    </>
  );
}
