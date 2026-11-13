// 보고서 한 장(보고서 센터에서 고른 것). 기간·비교 기준을 바꾸고, 숫자를 누르면 그 전표 목록으로 간다. 입력하는 값은 없다.
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/db/runtime";
import { canReport, FAMILIES, reportById } from "@/modules/report/catalog";
import { totalRow } from "@/modules/report/kit";
import { COMPARE, isCompare, periodFromQuery, PERIOD_KINDS } from "@/modules/report/period";
import { runReport } from "@/modules/report/run";
import { delta, fmtMetric } from "@/modules/report/service";
import { seoulDate } from "@/modules/platform/time";
import type { PanelHelpKey } from "@/modules/help/panels";
import { requireUser } from "../../_lib/session";
import { Badge, buttonClass, Card, PageTitle } from "../../_ui";
import { PeriodBar, periodHref } from "../_period-bar";
import { PrintButton } from "../print-button";

/** 표 칸 숫자: 단위는 머리줄에 있으므로 숫자만(원·건·대는 정수, 나머지는 소수 한 자리) */
const fmtNum = (v: number, unit?: string) => (unit === "원" || unit === "건" || unit === "대" || !unit ? Math.round(v) : Math.round(v * 10) / 10).toLocaleString("ko-KR");

const toneCls = { danger: "text-[var(--danger)]", warn: "text-[var(--warn,#b45309)]", ok: "text-[var(--ok)]" } as const;

