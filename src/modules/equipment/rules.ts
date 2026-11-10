// 설비 관리 규칙(STD-08). 화면과 서버가 함께 쓴다.
import type { CheckItem, CheckResult } from "@/db/schema/equipment";

const items = (...pairs: [string, string][]): CheckItem[] => pairs.map(([item, std]) => ({ item, std }));

/** 월간 점검란(F-08-02) 기본 항목 */
export const MONTHLY_DEFAULT = items(["벨트 장력", "적정(눌러서 1~2cm)"], ["배선·접지", "피복 손상·풀림 없음"], ["호스 노화", "균열·누기 없음"], ["볼트 체결", "풀림 없음"]);

type LogField = { key: string; label: string; unit?: string; num?: boolean; time?: boolean };

/** 설비 종류: 기본 중요도·점검 항목·쓰는 공정·운전 일지 틀(5절 작성 요령, 8절) */
export const EQ_KINDS = {
  booth: {
    label: "도장 부스",
    grade: "A",
    daily: items(["입기·배기 팬 이상음·진동", "없음"], ["필터 차압", "기준값 이하"], ["부스 내 조명", "점등 정상"], ["문 패킹·누기", "틈 없음"], ["버너·온도 제어", "설정값 도달"], ["소화기 압력", "녹색 범위"]),
    processes: ["paint", "dry"],
    legal: "",
    log: [
      { key: "start", label: "가동 시각", time: true },
      { key: "end", label: "종료 시각", time: true },
      { key: "boothTemp", label: "부스 온도", unit: "℃", num: true },
      { key: "dryTemp", label: "건조 온도", unit: "℃", num: true },
      { key: "dryMin", label: "건조 시간", unit: "분", num: true },
      { key: "filterPa", label: "필터 차압", unit: "Pa", num: true },
      { key: "filterState", label: "필터 상태" },
      { key: "paintL", label: "도료·시너 사용량", unit: "L", num: true },
    ] as LogField[],
  },
  compressor: {
    label: "컴프레서",
    grade: "A",
    daily: items(["토출 압력", "정상 범위(운전 기준서)"], ["드레인 배출", "배출함"], ["오일 레벨", "게이지 범위 안"], ["이상음·누기", "없음"]),
    processes: [],
    legal: "",
    log: [
      { key: "hours", label: "가동 시간", unit: "h", num: true },
      { key: "pressureBar", label: "토출 압력", unit: "bar", num: true },
      { key: "drain", label: "드레인 배출" },
      { key: "oilLevel", label: "오일 레벨" },
      { key: "noise", label: "이상음" },
    ] as LogField[],
  },
  lift: {
    label: "리프트",
    grade: "A",
    daily: items(["잠금장치(안전 걸쇠)", "작동 정상"], ["유압 누유", "없음"], ["와이어·체인", "손상·늘어남 없음"], ["상승·하강 이상음", "없음"]),
    processes: ["detach", "assemble"],
    legal: "안전검사(차량용 리프트)",
    log: [] as LogField[],
  },
  welder: {
    label: "용접기",
    grade: "B",
    daily: items(["케이블 피복", "손상 없음"], ["접지", "확실히 물림"], ["토치·건", "정상"]),
    processes: ["sheet"],
    legal: "",
    log: [] as LogField[],
  },
  dryer: {
    label: "건조기(적외선 등)",
    grade: "B",
    daily: items(["램프", "모두 점등"], ["타이머·온도", "설정값 도달"], ["전원 케이블", "손상 없음"]),
    processes: ["dry"],
    legal: "",
    log: [] as LogField[],
  },
  gauge: {
    label: "측정 장비",
    grade: "B",
    daily: items(["영점", "0 표시"], ["기준 시편", "허용 오차 안"]),
    processes: [],
    legal: "",
    log: [] as LogField[],
  },
  other: { label: "기타 설비", grade: "C", daily: [] as CheckItem[], processes: [], legal: "", log: [] as LogField[] },
} as const;
export type EqKind = keyof typeof EQ_KINDS;
export const isEqKind = (k: string): k is EqKind => k in EQ_KINDS;

export const GRADES = { A: "A — 멈추면 작업이 멈춤(부스·컴프레서·리프트)", B: "B — 대체 가능하지만 중요", C: "C — 일반" } as const;
export type Grade = keyof typeof GRADES;
export const isGrade = (g: string): g is Grade => g in GRADES;

/** 구역(F-08-05와 같음) */
export const ZONES = { A: "A 판금", B: "B 도장 준비", C: "C 도장 부스", D: "D 조색실", E: "E 자재 창고", F: "F 공용 공구", G: "G 사무실·대기실", H: "H 외부·주차" } as const;

