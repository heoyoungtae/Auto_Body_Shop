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
  /** 이 메뉴 앞에 작은 소제목을 붙인다(긴 묶음 나누기, 대표 결정 2026-11-23) */
  section?: string;
  /** 다른 묶음에 원래 자리가 있고, 업무 흐름 때문에 여기에도 보여 주는 바로가기. 메뉴 찾기·묶음 펼침은 원래 자리를 따른다 */
  also?: true;
};
export type MenuGroup = { id: string; label: string; items: MenuItem[] };

/** 메뉴 맨 위에 따로 두는 화면(묶음 밖). TV 현황판은 TV에 한 번 띄우면 되는 화면이라 설정 묶음으로, 표준서·기록 보관함은 '표준서·문서' 묶음으로 옮김(대표 결정 2026-11-23) */
export const TOP: MenuItem[] = [
  { label: "대시보드", href: "/home" },
  { label: "내 할 일", href: "/todo" },
  { label: "통계·보고서", href: "/reports", perm: ["report.mgmt", "report.acct", "report.quality", "report.stock", "report.people", "report.safety"] },
];

export const MENU: MenuGroup[] = [
  {
    id: "my",
    label: "내 업무",
    items: [
      { label: "일정표", href: "/schedule" },
      { label: "업무지시", href: "/tasks" },
      { label: "업무일지", href: "/journal" },
      { label: "결재", href: "/approvals" },
      { label: "알림", href: "/notifications" },
      // 직원 누구나 보는 것이라 인사·급여에서 옮김(대표 결정 2026-11-23)
      { label: "내 임금명세서", href: "/payroll/me", std: "STD-11.5" },
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
      // 홈페이지로 들어온 견적 요청도 상담의 시작이라 여기에도 보인다(원래 자리는 홈페이지 묶음)
      { label: "견적 요청함", perm: ["consult.write"], href: "/consults?f=online", std: "STD-01", also: true },
      {
        label: "업체 주문 앱(테크베이)",
        perm: ["portal.order"],
        href: "/portal-orders",
        std: "STD-01",
      },
      {
        label: "입고·진단",
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
      // 출고 다음은 돈 받기. 원래 자리는 회계 › 청구·수납(대표 결정 2026-11-23)
      { label: "수납", perm: ["money.view"], href: "/money", std: "STD-12", also: true },
      {
        label: "보험 청구",
        perm: ["claim.desk", "claim.money"],
        href: "/claims",
        std: "STD-03.6",
      },
      { label: "AOS 지급 엑셀 맞추기", perm: ["claim.money"], href: "/claims/aos-paid" },
    ],
  },
  {
    id: "customer",
    // 출고 뒤 손님 일(문자·기프티콘·만족도·보증)을 한 묶음으로(대표 결정 2026-11-23, 문자관리 묶음과 합침)
    label: "고객 관리",
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
      {
        section: "문자·선물",
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
  // 공개 홈페이지(jmotors.co.kr) 글·요청 — 처음엔 '수리 업무'에 두 줄로 끼어 있었으나 수리 공정이 아니라서
  // 따로 묶음으로 뺐다(사용자 지적 2026-11-22 "홈페이지 글이 왜 수리업무에 있는가"). 홈페이지 꾸미기(대표)는 설정 › 홈페이지.
  {
    id: "site",
    label: "홈페이지",
    items: [
      {
        label: "견적 요청함",
        perm: ["consult.write"],
        href: "/consults?f=online",
        std: "STD-01",
      },
      { label: "자주 묻는 질문", perm: ["consult.write"], href: "/homepage/faq", std: "STD-01" },
      { label: "공지사항", perm: ["consult.write"], href: "/homepage/notice", std: "STD-13" },
      { label: "작업 사례", perm: ["consult.write"], href: "/homepage/cases", std: "STD-13" },
      { label: "기술자료", perm: ["consult.write"], href: "/homepage/articles", std: "STD-13" },
      { label: "후기·사진·인증", perm: ["consult.write"], href: "/homepage/trust", std: "STD-13" },
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
      { label: "설비 라벨", perm: ["equip.manage"], href: "/equipment/labels", std: "STD-08.1" },
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
    // 흩어져 있던 표준서·문서 화면을 한 묶음으로(대표 결정 2026-11-23)
    id: "docs",
    label: "표준서·문서",
    items: [
      { label: "사내 표준서", href: "/std", std: "STD-00" },
      { label: "기록 보관함", href: "/records", std: "STD-Q.5" },
      { label: "문서 목록", href: "/qms/docs", std: "STD-Q.5" },
      {
        label: "문서 수발신·공문",
        perm: ["corr.write"],
        href: "/corr",
        std: "STD-Q.5",
      },
      { label: "문서 개정 요청", href: "/approvals/new", std: "STD-Q.5" },
      {
        label: "법규 대장",
        perm: ["legal.manage", "legal.confirm"],
        href: "/legal",
        std: "STD-Q.6",
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
      { label: "직무기술서", href: "/jobs", std: "F-11-08" },
      {
        label: "신입 오리엔테이션",
        perm: ["staff.roster", "staff.assess"],
        href: "/staff/onboarding",
        std: "F-11-09",
      },
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
    ],
  },
  {
    id: "account",
    label: "회계",
    items: [
      {
        section: "받을 돈",
        label: "입출금",
        perm: ["money.view", "expense.draft", "expense.pay", "bank.view"],
        href: "/money/cash",
        std: "STD-12",
      },
      {
        label: "청구·수납",
        perm: ["money.view"],
        href: "/money",
        std: "STD-12",
      },
      {
        label: "업체 외상(외상매출금)",
        perm: ["money.view"],
        href: "/money/accounts",
        std: "STD-12",
      },
      {
        section: "낼 돈",
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
        section: "장부·마감",
        label: "감가상각 대장",
        perm: ["expense.pay", "fixture.manage"],
        href: "/money/depreciation",
        std: "STD-12",
      },
      {
        label: "통장·카드 내역",
        perm: ["bank.view"],
        href: "/money/bank",
        std: "STD-12",
      },
      {
        label: "회계 장부(기초 잔액·자금 전표)",
        perm: ["money.close_month"],
        href: "/money/books",
        std: "STD-12",
      },
      {
        label: "연간 예산",
        perm: ["money.close_month"],
        href: "/money/budget",
        std: "STD-12",
      },
      {
        label: "마감",
        perm: ["money.close_day", "money.close_month"],
        href: "/money/close",
        std: "STD-12",
      },
      {
        label: "세금·절세",
        perm: ["payroll.view"],
        href: "/money/tax",
        std: "STD-12",
      },
    ],
  },
  {
    // 20개를 소제목 4개로 나눔(대표 결정 2026-11-23)
    id: "settings",
    label: "설정",
    items: [
      { section: "우리 공업사", label: "사업장 정보", perm: ["settings.edit"], href: "/settings/shop" },
      { label: "본점·지점", href: "/settings/branches" },
      { label: "작업장", href: "/settings/workplaces" },
      { label: "영업일·휴무일", perm: ["settings.edit"], href: "/settings/calendar" },
      { label: "로고·앱 아이콘", href: "/settings/brand" },
      { section: "업무 기준", label: "공임 기준표", perm: ["settings.edit"], href: "/settings/labor", std: "F-03-01" },
      { label: "정책값", perm: ["settings.edit"], href: "/settings/policies", std: "부록 D" },
      { label: "전결 규정", perm: ["settings.edit"], href: "/settings/delegation", std: "부록 B" },
      { label: "권한표", perm: ["settings.edit"], href: "/settings/permissions" },
      { label: "로그인 계정", perm: ["account.manage"], href: "/settings/users" },
      { label: "차 부위·세부 부위", perm: ["diag.confirm"], href: "/settings/body-parts" },
      { label: "보험사·AOS", perm: ["claim.desk", "settings.edit"], href: "/settings/insurers" },
      { section: "바깥 연결", label: "문자 발송 서비스", perm: ["settings.edit"], href: "/settings/messaging" },
      { label: "카카오 알림톡", perm: ["settings.edit"], href: "/settings/kakao" },
      { label: "기프티콘 공급사", perm: ["settings.edit"], href: "/settings/gift" },
      { label: "출퇴근 장소(와이파이)", roles: ["owner"], href: "/settings/punch" },
      { label: "TV 현황판 연결", href: "/settings/tv" },
      // TV에 띄우는 화면. 맨 위에서 옮김(대표 결정 2026-11-23)
      { label: "TV 현황판", href: "/tv" },
      { label: "TV 현황판(테크베이)", href: "/tv/techbay" },
      { section: "홈페이지·서버", label: "홈페이지 꾸미기", roles: ["owner"], href: "/settings/site" },
      { label: "내 차 수첩(고객용)", roles: ["owner"], href: "/settings/carbook" },
      { label: "서버·새 버전 올리기", roles: ["owner"], href: "/settings/server" },
      { label: "도메인(앱 주소)", roles: ["owner"], href: "/settings/domain" },
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
