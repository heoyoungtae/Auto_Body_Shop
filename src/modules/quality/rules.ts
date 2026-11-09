// 부적합·시정 조치(F-Q-10)와 3정5S(F-08-05) 규칙. 화면과 서버가 함께 쓴다.

export const NC_SOURCES = {
  inspect: "검사 불합격",
  complaint: "고객 불만",
  audit: "내부심사",
  goal: "목표 미달",
  legal: "법규 미흡",
  equipment: "설비 고장",
  five_s: "5S 미달",
  accident: "사고",
  privacy: "개인정보",
  other: "기타",
} as const;
export type NcSource = keyof typeof NC_SOURCES;
export const isNcSource = (s: string): s is NcSource => s in NC_SOURCES;

export const ROOT_CAUSES = { person: "사람", method: "방법", equipment: "설비", material: "재료", environment: "환경", standard: "표준 미비" } as const;
export type RootCause = keyof typeof ROOT_CAUSES;

export const NC_STATUS = { open: "발행(원인 분석 전)", planned: "조치 중", done: "효과 확인 대기", closed: "종결" } as const;
export type NcStatus = keyof typeof NC_STATUS;
export const NC_TONE: Record<NcStatus, "danger" | "warn" | "accent" | "ok"> = { open: "danger", planned: "warn", done: "accent", closed: "ok" };

/** 시정 계획(원인·조치·담당·기한) 검사. 5 Why 는 적어도 2단계 */
export function planIssues(p: { whys: string[]; rootCause: string; corrective: string; assigneeId: string; dueOn: string; stdRevision: boolean; revisionRef: string }, today: string): string[] {
  const out: string[] = [];
  const whys = p.whys.map((w) => w.trim()).filter(Boolean);
  if (whys.length < 2) out.push("원인 분석(왜?)을 두 단계 이상 적어 주세요");
  if (!(p.rootCause in ROOT_CAUSES)) out.push("근본 원인 분류를 골라 주세요");
  if (!p.corrective.trim()) out.push("시정 조치(재발 방지)를 적어 주세요");
  if (!p.assigneeId) out.push("조치 담당을 정해 주세요");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.dueOn)) out.push("조치 기한을 정해 주세요");
  else if (p.dueOn < today) out.push("조치 기한이 지난 날짜입니다");
  if (p.stdRevision && !p.revisionRef.trim()) out.push("표준·양식 개정이 필요하면 개정 요청(F-Q-05) 번호를 적어 주세요");
  return out;
}

/** 출처별 기본 조치 기한(일): 5S 미달 14일(STD-08 14.3), 검사 반복 불합격 7일(STD-05 6.5), 설비 반복 고장 14일(STD-08 9.6) */
export const DEFAULT_DUE_DAYS: Partial<Record<NcSource, number>> = { five_s: 14, inspect: 7, equipment: 14 };

// ───────── 3정5S ─────────

/** 구역(8.8) — 설비 구역과 같다 */
export const FIVE_S_ZONES = { A: "판금", B: "도장 준비", C: "도장 부스", D: "조색실", E: "자재 창고", F: "공용 공구", G: "사무실·대기실", H: "외부·주차" } as const;
export type ZoneCode = keyof typeof FIVE_S_ZONES;
export const isZone = (z: string): z is ZoneCode => z in FIVE_S_ZONES;

/** 일일 점검 체크 항목(F-08-05) */
export const DAILY_ITEMS = [
  "통로·비상구에 물건 없음",
  "공구·치공구가 쉐도우 보드 정위치에 있음",
  "도료·시너 뚜껑 닫힘, 보관함 안",
  "바닥 청소, 기름·도료 얼룩 없음",
  "폐기물 분리 배출(지정·일반·재활용)",
  "소화기 앞 적치물 없음",
  "전원·에어·가스 차단",
] as const;

/** 월간 평가 5S 항목, 각 20점(20 = 기준 사진과 같음, 10 = 일부 이탈, 0 = 기준 없음) */
export const FIVE_S = [
  { key: "seiri", label: "정리", hint: "필요 없는 물건이 없다(빨간 딱지 처리)" },
  { key: "seiton", label: "정돈", hint: "3정(정위치·정품·정량)대로 놓였다" },
  { key: "seiso", label: "청소", hint: "바닥·설비가 깨끗하고 누유·이상을 찾았다" },
  { key: "seiketsu", label: "청결", hint: "기준 사진 상태가 유지된다" },
  { key: "shitsuke", label: "습관화", hint: "일일 점검을 빠짐없이 했다" },
] as const;
export const SCORE_STEPS = [20, 10, 0] as const;
export const SCORE_LABEL: Record<number, string> = { 20: "20 기준대로", 10: "10 일부 이탈", 0: "0 기준 없음" };

export function scoreTotal(scores: number[]): number {
  return scores.reduce((a, b) => a + b, 0);
}
export function scoreIssues(scores: number[]): string[] {
  if (scores.length !== FIVE_S.length) return ["5S 항목 다섯 개를 모두 매겨 주세요"];
  if (scores.some((s) => !(SCORE_STEPS as readonly number[]).includes(s))) return ["점수는 20·10·0 가운데 고릅니다"];
  return [];
}

/** 이번 달 일일 점검을 한 날 / 했어야 할 날 → 습관화 참고 */
export function dailyRate(done: number, due: number) {
  return due ? Math.round((done / due) * 100) : null;
}
