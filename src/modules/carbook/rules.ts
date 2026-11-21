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

// ── 2단계: 내 기록·알림 ──

/** 내 차 수첩 이용 동의(F-13-01 차계부 항목). 문구를 바꾸면 판을 올리고 다시 받는다 */
export const CARBOOK_CONSENT_VERSION = "F-13-01 차계부 v1";
export const CARBOOK_CONSENT_TEXT = {
  title: "[선택] 내 차 수첩에 내가 적는 기록 보관",
  items: [
    "보관하는 것: 내가 적은 주유·충전, 소모품·정비, 세차, 보험·세금·검사, 기타 비용 기록과 주행거리, 보험 만기일",
    "목적: 내 차 비용·연비 보기, 검사·보증·소모품·보험 만기 알림",
    "정비소가 보는 것: 주행거리만(상담·입고 때 참고). 금액·주유소 같은 나머지 기록은 보지 않습니다",
    "보관 기간: 동의를 철회하거나 그만 쓰면 바로 지웁니다. 3년 동안 들어오지 않으면 미리 문자로 알린 뒤 지웁니다",
    "동의하지 않아도 수리 이력·서류·보증은 그대로 보실 수 있습니다. '내 기록'과 알림만 잠깁니다",
  ],
} as const;

/** 손님 기록을 지우는 기준: 마지막 접속 뒤 3년. 30일 전에 한 번 알린다 */
export const IDLE_PURGE = { years: 3, noticeDays: 30 } as const;

export const ENTRY_KIND_LABEL = { fuel: "주유·충전", item: "소모품·정비", wash: "세차", fee: "보험·세금·검사", other: "기타 비용" } as const;
export type EntryKind = keyof typeof ENTRY_KIND_LABEL;

/** 연료: 단위와 이름 */
export const FUELS = {
  gasoline: { label: "휘발유", unit: "L" },
  diesel: { label: "경유", unit: "L" },
  lpg: { label: "LPG", unit: "L" },
  ev: { label: "전기 충전", unit: "kWh" },
  h2: { label: "수소", unit: "kg" },
} as const;
export type Fuel = keyof typeof FUELS;

/** 소모품 기본 교체 주기. 손님이 기록할 때 바꿀 수 있다. [확인 필요] 차 설명서의 주기가 우선 */
export const ITEMS = {
  oil: { label: "엔진오일", km: 10000, months: 12 },
  tire: { label: "타이어", km: 50000, months: 60 },
  wiper: { label: "와이퍼", km: null, months: 12 },
  battery: { label: "배터리", km: null, months: 36 },
  brake: { label: "브레이크 패드", km: 40000, months: null },
  aircon: { label: "에어컨 필터", km: 15000, months: 12 },
  etc: { label: "기타 정비", km: null, months: null },
} as const;
export type Item = keyof typeof ITEMS;

export const FEES = { insurance: "자동차 보험", tax: "자동차세", inspection: "정기검사", parking: "주차·통행료" } as const;
export type Fee = keyof typeof FEES;

export const subLabel = (kind: string, sub: string | null) =>
  (kind === "fuel" ? FUELS[sub as Fuel]?.label : kind === "item" ? ITEMS[sub as Item]?.label : kind === "fee" ? FEES[sub as Fee] : null) ?? ENTRY_KIND_LABEL[kind as EntryKind] ?? kind;

/** 알림 종류(더보기 › 알림에서 켜고 끈다. 줄이 없으면 켬) */
export const ALERTS = {
  inspection: { label: "자동차 정기검사", hint: "최초 등록일로 계산한 검사 기간이 시작될 때" },
  warranty: { label: "보증 끝나기 30일 전", hint: "우리 정비소 수리의 보증이 곧 끝날 때" },
  items: { label: "소모품 교체", hint: "엔진오일·타이어 같은 기록의 다음 교체 때가 2주 안일 때" },
  insurance: { label: "자동차 보험 만기 30일 전", hint: "보험 만기일을 넣어 두셨을 때" },
} as const;
export type AlertKind = keyof typeof ALERTS;
export const alertOn = (prefs: Record<string, boolean> | null | undefined, k: AlertKind) => prefs?.[k] !== false;

/** 'YYYY-MM-DD' 에 달 더하기(말일은 그 달 말일로) */
export function addMonths(date: string, months: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  t.setUTCDate(Math.min(d, last));
  return t.toISOString().slice(0, 10);
}
const dayNo = (date: string) => Math.round(Date.parse(`${date}T00:00:00Z`) / 864e5);
const fromDayNo = (n: number) => new Date(n * 864e5).toISOString().slice(0, 10);
const plusDays = (date: string, n: number) => fromDayNo(dayNo(date) + n);

