// 안전보건(STD-09) 규칙. 화면과 서버가 함께 쓴다.

/** 공정(STD-09 4.1) */
export const PROCESSES = [
  "입고",
  "판금",
  "용접",
  "퍼티",
  "샌딩",
  "조색",
  "도장",
  "건조",
  "광택",
  "조립",
  "출고",
  "리프트 작업",
  "화학물질 보관",
  "공통(사무·이동)",
] as const;

export const HA_KIND = {
  initial: "최초",
  regular: "정기",
  adhoc: "수시",
} as const;
export type HaKind = keyof typeof HA_KIND;
export const HA_STATUS = { draft: "작성 중", done: "확정" } as const;
/** 4.2 위험성 4점 이상은 감소 대책 필수 */
export const HA_MEASURE_SCORE = 4;
/** 4.3 대책 우선순위 */
export const MEASURE_TYPES = {
  eliminate: "제거",
  substitute: "대체(저VOC·수용성)",
  engineering: "공학적(배기·방호)",
  admin: "관리적(절차·교육)",
  ppe: "보호구",
} as const;
export type MeasureType = keyof typeof MEASURE_TYPES;
export const hazardTone = (s: number) =>
  s >= 6 ? "danger" : s >= HA_MEASURE_SCORE ? "warn" : "ok";

/** 개업 전 최초 평가 초안(STD-09 1절의 주된 위험). 점수는 초안 */
export const INITIAL_HAZARDS: {
  process: string;
  hazard: string;
  current: string;
  likelihood: number;
  severity: number;
}[] = [
  {
    process: "도장",
    hazard: "유기용제·이소시아네이트 흡입",
    current: "도장 부스 배기, 방독 마스크",
    likelihood: 2,
    severity: 3,
  },
  {
    process: "조색",
    hazard: "유기용제 흡입·피부 접촉",
    current: "조색실 배기, 니트릴 장갑",
    likelihood: 2,
    severity: 2,
  },
  {
    process: "샌딩",
    hazard: "분진 흡입, 소음",
    current: "집진 샌더, 방진 마스크",
    likelihood: 3,
    severity: 2,
  },
  {
    process: "용접",
    hazard: "불티로 인한 화재, 흄 흡입",
    current: "불티 방지포, 소화기",
    likelihood: 2,
    severity: 3,
  },
  {
    process: "리프트 작업",
    hazard: "차량 낙하·끼임",
    current: "리프트 일일 점검, 안전 잠금",
    likelihood: 1,
    severity: 3,
  },
  {
    process: "판금",
    hazard: "중량물 취급 근골격계 부담, 날카로운 모서리 베임",
    current: "작업 장갑, 2인 작업",
    likelihood: 2,
    severity: 2,
  },
  {
    process: "화학물질 보관",
    hazard: "인화성 물질 화재·폭발",
    current: "위험물 보관함, 화기 금지",
    likelihood: 1,
    severity: 3,
  },
];

export const CHEM_CATEGORIES = [
  "도료",
  "시너",
  "경화제",
  "퍼티",
  "프라이머·서페이서",
  "탈지제·세정제",
  "접착제·실러",
  "광택제",
  "기타",
] as const;
/** 9.3 보호구 */
export const PPE = [
  "방독 마스크(유기가스용)",
  "송기 마스크",
  "방진 마스크",
  "도장복",
  "니트릴 장갑",
  "보안경",
  "귀마개",
  "용접면",
  "가죽 장갑",
  "방염 앞치마",
  "안전화",
  "안전모",
] as const;
/** 분류별 기본 보호구(9.3 표에서) */
export const PPE_BY_CATEGORY: Record<string, string[]> = {
  도료: ["방독 마스크(유기가스용)", "도장복", "니트릴 장갑", "보안경"],
  시너: ["방독 마스크(유기가스용)", "니트릴 장갑", "보안경"],
  경화제: ["방독 마스크(유기가스용)", "도장복", "니트릴 장갑", "보안경"],
  퍼티: ["방진 마스크", "니트릴 장갑", "보안경"],
  "프라이머·서페이서": [
    "방독 마스크(유기가스용)",
    "도장복",
    "니트릴 장갑",
    "보안경",
  ],
  "탈지제·세정제": ["방독 마스크(유기가스용)", "니트릴 장갑", "보안경"],
  "접착제·실러": ["니트릴 장갑", "보안경"],
  광택제: ["니트릴 장갑", "보안경"],
  기타: [],
};
/** 인화성이 흔한 분류 */
export const FLAMMABLE_CATEGORIES = [
  "도료",
  "시너",
  "경화제",
  "프라이머·서페이서",
  "탈지제·세정제",
];

export const INC_KIND = { accident: "사고", near: "아차사고" } as const;
export type IncKind = keyof typeof INC_KIND;
export const INC_SEVERITY = {
  none: "부상 없음",
  first_aid: "응급처치",
  lost_time: "휴업",
  serious: "중대(사망·중상)",
} as const;
export type IncSeverity = keyof typeof INC_SEVERITY;
export const INC_STATUS = {
  reported: "보고",
  investigated: "조사 끝",
  closed: "종결",
} as const;
export type IncStatus = keyof typeof INC_STATUS;
export const INC_TONE = {
  reported: "danger",
  investigated: "warn",
  closed: "ok",
} as const;
/** 9.3 보고서 24시간, 9.5 원인·재발 방지 14일 */
export const INC_REPORT_HOURS = 24;
export const INC_FIX_DAYS = 14;
