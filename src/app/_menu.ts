// 메뉴 구조 — 사내 표준서 장 순서(STD-01~13·Q)와 앱 설계서 5.1 모듈을 따른다.
// href 가 있는 것은 지금 열리는 화면, 없는 것은 개발 예정(단계 표시). 화면이 생기면 href 를 채운다.
// roles 를 주면 그 역할에만 보인다(없으면 모두).
import type { Role } from "@/modules/auth/roles";

export type MenuItem = { label: string; href?: string; phase?: "1차" | "2차" | "3차"; std?: string; roles?: Role[] };
export type MenuGroup = { id: string; label: string; items: MenuItem[] };

/** 메뉴 맨 위에 따로 두는 화면(묶음 밖) */
export const TOP: MenuItem[] = [{ label: "대시보드", href: "/home" }];

export const MENU: MenuGroup[] = [
  {
    id: "my",
    label: "내 업무",
    items: [
      { label: "내 할 일", href: "/todo" },
      { label: "결재", href: "/approvals" },
      { label: "알림", href: "/notifications" },
    ],
  },
  {
    id: "repair",
    label: "수리 업무",
    items: [
      { label: "상담·예약", href: "/consults", std: "STD-01" },
      { label: "접수·입고", href: "/repairs", std: "STD-02" },
      { label: "견적·고객 승인", href: "/estimates", std: "STD-03" },
      { label: "작업·공정", href: "/work", std: "STD-04" },
      { label: "검사·출고", href: "/repairs?f=qc", std: "STD-05" },
      { label: "보험 청구", href: "/claims", std: "STD-03.6" },
    ],
  },
  {
    id: "customer",
    label: "고객",
    items: [
      { label: "고객·차량", href: "/customers", std: "STD-13" },
      { label: "보증 수리", phase: "2차", std: "STD-06.2" },
      { label: "만족도·불만", phase: "2차", std: "STD-06" },
    ],
  },
  {
    id: "messages",
    label: "문자관리",
    items: [
      { label: "문자 발송", phase: "1차", std: "STD-01" },
      { label: "발송 이력", href: "/messages/log" },
      { label: "문구 서식", phase: "1차" },
      { label: "기프티콘 발송", phase: "2차", std: "STD-06", roles: ["owner", "plant_manager", "advisor"] },
      { label: "기프티콘 이력", phase: "2차", roles: ["owner", "plant_manager", "advisor", "accounting"] },
    ],
  },
  {
    id: "facility",
    label: "설비·현장(TPM)",
    items: [
      { label: "설비 대장", phase: "1차", std: "STD-08.1" },
      { label: "일상 점검", phase: "1차", std: "STD-08.2" },
      { label: "윤활", phase: "1차", std: "STD-08.4" },
      { label: "3정5S 점검", phase: "1차", std: "STD-08.8~11" },
      { label: "예방정비·운전 일지", phase: "2차", std: "STD-08.5~6" },
      { label: "측정 장비 교정", phase: "2차", std: "STD-08.3" },
      { label: "치공구", phase: "2차", std: "STD-08.7" },
      { label: "개선 제안", phase: "2차", std: "STD-08.12" },
    ],
  },
  {
    id: "quality",
    label: "품질",
    items: [
      { label: "부적합·시정 조치", phase: "1차", std: "STD-Q.9" },
      { label: "문서 개정 요청", href: "/approvals/new", std: "STD-Q.5" },
      { label: "법규 대장", phase: "2차", std: "STD-Q.6" },
      { label: "리스크·내부 심사", phase: "3차", std: "STD-Q" },
    ],
  },
  {
    id: "purchase",
    label: "구매·자재",
    items: [
      { label: "협력업체", phase: "2차", std: "STD-07.1" },
      { label: "발주·외주", phase: "2차", std: "STD-07" },
      { label: "비품·자산", phase: "2차", std: "STD-07.5" },
    ],
  },
  {
    id: "safety",
    label: "안전·환경",
    items: [
      { label: "안전 점검", phase: "2차", std: "STD-09" },
      { label: "환경 관리", phase: "2차", std: "STD-10" },
    ],
  },
  {
    id: "people",
    label: "인사·급여",
    items: [
      { label: "직원 명부·역량표", phase: "1차", std: "STD-11.2" },
      { label: "근태·휴가", phase: "3차", std: "STD-11.4" },
      { label: "급여", phase: "3차", std: "STD-11.5", roles: ["owner", "accounting"] },
    ],
  },
  {
    id: "account",
    label: "회계",
    items: [
      { label: "청구·수납", phase: "3차", std: "STD-12" },
      { label: "지출", phase: "3차", std: "STD-12" },
    ],
  },
  {
    id: "settings",
    label: "설정",
    items: [
      { label: "사업장 정보", href: "/settings/shop" },
      { label: "공임 기준표", href: "/settings/labor", std: "F-03-01" },
      { label: "정책값", href: "/settings/policies", std: "부록 D" },
      { label: "전결 규정", href: "/settings/delegation", std: "부록 B" },
      { label: "직원·역할", href: "/settings/users" },
      { label: "문자 발송 서비스", href: "/settings/messaging" },
      { label: "카카오 알림톡", href: "/settings/kakao" },
      { label: "기프티콘 공급사", href: "/settings/gift" },
      { label: "영업일·휴무일", href: "/settings/calendar" },
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
