// 메뉴 구조 — 사내 표준서 장 순서(STD-01~13·Q)와 앱 설계서 5.1 모듈을 따른다.
// href 가 있는 것은 지금 열리는 화면, 없는 것은 개발 예정(단계 표시). 화면이 생기면 href 를 채운다.
// roles 를 주면 그 역할에만, perm 을 주면 그 권한(권한표) 가운데 하나라도 있는 사람에게만 보인다(사용자 지시 2026-11-09 "권한 없는 메뉴는 숨겨라").
import type { PermKey } from "@/modules/auth/permissions";
import type { Role } from "@/modules/auth/roles";

export type MenuItem = {
  label: string;
  href?: string;
  phase?: "1차" | "2차" | "3차";
  std?: string;
  roles?: Role[];
  perm?: PermKey[];
};
export type MenuGroup = { id: string; label: string; items: MenuItem[] };

/** 메뉴 맨 위에 따로 두는 화면(묶음 밖) */
export const TOP: MenuItem[] = [
  { label: "대시보드", href: "/home" },
  { label: "통계·보고서", href: "/reports", perm: ["report.view"] },
];

export const MENU: MenuGroup[] = [
  {
    id: "my",
    label: "내 업무",
    items: [
      { label: "내 할 일", href: "/todo" },
      { label: "일정표", href: "/schedule" },
      { label: "업무지시", href: "/tasks" },
      { label: "업무일지", href: "/journal" },
      { label: "결재", href: "/approvals" },
      { label: "알림", href: "/notifications" },
    ],
  },
  {
    id: "repair",
    label: "수리 업무",
    items: [
      {
        label: "상담·예약",
        perm: ["consult.write"],
        href: "/consults",
        std: "STD-01",
      },
      {
        label: "접수·입고",
        perm: ["repair.write", "diag.write", "diag.confirm"],
        href: "/repairs",
        std: "STD-02",
      },
      {
        label: "견적·고객 승인",
        perm: ["estimate.write", "estimate.review"],
        href: "/estimates",
        std: "STD-03",
      },
      {
        label: "작업·공정",
        perm: ["work.assign", "work.do"],
        href: "/work",
        std: "STD-04",
      },
      {
        label: "검사·출고",
        perm: ["inspect.do", "delivery.do"],
        href: "/repairs?f=qc",
        std: "STD-05",
      },
      {
        label: "보험 청구",
        perm: ["claim.desk", "claim.money"],
        href: "/claims",
        std: "STD-03.6",
      },
    ],
  },
  {
    id: "customer",
    label: "고객",
    items: [
      {
        label: "고객·차량",
        perm: ["customer.write"],
        href: "/customers",
        std: "STD-13",
      },
      {
        label: "보증 수리",
        perm: ["complaint.contact", "complaint.judge", "work.assign"],
        href: "/complaints?f=warranty",
        std: "STD-06.4",
      },
      { label: "만족도·불만", href: "/complaints", std: "STD-06" },
    ],
  },
  {
    id: "messages",
    label: "문자관리",
    items: [
      {
        label: "문자 발송",
        perm: ["consult.write"],
        href: "/messages/send",
        std: "STD-01",
      },
      { label: "발송 이력", perm: ["consult.write"], href: "/messages/log" },
      {
        label: "문구 서식",
        perm: ["consult.write"],
        href: "/messages/templates",
      },
      {
        label: "기프티콘 발송",
        perm: ["gift.send"],
        href: "/gifts/send",
        std: "STD-06",
      },
      { label: "기프티콘 이력", perm: ["gift.view"], href: "/gifts" },
    ],
  },
  {
    id: "facility",
    label: "설비·현장(TPM)",
    items: [
      {
        label: "설비 대장",
        perm: ["equip.check"],
        href: "/equipment",
        std: "STD-08.1",
      },
      {
        label: "일상 점검",
        perm: ["equip.check"],
        href: "/equipment/checks",
        std: "STD-08.2",
      },
      {
        label: "윤활",
        perm: ["equip.check"],
        href: "/equipment/lube",
        std: "STD-08.4",
      },
      {
        label: "예방정비",
        perm: ["equip.check"],
        href: "/equipment/pm",
        std: "STD-08.6",
      },
      {
        label: "측정 장비 교정",
        perm: ["equip.calibrate"],
        href: "/equipment?f=gauge",
        std: "STD-08.3",
      },
      { label: "3정5S 점검", href: "/five-s", std: "STD-08.8~11" },
      {
        label: "치공구",
        perm: ["equip.check"],
        href: "/tools",
        std: "STD-08.7",
      },
      { label: "개선 제안", href: "/suggestions", std: "STD-08.12" },
    ],
  },
  {
    id: "quality",
    label: "품질",
    items: [
      {
        label: "품질목표",
        perm: ["qms.goal_view"],
        href: "/qms/goals",
        std: "STD-Q.3",
      },
      { label: "부적합·시정 조치", href: "/nc", std: "STD-Q.9" },
      { label: "문서 목록", href: "/qms/docs", std: "STD-Q.5" },
      { label: "문서 개정 요청", href: "/approvals/new", std: "STD-Q.5" },
      {
        label: "법규 대장",
        perm: ["legal.manage", "legal.confirm"],
        href: "/legal",
        std: "STD-Q.6",
      },
      { label: "리스크·기회", href: "/risks", std: "STD-Q.4" },
      {
        label: "내부 심사",
        perm: ["audit.manage", "audit.approve"],
        href: "/audits",
        std: "STD-Q.7",
      },
      {
        label: "조직 상황 검토",
        perm: ["qms.context", "qms.docs"],
        href: "/qms/context",
        std: "STD-Q.1",
      },
      {
        label: "경영검토",
        perm: ["qms.review", "qms.docs"],
        href: "/qms/review",
        std: "STD-Q.8",
      },
    ],
  },
  {
    id: "purchase",
    label: "구매·자재",
    items: [
      {
        label: "협력업체",
        perm: ["supplier.manage", "supplier.approve", "supplier.bank"],
        href: "/suppliers",
        std: "STD-07.4",
      },
      {
        label: "발주·입고",
        perm: ["purchase.order", "purchase.receive", "purchase.invoice"],
        href: "/purchases",
        std: "STD-07.5~6",
      },
      {
        label: "재고",
        perm: ["stock.use", "stock.manage"],
        href: "/stock",
        std: "STD-07.7",
      },
      {
        label: "외주",
        perm: ["purchase.order", "outsource.notice"],
        href: "/outsource",
        std: "STD-07.8",
      },
      { label: "비품·자산", href: "/fixtures", std: "STD-07.9" },
      { label: "설비 라벨", perm: ["equip.manage"], href: "/equipment/labels", std: "STD-08.1" },
    ],
  },
  {
    id: "safety",
    label: "안전·환경",
    items: [
      { label: "사고·아차사고", href: "/incidents", std: "STD-09.6" },
      { label: "화학물질·MSDS", href: "/chemicals", std: "STD-09.2" },
      { label: "위험성평가", href: "/hazards", std: "STD-09.1" },
      { label: "환경 관리", href: "/environment", std: "STD-10" },
    ],
  },
  {
    id: "people",
    label: "인사·급여",
    items: [
      {
        label: "직원 명부·역량표",
        perm: ["staff.roster", "staff.assess"],
        href: "/staff",
        std: "STD-11.2",
      },
      { label: "계약서·서약서", href: "/staff/docs", std: "F-11-01·F-13-02" },
      { label: "취업규칙", href: "/rules", std: "STD-11" },
      { label: "출퇴근·근태", href: "/attendance", std: "STD-11.4" },
      { label: "교육 훈련", href: "/training", std: "STD-11.2" },
      { label: "사내 교재", href: "/training/manuals", std: "STD-11.2" },
      { label: "인사평가", href: "/reviews", std: "STD-11.6" },
      {
        label: "퇴직 처리",
        perm: ["staff.roster", "staff.assess"],
        href: "/staff/exit",
        std: "STD-11.7",
      },
      { label: "재직증명서", href: "/certificates", std: "STD-11" },
      {
        label: "급여대장",
        perm: ["payroll.view"],
        href: "/payroll",
        std: "STD-11.5",
      },
      { label: "내 임금명세서", href: "/payroll/me", std: "STD-11.5" },
    ],
  },
  {
    id: "account",
    label: "회계",
    items: [
      {
        label: "청구·수납",
        perm: ["money.view"],
        href: "/money",
        std: "STD-12",
      },
      {
        label: "지출 결의",
        perm: ["expense.draft", "expense.pay"],
        href: "/money/expenses",
        std: "STD-12",
      },
      {
        label: "외상매입금·미지급금",
        perm: ["expense.draft", "expense.pay"],
        href: "/money/payables",
        std: "STD-12",
      },
      {
        label: "감가상각 대장",
        perm: ["expense.pay", "fixture.manage"],
        href: "/money/depreciation",
        std: "STD-12",
      },
      {
        label: "마감",
        perm: ["money.close_day", "money.close_month"],
        href: "/money/close",
        std: "STD-12",
      },
    ],
  },
  {
    id: "settings",
    label: "설정",
    items: [
      { label: "사업장 정보", perm: ["settings.edit"], href: "/settings/shop" },
      {
        label: "공임 기준표",
        perm: ["settings.edit"],
        href: "/settings/labor",
        std: "F-03-01",
      },
      {
        label: "정책값",
        perm: ["settings.edit"],
        href: "/settings/policies",
        std: "부록 D",
      },
      {
        label: "전결 규정",
        perm: ["settings.edit"],
        href: "/settings/delegation",
        std: "부록 B",
      },
      { label: "로그인 계정", perm: ["account.manage"], href: "/settings/users" },
      {
        label: "권한표",
        perm: ["settings.edit"],
        href: "/settings/permissions",
      },
      {
        label: "문자 발송 서비스",
        perm: ["settings.edit"],
        href: "/settings/messaging",
      },
      {
        label: "카카오 알림톡",
        perm: ["settings.edit"],
        href: "/settings/kakao",
      },
      {
        label: "기프티콘 공급사",
        perm: ["settings.edit"],
        href: "/settings/gift",
      },
      {
        label: "영업일·휴무일",
        perm: ["settings.edit"],
        href: "/settings/calendar",
      },
      {
        label: "출퇴근 장소(와이파이)",
        roles: ["owner"],
        href: "/settings/punch",
      },
    ],
  },
  {
    id: "me",
    label: "도움말·내 정보",
    items: [
      { label: "도움말 센터", href: "/help" },
      { label: "내 계정·비밀번호", href: "/account" },
    ],
  },
];
