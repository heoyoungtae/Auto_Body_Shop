// 품질경영시스템(Q장) 규칙: 조직 상황(F-Q-01) 칸, 품질목표(F-Q-02) 지표, 문서 목록(F-Q-04) 구분. DB 없음.

/** F-Q-01 이슈 구분 */
export const CONTEXT_AREAS = [
  "내부 – 인력·기술",
  "내부 – 설비·재무",
  "외부 – 보험사·시장",
  "외부 – 법령·정책",
  "외부 – 기술(전기차·알루미늄·신도료)",
] as const;

/** F-Q-01 이해관계자(기본 행). 확인 방법은 양식에 적힌 대로 */
export const DEFAULT_PARTIES = [
  { party: "고객", needs: "", check: "만족도·불만", std: "" },
  { party: "보험사·렌터카·딜러", needs: "", check: "거래처 평가", std: "" },
  { party: "직원", needs: "", check: "면담·개선 제안", std: "" },
  { party: "협력업체", needs: "", check: "거래 기록", std: "" },
  { party: "지자체·주민", needs: "", check: "민원·법규 대장", std: "" },
];

export type GoalKey = keyof typeof GOALS;
/** F-Q-02 품질목표 지표(총람 Q.3 표). dir: lower 낮을수록 좋음(이하) · higher 높을수록 좋음(이상) */
export const GOALS = {
  rework: {
    label: "재작업률",
    calc: "최종 검사 불합격이 있었던 출고 건 ÷ 출고 건",
    unit: "%",
    dir: "lower",
    target: 5,
  },
  warranty: {
    label: "보증 재입고율",
    calc: "보증 수리로 처리한 불만 건 ÷ 출고 건",
    unit: "%",
    dir: "lower",
    target: 2,
  },
  ontime: {
    label: "납기 준수율",
    calc: "약속일 안 출고 ÷ 약속일이 있는 출고 건",
    unit: "%",
    dir: "higher",
    target: 90,
  },
  overrun: {
    label: "견적 초과율",
    calc: "최종 금액이 처음 승인한 견적보다 10% 넘게 오른 건 ÷ 출고 건",
    unit: "%",
    dir: "lower",
    target: 5,
  },
  satisfaction: {
    label: "고객 만족도",
    calc: "그 달 답한 설문 점수 평균(5점)",
    unit: "점",
    dir: "higher",
    target: 4.5,
  },
  complaint7: {
    label: "불만 처리 기한 준수",
    calc: "접수 7일 안 종결 ÷ 그 달 종결한 불만",
    unit: "%",
    dir: "higher",
    target: 90,
  },
  accident: {
    label: "산업재해",
    calc: "휴업 이상 재해 건수",
    unit: "건",
    dir: "lower",
    target: 0,
  },
  legal: {
    label: "법규 기한 준수",
    calc: "기한이 지나지 않은 법규 항목 ÷ 기한이 있는 대상 항목(집계 때 기준)",
    unit: "%",
    dir: "higher",
    target: 100,
  },
  downtime: {
    label: "설비 고장 정지",
    calc: "고장으로 작업을 멈춘 시간, 월 합계",
    unit: "시간",
    dir: "lower",
    target: 8,
  },
  fiveS: {
    label: "3정5S 점수",
    calc: "월 점검 구역 평균(100점)",
    unit: "점",
    dir: "higher",
    target: 85,
  },
  pm: {
    label: "예방정비 이행률",
    calc: "기한 안 실시 ÷ 그 달 기한인 예방정비",
    unit: "%",
    dir: "higher",
    target: 95,
  },
} as const;
export const GOAL_KEYS = Object.keys(GOALS) as GoalKey[];
export const isGoalKey = (s: string): s is GoalKey => s in GOALS;

/** 목표를 지켰는가(대상이 없으면 null) */
export function goalOk(
  key: GoalKey,
  value: number | null,
  target: number,
): boolean | null {
  if (value == null) return null;
  return GOALS[key].dir === "lower"
    ? value <= target + 1e-9
    : value >= target - 1e-9;
}

/** 표시용: 12.3% · 4.6점 · 3.5시간 · 0건 */
export function goalText(key: GoalKey, v: number | null) {
  if (v == null) return "—";
  const u = GOALS[key].unit;
  return `${u === "건" ? Math.round(v) : Math.round(v * 10) / 10}${u}`;
}

/** 2개월 연속 미달이면 부적합(Q.3) */
export const MISS_MONTHS = 2;
/** 앞달 집계를 고정하는 날 */
export const GOAL_SNAPSHOT_DAY = 5;

export const DOC_KINDS = {
  std: "표준서",
  wi: "작업 지침서",
  form: "양식",
  external: "외부 문서",
} as const;
export type DocKind = keyof typeof DOC_KINDS;
export const isDocKind = (s: string): s is DocKind => s in DOC_KINDS;

/** v0.2 → v0.3, v1.9 → v1.10. 숫자 형식이 아니면 끝에 '-개정' */
export function nextRev(rev: string) {
  const m = /^(v?)(\d+)\.(\d+)$/.exec(rev.trim());
  return m ? `${m[1]}${m[2]}.${Number(m[3]) + 1}` : `${rev}-개정`;
}

/** F-Q-09 입력 항목(양식 순서) */
export const REVIEW_INPUTS = {
  prev: { label: "지난 검토 조치 결과", src: "전년 F-Q-09" },
  context: { label: "내부·외부 이슈 변화", src: "F-Q-01" },
  goals: { label: "품질목표 실적", src: "F-Q-02" },
  customer: { label: "고객 만족·불만", src: "F-06-01, F-06-02" },
  nc: { label: "부적합·시정 조치", src: "F-Q-10" },
  audit: { label: "내부심사 결과", src: "F-Q-08" },
  legal: { label: "법규 준수 평가", src: "F-Q-07" },
  risk: { label: "리스크·기회", src: "F-Q-03" },
  supplier: { label: "협력업체 평가", src: "F-07-01" },
  safety: { label: "안전보건(재해·아차사고)", src: "F-09-03" },
  env: { label: "환경 실적(폐기물)", src: "F-10-02" },
  equipment: { label: "설비 고장·예방정비 실적", src: "F-08-04, F-08-07" },
} as const;
export type ReviewInputKey = keyof typeof REVIEW_INPUTS;