export const EQ_STATUS = { in_use: "사용 중", stopped: "사용 금지", disposed: "처분" } as const;

/** 점검 표기(F-08-02) */
export const MARKS = { o: "○ 양호", tri: "△ 주의(조치 후 사용)", x: "× 이상(사용 금지)", na: "- 비가동" } as const;
export type Mark = keyof typeof MARKS;
export const MARK_SHORT: Record<Mark, string> = { o: "○", tri: "△", x: "×", na: "-" };
export const isMark = (m: string): m is Mark => m in MARKS;

export const CHECK_KINDS = { daily: "일상 점검", monthly: "월간 점검" } as const;
export type CheckKind = keyof typeof CHECK_KINDS;

export const LUBE_STATES = { normal: "정상", over: "과급유", leak: "누유", discolor: "변색", foreign: "이물" } as const;
export type LubeState = keyof typeof LUBE_STATES;
export const LUBE_METHODS = ["그리스 건", "오일러", "교환", "분무"] as const;
export const LUBE_COLORS = ["빨강", "파랑", "노랑", "초록", "흰색"] as const;

export const FAIL_CAUSES = { lube: "윤활 부족", missed: "점검 누락", operation: "운전 오류", wear: "마모·수명", other: "기타" } as const;
export const PREVENTIONS = { pm: "예방정비 항목 추가", std: "운전 기준 개정", training: "교육", nc: "부적합 보고(F-Q-10)" } as const;
export const FAIL_STATUS = { open: "조치 중", closed: "확인 끝" } as const;

/** 점검표 줄 "항목 | 기준" ↔ 항목 목록 */
export function parseItems(text: string): CheckItem[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [item, ...rest] = l.split("|");
      return { item: item.trim(), std: rest.join("|").trim() };
    })
    .filter((i) => i.item);
}
export const itemsText = (list: CheckItem[]) => list.map((i) => (i.std ? `${i.item} | ${i.std}` : i.item)).join("\n");

/** 점검 결과 판정: × 가 하나라도 있으면 사용 금지, 모두 - 면 비가동 */
export function checkOutcome(results: CheckResult[]) {
  const bad = results.filter((r) => r.mark === "x");
  const warn = results.filter((r) => r.mark === "tri");
  return { ok: bad.length === 0, idle: results.length > 0 && results.every((r) => r.mark === "na"), bad, warn };
}

/** 점검 입력 검사: 모든 항목에 표기, ×·△ 는 내용(조치) 필수 */
export function checkIssues(results: CheckResult[]): string[] {
  const out: string[] = [];
  if (!results.length) out.push("점검 항목이 없습니다. 설비 대장에서 점검 항목을 먼저 정하세요");
  const missing = results.filter((r) => !isMark(r.mark));
  if (missing.length) out.push(`표기하지 않은 항목: ${missing.map((r) => r.item).join(", ")}`);
  const noNote = results.filter((r) => (r.mark === "x" || r.mark === "tri") && !r.note?.trim());
  if (noNote.length) out.push(`×·△ 항목은 상태나 한 조치를 적어야 합니다: ${noNote.map((r) => r.item).join(", ")}`);
  return out;
}

const pad = (n: number) => String(n).padStart(2, "0");
const toUtc = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
export const addDaysIso = (iso: string, d: number) => new Date(toUtc(iso) + d * 86_400_000).toISOString().slice(0, 10);
export const daysBetween = (a: string, b: string) => Math.round((toUtc(b) - toUtc(a)) / 86_400_000);
export const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** 몇 달 뒤 같은 날(그 달에 없는 날이면 말일) */
export function addMonthsIso(iso: string, months: number): string {
  const y = +iso.slice(0, 4);
  const m = +iso.slice(5, 7) - 1 + months;
  const ny = y + Math.floor(m / 12);
  const nm = (((m % 12) + 12) % 12) + 1;
  return `${ny}-${pad(nm)}-${pad(Math.min(+iso.slice(8, 10), lastDay(ny, nm)))}`;
}

export type Due = "overdue" | "today" | "soon" | "ok";
export function dueState(due: string | null | undefined, today: string, alertDays: number): Due | null {
  if (!due) return null;
  if (due < today) return "overdue";
  if (due === today) return "today";
  return daysBetween(today, due) <= alertDays ? "soon" : "ok";
}
export const DUE_LABEL: Record<Due, string> = { overdue: "기한 지남", today: "오늘", soon: "곧", ok: "여유" };
export const DUE_TONE: Record<Due, "danger" | "warn" | "accent" | "neutral"> = { overdue: "danger", today: "warn", soon: "accent", ok: "neutral" };

