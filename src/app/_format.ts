// 화면용 형식 도우미(서버·브라우저 공용, 순수 함수)

/** 서울 기준 오늘 YYYY-MM-DD */
export const seoulToday = (now = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(now);

const toUtc = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};

export const addDaysIso = (iso: string, days: number) => new Date(toUtc(iso) + days * 86_400_000).toISOString().slice(0, 10);

const WEEK = ["일", "월", "화", "수", "목", "금", "토"];

/** "11월 9일(월) · 내일" */
export function dayLabel(iso: string, today: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "";
  const t = toUtc(iso);
  const d = new Date(t);
  const diff = Math.round((t - toUtc(today)) / 86_400_000);
  const rel = diff === 0 ? "오늘" : diff === 1 ? "내일" : diff === -1 ? "어제" : diff > 0 ? `${diff}일 뒤` : `${-diff}일 전`;
  return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일(${WEEK[d.getUTCDay()]}) · ${rel}`;
}

/** 1500000 → "150만 원", 123456789 → "1억 2,345만 6,789원" */
export function koMoney(n: number): string {
  if (!Number.isFinite(n)) return "";
  if (n === 0) return "0원";
  const sign = n < 0 ? "-" : "";
  let v = Math.abs(Math.trunc(n));
  const parts: string[] = [];
  for (const [unit, size] of [["조", 1e12], ["억", 1e8], ["만", 1e4]] as const) {
    const q = Math.floor(v / size);
    if (q) parts.push(`${q.toLocaleString("ko-KR")}${unit}`);
    v %= size;
  }
  if (v) parts.push(v.toLocaleString("ko-KR"));
  const last = parts[parts.length - 1];
  return `${sign}${parts.join(" ")}${/[조억만]$/.test(last) ? " 원" : "원"}`;
}
