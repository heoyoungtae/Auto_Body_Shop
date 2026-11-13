// 직무기술서(F-11-08, STD-11). 화면과 서버가 같이 쓴다(DB 없음).
// 사용자 결정 2026-11-14 '제안대로 진행': 앱 역할 7개마다 직무기술서, 기술자는 3개 직군,
// 품질·안전환경 담당은 겸직, 자격증은 공장장만 필수(나머지는 우대).
// '하는 일·확인·승인'(앱 권한) 칸은 사람이 쓰지 않고 권한표(permissions.ts)에서 자동으로 만든다.
// 내용을 고치면 JD_VERSION 을 올린다 → 직원에게 다시 확인 서명을 받는다.
import { PERMS, type PermKey } from "@/modules/auth/permissions";
import type { Role } from "@/modules/auth/roles";
import { SKILLS, type Skill } from "./rules";

export const JD_VERSION = "v1 2026-11-14";

export type JobKey = "owner" | "plant_manager" | "advisor" | "tech_sheet" | "tech_paint" | "tech_prep" | "quality" | "safety" | "accounting";

export type Job = {
  /** 명부 '종사 업무'에 들어가는 이름 */
  title: string;
  /** 이 직무에 주는 앱 역할 */
  role: Role;
  /** 다른 직무와 겸할 때 쓰는 직무(품질·안전환경) */
  concurrent?: boolean;
  purpose: string;
  duties: string[];
  required: string[];
  competencies: string[];
  preferred: string[];
  /** 견제 장치: 자기 일을 자기가 확인하지 않게 하는 규칙 */
  checks: string[];
  reportsTo: string;
  deputy: string;
  /** 역량표 직무: 주로 하는 것 / 함께 익힐 것 */
  skills?: Skill[];
  sideSkills?: Skill[];
  /** 입사 때 기대 역량 단계(경력·신입) */
  entryLevel?: { career: number; newbie: number };
  /** 오리엔테이션 직무 교재 목차(사내 교재)와 외부 자료 */
  manuals: string[];
  links: string[];
  /** 지금은 채용 대상이 아님(대표) */
  notHired?: boolean;
};

const TECH_COMMON = {
  role: "technician" as Role,
  purpose: "배정받은 공정을 작업 표준대로 끝내고, 자기 작업을 스스로 검사해 다음 공정에 넘긴다",
  duties: [
    "손상 진단 기록",
    "공정 시작·끝·자주 검사(사진)",
    "자재 사용 기록",
    "입고 검수",
    "설비 일상점검·윤활·고장 신고",
    "3정5S 구역 점검",
    "개선 제안·아차사고 보고",
    "출퇴근·업무일지",
  ],
  checks: ["배정받은 공정만 함", "역량 2단계 미만은 지도자(3단계 이상)와 함께", "자기가 작업한 차는 최종 검사 못 함"],
  reportsTo: "공장장",
  deputy: "같은 직군 기술자",
  links: ["도료 제조사 공법 영상", "안전보건공단(KOSHA) 교육 자료"],
};
const TECH_COMPETENCY = [
  "역량표 4단계: 1 교육 중(감독 아래 보조) → 2 독립 작업(혼자 배정 가능) → 3 숙련(최종 검사·지도자 가능) → 4 지도(신입 OJT·표준 개정 제안)",
  "보호구 착용·MSDS 읽기",
  "사진으로 기록 남기기",
];
const TECH_MANUALS = ["공정 기록과 자주 검사 기준", "자재 사용 기록", "설비 일상점검·윤활", "사용 도료 MSDS"];

