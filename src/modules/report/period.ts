// 통계·보고서 기간: 일·주(월요일 시작)·월·분기·연. DB 없음.
import { addDays } from "@/modules/platform/time";

export const PERIOD_KINDS = {
  day: "일",
  week: "주",
  month: "월",
  quarter: "분기",
  half: "반기",
  year: "연",
} as const;
export type PeriodKind = keyof typeof PERIOD_KINDS;
export const isPeriodKind = (s: string): s is PeriodKind => s in PERIOD_KINDS;
export const isIsoDate = (s: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));

export type Period = {
  /** custom = 시작~끝을 직접 고른 기간 */
  kind: PeriodKind | "custom";
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
const spanDays = (from: string, to: string) =>
  (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 864e5 + 1;

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
    case "half": {
      const h = m <= 6 ? 1 : 2;
      from = `${y}-${h === 1 ? "01" : "07"}-01`;
      to = `${y}-${h === 1 ? "06-30" : "12-31"}`;
      label = `${y}년 ${h === 1 ? "상" : "하"}반기`;
      break;
    }
    case "year":
      from = `${y}-01-01`;
      to = `${y}-12-31`;
      label = `${y}년`;
      break;
  }
  const days = spanDays(from, to);
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

/** 시작~끝을 직접 고른 기간(거꾸로 넣으면 바로잡는다). 앞 기간 = 바로 앞 같은 일 수 */
export function customPeriod(a: string, b: string): Period {
  const [from, to] = a <= b ? [a, b] : [b, a];
  const days = spanDays(from, to);
  return {
    kind: "custom",
    from,
    to,
    label: `${from.slice(0, 4)}.${md(from)} ~ ${to.slice(0, 4) === from.slice(0, 4) ? "" : `${to.slice(0, 4)}.`}${md(to)}`,
    prev: addDays(from, -1),
    next: addDays(to, 1),
    days,
  };
}

/** 바로 앞 기간 */
export const prevPeriod = (p: Period): Period =>
  p.kind === "custom"
    ? customPeriod(addDays(p.from, -p.days), addDays(p.from, -1))
    : periodOf(p.kind, p.prev);

/** 한 해 전 같은 기간(2월 29일은 28일로) */
export function yoyPeriod(p: Period): Period {
  const back = (d: string) => {
    const y = Number(d.slice(0, 4)) - 1;
    const md2 = d.slice(5) === "02-29" ? "02-28" : d.slice(5);
    return `${y}-${md2}`;
  };
  if (p.kind === "custom") return customPeriod(back(p.from), back(p.to));
  if (p.kind === "week") return periodOf("week", back(p.from));
  return periodOf(p.kind, back(p.from));
}

/** 비교 기준: 앞 기간 / 작년 같은 기간 */
export const COMPARE = { prev: "앞 기간", yoy: "작년 같은 기간" } as const;
export type CompareKind = keyof typeof COMPARE;
export const isCompare = (s: string): s is CompareKind => s in COMPARE;
export const comparePeriod = (p: Period, c: CompareKind) =>
  c === "yoy" ? yoyPeriod(p) : prevPeriod(p);

/** 주소의 k·at·from·to 로 기간을 정한다(잘못된 값은 이번 달) */
export function periodFromQuery(q: { k?: string; at?: string; from?: string; to?: string }, today: string): Period {
  if (q.k === "custom" && q.from && q.to && isIsoDate(q.from) && isIsoDate(q.to)) {
    const p = customPeriod(q.from, q.to);
    // 너무 긴 기간은 5년까지만
    return p.days > 1830 ? customPeriod(addDays(p.to, -1829), p.to) : p;
  }
  const kind: PeriodKind = q.k && isPeriodKind(q.k) ? q.k : "month";
  return periodOf(kind, q.at && isIsoDate(q.at) ? q.at : today);
}

/** p 를 끝으로 하는 최근 n 개 기간(오래된 것부터) */
export function recentPeriods(p: Period, n: number): Period[] {
  const out: Period[] = [p];
  while (out.length < n) out.unshift(prevPeriod(out[0]));
  return out;
}

/** 추이 칸 이름: 일 11.3 · 주 11.3~ · 월 11월 · 분기 3분기 · 연 2026 */
export function shortLabel(p: Period) {
  switch (p.kind) {
    case "custom":
      return `${md(p.from)}~`;
    case "half":
      return `${p.from.slice(2, 4)}.${p.from.slice(5, 7) === "01" ? "상" : "하"}`;
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
export const TREND_COUNT: Record<PeriodKind | "custom", number> = {
  day: 14,
  week: 12,
  month: 12,
  quarter: 8,
  half: 6,
  year: 5,
  custom: 6,
};
