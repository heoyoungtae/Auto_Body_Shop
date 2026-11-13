// 통계·보고서 목록(보고서 센터). 분야별로 보고서를 나누고, 보고서마다 볼 수 있는 권한을 따로 둔다.
// 사용자 결정 2026-11-13: 한 화면에 뭉뚱그리지 말고 보고서별로. 아직 만들지 않은 보고서는 phase(단계)를 달아 흐리게 보인다.
// DB 없음(메뉴·테스트·화면이 같이 쓴다).
import { can, type PermKey } from "@/modules/auth/permissions";
import type { Role } from "@/modules/auth/roles";

export const FAMILIES = {
  mgmt: { label: "경영보고서", perm: "report.mgmt", desc: "매출·영업·작업 생산성을 한눈에, 의사결정용" },
  acct: { label: "회계보고서", perm: "report.acct", desc: "받을 돈·낼 돈·부가세, 앞으로 재무제표·현금흐름" },
  quality: { label: "품질보고서", perm: "report.quality", desc: "품질목표·재작업·고객 만족, 경영검토 자료" },
  stock: { label: "재고·구매보고서", perm: "report.stock", desc: "재고·회전율·협력업체 실적" },
  people: { label: "인사·안전·설비보고서", perm: "report.safety", desc: "인력·근태·교육, 안전·환경, 설비" },
} as const satisfies Record<string, { label: string; perm: PermKey; desc: string }>;
export type FamilyId = keyof typeof FAMILIES;

export type ReportDef = {
  id: string;
  no: number;
  family: FamilyId;
  title: string;
  /** 한 줄 설명(보고서 센터 카드·화면 부제) */
  desc: string;
  std: string;
  perm: PermKey;
  /** 아직 안 만든 보고서: 몇 단계에서 만드는지 */
  phase?: string;
  /** 왜 아직 안 되는지(흐린 카드에 보임) */
  wait?: string;
};

const R = (d: Omit<ReportDef, "perm"> & { perm?: PermKey }): ReportDef => ({ perm: FAMILIES[d.family].perm, ...d });