/** 주기(개월)로 계획 월 만들기: 3 → 1·4·7·10월 */
export function monthsForCycle(cycle: number, start = 1): number[] {
  if (cycle < 1 || cycle > 12) return [];
  const out: number[] = [];
  for (let m = start; m <= 12; m += cycle) out.push(m);
  return out;
}

/** 계획 월·날짜 → 그 해의 정비 예정일 */
export const pmDueDates = (year: number, months: number[], day: number) => [...new Set(months)].filter((m) => m >= 1 && m <= 12).sort((a, b) => a - b).map((m) => `${year}-${pad(m)}-${pad(Math.min(Math.max(day, 1), lastDay(year, m)))}`);

/** 다음 관리 번호 EQ-001 */
export function nextEqNo(existing: string[]): string {
  const max = existing.reduce((a, n) => Math.max(a, Number(/^EQ-(\d+)$/.exec(n)?.[1] ?? 0)), 0);
  return `EQ-${String(max + 1).padStart(3, "0")}`;
}
export function nextLubeCode(existing: string[]): string {
  const max = existing.reduce((a, n) => Math.max(a, Number(/^L-(\d+)$/.exec(n)?.[1] ?? 0)), 0);
  return `L-${pad(max + 1)}`;
}

/** 월간 집계(9.5): 계획 대비 실시율, 고장 건수·정지 시간, 평균 수리 시간(MTTR), 평균 고장 간격(MTBF, 일) */
export function pmKpi(input: { due: number; done: number; failures: number; downMinutes: number; periodDays: number }) {
  return {
    rate: input.due ? Math.round((input.done / input.due) * 100) : null,
    failures: input.failures,
    downMinutes: input.downMinutes,
    mttr: input.failures ? Math.round(input.downMinutes / input.failures) : null,
    mtbfDays: input.failures ? Math.round((input.periodDays / input.failures) * 10) / 10 : null,
  };
}

// ── 치공구(STD-08 8.7, F-08-08) ──
export const TOOL_KEEP = { board: "공용(쉐도우 보드)", personal: "개인 공구함" } as const;
export type ToolKeep = keyof typeof TOOL_KEEP;
export const TOOL_STATUS = { ok: "사용 가능", repair: "수리 중", lost: "분실", disposed: "폐기" } as const;
export type ToolStatus = keyof typeof TOOL_STATUS;
export const TOOL_TONE: Record<ToolStatus, "neutral" | "ok" | "warn" | "danger" | "accent"> = { ok: "ok", repair: "warn", lost: "danger", disposed: "neutral" };
/** 분기 점검 결과(10.4): 마모·파손·누락 */
export const TOOL_CHECK = { ok: "양호", worn: "마모", broken: "파손", missing: "누락(없음)" } as const;
export type ToolCheck = keyof typeof TOOL_CHECK;
/** 불량이면 결정: 수리·교체·폐기, 또는 지켜봄(마모가 가벼울 때) */
export const TOOL_DECISION = { keep: "그대로 씀(지켜봄)", repair: "수리", replace: "교체(새로 구입)", dispose: "폐기" } as const;
export type ToolDecision = keyof typeof TOOL_DECISION;

export function nextToolNo(existing: string[]) {
  const n = existing.map((x) => Number(/^TL-(\d+)$/.exec(x)?.[1] ?? 0)).reduce((a, b) => Math.max(a, b), 0) + 1;
  return `TL-${String(n).padStart(3, "0")}`;
}

/** 'YYYY-MM-DD' → 'YYYY-Qn' */
export function quarterOf(date: string) {
  return `${date.slice(0, 4)}-Q${Math.floor((Number(date.slice(5, 7)) - 1) / 3) + 1}`;
}

/** 분기 마지막 달인지(3·6·9·12월): 이 달에 점검을 마친다 */
export const quarterEndMonth = (date: string) => Number(date.slice(5, 7)) % 3 === 0;

// ── 개선 제안(STD-08 8.12, F-08-06) ──
export const SG_STATUS = { submitted: "검토 중", adopted: "채택(실행 전)", held: "보류", rejected: "불채택", done: "실행 끝" } as const;
export type SgStatus = keyof typeof SG_STATUS;
export const SG_TONE: Record<SgStatus, "neutral" | "ok" | "warn" | "danger" | "accent"> = { submitted: "warn", adopted: "accent", held: "neutral", rejected: "danger", done: "ok" };
/** 공장장 결정(15.2) */
export const SG_DECISIONS = { adopted: "채택", held: "보류", rejected: "불채택" } as const;
export type SgDecision = keyof typeof SG_DECISIONS;
/** 회신 기한: 제출 뒤 14일 */
export const SG_REPLY_DAYS = 14;