export const JOBS: Record<JobKey, Job> = {
  owner: {
    title: "대표",
    role: "owner",
    notHired: true,
    purpose: "사내 표준서에 따라 정비소를 운영하고, 돈·사람·품질의 최종 책임을 진다",
    duties: [
      "전결 금액을 넘는 견적·발주 승인",
      "급여 지급·월 마감 승인",
      "근로계약·재직증명 직인",
      "역량·인사평가 확정",
      "협력업체 등록 승인",
      "품질목표·경영검토",
      "불만 보상 승인",
      "계정·권한·정책값 설정",
      "연간 교육 계획",
    ],
    required: ["사업자·자동차정비업 등록 명의인"],
    competencies: ["경영 판단(예산·수익)", "법규 이해(노동·안전·자동차관리법)", "사람 관리", "기록을 보고 결정하는 습관"],
    preferred: [],
    checks: ["자기가 낸 견적·지출도 기록에 남김", "부재 때는 공장장이 대리 승인"],
    reportsTo: "없음",
    deputy: "공장장",
    manuals: ["전결 규정", "권한표"],
    links: [],
  },
  plant_manager: {
    title: "공장장",
    role: "plant_manager",
    purpose: "작업장을 하루 단위로 운영해 약속한 날짜에 기준 품질로 출고되게 한다",
    duties: [
      "진단 확인",
      "견적 내부 검토(200만 원 이하 전결)",
      "작업 배정(역량 단계 확인)",
      "기술자 역량 평가·인사평가 작성",
      "근태·연장근로 승인",
      "발주·외주(50만 원 이하 전결)",
      "재고 품목·안전재고",
      "설비 대장·예방정비·고장 확인",
      "3정5S 월간 평가",
      "개선 제안 회신",
      "업무지시",
    ],
    required: ["차체 수리(판금 또는 도장) 실무 5년 이상", "자동차차체수리기능사 또는 자동차보수도장기능사 이상", "운전면허"],
    competencies: ["역량표 '검사' 3단계 이상, 주 직무 3단계 이상", "작업 일정 짜기", "보험 견적·손해사정 이해", "직원 지도와 면담", "앱으로 기록하고 확인하는 습관"],
    preferred: ["자동차정비산업기사 이상", "수입차·알루미늄·전기차 차체 수리 경험", "관리감독자 안전보건교육 이수", "품질·안전 겸직 가능자"],
    checks: ["자기 근태·발주 요청은 대표 승인", "자기 인사평가는 대표가 씀", "자기가 작업한 차는 최종 검사 못 함"],
    reportsTo: "대표",
    deputy: "선임 기술자(3단계 이상)",
    skills: ["inspect"],
    sideSkills: ["sheet", "paint"],
    entryLevel: { career: 3, newbie: 3 },
    manuals: ["작업 배정과 역량 단계", "역량 평가", "전결 규정", "발주·외주", "설비 대장"],
    links: ["관리감독자 안전보건교육(KOSHA)"],
  },
  advisor: {
    title: "상담원",
    role: "advisor",
    purpose: "고객이 상담부터 출고까지 한 사람에게 안내받고, 견적·보험·수납이 빠짐없이 처리되게 한다",
    duties: [
      "상담·예약",
      "고객·차량 등록과 개인정보 동의",
      "접수·입고(사진)",
      "법정 양식 견적 작성·고객 승인",
      "보험 접수·손해사정 요청·청구",
      "외주 반출 전 고객 알림",
      "수납·일일 마감",
      "출고·정비명세서 발급",
      "불만 접수 안내·만족 확인",
      "기프티콘 발송",
    ],
    required: ["운전면허(고객 차 이동)", "고객 응대 경험 1년 이상"],
    competencies: ["역량표 '상담·견적' 2단계 이상(입사 3개월 안)", "손상 부위를 사진과 용어로 설명", "자동차보험 처리 흐름(사고접수번호·과실·자기부담금)", "개인정보 다루는 규칙", "불만 고객 응대"],
    preferred: ["정비소·보험사·손해사정 업무 경험", "자동차 보험 견적 프로그램 경험", "외국어 고객 응대 가능"],
    checks: ["견적 승인은 공장장·대표", "보험금 입금 확인은 회계", "불만 판정·보상은 품질·대표"],
    reportsTo: "공장장",
    deputy: "공장장",
    skills: ["consult"],
    entryLevel: { career: 2, newbie: 1 },
    manuals: ["상담·접수", "법정 견적서", "보험 청구", "출고·정비명세서", "불만 응대"],
    links: ["개인정보보호위원회 교육 자료"],
  },
  tech_sheet: {
    ...TECH_COMMON,
    title: "기술자(판금·덴트)",
    required: ["경력직: 판금 또는 덴트 실무 2년 이상 / 신입: 없음(지도자 배정)"],
    competencies: TECH_COMPETENCY,
    preferred: ["자동차차체수리기능사", "특수용접기능사(CO2·스폿)", "PDR(무도장 덴트) 경험", "알루미늄 차체 경험"],
    skills: ["sheet", "dent", "weld"],
    sideSkills: ["equip"],
    entryLevel: { career: 2, newbie: 1 },
    manuals: [...TECH_MANUALS, "판금·덴트 작업 표준", "프레임 수정기·용접기 운전"],
  },
  tech_paint: {
    ...TECH_COMMON,
    title: "기술자(도장)",
    required: ["경력직: 도장 실무 2년 이상 / 신입: 없음(지도자 배정)"],
    competencies: TECH_COMPETENCY,
    preferred: ["자동차보수도장기능사", "수용성 도료 경험", "조색에 필요한 색 구별(필수 여부는 노무 확인 후)"],
    skills: ["color", "paint"],
    sideSkills: ["putty", "equip"],
    entryLevel: { career: 2, newbie: 1 },
    manuals: [...TECH_MANUALS, "조색·도장 작업 표준", "도장 부스 운전"],
  },
  tech_prep: {
    ...TECH_COMMON,
    title: "기술자(준비·광택)",
    required: ["없음(신입 가능)"],
    competencies: TECH_COMPETENCY,
    preferred: ["광택·디테일링 경험", "자동차보수도장기능사 준비 중"],
    skills: ["putty", "polish"],
    sideSkills: [],
    entryLevel: { career: 1, newbie: 1 },
    manuals: [...TECH_MANUALS, "퍼티·샌딩·마스킹 작업 표준", "광택 작업 표준"],
  },
  quality: {
    title: "품질 담당",
    role: "quality",
    concurrent: true,
    purpose: "고객에게 나가기 전 마지막 눈이 되고, 같은 문제가 다시 생기지 않게 한다",
    duties: ["최종 검사", "부적합 원인 분석·시정 조치·종결", "불만 현물 확인·보증 판정", "측정 장비 교정 기록", "리스크 대장", "내부심사 계획", "문서 목록 관리"],
    required: ["역량표 '검사' 3단계 이상"],
    competencies: ["도막 두께·색차·단차 검사", "원인 찾기(왜 5번)", "표준서와 기록을 대조하는 꼼꼼함"],
    preferred: ["ISO 9001 내부심사원 교육 이수", "보수도장 경력"],
    checks: ["자기가 작업한 차는 검사 못 함", "자기 업무는 심사 못 함", "보상 승인은 대표"],
    reportsTo: "대표",
    deputy: "공장장",
    skills: ["inspect"],
    entryLevel: { career: 3, newbie: 3 },
    manuals: ["최종 검사 기준", "부적합·시정 조치", "불만 판정", "내부심사"],
    links: [],
  },
  safety: {
    title: "안전환경 담당",
    role: "safety",
    concurrent: true,
    purpose: "도료·용제·용접·들어올리기 장비에서 사람과 환경을 지킨다",
    duties: ["위험성평가", "화학물질 목록·MSDS", "사고·아차사고 조사·종결·법정 신고", "법규 대장·준수 평가 작성", "안전보건 교육 주관", "폐기물·대기 배출 기록"],
    required: ["관리감독자 안전보건교육 이수(없으면 지정 후 3개월 안 이수)"],
    competencies: ["산업안전보건법·화학물질 기본", "위험 찾기", "현장 사람에게 쉽게 말하기"],
    preferred: ["산업안전산업기사·환경기능사 이상", "소방안전관리자"],
    checks: ["연간 법규 준수 평가 확정은 대표"],
    reportsTo: "대표",
    deputy: "공장장",
    manuals: ["위험성평가", "화학물질·MSDS", "사고 보고", "법규 대장"],
    links: ["안전보건공단(KOSHA) 교육 자료"],
  },
  accounting: {
    title: "회계 담당",
    role: "accounting",
    purpose: "들어오고 나가는 돈을 전표와 통장으로 맞춰, 세금과 급여가 제때 맞게 나가게 한다",
    duties: [
      "수납·일일 마감",
      "보험금 입금 확인·독촉",
      "지출 결의·지급·외상매입금 지급",
      "세금계산서 연결",
      "협력업체 계좌 확인",
      "통장·카드·홈택스 내역 맞추기",
      "급여 계산·급여대장",
      "월 마감 상신",
      "직원 명부·재직증명",
      "비품 대장",
    ],
    required: ["경리·회계 실무 1년 이상 또는 전산회계 2급 이상"],
    competencies: ["부가세·원천세·4대보험 기본", "엑셀", "개인정보·계좌번호 비밀 지키기", "숫자가 안 맞으면 끝까지 찾는 태도"],
    preferred: ["전산세무 2급·급여관리사", "정비업·보험 청구 정산 경험"],
    checks: ["급여·월 마감·근로계약은 대표 승인", "자기가 넣은 업체 계좌는 다른 사람이 전화 확인해야 지급", "통장 연동 설정은 대표"],
    reportsTo: "대표",
    deputy: "대표",
    manuals: ["수납·마감", "지출·지급", "통장 맞추기", "급여", "계좌 확인 규칙"],
    links: ["국세청 안내 자료"],
  },
};