export const REPORTS: ReportDef[] = [
  R({ id: "summary", no: 1, family: "mgmt", title: "경영 요약", desc: "매출·수금·미수·입고·출고·품질·안전 핵심 숫자와 경고를 한 장에", std: "STD-Q Q.10" }),
  R({ id: "sales", no: 2, family: "mgmt", title: "영업 실적", desc: "상담 → 예약 → 입고 → 출고 단계별 건수와 놓친 수, 유입 경로, 보험/자비", std: "STD-01~02" }),
  R({ id: "revenue", no: 3, family: "mgmt", title: "매출 분석", desc: "보험사별·수리 종류별·공임/부품 구성, 건당 매출", std: "STD-12" }),
  R({ id: "productivity", no: 4, family: "mgmt", title: "생산성·작업", desc: "기술자별·공정별 작업 시간과 표준 대비 효율, 수리 기간", std: "STD-04" }),
  R({ id: "budget", no: 5, family: "mgmt", title: "손익분기·예산 대비", desc: "월 고정비, 손익분기 매출, 예산 대비 실적", std: "STD-12", phase: "5단계", wait: "연초 예산 입력과 손익계산서(4단계)가 있어야 합니다" }),
  R({ id: "pl", no: 6, family: "acct", title: "손익계산서", desc: "매출 − 매출원가 − 판관비 = 영업이익, 월별·누계", std: "STD-12", phase: "4단계", wait: "계정과목·자동 분개가 있어야 합니다" }),
  R({ id: "bs", no: 7, family: "acct", title: "재무상태표", desc: "기준일의 자산·부채·자본", std: "STD-12", phase: "4단계", wait: "개업일 기초 잔액·자동 분개가 있어야 합니다" }),
  R({ id: "cashflow", no: 8, family: "acct", title: "현금흐름표", desc: "영업·투자·재무 활동별로 들어오고 나간 돈", std: "STD-12", phase: "4단계", wait: "통장 구분·자금 전표가 있어야 합니다" }),
  R({ id: "funds", no: 9, family: "acct", title: "자금일보·자금수지 예정", desc: "통장·현금별 입금·지급·잔액, 앞으로 4주 입금·지급 예정", std: "STD-12", phase: "4단계", wait: "통장 구분과 기초 잔액이 있어야 잔액이 맞습니다" }),
  R({ id: "ar", no: 10, family: "acct", title: "매출채권 연령", desc: "고객·보험사 미수를 30·60·90일 넘은 것으로 나눔, 보험사별 입금 일수", std: "STD-12 12.2" }),
  R({ id: "ap", no: 11, family: "acct", title: "매입채무·지급 예정", desc: "업체별 외상매입금·미지급금 잔액과 지급 예정일", std: "STD-12 12.3" }),
  R({ id: "vat", no: 12, family: "acct", title: "부가세 집계", desc: "매출세액(세금계산서·카드·현금영수증)과 매입세액, 신고 참고용", std: "STD-12" }),
  R({ id: "ledger", no: 13, family: "acct", title: "계정별 원장", desc: "계정별 기간 합계와 그 계정의 전표", std: "STD-12", phase: "4단계", wait: "계정과목·자동 분개가 있어야 합니다" }),
  R({ id: "quality", no: 14, family: "quality", title: "품질 월보", desc: "품질목표별 실적·달성 여부, 미달 목표", std: "STD-Q Q.3" }),
  R({ id: "rework", no: 15, family: "quality", title: "재작업·부적합 분석", desc: "검사 한 번에 합격률, 재작업, 부적합 원인·출처별, 시정조치 지연", std: "STD-05·Q.9" }),
  R({ id: "customer", no: 16, family: "quality", title: "고객 만족·불만·보증", desc: "설문 점수·응답률, 불만 유형·처리 기간, 보증 수리·보상", std: "STD-06" }),
  R({ id: "review", no: 17, family: "quality", title: "경영검토 입력 자료", desc: "ISO 9.3 경영검토에 넣을 자료를 기간별로 자동 묶음", std: "STD-Q Q.10" }),
  R({ id: "stock", no: 18, family: "stock", title: "재고현황", desc: "기준일의 품목별 수량·금액, 안전재고 미달, 유효기간 임박", std: "STD-07" }),
  R({ id: "stockledger", no: 19, family: "stock", title: "재고 수불부", desc: "기초·입고·출고·조정·기말, 수량과 금액", std: "STD-07" }),
  R({ id: "turnover", no: 20, family: "stock", title: "재고회전율·장기 재고", desc: "회전율·회전일수, 90일 넘게 안 쓴 품목, 재고감모·실사 차이", std: "STD-07" }),
  R({ id: "purchase", no: 21, family: "stock", title: "구매·협력업체 실적", desc: "업체별 발주·입고 금액, 납기 준수, 입고 불량, 외주, 평가 점수", std: "STD-07" }),
  R({ id: "people", no: 22, family: "people", title: "인력·근태·교육", desc: "직원별 근무·연장 시간, 인건비와 매출 대비, 교육 이수", std: "STD-11", perm: "report.people" }),
  R({ id: "safety", no: 23, family: "people", title: "안전·환경", desc: "사고·아차사고, 위험성평가 개선 조치, 지정폐기물", std: "STD-09·10" }),
  R({ id: "equipment", no: 24, family: "people", title: "설비", desc: "고장·멈춘 시간, 예방정비·일상점검 이행, 교정 도래", std: "STD-08" }),
];

export const reportById = (id: string) => REPORTS.find((r) => r.id === id);

type Who = { roles: readonly Role[] };
/** 이 사람이 볼 수 있는 보고서 */
export const canReport = (u: Who, r: ReportDef) => can(u, r.perm);
/** 보고서 센터를 열 수 있나(보고서 하나라도 볼 수 있으면) */
export const canAnyReport = (u: Who) => REPORTS.some((r) => canReport(u, r));
/** 보고서 권한 키 전부(메뉴 표시용) */
export const REPORT_PERMS: PermKey[] = [...new Set(REPORTS.map((r) => r.perm))];
