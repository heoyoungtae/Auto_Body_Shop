// 날짜는 모두 한국 시각 기준 YYYY-MM-DD 로 다룬다.
const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" });

export function seoulDate(now = new Date()): string {
  return fmt.format(now);
}

/** 문서 번호용 연월(YYMM) */
export function seoulPeriod(now = new Date()): string {
  const d = seoulDate(now);
  return d.slice(2, 4) + d.slice(5, 7);
}

export function addDays(date: string, days: number): string {
  const t = Date.parse(`${date}T00:00:00Z`) + days * 864e5;
  return new Date(t).toISOString().slice(0, 10);
}
