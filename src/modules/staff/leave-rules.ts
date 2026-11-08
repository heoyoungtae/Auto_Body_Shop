// 근태 신청(STD-11 4절) 규칙: 종류, 연차 일수(근로기준법 제60조), 날짜·시간 계산. 화면과 서버가 같이 쓴다(DB 없음).
import { isBusinessDay, type ShopCalendar } from "@/modules/platform/business-days";

/** unit: day 기간(영업일 수), half 반나절(하루), time 시간(하루 안). deduct 는 연차에서 빼는 일수(하루당) */
export const LEAVE_KINDS = {
  annual: { label: "연차", unit: "day", deduct: 1, ahead: true, hint: "하루 이상 쉼. 남은 연차에서 뺍니다" },
  half_am: { label: "오전 반차", unit: "half", deduct: 0.5, ahead: true, hint: "오전 반나절. 연차 0.5일" },
  half_pm: { label: "오후 반차", unit: "half", deduct: 0.5, ahead: true, hint: "오후 반나절. 연차 0.5일" },
  sick: { label: "병가", unit: "day", deduct: 0, ahead: false, hint: "아파서 쉼. 3일 이상이면 진단서" },
  out: { label: "외출", unit: "time", deduct: 0, ahead: false, hint: "근무 중 잠시 나감" },
  early: { label: "조퇴", unit: "time", deduct: 0, ahead: false, hint: "일찍 퇴근" },
  late: { label: "지각", unit: "time", deduct: 0, ahead: false, hint: "늦게 출근(사후 신고)" },
  family: { label: "경조휴가", unit: "day", deduct: 0, ahead: false, hint: "결혼·장례 등. 유급, 연차에서 빼지 않음(취업규칙 제18조)" },
  absent: { label: "결근", unit: "day", deduct: 0, ahead: false, hint: "알리지 못하고 빠짐(사후 신고)" },
  overtime: { label: "연장근무", unit: "time", deduct: 0, ahead: true, hint: "정해진 시간 뒤 더 일함. 미리 신청" },
} as const;
export type LeaveKind = keyof typeof LEAVE_KINDS;
export const isLeaveKind = (k: string): k is LeaveKind => k in LEAVE_KINDS;

/** 주 연장근로 한도(근로기준법 제53조) */
export const WEEKLY_OVERTIME_MAX = 12;
/** 사후 신고를 받는 기간(일) */
export const LATE_REPORT_DAYS = 30;
/** 병가 진단서가 필요한 일수 */
export const SICK_PROOF_DAYS = 3;

const D = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);

/** n년 뒤 같은 날(2월 29일은 28일로) */
export function addYears(date: string, n: number) {
  const [y, m, d] = date.split("-").map(Number);
  const last = new Date(Date.UTC(y + n, m, 0)).getUTCDate();
  return iso(Date.UTC(y + n, m - 1, Math.min(d, last)));
}
export const dayBefore = (date: string) => iso(D(date) - 864e5);

/** 만 개월 수 */
export function fullMonths(from: string, to: string) {
  const [y1, m1, d1] = from.split("-").map(Number);
  const [y2, m2, d2] = to.split("-").map(Number);
  return Math.max(0, (y2 - y1) * 12 + (m2 - m1) - (d2 < d1 ? 1 : 0));
}

/**
 * 연차 일수(입사일 기준, 근로기준법 제60조).
 * 1년 미만: 1개월 개근마다 1일(최대 11일, 입사 1년까지 사용).
 * 1년 이상: 15일, 3년차부터 2년마다 1일 더(최대 25일). 출근율 80% 미만은 반영하지 않음 [확인 필요].
 */
export function annualEntitlement(hiredOn: string, on: string): { from: string; to: string; days: number; firstYear: boolean } {
  const m = fullMonths(hiredOn, on);
  if (m < 12) return { from: hiredOn, to: dayBefore(addYears(hiredOn, 1)), days: Math.min(m, 11), firstYear: true };
  const y = Math.floor(m / 12);
  return { from: addYears(hiredOn, y), to: dayBefore(addYears(hiredOn, y + 1)), days: Math.min(25, 15 + Math.floor((y - 1) / 2)), firstYear: false };
}

/**
 * 상시 5명 미만 사업장(근로기준법 시행령 별표 1: 제60조 미적용)의 사내 연차.
 * 입사일 기준 1년마다 정한 일수를 준다(입사 첫해도 같은 일수).
 */
export function smallShopEntitlement(hiredOn: string, on: string, days: number) {
  const y = Math.floor(fullMonths(hiredOn, on) / 12);
  return { from: addYears(hiredOn, y), to: dayBefore(addYears(hiredOn, y + 1)), days, firstYear: false };
}

/** 기간 안의 영업일 수(쉬는 날은 연차에서 빼지 않는다) */
export function businessDaysBetween(from: string, to: string, cal: ShopCalendar) {
  let n = 0;
  for (let t = D(from); t <= D(to); t += 864e5) if (isBusinessDay(cal, iso(t))) n++;
  return n;
}

/** "HH:MM" 두 개 → 시간(0.5 단위). 틀리면 null */
export function hoursBetween(from: string, to: string) {
  const re = /^([01]\d|2[0-3]):([0-5]\d)$/;
  const a = re.exec(from);
  const b = re.exec(to);
  if (!a || !b) return null;
  const min = Number(b[1]) * 60 + Number(b[2]) - (Number(a[1]) * 60 + Number(a[2]));
  return min > 0 ? Math.round((min / 60) * 2) / 2 : null;
}

/** 그 주 월요일(주 연장근로 합계용) */
export function weekStart(date: string) {
  const wd = new Date(D(date)).getUTCDay();
  return iso(D(date) - ((wd + 6) % 7) * 864e5);
}
export const addDaysIso = (date: string, n: number) => iso(D(date) + n * 864e5);

/** 30분 단위 시각 목록(고르기 칸) */
export const TIME_OPTIONS = Array.from({ length: 35 }, (_, i) => {
  const m = 6 * 60 + i * 30;
  const v = `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  return { value: v, label: v };
});

/** 결재 문서 data → 한 줄 */
export function leaveSummary(d: { leaveKind?: unknown; fromDate?: unknown; toDate?: unknown; fromTime?: unknown; toTime?: unknown; days?: unknown; hours?: unknown }) {
  const k = isLeaveKind(String(d.leaveKind)) ? LEAVE_KINDS[d.leaveKind as LeaveKind] : null;
  if (!k) return "";
  if (k.unit === "day") return `${k.label} ${d.fromDate}${d.toDate && d.toDate !== d.fromDate ? ` ~ ${d.toDate}` : ""} (${d.days}일)`;
  if (k.unit === "half") return `${k.label} ${d.fromDate}`;
  return `${k.label} ${d.fromDate} ${d.fromTime}~${d.toTime} (${d.hours}시간)`;
}
