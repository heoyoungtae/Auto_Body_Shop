// 보고서 실행: 보고서 id → 계산. 화면·엑셀(CSV)이 같은 결과를 쓴다.
import type { Db } from "@/db/client";
import { seoulDate } from "@/modules/platform/time";
import { type ReportDef, canReport, reportById } from "./catalog";
import { type Actor, type Builder, type ReportBody, totalRow } from "./kit";
import { type CompareKind, COMPARE, comparePeriod, type Period, recentPeriods, shortLabel, TREND_COUNT } from "./period";
import { ap, ar, vat } from "./reports-acct";
import { productivity, revenue, sales, summary } from "./reports-mgmt";
import { equipmentReport, people, purchase, safety } from "./reports-ops";
import { customer, quality, review, rework } from "./reports-quality";
import type { Unit } from "./service";

export const BUILDERS: Record<string, Builder> = {
  summary,
  sales,
  revenue,
  productivity,
  ar,
  ap,
  vat,
  quality,
  rework,
  customer,
  review,
  purchase,
  people,
  safety,
  equipment: equipmentReport,
};

export class ReportAccessError extends Error {}

export type RunResult = { def: ReportDef; p: Period; q: Period; cmp: CompareKind; body: ReportBody; trend: { labels: string[]; periods: Period[]; series: { key: string; label: string; unit: Unit; values: number[] }[] } | null };

/** 보고서 하나 계산(권한 없거나 아직 안 만든 보고서면 오류) */
export async function runReport(db: Db, actor: Actor, id: string, p: Period, cmp: CompareKind, now = new Date()): Promise<RunResult> {
  const def = reportById(id);
  if (!def || def.phase || !BUILDERS[id]) throw new ReportAccessError("아직 만들지 않은 보고서입니다");
  if (!canReport(actor, def)) throw new ReportAccessError("이 보고서를 볼 권한이 없습니다");
  const q = comparePeriod(p, cmp);
  const body = await BUILDERS[id]({ db, actor, p, q, now, today: seoulDate(now) });
  let trend: RunResult["trend"] = null;
  if (body.trends?.length) {
    const ps = recentPeriods(p, TREND_COUNT[p.kind]);
    const from = ps[0].from;
    const to = ps[ps.length - 1].to;
    const idx = (d: string) => ps.findIndex((x) => x.from <= d && d <= x.to);
    const series = [];
    for (const t of body.trends) {
      const v = ps.map(() => 0);
      for (const e of await t.load(db, from, to)) {
        const k = idx(e.on);
        if (k >= 0) v[k] += e.w ?? 1;
      }
      series.push({ key: t.key, label: t.label, unit: t.unit, values: v });
    }
    trend = { labels: ps.map(shortLabel), periods: ps, series };
  }
  return { def, p, q, cmp, body, trend };
}

/** CSV(엑셀에서 열림, BOM 포함): 숫자 줄 → 표마다 머리줄·줄·합계 */
export function runCsv(r: RunResult) {
  const esc = (v: unknown) => {
    const s = v == null ? "" : typeof v === "number" ? String(Math.round(v * 100) / 100) : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows: unknown[][] = [[`${r.def.no}. ${r.def.title}`, r.p.label, `${r.p.from}~${r.p.to}`, `비교: ${COMPARE[r.cmp]} ${r.q.label}`], []];
  if (r.body.kpis.length) {
    rows.push(["항목", "단위", "이번 기간", COMPARE[r.cmp], "목표", "비고"]);
    for (const k of r.body.kpis) rows.push([k.label, k.unit, k.value, k.now ? "지금 기준" : k.prev, k.target ?? "", k.note ?? ""]);
    rows.push([]);
  }
  for (const t of r.body.tables) {
    rows.push([`[${t.title}]${t.now ? " 지금 기준" : ""}`]);
    rows.push(t.cols.map((c) => (c.unit ? `${c.label}(${c.unit})` : c.label)));
    for (const row of t.rows) rows.push(row.cells);
    const tot = totalRow(t);
    if (tot) rows.push(tot);
    rows.push([]);
  }
  return "﻿" + rows.map((r) => r.map(esc).join(",")).join("\r\n");
}
