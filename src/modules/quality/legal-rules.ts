// 법규 대장(F-Q-06)·준수 평가(F-Q-07) 규칙과 부록 C 초안
import { addDays } from "@/modules/platform/time";

export const LEGAL_AREAS = [
  "정비업",
  "환경",
  "안전",
  "고객",
  "인사",
  "세무",
  "기타",
] as const;
export const APPLIES = {
  check: "확인 필요",
  yes: "대상",
  no: "대상 아님",
} as const;
export type Applies = keyof typeof APPLIES;
export const CYCLES = {
  none: "1회·수시",
  monthly: "매월",
  quarterly: "분기",
  half: "반기",
  yearly: "매년",
} as const;
export type Cycle = keyof typeof CYCLES;
export const EVAL_RESULTS = {
  ok: "준수",
  lacking: "미흡",
  na: "대상 아님",
} as const;
export type EvalResult = keyof typeof EVAL_RESULTS;

const MONTHS: Record<Cycle, number> = {
  none: 0,
  monthly: 1,
  quarterly: 3,
  half: 6,
  yearly: 12,
};

/** 이행한 날 기준 다음 기한(주기만큼 뒤, 같은 날짜. 그 달에 없는 날이면 말일) */
export function nextDueAfter(cycle: Cycle, from: string): string | null {
  const m = MONTHS[cycle];
  if (!m) return null;
  const [y, mo, d] = from.split("-").map(Number);
  const t = new Date(Date.UTC(y, mo - 1 + m, 1));
  const last = new Date(
    Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0),
  ).getUTCDate();
  t.setUTCDate(Math.min(d, last));
  return t.toISOString().slice(0, 10);
}

/** 기한 알림 단계: 기한 지남 / 7일 안 / 30일 안 (정책값) */
export function dueStage(
  due: string | null,
  today: string,
  first: number,
  second: number,
): "late" | "second" | "first" | null {
  if (!due) return null;
  if (due < today) return "late";
  if (due <= addDays(today, second)) return "second";
  if (due <= addDays(today, first)) return "first";
  return null;
}

