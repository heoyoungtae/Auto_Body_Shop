// 영업일 계산 — 화면(클라이언트)에서도 쓰는 순수 함수. DB에서 읽는 부분은 calendar.ts.
// 설정 › 영업일·휴무일에서 영업 요일, 공휴일 제외 여부, 가게 휴무일·특별 영업일을 정한다(사용자 지시 2026-11-08).

/**
 * 법정 공휴일(관공서의 공휴일에 관한 규정, 대체공휴일 포함).
 * 2026년은 확정분, 2027년은 규정에 따른 예상(임시공휴일·선거일 발표 시 설정 화면에서 '공휴일 추가').
 */
export const KR_PUBLIC_HOLIDAYS: Record<string, string> = {
  "2026-01-01": "신정",
  "2026-02-16": "설날 연휴",
  "2026-02-17": "설날",
  "2026-02-18": "설날 연휴",
  "2026-03-01": "삼일절",
  "2026-03-02": "대체공휴일(삼일절)",
  "2026-05-01": "노동절",
  "2026-05-05": "어린이날",
  "2026-05-24": "부처님오신날",
  "2026-05-25": "대체공휴일(부처님오신날)",
  "2026-06-03": "전국동시지방선거",
  "2026-06-06": "현충일",
  "2026-07-17": "제헌절",
  "2026-08-15": "광복절",
  "2026-08-17": "대체공휴일(광복절)",
  "2026-09-24": "추석 연휴",
  "2026-09-25": "추석",
  "2026-09-26": "추석 연휴",
  "2026-10-03": "개천절",
  "2026-10-05": "대체공휴일(개천절)",
  "2026-10-09": "한글날",
  "2026-12-25": "성탄절",
  "2027-01-01": "신정",
  "2027-02-06": "설날 연휴",
  "2027-02-07": "설날",
  "2027-02-08": "설날 연휴",
  "2027-02-09": "대체공휴일(설날)",
  "2027-03-01": "삼일절",
  "2027-05-01": "노동절",
  "2027-05-05": "어린이날",
  "2027-05-13": "부처님오신날",
  "2027-06-06": "현충일",
  "2027-07-17": "제헌절",
  "2027-08-15": "광복절",
  "2027-08-16": "대체공휴일(광복절)",
  "2027-09-14": "추석 연휴",
  "2027-09-15": "추석",
  "2027-09-16": "추석 연휴",
  "2027-10-03": "개천절",
  "2027-10-04": "대체공휴일(개천절)",
  "2027-10-09": "한글날",
  "2027-10-11": "대체공휴일(한글날)",
  "2027-12-25": "성탄절",
  "2027-12-27": "대체공휴일(성탄절)",
};
/** 내장 공휴일이 있는 마지막 해. 이 해가 지나기 전에 다음 해 공휴일을 넣어야 한다 */
export const HOLIDAY_DATA_LAST_YEAR = 2027;

export type DayKind = "holiday" | "closed" | "open";
export const DAY_KIND_LABEL: Record<DayKind, string> = { holiday: "공휴일 추가(임시공휴일 등)", closed: "가게 휴무", open: "특별 영업일(쉬는 날이지만 문 엶)" };
export const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"] as const;

export type ShopCalendar = {
  /** 문 여는 요일(0=일 … 6=토) */
  workdays: number[];
  /** 법정 공휴일에 쉬는가 */
  excludeHolidays: boolean;
  /** 설정에서 넣은 날: 날짜 → 종류·이름 */
  days: Record<string, { kind: DayKind; name: string }>;
  /** 특일 정보에서 받은 그 해 공휴일(해 → 날짜 → 이름). 받은 해는 이것만 쓰고 앱 예비 목록은 쓰지 않는다 */
  official?: Record<string, Record<string, string>>;
};

/** 그날의 법정 공휴일 이름. 받은 해는 받은 목록, 못 받은 해는 앱 예비 목록 */
export function holidayName(cal: ShopCalendar, iso: string): string | null {
  const off = cal.official?.[iso.slice(0, 4)];
  return (off ? off[iso] : KR_PUBLIC_HOLIDAYS[iso]) ?? null;
}

/** 기간 안 법정 공휴일과 출처(official 특일 정보 · fallback 앱 예비 목록) */
export function holidayList(cal: ShopCalendar, from: string, to: string) {
  const out: { date: string; name: string; src: "official" | "fallback" }[] = [];
  const years = new Set<string>();
  for (let y = Number(from.slice(0, 4)); y <= Number(to.slice(0, 4)); y++) years.add(String(y));
  for (const y of years) {
    const off = cal.official?.[y];
    const src = off ? Object.entries(off) : Object.entries(KR_PUBLIC_HOLIDAYS).filter(([d]) => d.startsWith(`${y}-`));
    for (const [date, name] of src) if (date >= from && date <= to) out.push({ date, name, src: off ? "official" : "fallback" });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

export const DEFAULT_CALENDAR: ShopCalendar = { workdays: [1, 2, 3, 4, 5], excludeHolidays: true, days: {} };

const weekday = (iso: string) => new Date(`${iso}T00:00:00Z`).getUTCDay();

/** 그날 쉬는 이유. 영업일이면 null */
export function closedReason(cal: ShopCalendar, iso: string): string | null {
  const d = cal.days[iso];
  if (d?.kind === "open") return null;
  if (d?.kind === "closed") return `가게 휴무${d.name ? `: ${d.name}` : ""}`;
  if (cal.excludeHolidays) {
    if (d?.kind === "holiday") return d.name || "공휴일";
    const h = holidayName(cal, iso);
    if (h) return h;
  }
  if (!cal.workdays.includes(weekday(iso))) return `${WEEKDAYS[weekday(iso)]}요일 휴무`;
  return null;
}

export const isBusinessDay = (cal: ShopCalendar, iso: string) => closedReason(cal, iso) == null;

/** 영업일 n일 뒤. 쉬는 날은 세지 않는다 */
export function addBusinessDays(iso: string, n: number, cal: ShopCalendar = DEFAULT_CALENDAR): string {
  let t = Date.parse(`${iso}T00:00:00Z`);
  let left = n;
  let guard = 0;
  while (left > 0 && guard++ < 400) {
    t += 864e5;
    if (isBusinessDay(cal, new Date(t).toISOString().slice(0, 10))) left--;
  }
  return new Date(t).toISOString().slice(0, 10);
}

/** 기간 안의 쉬는 날 목록(달력·저장 전 점검용) */
export function closedDays(cal: ShopCalendar, from: string, days: number) {
  const out: { date: string; reason: string }[] = [];
  const t0 = Date.parse(`${from}T00:00:00Z`);
  for (let i = 0; i < days; i++) {
    const iso = new Date(t0 + i * 864e5).toISOString().slice(0, 10);
    const r = closedReason(cal, iso);
    if (r) out.push({ date: iso, reason: r });
  }
  return out;
}
