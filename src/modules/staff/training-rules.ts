// 교육 기록(F-11-03) 규칙: 교육 종류, 연간 기본 계획(STD-11 5.1, 취업규칙 제27조), 효과 확인 대상

export const TR_KINDS = {
  safety_regular: { label: "정기 안전보건교육", legal: true, effect: false },
  safety_hire: {
    label: "채용 시 교육(안전보건·직무 입문)",
    legal: true,
    effect: false,
  },
  safety_change: {
    label: "작업 내용 변경 시 교육",
    legal: true,
    effect: false,
  },
  msds: { label: "MSDS(화학물질) 교육", legal: true, effect: false },
  harassment: { label: "직장 내 성희롱 예방교육", legal: true, effect: false },
  privacy: { label: "개인정보 보호 교육", legal: true, effect: false },
  disability: { label: "장애인 인식개선 교육", legal: true, effect: false },
  bullying: { label: "직장 내 괴롭힘 예방교육", legal: false, effect: false },
  job: { label: "직무 교육(도료·공법·수리 지침)", legal: false, effect: true },
  std_rev: { label: "표준서 개정 교육", legal: false, effect: true },
  ojt: { label: "OJT(선임자 짝 교육)", legal: false, effect: true },
  other: { label: "기타", legal: false, effect: false },
} as const;
export type TrKind = keyof typeof TR_KINDS;
export const isTrKind = (k: string): k is TrKind => k in TR_KINDS;

export const TR_STATUS = {
  planned: "계획",
  done: "실시",
  cancelled: "취소",
} as const;
export const EFFECT_METHODS = {
  practice: "실습 평가",
  rework: "이후 재작업률",
  observe: "작업 관찰",
  test: "필기·구두 확인",
} as const;
export const EFFECT_RESULTS = {
  effective: "효과 있음",
  partial: "일부 효과",
  none: "효과 없음(재교육)",
} as const;
export type EffectResult = keyof typeof EFFECT_RESULTS;

/** 효과 확인 기한: 실시일 + 1개월(STD-11 5.3) */
export const EFFECT_DAYS = 30;
/** 채용 시 교육을 아직 안 받은 신규 입사자로 보는 기간(입사일 기준) */
export const HIRE_WINDOW_DAYS = 90;

type PlanItem = {
  kind: TrKind;
  title: string;
  month: number;
  hours: number;
  target: string;
};

/**
 * 연간 기본 계획(STD-11 5.1, 대표가 1월에 세움). 시간·주기는 제안값이며 법정 요건은 [확인 필요].
 * 정기 안전보건교육: 산업안전보건법 시행규칙 별표 4(현장직 반기 12시간 이상 — 상시 인원별 적용 확인 필요).
 */
export const DEFAULT_PLAN: PlanItem[] = [
  {
    kind: "safety_regular",
    title: "상반기 정기 안전보건교육",
    month: 3,
    hours: 12,
    target: "전 직원(사무직 6시간)",
  },
  {
    kind: "safety_regular",
    title: "하반기 정기 안전보건교육",
    month: 9,
    hours: 12,
    target: "전 직원(사무직 6시간)",
  },
  {
    kind: "harassment",
    title: "직장 내 성희롱 예방교육",
    month: 4,
    hours: 1,
    target: "전 직원·대표",
  },
  {
    kind: "privacy",
    title: "개인정보 보호 교육",
    month: 4,
    hours: 1,
    target: "전 직원(고객 정보 취급자 필수)",
  },
  {
    kind: "disability",
    title: "직장 내 장애인 인식개선 교육",
    month: 5,
    hours: 1,
    target: "전 직원·대표",
  },
  {
    kind: "bullying",
    title: "직장 내 괴롭힘 예방교육",
    month: 5,
    hours: 1,
    target: "전 직원",
  },
  {
    kind: "job",
    title: "신규 도료·공법 교육",
    month: 6,
    hours: 4,
    target: "도장·조색 담당",
  },
  {
    kind: "job",
    title: "제조사 수리 지침 교육",
    month: 7,
    hours: 4,
    target: "판금·검사 담당",
  },
  {
    kind: "job",
    title: "알루미늄·전기차 차체 수리 주의 교육",
    month: 10,
    hours: 4,
    target: "판금·용접·검사 담당",
  },
];

export const ym = (year: number, month: number) =>
  `${year}-${String(month).padStart(2, "0")}`;