export default async function ReportPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ k?: string; at?: string; from?: string; to?: string; c?: string }> }) {
  const { id } = await params;
  const q = await searchParams;
  const user = await requireUser();
  const def = reportById(id);
  if (!def) notFound();
  const fam = FAMILIES[def.family];
  if (!canReport(user, def))
    return (
      <>
        <PageTitle help="reports.view" sub={def.desc}>
          {def.no}. {def.title}
        </PageTitle>
        <p className="text-sm text-[var(--muted)]">이 보고서는 권한표의 &apos;{fam.label}&apos; 보기 권한이 있는 사람만 봅니다.</p>
      </>
    );
  if (def.phase)
    return (
      <>
        <PageTitle help="reports.view" sub={def.desc} std={def.std}>
          {def.no}. {def.title}
        </PageTitle>
        <Card title="아직 만들지 않은 보고서" help={{ kind: "panel", id: "rep.phase" }}>
          <p className="text-sm">
            <Badge tone="neutral">{def.phase}</Badge> {def.wait}
          </p>
          <p className="mt-2 text-sm">
            <Link href="/reports" className="text-[var(--accent)]">
              보고서 목록으로
            </Link>
          </p>
        </Card>
      </>
    );
  const today = seoulDate();
  const p = periodFromQuery(q, today);
  const cmp = q.c && isCompare(q.c) ? q.c : "prev";
  const r = await runReport(await getDb(), user, id, p, cmp);
  const base = `/reports/${id}`;
  const csv = `${periodHref(`${base}/csv`, p, cmp, p.from)}`;
  const hasTarget = r.body.kpis.some((k) => k.target != null);
  return (
    <>
      <PageTitle
        help="reports.view"
        sub={`${fam.label} · ${def.desc}`}
        std={def.std}
        actions={
          <div className="no-print flex flex-wrap gap-2">
            <Link href="/reports" className={buttonClass("secondary")}>
              보고서 목록
            </Link>
            <PrintButton />
            <a href={csv} className={buttonClass("secondary")}>
              엑셀(CSV)
            </a>
          </div>
        }
      >
        {def.no}. {def.title}
      </PageTitle>

      <PeriodBar base={base} p={p} q={r.q} cmp={cmp} today={today} />

      {r.body.kpis.length > 0 && (
        <Card title="핵심 숫자" help={{ kind: "panel", id: `rep.r.${id}` as PanelHelpKey }}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="text-left text-xs text-[var(--muted)]">
                  <th className="py-1 pr-2">항목</th>
                  <th className="pr-2 text-right">이번 기간</th>
                  <th className="pr-2 text-right">{COMPARE[cmp]}</th>
                  <th className="pr-2 text-right">변화</th>
                  {hasTarget && <th className="pr-2">목표</th>}
                  <th>비고</th>
                </tr>
              </thead>
              <tbody>
                {r.body.kpis.map((m) => {
                  const d = delta(m);
                  return (
                    <tr key={m.key} className="border-t border-[var(--line)]">
                      <td className="py-1.5 pr-2">
                        {m.href ? (
                          <Link href={m.href} className="text-[var(--accent)] hover:underline">
                            {m.label}
                          </Link>
                        ) : (
                          m.label
                        )}
                      </td>
                      <td className={`pr-2 text-right font-semibold whitespace-nowrap tabular-nums ${m.ok === false ? "text-[var(--danger)]" : m.ok ? "text-[var(--ok)]" : ""}`}>{fmtMetric(m.value, m.unit)}</td>
                      <td className="pr-2 text-right whitespace-nowrap text-[var(--muted)] tabular-nums">{m.now ? "지금 기준" : fmtMetric(m.prev, m.unit)}</td>
                      <td className={`pr-2 text-right text-xs whitespace-nowrap ${d?.tone === "ok" ? "text-[var(--ok)]" : d?.tone === "danger" ? "text-[var(--danger)]" : "text-[var(--muted)]"}`}>{d?.text ?? ""}</td>
                      {hasTarget && (
                        <td className="pr-2 text-xs whitespace-nowrap">
                          {m.target != null && `${fmtMetric(m.target, m.unit)} ${m.better === "down" ? "이하" : "이상"}`} {m.ok === false && <Badge tone="danger">미달</Badge>}
                        </td>
                      )}
                      <td className="text-xs text-[var(--muted)]">{m.note}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {r.body.tables.map((t) => {
        const tot = totalRow(t);
        return (
          <Card key={t.key} title={`${t.title}${t.now ? " · 지금 기준" : ""}`} help={{ kind: "panel", id: t.help }}>
            {t.rows.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">{t.empty ?? "자료가 없습니다."}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-sm">
                  <thead>
                    <tr className="text-left text-xs text-[var(--muted)]">
                      {t.cols.map((c, i) => (
                        <th key={i} className={`py-1 pr-2 ${c.num ? "text-right" : ""}`}>
                          {c.label}
                          {c.unit && !c.label.includes(c.unit) ? `(${c.unit})` : ""}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {t.rows.map((row, ri) => (
                      <tr key={ri} className={`border-t border-[var(--line)] ${row.tone ? toneCls[row.tone] : ""}`}>
                        {row.cells.map((v, i) => {
                          const c = t.cols[i];
                          const text = typeof v === "number" ? fmtNum(v, c?.unit) : (v ?? "—");
                          return (
                            <td key={i} className={`py-1.5 pr-2 ${c?.num ? "text-right whitespace-nowrap tabular-nums" : ""}`}>
                              {i === 0 && row.href ? (
                                <Link href={row.href} className="text-[var(--accent)] hover:underline">
                                  {text}
                                </Link>
                              ) : (
                                text
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                  {tot && (
                    <tfoot>
                      <tr className="border-t-2 border-[var(--line)] font-semibold">
                        {tot.map((v, i) => (
                          <td key={i} className={`py-1.5 pr-2 ${t.cols[i]?.num ? "text-right whitespace-nowrap tabular-nums" : ""}`}>
                            {typeof v === "number" ? fmtNum(v, t.cols[i]?.unit) : (v ?? "")}
                          </td>
                        ))}
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            )}
            {t.note && <p className="mt-2 text-xs text-[var(--muted)]">{t.note}</p>}
          </Card>
        );
      })}

      {r.trend && (
        <Card title={`추이 · 최근 ${r.trend.periods.length}개 ${p.kind === "custom" ? "같은 길이 기간" : PERIOD_KINDS[p.kind]}`} help={{ kind: "panel", id: "rep.trend" }}>
          <div className="grid gap-4 md:grid-cols-2">
            {r.trend.series.map((s) => {
              const max = Math.max(1, ...s.values);
              return (
                <figure key={s.key}>
                  <figcaption className="mb-1 text-xs font-semibold">
                    {s.label} <span className="font-normal text-[var(--muted)]">이번 {fmtMetric(s.values[s.values.length - 1], s.unit)}</span>
                  </figcaption>
                  <div className="flex h-24 items-end gap-0.5" role="img" aria-label={`${s.label} 추이`}>
                    {s.values.map((v, i) => (
                      <Link key={i} href={periodHref(base, r.trend!.periods[i], cmp, r.trend!.periods[i].from)} title={`${r.trend!.periods[i].label}: ${fmtMetric(v, s.unit)}`} className="flex h-full flex-1 items-end">
                        <span className={`block w-full rounded-t-sm ${i === s.values.length - 1 ? "bg-[var(--accent)]" : "bg-[var(--accent)]/40"}`} style={{ height: `${v ? Math.max(4, (v / max) * 100) : 0}%` }} />
                      </Link>
                    ))}
                  </div>
                  <div className="mt-0.5 flex gap-0.5 text-[10px] text-[var(--muted)]">
                    {r.trend!.labels.map((l, i) => (
                      <span key={i} className="flex-1 truncate text-center">
                        {i % Math.ceil(r.trend!.labels.length / 7) === 0 || i === r.trend!.labels.length - 1 ? l : ""}
                      </span>
                    ))}
                  </div>
                </figure>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-[var(--muted)]">막대에 마우스를 올리면 값이, 누르면 그 기간 보고서가 열립니다.</p>
        </Card>
      )}

      {r.body.notes?.map((n, i) => (
        <p key={i} className="text-xs text-[var(--muted)]">
          {n}
        </p>
      ))}
    </>
  );
}
