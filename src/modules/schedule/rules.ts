// 일정표 규칙 — 화면과 서버가 같이 쓰는 순수 함수(사용자 지시 2026-11-09: 사내 공용 일정과 개인 일정을 나눠 관리).
export const SCOPES = { shop: "사내 공용", personal: "개인" } as const;
export type Scope = keyof typeof SCOPES;

export const KINDS = { meeting: "회의", education: "교육", audit: "점검·심사", visit: "방문·외근", event: "행사", off: "단체 휴무", etc: "기타" } as const;
export type Kind = keyof typeof KINDS;
/** 개인 일정에는 '단체 휴무'를 쓰지 않는다 */
export const PERSONAL_KINDS: Kind[] = ["meeting", "education", "visit", "etc"];

export const REPEATS = { none: "반복 안 함", weekly: "매주", monthly: "매월(같은 날)", yearly: "매년" } as const;
export type Repeat = keyof typeof REPEATS;

/** 알림: 비움 = 알리지 않음 */
export const REMIND_OPTIONS = [
  { value: "", label: "알리지 않음" },
  { value: "0", label: "당일 아침" },
  { value: "1", label: "하루 전" },
  { value: "3", label: "3일 전" },
  { value: "7", label: "7일 전" },
];

/** 한 일정이 너무 길게 이어지지 않게(연차 같은 긴 일정은 휴가 신청으로) */
export const MAX_SPAN_DAYS = 31;

/** 달력 층: 공용·개인·자동(다른 화면 기록에서 읽어 옴) */
export const LAYERS = { shop: "사내 공용", mine: "내 일정", auto: "자동 일정" } as const;
export type Layer = keyof typeof LAYERS;

/** 자동 일정 종류와 색 */
export const AUTO_KINDS = {
  holiday: "휴무·공휴일",
  reservation: "입고 예약",
  delivery: "출고 약속",
  leave: "휴가·근태",
  task: "업무지시 기한",
  legal: "법정 검사",
  calib: "측정 장비 교정",
  lube: "윤활",
  pm: "예방정비",
  nc: "시정 조치 기한",
  po: "발주 납기",
  outsource: "외주 납기",
} as const;
export type AutoKind = keyof typeof AUTO_KINDS;

export type Tone = "neutral" | "ok" | "warn" | "danger" | "accent";
export const LAYER_TONE: Record<Layer, Tone> = { shop: "accent", mine: "ok", auto: "neutral" };
export const AUTO_TONE: Partial<Record<AutoKind, Tone>> = { holiday: "danger", delivery: "warn", legal: "warn", nc: "warn" };

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

const parse = (d: string) => Date.parse(`${d}T00:00:00Z`);
export const addDaysIso = (d: string, n: number) => new Date(parse(d) + n * 864e5).toISOString().slice(0, 10);
export const daysBetween = (a: string, b: string) => Math.round((parse(b) - parse(a)) / 864e5);
export const weekday = (d: string) => new Date(parse(d)).getUTCDay();
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

export type EventInput = {
  scope: string;
  kind: string;
  title: string;
  startOn: string;
  endOn: string;
  startTime: string;
  endTime: string;
  place: string;
  note: string;
  attendeeIds: string[];
  repeat: string;
  repeatUntil: string;
  remindDays: string;
};

