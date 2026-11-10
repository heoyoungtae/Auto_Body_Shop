// 리스크·기회 대장(F-Q-03, Q.4)과 내부심사(F-Q-08, Q.7) 규칙. 화면과 서버가 함께 쓴다.

/** 표준서 장(총람 기준). 리스크 '관련 장'과 심사 범위에 쓴다 */
export const STD_CHAPTERS = [
  "0장 총칙",
  "Q 품질경영(총람)",
  "1장 상담·예약·고객 응대",
  "2장 입고와 손상 진단",
  "3장 견적·보험 처리",
  "4장 작업 표준",
  "5장 품질 검사·출고",
  "6장 보증·사후관리·불만 처리",
  "7장 구매·자재·협력업체",
  "8장 설비·현장 관리",
  "9장 안전보건",
  "10장 환경",
  "11장 인사·급여·교육",
  "12장 수납·회계·정산",
  "13장 개인정보·정보보안",
] as const;

export const RISK_KIND = { risk: "리스크", opp: "기회" } as const;
export type RiskKind = keyof typeof RISK_KIND;
export const RISK_STATUS = {
  open: "관리 중",
  acting: "대응 중",
  done: "대응 끝",
  closed: "종료",
} as const;
export type RiskStatus = keyof typeof RISK_STATUS;
export const RISK_TONE = {
  open: "neutral",
  acting: "warn",
  done: "ok",
  closed: "neutral",
} as const;
export const LEVEL = { 1: "낮음", 2: "보통", 3: "높음" } as const;

export const riskScore = (l: number, i: number) => l * i;
export const scoreTone = (s: number, alert: number) =>
  s >= alert ? "danger" : s >= 3 ? "warn" : "ok";
/** 분기 이름 "2026-Q4"와 그 분기 마지막 달인지 */
export const quarterKey = (date: string) =>
  `${date.slice(0, 4)}-Q${Math.floor((Number(date.slice(5, 7)) - 1) / 3) + 1}`;
export const isQuarterEndMonth = (date: string) =>
  Number(date.slice(5, 7)) % 3 === 0;

/** Q.4 초기 등록 항목. 점수는 초안이라 대표 검토 때 고친다 */
export const INITIAL_RISKS: {
  content: string;
  chapter: string;
  likelihood: number;
  impact: number;
  control: string;
}[] = [
  {
    content: "조색 불일치(원래 색과 달라 재도장)",
    chapter: "4장 작업 표준",
    likelihood: 2,
    impact: 2,
    control: "시편 비교, 조색 기록(WI-04)",
  },
  {
    content: "작업 중 고객 차량 추가 손상",
    chapter: "4장 작업 표준",
    likelihood: 2,
    impact: 3,
    control: "입고 사진, 보호 커버, 탈부착 지침",
  },
  {
    content: "보험사 미승인 항목 작업(대금 미회수)",
    chapter: "3장 견적·보험 처리",
    likelihood: 2,
    impact: 2,
    control: "승인 항목만 작업 지시서에 들어감",
  },
  {
    content: "도장 부스 화재",
    chapter: "9장 안전보건",
    likelihood: 1,
    impact: 3,
    control: "부스 점검, 소화기, 용제 보관 기준",
  },
  {
    content: "유기용제 노출(작업자 건강)",
    chapter: "9장 안전보건",
    likelihood: 2,
    impact: 3,
    control: "방독 마스크, 환기, 작업환경측정",
  },
  {
    content: "폐기물 부적정 처리(지정폐기물)",
    chapter: "10장 환경",
    likelihood: 1,
    impact: 3,
    control: "허가 업체 위탁, 올바로 인계서",
  },
  {
    content: "고객 개인정보 유출",
    chapter: "13장 개인정보·정보보안",
    likelihood: 1,
    impact: 3,
    control: "권한별 메뉴, 암호화, 접속 기록",
  },
];

export const AUDIT_STATUS = {
  planned: "계획",
  reported: "보고(승인 대기)",
  approved: "승인",
} as const;
export type AuditStatus = keyof typeof AUDIT_STATUS;
export const AUDIT_TONE = {
  planned: "warn",
  reported: "accent",
  approved: "ok",
} as const;
export const VERDICT = {
  ok: "적합",
  improve: "개선 권고",
  nc: "부적합",
} as const;
export type Verdict = keyof typeof VERDICT;
export const VERDICT_TONE = {
  ok: "ok",
  improve: "warn",
  nc: "danger",
} as const;
export const AUDIT_CRITERIA = "사내 표준서, ISO 9001·14001·45001 해당 조항";
