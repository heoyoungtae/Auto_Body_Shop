// 권한표 — 업무(기능)마다 할 수 있는 역할. 사내 표준서 각 절의 '책임과 권한'을 옮긴 것이고,
// 화면과 서버의 권한 검사는 모두 여기 값을 읽는다(설정 › 권한표에 그대로 보인다).
// 역할의 범위를 바꾸려면 표준서를 개정(F-Q-05)한 뒤 이 표를 고친다.
import type { Role } from "./roles";

type Perm = { area: string; label: string; std: string; roles: Role[]; note?: string };

export const PERMS = {
  "customer.write": { area: "고객·상담", label: "고객·차량 등록·수정", std: "STD-01", roles: ["owner", "plant_manager", "advisor"] },
  "consult.write": { area: "고객·상담", label: "상담·예약 쓰기", std: "STD-01", roles: ["owner", "plant_manager", "advisor"] },
  "repair.write": { area: "수리", label: "접수·입고, 수리 건 수정", std: "STD-02", roles: ["owner", "plant_manager", "advisor"] },
  "diag.write": { area: "수리", label: "손상 진단 기록", std: "STD-02", roles: ["technician", "plant_manager", "owner"] },
  "diag.confirm": { area: "수리", label: "진단 확인·다시 열기", std: "STD-02", roles: ["plant_manager", "owner"] },
  "estimate.write": { area: "수리", label: "견적 쓰기·고객 승인 받기", std: "STD-03", roles: ["advisor", "plant_manager", "owner"] },
  "estimate.review": { area: "수리", label: "견적 내부 검토", std: "부록 B", roles: ["plant_manager", "owner"], note: "금액에 따라 전결 규정이 정함(200만 원 이하 공장장, 넘으면 대표)" },
  "work.assign": { area: "작업", label: "작업 지시·배정", std: "STD-04", roles: ["plant_manager", "owner"] },
  "work.do": { area: "작업", label: "공정 시작·끝, 자주 검사", std: "STD-04", roles: ["technician", "plant_manager"], note: "배정받은 공정만. 역량 단계가 기준 미만이면 지도자 필요" },
  "inspect.do": { area: "작업", label: "최종 검사", std: "STD-05", roles: ["quality", "plant_manager", "owner"], note: "그 차를 작업한 사람은 못 함. 검사 역량 3단계 이상" },
  "delivery.do": { area: "작업", label: "출고·정비명세서 발급", std: "STD-05", roles: ["advisor", "plant_manager", "owner"] },
  "claim.desk": { area: "보험", label: "보험 접수·손해사정 요청·청구", std: "STD-03 6절", roles: ["advisor", "plant_manager", "owner"] },
  "claim.money": { area: "보험", label: "보험금 입금 확인·독촉", std: "STD-12", roles: ["accounting", "owner"] },
  "staff.roster": { area: "인사", label: "직원 등록·근로자 명부 보기·쓰기", std: "STD-11", roles: ["owner", "accounting"], note: "본인은 자기 명부만 봄" },
  "contract.approve": { area: "인사", label: "근로계약서 확인(직인)", std: "STD-11·F-11-01", roles: ["owner"], note: "회계 담당이 쓴 계약서는 대표가 확인해야 직원이 서명할 수 있음" },
  "staff.assess": { area: "인사", label: "역량 평가", std: "STD-11 6절", roles: ["owner", "plant_manager"] },
  "staff.confirm": { area: "인사", label: "역량 평가 확인", std: "STD-11 6절", roles: ["owner"] },
  "leave.approve": { area: "인사", label: "근태·휴가·연장근로 승인", std: "부록 B", roles: ["plant_manager", "owner"], note: "공장장 본인 건은 대표" },
  "leave.team": { area: "인사", label: "직원 근태 전체 보기", std: "STD-11 4절", roles: ["owner", "plant_manager", "accounting"] },
  "cert.all": { area: "인사", label: "재직증명서 전체 보기·인쇄", std: "STD-11", roles: ["owner", "accounting"], note: "본인은 자기 것" },
  "cert.approve": { area: "인사", label: "재직증명서 발급 승인(직인)", std: "STD-11", roles: ["owner"] },
  "equip.manage": { area: "설비", label: "설비 대장·윤활 개소·예방정비 계획 쓰기, 고장 확인(사용 재개)", std: "STD-08", roles: ["plant_manager", "owner"] },
  "equip.check": { area: "설비", label: "설비 점검·윤활·운전 일지·고장 신고·예방정비 실적", std: "STD-08", roles: ["technician", "plant_manager", "owner", "safety", "quality"] },
  "equip.calibrate": { area: "설비", label: "측정 장비 교정 기록", std: "STD-08 6절", roles: ["quality", "plant_manager", "owner"] },
  "pm.approve": { area: "설비", label: "예방정비 계획 승인", std: "STD-08 9절", roles: ["owner"] },
  "nc.handle": { area: "품질", label: "부적합 원인 분석·시정 조치 지정·효과 확인·종결", std: "STD-Q Q.9", roles: ["quality", "plant_manager", "owner"], note: "부적합 발행은 누구나. 조치 담당은 자기 조치를 적음" },
  "nc.approve": { area: "품질", label: "중대 부적합 종결 승인", std: "F-Q-10", roles: ["owner"] },
  "five_s.audit": { area: "설비", label: "3정5S 구역 담당 지정·월간 평가", std: "STD-08 11·14절", roles: ["plant_manager", "owner"], note: "일일 점검은 구역 담당(대행자)이 함" },
  "complaint.contact": { area: "고객·상담", label: "불만 접수 안내·고객 동의·만족 확인·종결", std: "STD-06 5절", roles: ["advisor", "plant_manager", "owner"], note: "불만 접수는 누구나" },
  "complaint.judge": { area: "품질", label: "불만 현물 확인·보증 판정", std: "STD-06 5.3~5.4", roles: ["quality", "plant_manager", "owner"] },
  "complaint.compensate": { area: "품질", label: "불만 보상·환불 승인", std: "STD-06 5.7·부록 B", roles: ["owner"] },
  "task.issue": { area: "업무지시", label: "업무지시 내리기", std: "사용자 지시 2026-11-09", roles: ["owner", "plant_manager"], note: "기본값. 대표가 이 화면 아래 '업무지시 권한'에서 역할을 더하거나 뺌. 받은 지시를 아래로 전달하는 것은 누구나" },
  "account.manage": { area: "설정", label: "계정·역할·비밀번호·잠금", std: "설계 9.1", roles: ["owner"] },
  "settings.edit": { area: "설정", label: "정비소 정보·영업일·정책값·전결·공임표·연동 설정", std: "부록 B·D", roles: ["owner"] },
} satisfies Record<string, Perm>;

export type PermKey = keyof typeof PERMS;
export const PERM_KEYS = Object.keys(PERMS) as PermKey[];
export const rolesFor = (k: PermKey): Role[] => PERMS[k].roles;
export const can = (a: { roles: readonly Role[] }, k: PermKey) => a.roles.some((r) => (PERMS[k].roles as Role[]).includes(r));