/** 저장 전에 막을 것. 빈 배열이면 통과 */
export function eventIssues(i: EventInput): string[] {
  const out: string[] = [];
  if (!(i.scope in SCOPES)) out.push("공용·개인을 골라 주세요");
  if (!(i.kind in KINDS)) out.push("일정 종류를 골라 주세요");
  else if (i.scope === "personal" && !PERSONAL_KINDS.includes(i.kind as Kind)) out.push(`개인 일정에는 '${KINDS[i.kind as Kind]}'를 쓰지 않습니다`);
  if (!i.title.trim()) out.push("일정 이름을 적어 주세요");
  if (!ISO.test(i.startOn)) out.push("시작일을 골라 주세요");
  const end = i.endOn || i.startOn;
  if (ISO.test(i.startOn) && ISO.test(end)) {
    if (end < i.startOn) out.push("끝나는 날이 시작일보다 앞섭니다");
    else if (daysBetween(i.startOn, end) >= MAX_SPAN_DAYS) out.push(`한 일정은 ${MAX_SPAN_DAYS}일을 넘기지 않습니다. 긴 일정은 나눠 올리거나 반복으로 정해 주세요`);
  }
  if (i.startTime && !TIME.test(i.startTime)) out.push("시작 시각 형식이 틀렸습니다(예: 09:30)");
  if (i.endTime && !TIME.test(i.endTime)) out.push("끝 시각 형식이 틀렸습니다(예: 10:30)");
  if (i.endTime && !i.startTime) out.push("끝 시각만 적을 수는 없습니다. 시작 시각을 적어 주세요");
  if (i.startTime && i.endTime && end === i.startOn && i.endTime <= i.startTime) out.push("끝 시각이 시작 시각보다 앞섭니다");
  if (!(i.repeat in REPEATS)) out.push("반복을 골라 주세요");
  if (i.repeat !== "none") {
    if (end !== i.startOn) out.push("여러 날 일정은 반복할 수 없습니다");
    if (i.repeatUntil && (!ISO.test(i.repeatUntil) || i.repeatUntil < i.startOn)) out.push("반복 끝나는 날이 시작일보다 앞섭니다");
  }
  if (i.remindDays && !REMIND_OPTIONS.some((o) => o.value === i.remindDays)) out.push("알림을 골라 주세요");
  return out;
}

type Occ = { startOn: string; endOn: string; repeat: string; repeatUntil: string | null };

/** 반복을 펼쳐 [from, to] 안에 걸치는 날짜(시작일)들을 돌려준다. 매월 31일처럼 없는 날은 그달 마지막 날 */
export function occurrences(e: Occ, from: string, to: string, limit = 400): string[] {
  const span = daysBetween(e.startOn, e.endOn);
  const until = e.repeatUntil && e.repeatUntil < to ? e.repeatUntil : to;
  const hit = (s: string) => addDaysIso(s, span) >= from && s <= to;
  if (e.repeat === "none" || !(e.repeat in REPEATS)) return hit(e.startOn) ? [e.startOn] : [];
  const out: string[] = [];
  const [y0, m0, d0] = e.startOn.split("-").map(Number);
  for (let n = 0; out.length < limit; n++) {
    let s: string;
    if (e.repeat === "weekly") s = addDaysIso(e.startOn, n * 7);
    else {
      const months = e.repeat === "monthly" ? n : n * 12;
      const y = y0 + Math.floor((m0 - 1 + months) / 12);
      const m = ((m0 - 1 + months) % 12) + 1;
      s = `${y}-${String(m).padStart(2, "0")}-${String(Math.min(d0, lastDay(y, m))).padStart(2, "0")}`;
    }
    if (s > until) break;
    if (hit(s)) out.push(s);
  }
  return out;
}

/** 달력 한 달: 일요일부터 시작하는 주들(앞뒤 달 날짜 포함) */
export function monthGrid(ym: string): string[][] {
  const first = `${ym}-01`;
  const start = addDaysIso(first, -weekday(first));
  const [y, m] = ym.split("-").map(Number);
  const last = `${ym}-${String(lastDay(y, m)).padStart(2, "0")}`;
  const weeks: string[][] = [];
  for (let s = start; s <= last; s = addDaysIso(s, 7)) weeks.push(Array.from({ length: 7 }, (_, i) => addDaysIso(s, i)));
  return weeks;
}

/** 그 날이 든 주(일~토) */
export const weekOf = (d: string) => Array.from({ length: 7 }, (_, i) => addDaysIso(d, i - weekday(d)));

export function shiftMonth(ym: string, n: number) {
  const [y, m] = ym.split("-").map(Number);
  const t = y * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
}

export const timeLabel = (s: string | null, e: string | null) => (s ? (e ? `${s}~${e}` : s) : "종일");
export const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"];