/** 부록 C 법규 대장 초안(개업 전 국가법령정보센터에서 조문·대상 여부 확인 필요) */
export const APPENDIX_C: {
  area: string;
  lawName: string;
  duty: string;
  stdRef: string;
  authority: string;
}[] = [
  {
    area: "정비업",
    lawName: "자동차관리법·시행규칙",
    duty: "자동차정비업 등록(업종·시설 기준), 정비책임자, 견적서·명세서 발급, 요금 게시, 정비 기록",
    stdRef: "0.5, 3.2, 5.3, 1.4",
    authority: "시·군·구",
  },
  {
    area: "정비업",
    lawName: "자동차손해배상보장법",
    duty: "자동차보험 정비요금 기준",
    stdRef: "3.5",
    authority: "국토교통부",
  },
  {
    area: "환경",
    lawName: "대기환경보전법",
    duty: "도장시설 배출시설 신고·허가, 방지시설 운영·기록, 자가측정, VOC 관리",
    stdRef: "10.1",
    authority: "시·도 / 시·군·구",
  },
  {
    area: "환경",
    lawName: "폐기물관리법",
    duty: "사업장·지정폐기물 분류·보관 기간, 허가 업체 위탁, 올바로 인계서",
    stdRef: "10.2",
    authority: "시·군·구 / 유역환경청",
  },
  {
    area: "환경",
    lawName: "물환경보전법",
    duty: "폐수배출시설 대상 여부",
    stdRef: "10.3",
    authority: "시·군·구",
  },
  {
    area: "환경",
    lawName: "화학물질관리법",
    duty: "유해화학물질 취급 기준 해당 여부",
    stdRef: "9.2",
    authority: "환경부",
  },
  {
    area: "안전",
    lawName: "산업안전보건법",
    duty: "위험성평가, MSDS 게시·교육, 국소배기, 보호구, 작업환경측정, 특수건강진단, 안전보건교육, 산업재해 보고",
    stdRef: "9장, 8.2",
    authority: "고용노동부",
  },
  {
    area: "안전",
    lawName: "중대재해 처벌 등에 관한 법률",
    duty: "안전보건관리체계 구축 의무(상시 근로자 수 기준)",
    stdRef: "Q장, 9장",
    authority: "고용노동부",
  },
  {
    area: "안전",
    lawName: "위험물안전관리법",
    duty: "인화성 액체 지정수량·저장 기준",
    stdRef: "7.3, 9.4",
    authority: "소방서",
  },
  {
    area: "안전",
    lawName: "소방시설법·화재예방법",
    duty: "소방시설 설치·점검, 소방안전관리자 대상 여부",
    stdRef: "9.4",
    authority: "소방서",
  },
  {
    area: "안전",
    lawName: "산업안전보건법(안전검사)",
    duty: "리프트·압력용기 안전검사 대상 여부",
    stdRef: "8.2",
    authority: "고용노동부",
  },
  {
    area: "고객",
    lawName: "소비자기본법(소비자분쟁해결기준)",
    duty: "자동차정비업 보증·보상 기준",
    stdRef: "6.1, 6.4",
    authority: "공정거래위원회",
  },
  {
    area: "고객",
    lawName: "개인정보 보호법",
    duty: "수집·이용·제3자 제공 동의, 안전조치, 파기, 유출 통지",
    stdRef: "13장",
    authority: "개인정보보호위원회",
  },
  {
    area: "고객",
    lawName: "정보통신망법",
    duty: "광고성 문자 수신 동의",
    stdRef: "6.3, 13.2",
    authority: "방송통신위원회",
  },
  {
    area: "고객",
    lawName: "전자문서 및 전자거래 기본법·전자서명법",
    duty: "전자결재·전자서명의 효력",
    stdRef: "0.6",
    authority: "과학기술정보통신부",
  },
  {
    area: "인사",
    lawName: "근로기준법·최저임금법",
    duty: "근로계약서 교부, 근로자 명부·임금대장, 취업규칙(10인 이상)",
    stdRef: "11.1",
    authority: "고용노동부",
  },
  {
    area: "인사",
    lawName: "남녀고용평등법",
    duty: "직장 내 성희롱 예방교육",
    stdRef: "11.2",
    authority: "고용노동부",
  },
  {
    area: "인사",
    lawName: "근로기준법(근로시간·임금)",
    duty: "연장근로 한도, 연장·야간·휴일 가산임금, 연차휴가, 임금 정기 지급, 임금명세서 교부(상시 5인 기준 적용 범위)",
    stdRef: "11.4, 11.5",
    authority: "고용노동부",
  },
  {
    area: "인사",
    lawName: "근로자퇴직급여 보장법",
    duty: "퇴직금·퇴직연금 설정, 퇴직 후 지급 기한",
    stdRef: "11.7",
    authority: "고용노동부",
  },
  {
    area: "인사",
    lawName: "국민연금법·국민건강보험법·고용보험법·산업재해보상보험법",
    duty: "4대 보험 취득·상실 신고, 보험료 원천공제·납부",
    stdRef: "11.5, 11.7",
    authority: "4대 보험 공단",
  },
  {
    area: "세무",
    lawName: "부가가치세법·소득세법·국세기본법",
    duty: "세금계산서, 현금영수증, 장부 보존",
    stdRef: "12장",
    authority: "국세청",
  },
];

/** 국가법령정보센터 검색 링크(법령명으로) */
export const lawSearchUrl = (name: string) =>
  `https://www.law.go.kr/lsSc.do?menuId=1&query=${encodeURIComponent(
    name
      .replace(/\(.*?\)/g, "")
      .split("·")[0]
      .trim(),
  )}`;