/**
 * 자동차 정기검사 유효기간 끝나는 날: 비사업용 승용은 최초 등록일부터 4년, 그 뒤 2년마다.
 * 검사는 끝나는 날 앞뒤 31일 안에 받는다. 승합·화물·사업용은 주기가 달라 계산하지 않는다(null).
 * [확인 필요] 자동차관리법 시행규칙 별표 15의2
 */
export const INSPECTION = { firstYears: 4, everyYears: 2, windowDays: 31 } as const;
export function nextInspection(registeredOn: string | null, bodyType: string | null, today: string) {
  if (!registeredOn || bodyType === "van" || bodyType === "truck") return null;
  let end = plusDays(addMonths(registeredOn, INSPECTION.firstYears * 12), -1);
  // 이미 지난 주기는 넘긴다(끝나는 날 + 검사 기간이 지났으면 다음 주기)
  while (plusDays(end, INSPECTION.windowDays) < today) end = addMonths(end, INSPECTION.everyYears * 12);
  return { from: plusDays(end, -INSPECTION.windowDays), until: plusDays(end, INSPECTION.windowDays), end };
}

/** 보험 만기: 한 번 넣으면 매년 같은 날로 넘긴다 */
export function nextYearly(date: string | null, today: string) {
  if (!date) return null;
  let d = date;
  while (d < today) d = addMonths(d, 12);
  return d;
}

/** 하루 평균 주행거리를 모를 때 쓰는 값(1년 1만 5천 km) */
export const DEFAULT_KM_PER_DAY = 40;

/**
 * 주행거리 도우미: 정비소가 확인한 값과 손님 기록을 날짜순으로 이어 하루 평균을 내고, 오늘 값을 짐작한다.
 * 30일보다 짧은 기간이면 기본값(하루 40km)을 쓴다.
 */
export function mileageGuess(points: { on: string; km: number }[], today: string) {
  const p = points.filter((x) => x.km > 0 && x.on <= today).sort((a, b) => (a.on === b.on ? a.km - b.km : a.on < b.on ? -1 : 1));
  if (!p.length) return null;
  const last = p[p.length - 1];
  const first = p[0];
  const span = dayNo(last.on) - dayNo(first.on);
  const perDay = span >= 30 && last.km > first.km ? (last.km - first.km) / span : DEFAULT_KM_PER_DAY;
  const today_ = Math.round(last.km + perDay * Math.max(0, dayNo(today) - dayNo(last.on)));
  return { km: today_, last, perDay: Math.round(perDay), measured: span >= 30 && last.km > first.km };
}

/** 소모품 다음 교체 예상일: 날짜 주기와 거리 주기 중 먼저 오는 것 */
export function itemDue(e: { on: string; mileage: number | null; intervalKm: number | null; intervalMonths: number | null }, perDay: number) {
  const byDate = e.intervalMonths ? addMonths(e.on, e.intervalMonths) : null;
  const byKm = e.intervalKm && e.mileage != null ? { km: e.mileage + e.intervalKm, date: plusDays(e.on, Math.ceil(e.intervalKm / Math.max(1, perDay))) } : null;
  const date = [byDate, byKm?.date].filter((x): x is string => !!x).sort()[0] ?? null;
  return date ? { date, km: byKm?.km ?? null, why: byKm && byKm.date === date ? ("km" as const) : ("date" as const) } : null;
}

/** 주유 칸: 금액·양·단가 중 둘만 있으면 나머지를 채운다. 양은 ×100 정수 */
export function fuelFill(x: { amount: number | null; qty: number | null; unit: number | null }) {
  let { amount, qty, unit } = x;
  if (amount == null && qty != null && unit != null) amount = Math.round(qty * unit);
  else if (qty == null && amount != null && unit) qty = Math.round((amount / unit) * 100) / 100;
  else if (unit == null && amount != null && qty) unit = Math.round(amount / qty);
  return { amount, qty, unit };
}

/** 연비: 주행거리가 적힌 주유 기록 둘 이상. 첫 기록의 양은 빼고(그 전 주행분) 나머지 양으로 나눈다 */
export function fuelEconomy(rows: { on: string; mileage: number | null; qtyX100: number | null; sub: string | null }[]) {
  const r = rows.filter((x) => x.mileage != null && x.qtyX100).sort((a, b) => a.mileage! - b.mileage!);
  if (r.length < 2) return null;
  const km = r[r.length - 1].mileage! - r[0].mileage!;
  const qty = r.slice(1).reduce((s, x) => s + x.qtyX100!, 0) / 100;
  if (km <= 0 || qty <= 0) return null;
  const unit = FUELS[(r[r.length - 1].sub ?? "gasoline") as Fuel]?.unit ?? "L";
  return { value: Math.round((km / qty) * 10) / 10, unit: `km/${unit}`, km, qty };
}
