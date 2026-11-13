// 보고서 한 장의 모양(숫자 줄·표·추이)과 보고서 만들 때 같이 쓰는 도구. 화면·엑셀(CSV)·인쇄가 같은 모양을 쓴다.
import type { Db } from "@/db/client";
import type { Role } from "@/modules/auth/roles";
import type { PanelHelpKey } from "@/modules/help/panels";
import type { Period } from "./period";
import type { Metric, Unit } from "./service";

export type Actor = { id: string; roles: Role[] };
export type Ctx = { db: Db; actor: Actor; p: Period; q: Period; now: Date; today: string };

export type Cell = string | number | null;
export type Col = { label: string; unit?: Unit; /** 숫자 칸(오른쪽 맞춤·합계) */ num?: boolean };
export type Row = { cells: Cell[]; href?: string; tone?: "danger" | "warn" | "ok" };
export type RTable = {
  key: string;
  title: string;
  help: PanelHelpKey;
  cols: Col[];
  rows: Row[];
  /** 합계 줄(없으면 숫자 칸을 더해 만든다. false 면 합계 줄 없음) */
  total?: Cell[] | false;
  /** 줄이 없을 때 */
  empty?: string;
  /** 표 아래 한 줄 설명 */
  note?: string;
  /** 지금 기준(기간과 무관) */
  now?: boolean;
};
/** 추이: 날짜별 값을 기간 칸에 모은다 */
export type TrendDef = { key: string; label: string; unit: Unit; load: (db: Db, from: string, to: string) => Promise<{ on: string; w?: number }[]> };
export type ReportBody = { kpis: Metric[]; tables: RTable[]; trends?: TrendDef[]; notes?: string[] };
export type Builder = (c: Ctx) => Promise<ReportBody>;

export const tsRange = (p: { from: string; to: string }) => ({
  start: new Date(`${p.from}T00:00:00+09:00`),
  end: new Date(`${p.to}T23:59:59.999+09:00`),
});
export const sum = <T>(xs: T[], f: (x: T) => number) => xs.reduce((a, x) => a + f(x), 0);
export const pct = (n: number, d: number) => (d ? (n / d) * 100 : null);
export const avg = (xs: number[]) => (xs.length ? sum(xs, (x) => x) / xs.length : null);
export const round1 = (n: number | null) => (n == null ? null : Math.round(n * 10) / 10);

/** 이번 기간·비교 기간을 같이 계산 */
export async function both<T>(c: Ctx, f: (p: { from: string; to: string }) => Promise<T>): Promise<[T, T]> {
  return Promise.all([f(c.p), f(c.q)]);
}

/** 숫자 줄 하나 */
export function m(key: string, label: string, unit: Unit, value: number | null, prev: number | null, o: Partial<Metric> = {}): Metric {
  return { key, label, unit, value, prev, ...o };
}

/** 키별로 모아 세기(건수·합계) */
export function groupBy<T>(xs: T[], key: (x: T) => string, w: (x: T) => number = () => 1) {
  const out = new Map<string, number>();
  for (const x of xs) out.set(key(x), (out.get(key(x)) ?? 0) + w(x));
  return out;
}

/** 합계 줄: 숫자 칸만 더한다 */
export function totalRow(t: RTable): Cell[] | null {
  if (t.total === false || !t.rows.length) return null;
  if (t.total) return t.total;
  if (!t.cols.some((c) => c.num)) return null;
  return t.cols.map((c, i) => (i === 0 ? "합계" : c.num && c.unit !== "%" && c.unit !== "일" && c.unit !== "점" && c.unit !== "회" ? sum(t.rows, (r) => (typeof r.cells[i] === "number" ? (r.cells[i] as number) : 0)) : null));
}

const DAY = 864e5;
export const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY);
