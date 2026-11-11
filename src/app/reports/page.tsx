// 통계·보고서: 일·주·월·분기·연 기간별 경영 현황. 숫자는 모두 앞선 전표에서 계산한다(입력 없음).
import Link from "next/link";
import { getDb } from "@/db/runtime";
import { can } from "@/modules/auth/permissions";
import { seoulDate } from "@/modules/platform/time";
import {
  isIsoDate,
  isPeriodKind,
  PERIOD_KINDS,
  periodOf,
  prevPeriod,
  type PeriodKind,
} from "@/modules/report/period";
import {
  buildReport,
  buildTrend,
  delta,
  fmtMetric,
  type SectionId,
} from "@/modules/report/service";
import { DateField } from "../_input";
import { requireUser } from "../_lib/session";
import { Badge, Button, buttonClass, Card, PageTitle } from "../_ui";
import { PrintButton } from "./print-button";

const SECTION_HELP: Record<SectionId, string> = {
  ops: "rep.ops",
  money: "rep.money",
  quality: "rep.quality",
  customer: "rep.customer",
  field: "rep.field",
  safety: "rep.safety",
};

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ k?: string; at?: string }>;
}) {
  const q = await searchParams;
  const user = await requireUser();
  if (!can(user, "report.view"))
    return (
      <p className="text-sm text-[var(--muted)]">
        통계·보고서는 대표·공장장·품질 담당·회계 담당이 봅니다.
      </p>
    );
  const today = seoulDate();
  const kind: PeriodKind = q.k && isPeriodKind(q.k) ? q.k : "month";
  const at = q.at && isIsoDate(q.at) ? q.at : today;
  const p = periodOf(kind, at);
  const prev = prevPeriod(p);
  const db = await getDb();
  const [sections, trend] = await Promise.all([
    buildReport(db, user, p),
    buildTrend(db, user, p),
  ]);
  const url = (k: PeriodKind, d: string) => `/reports?k=${k}&at=${d}`;
  const running = p.to >= today && p.from <= today;
  return (
    <>
      <PageTitle
        help="reports"
        sub="상담·수리·명세서·수납·지출·검사·불만·설비·안전·환경·교육 기록을 기간별로 모아 앞 기간과 비교합니다. 따로 입력하는 값은 없습니다."
        actions={
          <div className="no-print flex flex-wrap gap-2">
            <PrintButton />
            <a
              href={`/reports/csv?k=${kind}&at=${p.from}`}
              className={buttonClass("secondary")}
            >
              엑셀(CSV)
            </a>
          </div>
        }
      >
        통계·보고서
      </PageTitle>

      <Card title="기간" help={{ kind: "panel", id: "rep.period" }}>
        <div className="no-print mb-3 flex flex-wrap gap-1">
          {(Object.keys(PERIOD_KINDS) as PeriodKind[]).map((k) => (
            <Link
              key={k}
              href={url(k, at)}
              className={buttonClass(k === kind ? "primary" : "secondary")}
              aria-current={k === kind ? "page" : undefined}
            >
              {PERIOD_KINDS[k]}
            </Link>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={url(kind, p.prev)}
            className={`no-print ${buttonClass("secondary")}`}
          >
            ◀ 앞
          </Link>
          <b className="text-lg">{p.label}</b>
          {p.next <= today && (
            <Link
              href={url(kind, p.next)}
              className={`no-print ${buttonClass("secondary")}`}
            >
              뒤 ▶
            </Link>
          )}
          {!running && (
            <Link
              href={url(kind, today)}
              className={`no-print ${buttonClass("secondary")}`}
            >
              이번 {PERIOD_KINDS[kind]}
            </Link>
          )}
          {running && <Badge tone="warn">진행 중 · 오늘까지 집계</Badge>}
        </div>
        <p className="mt-1 text-xs text-[var(--muted)]">
          {p.from} ~ {p.to} · 비교: 앞 기간 {prev.label}
        </p>
        <form
          method="get"
          className="no-print mt-3 flex flex-wrap items-end gap-2"
        >
          <input type="hidden" name="k" value={kind} />
          <DateField
            help="rep.at"
            name="at"
            defaultValue={at}
            quick={["today"]}
          />
          <Button type="submit" variant="secondary">
            이 날이 든 {PERIOD_KINDS[kind]} 보기
          </Button>
        </form>
      </Card>

      {sections.map((s) => (
        <Card
          key={s.id}
          title={`${s.title} · ${s.std}`}
          help={{ kind: "panel", id: SECTION_HELP[s.id] as never }}
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="text-left text-xs text-[var(--muted)]">
                  <th className="py-1 pr-2">항목</th>
                  <th className="pr-2 text-right">이번 기간</th>
                  <th className="pr-2 text-right">앞 기간</th>
                  <th className="pr-2 text-right">변화</th>
                  {s.id === "quality" && <th className="pr-2">목표</th>}
                  <th>비고</th>
                </tr>
              </thead>
              <tbody>
                {s.metrics.map((m) => {
                  const d = delta(m);
                  return (
                    <tr key={m.key} className="border-t border-[var(--line)]">
                      <td className="py-1.5 pr-2">
                        {m.href ? (
                          <Link href={m.href} className="hover:underline">
                            {m.label}
                          </Link>
                        ) : (
                          m.label
                        )}
                      </td>
                      <td
                        className={`pr-2 text-right font-semibold tabular-nums whitespace-nowrap ${m.ok === false ? "text-[var(--danger)]" : m.ok ? "text-[var(--ok)]" : ""}`}
                      >
                        {fmtMetric(m.value, m.unit)}
                      </td>
                      <td className="pr-2 text-right text-[var(--muted)] tabular-nums whitespace-nowrap">
                        {m.now ? "지금 기준" : fmtMetric(m.prev, m.unit)}
                      </td>
                      <td
                        className={`pr-2 text-right text-xs whitespace-nowrap ${d?.tone === "ok" ? "text-[var(--ok)]" : d?.tone === "danger" ? "text-[var(--danger)]" : "text-[var(--muted)]"}`}
                      >
                        {d?.text ?? ""}
                      </td>
                      {s.id === "quality" && (
                        <td className="pr-2 text-xs whitespace-nowrap">
                          {m.target != null &&
                            `${fmtMetric(m.target, m.unit)} ${m.better === "down" ? "이하" : "이상"}`}
                          {m.ok === false && <Badge tone="danger">미달</Badge>}
                        </td>
                      )}
                      <td className="text-xs text-[var(--muted)]">{m.note}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {s.id === "quality" && (
            <p className="mt-2 text-xs text-[var(--muted)]">
              월 목표를 기간 전체에 그대로 대어 본 값입니다. 공식 판정(2개월
              연속 미달 → 부적합)은{" "}
              <Link href="/qms/goals" className="text-[var(--accent)]">
                품질목표 관리표
              </Link>
              의 달별 값으로 합니다.
            </p>
          )}
        </Card>
      ))}

      <Card
        title={`추이 · 최근 ${trend.periods.length}개 ${PERIOD_KINDS[kind]}`}
        help={{ kind: "panel", id: "rep.trend" }}
      >
        <div className="grid gap-4 md:grid-cols-2">
          {trend.series.map((s) => {
            const max = Math.max(1, ...s.values);
            return (
              <figure key={s.key}>
                <figcaption className="mb-1 text-xs font-semibold">
                  {s.label}{" "}
                  <span className="font-normal text-[var(--muted)]">
                    이번 {fmtMetric(s.values[s.values.length - 1], s.unit)}
                  </span>
                </figcaption>
                <div
                  className="flex h-24 items-end gap-0.5"
                  role="img"
                  aria-label={`${s.label} 추이`}
                >
                  {s.values.map((v, i) => (
                    <Link
                      key={i}
                      href={url(kind, trend.periods[i].from)}
                      title={`${trend.periods[i].label}: ${fmtMetric(v, s.unit)}`}
                      className="flex h-full flex-1 items-end"
                    >
                      <span
                        className={`block w-full rounded-t-sm ${i === s.values.length - 1 ? "bg-[var(--accent)]" : "bg-[var(--accent)]/40"}`}
                        style={{
                          height: `${v ? Math.max(4, (v / max) * 100) : 0}%`,
                        }}
                      />
                    </Link>
                  ))}
                </div>
                <div className="mt-0.5 flex gap-0.5 text-[10px] text-[var(--muted)]">
                  {trend.labels.map((l, i) => (
                    <span key={i} className="flex-1 truncate text-center">
                      {i % Math.ceil(trend.labels.length / 7) === 0 ||
                      i === trend.labels.length - 1
                        ? l
                        : ""}
                    </span>
                  ))}
                </div>
              </figure>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-[var(--muted)]">
          막대에 마우스를 올리면 값이, 누르면 그 기간 보고서가 열립니다.
        </p>
      </Card>
    </>
  );
}
