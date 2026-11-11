// 통계·보고서 기간: 일·주(월요일 시작)·월·분기·연. DB 없음.
import { addDays } from "@/modules/platform/time";

export const PERIOD_KINDS = {
  day: "일",
  week: "주",
  month: "월",
  quarter: "분기",
  year: "연",
} as const;
export type PeriodKind = keyof typeof PERIOD_KINDS;
export const isPeriodKind = (s: string): s is PeriodKind => s in PERIOD_KINDS;
export const isIsoDate = (s: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));

export type Period = {
  kind: PeriodKind;
  from: string;
  to: string;
  label: string;
  prev: string;
  next: string;
  /** 일 수 */
  days: number;
};

const pad = (n: number) => String(n).padStart(2, "0");
const lastDay = (y: number, m: number) =>
  new Date(Date.UTC(y, m, 0)).getUTCDate();
const weekday = (d: string) => new Date(`${d}T00:00:00Z`).getUTCDay(); // 0=일
const DOW = ["일", "월", "화", "수", "목", "금", "토"];
const md = (d: string) => `${Number(d.slice(5, 7))}.${Number(d.slice(8))}`;

/** at 이 들어 있는 기간 */
export function periodOf(kind: PeriodKind, at: string): Period {
  const y = Number(at.slice(0, 4));
  const m = Number(at.slice(5, 7));
  let from: string;
  let to: string;
  let label: string;
  switch (kind) {
    case "day":
      from = to = at;
      label = `${y}년 ${m}월 ${Number(at.slice(8))}일(${DOW[weekday(at)]})`;
      break;
    case "week": {
      from = addDays(at, -((weekday(at) + 6) % 7));
      to = addDays(from, 6);
      label = `${from.slice(0, 4)}.${md(from)}(월) ~ ${md(to)}(일)`;
      break;
    }
    case "month":
      from = `${y}-${pad(m)}-01`;
      to = `${y}-${pad(m)}-${pad(lastDay(y, m))}`;
      label = `${y}년 ${m}월`;
      break;
    case "quarter": {
      const q = Math.ceil(m / 3);
      from = `${y}-${pad(q * 3 - 2)}-01`;
      to = `${y}-${pad(q * 3)}-${pad(lastDay(y, q * 3))}`;
      label = `${y}년 ${q}분기`;
      break;
    }
    case "year":
      from = `${y}-01-01`;
      to = `${y}-12-31`;
      label = `${y}년`;
      break;
  }
  const days =
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 864e5 +
    1;
  return {
    kind,
    from,
    to,
    label,
    prev: addDays(from, -1),
    next: addDays(to, 1),
    days,
  };
}

/** 바로 앞 기간 */
export const prevPeriod = (p: Period) => periodOf(p.kind, p.prev);

/** p 를 끝으로 하는 최근 n 개 기간(오래된 것부터) */
export function recentPeriods(p: Period, n: number): Period[] {
  const out: Period[] = [p];
  while (out.length < n) out.unshift(prevPeriod(out[0]));
  return out;
}

/** 추이 칸 이름: 일 11.3 · 주 11.3~ · 월 11월 · 분기 3분기 · 연 2026 */
export function shortLabel(p: Period) {
  switch (p.kind) {
    case "day":
      return md(p.from);
    case "week":
      return `${md(p.from)}~`;
    case "month":
      return `${Number(p.from.slice(5, 7))}월`;
    case "quarter":
      return `${Math.ceil(Number(p.from.slice(5, 7)) / 3)}분기`;
    case "year":
      return p.from.slice(0, 4);
  }
}

/** 추이에 보여 줄 기간 수 */
export const TREND_COUNT: Record<PeriodKind, number> = {
  day: 14,
  week: 12,
  month: 12,
  quarter: 8,
  year: 5,
};
