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
  overtime: { label: "연장근무", unit: "time", deduct: 0, ahead: true, hint: "정해진 시간 뒤나 쉬는 날 더 일함. 미리 신청(급하면 7일 안 사후 신청)" },
  punch_fix: { label: "출퇴근 정정", unit: "time", deduct: 0, ahead: false, hint: "출근·퇴근을 못 눌렀거나 틀렸을 때. 시작=출근, 끝=퇴근" },
} as const;
export type LeaveKind = keyof typeof LEAVE_KINDS;
export const isLeaveKind = (k: string): k is LeaveKind => k in LEAVE_KINDS;

/** 주 연장근로 한도(근로기준법 제53조) */
export const WEEKLY_OVERTIME_MAX = 12;
/** 급한 연장근무를 사후에 신청할 수 있는 기간(일). 사후 신청은 '사후'로 표시되고 승인자가 인정 여부를 정한다 */
export const OVERTIME_AFTER_DAYS = 7;
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
  if (d.leaveKind === "punch_fix") return `${k.label} ${d.fromDate} 출근 ${d.fromTime} · 퇴근 ${d.toTime}`;
  const tag = (d as { after?: unknown }).after ? " 사후" : (d as { orderedBy?: unknown }).orderedBy ? " 지시" : "";
  return `${k.label}${tag} ${d.fromDate} ${d.fromTime}~${d.toTime} (${d.hours}시간)`;
}

/** n개월 뒤 같은 날(없으면 그 달 말일). 음수면 앞으로 */
export function addMonths(date: string, n: number) {
  const [y, m, d] = date.split("-").map(Number);
  const t = Date.UTC(y, m - 1 + n, 1);
  const ny = new Date(t).getUTCFullYear();
  const nm = new Date(t).getUTCMonth();
  const last = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
  return iso(Date.UTC(ny, nm, Math.min(d, last)));
}
export const addDays = (date: string, n: number) => iso(D(date) + n * 864e5);

/**
 * 연차 사용 촉진 일정(근로기준법 제61조, 대표 결정 2026-11-25: 앱이 자동 진행).
 * 1년 이상: 연차 연도 끝나기 6개월 전부터 10일 안에 1차(남은 일수 알리고 쓸 날을 정해 내라고 서면 촉구),
 * 직원이 10일 안에 내지 않으면 끝나기 2개월 전까지 회사가 쓸 날을 정해 서면 통보(2차).
 * 입사 1년 미만: 3개월 전부터 10일 안에 1차, 1개월 전까지 2차(뒤늦게 생긴 연차의 5일·10일 기준은 반영 안 함 [확인 필요]).
 * 5명 미만 사내 연차도 취업규칙 제17조로 같은 일정을 쓴다.
 */
export function promoteWindows(ent: { from: string; to: string; firstYear: boolean }) {
  const end = addDays(ent.to, 1);
  const r1From = addMonths(end, ent.firstYear ? -3 : -6);
  return { r1From, r1To: addDays(r1From, 9), r2Due: addMonths(end, ent.firstYear ? -1 : -2), end };
}

/** 쓸 날을 정해 내는 기한(1차 받은 날부터 10일) */
export const planDue = (sentOn: string) => addDays(sentOn, 10);

/**
 * 연차 연도가 끝났을 때 남은 연차를 보상할지: 1차를 기간 안에 보냈고, 직원이 쓸 날을 냈거나 회사가 2차를 기한 안에 보냈으면 보상 없음.
 * (직원이 낸 날에 쓰지 않은 경우의 처리, 지정한 날 출근 시 노무 수령 거부 표시는 노무사 확인 [확인 필요])
 */
export function promoteDone(w: ReturnType<typeof promoteWindows>, n: { r1On?: string | null; planOn?: string | null; r2On?: string | null }) {
  if (!n.r1On || n.r1On < w.r1From || n.r1On > w.r1To) return false;
  if (n.planOn && n.planOn <= planDue(n.r1On)) return true;
  return !!n.r2On && n.r2On <= w.r2Due;
}