export const JOB_KEYS = Object.keys(JOBS) as JobKey[];
export const isJobKey = (s: string): s is JobKey => s in JOBS;

/** 명부 '종사 업무' 값(직무 이름)으로 직무기술서를 찾는다. 예전에 직접 쓴 값은 null */
export function jobByTitle(title: string | null | undefined): JobKey | null {
  const t = (title ?? "").trim();
  return JOB_KEYS.find((k) => JOBS[k].title === t) ?? null;
}

/** 명부에서 고를 수 있는 직무(대표·겸직 직무 제외) */
export const ROSTER_JOBS = JOB_KEYS.filter((k) => !JOBS[k].notHired && !JOBS[k].concurrent);

/** 앱 역할로 정해지는 겸직 직무(품질·안전환경) */
export function concurrentJobs(roles: readonly Role[], main: JobKey | null): JobKey[] {
  return JOB_KEYS.filter((k) => JOBS[k].concurrent && roles.includes(JOBS[k].role) && k !== main);
}

export type PermLine = { key: PermKey; area: string; label: string; std: string; note?: string; alone: boolean };

/** 이 역할이 앱에서 할 수 있는 일(권한표에서 자동). alone=이 역할과 대표만 하는 일 */
export function permsForRole(role: Role): PermLine[] {
  return (Object.keys(PERMS) as PermKey[])
    .filter((k) => (PERMS[k].roles as Role[]).includes(role))
    .map((k) => {
      const p = PERMS[k] as { area: string; label: string; std: string; roles: Role[]; note?: string };
      return { key: k, area: p.area, label: p.label, std: p.std, note: p.note, alone: p.roles.every((r) => r === role || r === "owner") };
    });
}

