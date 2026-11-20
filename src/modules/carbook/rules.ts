// 내 차 수첩(고객용 차계부) 규칙: 화면과 서버가 같이 쓴다. DB 를 부르지 않는 것만 둔다.
import type { RO_STATUSES } from "@/db/schema";

/** 문자 인증번호: 3분 유효, 5번 틀리면 30분 잠금, 같은 번호로 하루 10번까지, 같은 접속 주소로 한 시간 30번까지 */
export const OTP = { digits: 6, minutes: 3, maxTries: 5, lockMinutes: 30, perDay: 10, perIpHour: 30 } as const;
/** 문자 인증 로그인은 90일, 알림톡 링크로 들어온 로그인(그 수리 건만)은 30일 유지. 링크 자체는 90일 동안 열린다 */
export const SESSION_DAYS = { full: 90, link: 30 } as const;
export const LINK_DAYS = 90;
export const COOKIE = "abs_my";
/** 인증번호를 기다리는 동안 휴대폰 번호를 잠시 담아 두는 쿠키(10분) */
export const PHONE_COOKIE = "abs_my_phone";

export type Scope = "full" | "link";

/** 손님에게 보이는 진행 단계. 사내 단계(입고 점검·진단·견적·작업·검사·출고)를 손님 말로 줄인 것 */
export const MY_STEPS = [
  { key: "in", label: "입고", at: ["intake", "checked"] },
  { key: "estimate", label: "견적", at: ["estimating"] },
  { key: "work", label: "수리", at: ["working"] },
  { key: "inspect", label: "검사", at: ["inspecting"] },
  { key: "ready", label: "출고 준비 끝", at: ["ready"] },
] as const;

type RoStatus = (typeof RO_STATUSES)[number];

export const MY_STATUS_LABEL: Record<RoStatus, string> = {
  intake: "입고해서 살펴보는 중",
  checked: "손상 부위를 살펴보는 중",
  estimating: "견적을 만드는 중",
  working: "수리 중",
  inspecting: "수리를 마치고 검사 중",
  ready: "수리 끝, 차를 찾아가세요",
  delivered: "출고함",
  cancelled: "취소됨",
};

export function mySteps(status: RoStatus) {
  if (status === "cancelled") return MY_STEPS.map((s) => ({ key: s.key, label: s.label, state: "todo" as const }));
  const now = status === "delivered" ? MY_STEPS.length : MY_STEPS.findIndex((s) => (s.at as readonly string[]).includes(status));
  return MY_STEPS.map((s, i) => ({ key: s.key, label: s.label, state: i < now ? ("done" as const) : i === now ? ("now" as const) : ("todo" as const) }));
}

export const isActiveRo = (status: string) => status !== "delivered" && status !== "cancelled";

/** 입고 사진 중 손님에게 보이지 않는 칸: 계기판(주행거리 외 경고등·개인 물건), 차대번호 표, 기타 */
export const HIDDEN_SLOTS = new Set(["dash", "label", "other"]);

/** 손님에게 보일 사진: 숨김 칸과 직원이 뺀 사진을 빼고 */
export function visiblePhotos<T extends { path: string; slot?: string | null }>(list: T[], hidden: string[]) {
  const no = new Set(hidden);
  return list.filter((p) => !no.has(p.path) && !(p.slot && HIDDEN_SLOTS.has(p.slot)));
}

/** 이름은 첫 글자만 보이고 나머지는 * */
export const maskName = (n: string) => `${n.slice(0, 1)}${"*".repeat(Math.max(1, n.length - 1))}`;

/** 인증번호 칸: 숫자만 6자리 */
export const cleanCode = (raw: string) => raw.replace(/\D/g, "").slice(0, OTP.digits);

/** 남은 날(보증 끝나는 날까지). 지났으면 음수 */
export function daysLeft(until: string, today: string) {
  return Math.round((Date.parse(`${until}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 864e5);
}

/** 설정 › 내 차 수첩(대표) */
export type CarbookConfig = { enabled: boolean; notice: string; hours: string };
export const DEFAULT_CONFIG: CarbookConfig = { enabled: true, notice: "", hours: "" };