/** 권한 줄을 업무 묶음(area)별로 */
export function permsByArea(role: Role) {
  const m = new Map<string, PermLine[]>();
  for (const p of permsForRole(role)) m.set(p.area, [...(m.get(p.area) ?? []), p]);
  return [...m.entries()].map(([area, items]) => ({ area, items }));
}

export const skillNames = (s: Skill[] | undefined) => (s ?? []).map((k) => SKILLS[k]).join(", ");

/** 근로계약서 '업무 내용' 기본값(80자 안): 직무 이름 + 주요 업무 앞부분 + 직무기술서 */
export function contractDuties(title: string): string {
  const k = jobByTitle(title);
  if (!k) return title;
  const j = JOBS[k];
  for (let n = 3; n >= 0; n--) {
    const s = n ? `${j.title}: ${j.duties.slice(0, n).join(", ")} 등 직무기술서(F-11-08)의 업무` : `${j.title} 및 직무기술서(F-11-08)의 업무`;
    if (s.length <= 80) return s;
  }
  return j.title;
}

/** 채용 공고 문구(복사해 쓰는 글). 나이·성별 같은 직무와 상관없는 조건은 넣지 않는다 */
export function jobPosting(key: JobKey, shopName: string): string {
  const j = JOBS[key];
  const lines = [
    `[${shopName || "정비소"}] ${j.title} 채용`,
    "",
    "■ 하는 일",
    j.purpose,
    ...j.duties.map((d) => `- ${d}`),
    "",
    "■ 자격조건",
    ...j.required.map((d) => `- ${d}`),
  ];
  if (j.preferred.length) lines.push("", "■ 우대", ...j.preferred.map((d) => `- ${d}`));
  lines.push("", "■ 함께 일하는 방식", `- 보고: ${j.reportsTo}`, "- 입사 후 2주 안 앱으로 안전보건·직무 입문 교육, 첫 달 선임 지도(OJT)");
  if (j.skills?.length) lines.push(`- 역량 평가 직무: ${skillNames(j.skills)}`);
  return lines.join("\n");
}
