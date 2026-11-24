// 정책값 — 사내 표준서 부록 D. 숫자 규칙은 코드에 박지 않고 이 키로만 읽는다(앱 설계서 8.4).
// 기본값은 표준서의 제안값이다. 대표가 설정 화면에서 바꾸면 policy_setting 에 이력이 쌓이고, 최신 시행분이 이긴다.
import { UserError } from "@/modules/platform/errors";
import { desc, eq, gt, lte } from "drizzle-orm";
import type { Db } from "@/db/client";
import { appUser, policySetting } from "@/db/schema";
import { writeAudit } from "./audit";
import { seoulDate } from "./time";

type Def = {
  value: number;
  unit: string;
  label: string;
  clause: string;
  min?: number;
  max?: number;
};

export const DEFAULT_POLICY = {
  "consult.reply_business_days": {
    value: 1,
    unit: "영업일",
    label: "상담 회신 기한",
    clause: "1.1",
  },
  "consult.follow_up_days": {
    value: 3,
    unit: "일 뒤",
    label: "미예약 상담 재연락",
    clause: "1.1",
  },
  "intake.daily_capacity": {
    value: 0,
    unit: "대(0=미정)",
    label: "일별 입고 한도",
    clause: "1.2",
  },
  "intake.min_photos": {
    value: 8,
    unit: "장",
    label: "입고 사진 최소(8방향)",
    clause: "2.1",
  },
  "intake.sign_skip": {
    value: 1,
    unit: "(1=생략, 0=서명 받음)",
    label: "입고 고객 서명 생략",
    clause: "2.1",
    min: 0,
    max: 1,
  },
  // 간소화(설정 › 간소화, 대표 2026-11-24 '진행하라'): 1=켬(간편), 0=끔(표준대로 전부 기록). 처음 값은 간편 모드
  "simple.work_order_auto": { value: 1, unit: "(1=켬, 0=끔)", label: "간소화: 고객 승인 때 작업 지시서 자동", clause: "4.1", min: 0, max: 1 },
  "simple.step_groups": { value: 1, unit: "(1=켬, 0=끔)", label: "간소화: 공정 3묶음·시작 단추 없음", clause: "4.1", min: 0, max: 1 },
  "simple.photo_per_group": { value: 1, unit: "(1=켬, 0=끔)", label: "간소화: 공정 사진 묶음당 1장", clause: "4.1", min: 0, max: 1 },
  "simple.check_all": { value: 1, unit: "(1=켬, 0=끔)", label: "간소화: '모두 이상 없음' 한 번에 체크", clause: "4.1", min: 0, max: 1 },
  "simple.photo_bulk": { value: 1, unit: "(1=켬, 0=끔)", label: "간소화: 입고 사진 한 번에 올리기", clause: "2.1", min: 0, max: 1 },
  "simple.statement_deliver": { value: 1, unit: "(1=켬, 0=끔)", label: "간소화: 정비명세서 발급·인도 한 화면", clause: "8절", min: 0, max: 1 },
  "simple.intake_agree_one": { value: 1, unit: "(1=켬, 0=끔)", label: "간소화: 입고 확인·이동 동의 한 체크", clause: "2.1", min: 0, max: 1 },
  "simple.estimate_send": { value: 1, unit: "(1=켬, 0=끔)", label: "간소화: 견적 발급 때 고객 링크 바로 보내기", clause: "3.2", min: 0, max: 1 },
  "simple.diag_auto": { value: 1, unit: "(1=켬, 0=끔)", label: "간소화: 진단 확인하면 견적까지 바로", clause: "2.2", min: 0, max: 1 },
  "simple.journal_quiet": { value: 1, unit: "(1=켬, 0=끔)", label: "간소화: 특이사항 없는 업무일지 확인 생략", clause: "11", min: 0, max: 1 },
  "simple.notice_digest": { value: 1, unit: "(1=켬, 0=끔)", label: "간소화: 급하지 않은 알림 하루 2번 묶기", clause: "-", min: 0, max: 1 },
  "simple.qc_quick": { value: 1, unit: "(1=켬, 0=끔)", label: "간소화: 최종 검사 '전부 합격'·도막 측정 생략", clause: "5절", min: 0, max: 1 },
  "simple.deliver_sign_skip": { value: 1, unit: "(1=켬, 0=끔)", label: "간소화: 출고 인수 서명 생략", clause: "8.4", min: 0, max: 1 },
  "simple.deliver_payment": { value: 1, unit: "(1=켬, 0=끔)", label: "간소화: 출고 때 입금 전표 자동", clause: "12.1", min: 0, max: 1 },
  "simple.self_approve": { value: 1, unit: "(1=켬, 0=끔)", label: "간소화: 결재권자 본인 건 바로 승인", clause: "0장 5절", min: 0, max: 1 },
  "simple.push_first": { value: 1, unit: "(1=켬, 0=끔)", label: "간소화: 손님 안내는 앱 푸시 먼저", clause: "-", min: 0, max: 1 },
  "simple.reminder_skip": { value: 1, unit: "(1=켬, 0=끔)", label: "간소화: 예약 확인 직후 전날 안내 생략", clause: "1.2", min: 0, max: 1 },
  "simple.booth_log_auto": { value: 1, unit: "(1=켬, 0=끔)", label: "간소화: 부스 운전 일지 자동 채움", clause: "5절", min: 0, max: 1 },
  "simple.punch_close": { value: 1, unit: "(1=켬, 0=끔)", label: "간소화: 퇴근 때 업무일지 마감", clause: "7.1", min: 0, max: 1 },
  "simple.five_s_weekly": { value: 1, unit: "(1=켬, 0=끔)", label: "간소화: 3정5S 점검 주 1회", clause: "14.1", min: 0, max: 1 },
  "simple.day_close_auto": { value: 1, unit: "(1=켬, 0=끔)", label: "간소화: 일일 마감 자동(현금 없는 날)", clause: "12.4", min: 0, max: 1 },
  "simple.estimate_small": { value: 1, unit: "(1=켬, 0=끔)", label: "간소화: 소액 견적 내부 검토 생략", clause: "3절", min: 0, max: 1 },
  "estimate.small_won": { value: 500000, unit: "원 이하", label: "소액 견적(내부 검토 생략) 기준", clause: "부록 B", min: 0, max: 5000000 },
  "estimate.valid_days": {
    value: 30,
    unit: "일",
    label: "견적 유효기간",
    clause: "3.2",
  },
  "estimate.followup_days": {
    value: 1,
    unit: "일 뒤",
    label: "견적 승인 재연락",
    clause: "3.2",
  },
  "estimate.overrun_pct": {
    value: 0,
    unit: "%",
    label: "견적 초과 허용",
    clause: "5.3",
    max: 100,
  },
  "inspect.gap_mm": {
    value: 1,
    unit: "mm 이내",
    label: "최종 검사: 패널 간극 좌우 차",
    clause: "5.5",
  },
  "inspect.film_min_um": {
    value: 100,
    unit: "μm 이상",
    label: "최종 검사: 도막 두께 하한",
    clause: "5.5",
  },
  "inspect.film_max_um": {
    value: 300,
    unit: "μm 이하",
    label: "최종 검사: 도막 두께 상한",
    clause: "5.5",
  },
  "inspect.after_photos": {
    value: 4,
    unit: "장 이상",
    label: "최종 검사: 작업 후 사진",
    clause: "5.5",
  },
  "delivery.no_wash_days": {
    value: 7,
    unit: "일",
    label: "출고 후 세차·왁스 금지 안내",
    clause: "5.8",
  },
  "warranty.paint_months": {
    value: 12,
    unit: "개월",
    label: "보증 기간: 도장·판금",
    clause: "6.1",
  },
  "warranty.decision_business_days": {
    value: 3,
    unit: "영업일",
    label: "보증 판정 기한",
    clause: "6.2",
  },
  "survey.delay_days": {
    value: 7,
    unit: "일 뒤",
    label: "만족도 설문 발송",
    clause: "6.3",
  },
  "survey.complaint_threshold": {
    value: 3,
    unit: "점 이하",
    label: "설문 불만 자동 접수",
    clause: "6.3",
    max: 5,
  },
  "complaint.ack_business_days": {
    value: 1,
    unit: "영업일",
    label: "불만 접수 통지",
    clause: "6.4",
  },
  "complaint.reply_days": {
    value: 7,
    unit: "일",
    label: "불만 회신",
    clause: "6.4",
  },
  "nc.decision_hours": {
    value: 24,
    unit: "시간",
    label: "부적합 처리 결정",
    clause: "Q.9",
  },
  "nc.correction_days": {
    value: 14,
    unit: "일",
    label: "시정 완료",
    clause: "Q.9",
  },
  "nc.effect_check_days": {
    value: 30,
    unit: "일",
    label: "효과 확인",
    clause: "Q.9",
  },
  "risk.owner_alert_score": {
    value: 6,
    unit: "점 이상",
    label: "리스크 대표 알림",
    clause: "Q.4",
  },
  "legal.alert_days_first": {
    value: 30,
    unit: "일 전",
    label: "인허가 갱신 알림(1차)",
    clause: "Q.6",
  },
  "legal.alert_days_second": {
    value: 7,
    unit: "일 전",
    label: "인허가 갱신 알림(2차)",
    clause: "Q.6",
  },
  "legal.review_months": {
    value: 3,
    unit: "개월마다",
    label: "법령 개정 확인",
    clause: "Q.6",
  },
  "waste.designated_days": {
    value: 45,
    unit: "일",
    label: "지정폐기물 보관 기간 한도",
    clause: "10.2",
    min: 1,
    max: 365,
  },
  "waste.alert_days": {
    value: 7,
    unit: "일 전",
    label: "폐기물 보관 한도 알림",
    clause: "10.2",
    min: 1,
    max: 60,
  },
  "env.filter_change_days": {
    value: 30,
    unit: "일",
    label: "도장 부스 필터 교체 주기(차압 초과 시 즉시)",
    clause: "10.1",
    min: 1,
    max: 365,
  },
  "supplier.improve_below": {
    value: 70,
    unit: "점 미만",
    label: "협력업체 개선 요청",
    clause: "7.1",
    max: 100,
  },
  "supplier.stop_below": {
    value: 60,
    unit: "점 미만",
    label: "협력업체 거래 중단",
    clause: "7.1",
    max: 100,
  },
  "insurance.dunning_days": {
    value: 30,
    unit: "일 뒤",
    label: "보험 미수 독촉",
    clause: "12.3",
  },
  "calibration.interval_months": {
    value: 12,
    unit: "개월",
    label: "측정 장비 교정 주기",
    clause: "8.3",
  },
  "lube.alert_days_before": {
    value: 3,
    unit: "일 전",
    label: "윤활 기한 알림",
    clause: "8.4",
  },
  "pm.alert_days_before": {
    value: 7,
    unit: "일 전",
    label: "예방정비 알림",
    clause: "8.6",
  },
  "five_s.nc_threshold": {
    value: 80,
    unit: "점 미만",
    label: "3정5S 부적합 기준",
    clause: "8.11",
    max: 100,
  },
  "five_s.cleanup_minutes": {
    value: 15,
    unit: "분",
    label: "작업 종료 전 청소 시간",
    clause: "8.10",
  },
  "five_s.red_tag_days": {
    value: 30,
    unit: "일",
    label: "불요품(빨간 딱지) 보류",
    clause: "8.10",
  },
  "proposal.reply_days": {
    value: 14,
    unit: "일",
    label: "개선 제안 회신",
    clause: "8.12",
  },
  "stock.count_diff_pct": {
    value: 2,
    unit: "% 초과",
    label: "재고 실사 차이(부적합 등록)",
    clause: "7.3",
    max: 100,
  },
  "stock.track_low": {
    value: 10_000,
    unit: "원",
    label: "재고 관리 방식 추천: 이 단가 미만 소모품은 '관리 안 함'",
    clause: "7.1",
    max: 1_000_000,
  },
  "stock.track_high": {
    value: 50_000,
    unit: "원",
    label: "재고 관리 방식 추천: 이 단가 이상은 '수량 관리'",
    clause: "7.1",
    max: 10_000_000,
  },
  "asset.register_min": {
    value: 500_000,
    unit: "원 이상",
    label: "자산 비품 기준 금액",
    clause: "7.5",
  },
  "asset.immediate_max": {
    value: 1_000_000,
    unit: "원 이하",
    label: "산 날 비용 처리 가능 금액",
    clause: "법인세법 시행령 제31조",
  },
  "asset.fixture_years": {
    value: 5,
    unit: "년",
    label: "비품·공구 내용연수",
    clause: "법인세법 시행규칙 별표5",
    min: 4,
    max: 6,
  },
  "asset.equipment_years": {
    value: 5,
    unit: "년",
    label: "설비(기계장치) 내용연수",
    clause: "법인세법 시행규칙 별표6",
    min: 2,
    max: 20,
  },
  "asset.dep_declining": {
    value: 0,
    unit: "(0 정액·1 정률)",
    label: "기본 상각 방법",
    clause: "법인세법 시행령 제26조",
    min: 0,
    max: 1,
  },
  "asset.contract_alert_days": {
    value: 60,
    unit: "일 전",
    label: "사용계약 만료 알림",
    clause: "대표 지시 2026-11-12",
    min: 7,
    max: 180,
  },
  "payroll.attendance_close_day": {
    value: 3,
    unit: "일(매월)",
    label: "근태 확정일",
    clause: "11.4",
    min: 1,
    max: 28,
  },
  "money.outsource_trade": {
    value: 1,
    unit: "(1=외상매입금, 0=미지급금)",
    label: "외주 가공 대금 계정",
    clause: "12.2",
    min: 0,
    max: 1,
  },
  "money.card_pay_day": {
    value: 14,
    unit: "일(매월, 전달 사용분)",
    label: "사업자 카드 결제일",
    clause: "12.2",
    min: 1,
    max: 28,
  },
  "money.pay_alert_days": {
    value: 3,
    unit: "일 전",
    label: "외상 지급 기한 알림",
    clause: "12.2",
    min: 0,
    max: 30,
  },
  "money.event_client_max": {
    value: 200_000,
    unit: "원(1회)",
    label: "거래처 경조사비 1회 한도",
    clause: "12.2",
    min: 0,
    max: 1_000_000,
  },
  "money.entertain_base": {
    value: 36_000_000,
    unit: "원(연, 중소기업)",
    label: "접대비 기본 한도",
    clause: "12.2",
    min: 0,
    max: 100_000_000,
  },
  "money.entertain_alert_pct": {
    value: 80,
    unit: "%",
    label: "접대비 한도 알림",
    clause: "12.2",
    min: 10,
    max: 100,
  },
  "tax.simple_receipt_max": {
    value: 30_000,
    unit: "원(1건)",
    label: "간이영수증 인정 한도(적격증빙 기준)",
    clause: "12.2",
    min: 0,
    max: 1_000_000,
  },
  "tax.cash_receipt_must": {
    value: 100_000,
    unit: "원 이상(1건)",
    label: "현금영수증 의무 발행 기준",
    clause: "12.1",
    min: 0,
    max: 1_000_000,
  },
  "tax.car_expense_cap": {
    value: 15_000_000,
    unit: "원(연, 1대)",
    label: "업무용 승용차 비용 한도(운행기록부 없을 때)",
    clause: "12.2",
    min: 0,
    max: 100_000_000,
  },
  "tax.car_dep_cap": {
    value: 8_000_000,
    unit: "원(연, 1대)",
    label: "업무용 승용차 감가상각비 한도",
    clause: "12.2",
    min: 0,
    max: 100_000_000,
  },
  "welfare.event_wedding": {
    value: 300_000,
    unit: "원",
    label: "직원 경조금: 본인 결혼",
    clause: "11.5",
    min: 0,
    max: 5_000_000,
  },
  "welfare.event_wedding_child": {
    value: 200_000,
    unit: "원",
    label: "직원 경조금: 자녀 결혼",
    clause: "11.5",
    min: 0,
    max: 5_000_000,
  },
  "welfare.event_birth": {
    value: 100_000,
    unit: "원",
    label: "직원 경조금: 출산·돌",
    clause: "11.5",
    min: 0,
    max: 5_000_000,
  },
  "welfare.event_funeral": {
    value: 300_000,
    unit: "원",
    label: "직원 경조금: 부모·배우자·자녀 상",
    clause: "11.5",
    min: 0,
    max: 5_000_000,
  },
  "welfare.event_funeral_far": {
    value: 100_000,
    unit: "원",
    label: "직원 경조금: 조부모·형제자매 상",
    clause: "11.5",
    min: 0,
    max: 5_000_000,
  },
  "payroll.pay_day": {
    value: 10,
    unit: "일(매월)",
    label: "급여 지급일",
    clause: "11.5",
    min: 1,
    max: 28,
  },
  "wage.minimum_hourly": {
    value: 10_320,
    unit: "원(시간당)",
    label: "최저임금(시급)",
    clause: "11.5",
    min: 1,
  },
  "ins.pension_rate": {
    value: 4750,
    unit: "÷1000 %(4750=4.75%)",
    label: "국민연금 근로자 요율",
    clause: "11.5",
    min: 0,
    max: 20000,
  },
  "ins.health_rate": {
    value: 3595,
    unit: "÷1000 %(3595=3.595%)",
    label: "건강보험 근로자 요율",
    clause: "11.5",
    min: 0,
    max: 20000,
  },
  "ins.ltc_ratio": {
    value: 13140,
    unit: "÷1000 %(건강보험료 대비)",
    label: "장기요양보험료율",
    clause: "11.5",
    min: 0,
    max: 50000,
  },
  "ins.employment_rate": {
    value: 900,
    unit: "÷1000 %(900=0.9%)",
    label: "고용보험 근로자 요율",
    clause: "11.5",
    min: 0,
    max: 5000,
  },
  "ins.pension_cap": {
    value: 6_370_000,
    unit: "원(월)",
    label: "국민연금 기준소득월액 상한",
    clause: "11.5",
    min: 1,
  },
  "ins.pension_floor": {
    value: 400_000,
    unit: "원(월)",
    label: "국민연금 기준소득월액 하한",
    clause: "11.5",
    min: 0,
  },
  "tax.meal_exempt": {
    value: 200_000,
    unit: "원(월)",
    label: "식대 비과세 한도",
    clause: "11.5",
    min: 0,
  },
  "tax.car_exempt": {
    value: 200_000,
    unit: "원(월)",
    label: "자가운전보조금 비과세 한도",
    clause: "11.5",
    min: 0,
  },
  "ins.employment_employer_rate": {
    value: 1150,
    unit: "÷1000 %(1150=1.15%)",
    label: "고용보험 회사 요율",
    clause: "11.5",
    min: 0,
    max: 5000,
  },
  "ins.accident_rate": {
    value: 0,
    unit: "÷1000 %(0=고지서로 따로 봄)",
    label: "산재보험료율",
    clause: "11.5",
    min: 0,
    max: 50000,
  },
  "tax.table_pension_rate": {
    value: 4500,
    unit: "÷1000 %(4500=4.5%)",
    label: "간이세액표 연금보험료 요율",
    clause: "11.5",
    min: 0,
    max: 20000,
  },
  "tax.table_pension_cap": {
    value: 5_900_000,
    unit: "원(월)",
    label: "간이세액표 연금 기준 상한",
    clause: "11.5",
    min: 0,
  },
  "tax.table_pension_floor": {
    value: 370_000,
    unit: "원(월)",
    label: "간이세액표 연금 기준 하한",
    clause: "11.5",
    min: 0,
  },
  "tax.child_one": {
    value: 12_500,
    unit: "원(월)",
    label: "자녀 1명 소득세 공제",
    clause: "11.5",
    min: 0,
  },
  "tax.child_two": {
    value: 29_160,
    unit: "원(월)",
    label: "자녀 2명 소득세 공제",
    clause: "11.5",
    min: 0,
  },
  "tax.child_more": {
    value: 25_000,
    unit: "원(월, 1명당)",
    label: "자녀 3명째부터 더 빼는 금액",
    clause: "11.5",
    min: 0,
  },
  "tax.childcare_exempt": {
    value: 200_000,
    unit: "원(월)",
    label: "보육수당 비과세 한도",
    clause: "11.5",
    min: 0,
  },
  "tax.ot_exempt_pay_cap": {
    value: 2_600_000,
    unit: "원(월정액급여)",
    label: "생산직 연장수당 비과세 월급 기준",
    clause: "11.5",
    min: 0,
  },
  "tax.ot_exempt_annual": {
    value: 2_400_000,
    unit: "원(연)",
    label: "생산직 연장수당 비과세 연 한도",
    clause: "11.5",
    min: 0,
  },
  "ins.durunuri_pay_cap": {
    value: 2_700_000,
    unit: "원(월 보수, 미만)",
    label: "두루누리 지원 월 보수 기준",
    clause: "11.5",
    min: 0,
  },
  "work.weekly_hours_warn": {
    value: 48,
    unit: "시간",
    label: "주간 근로시간 경고",
    clause: "11.4",
  },
  "work.overstay_minutes": {
    value: 30,
    unit: "분",
    label: "승인 없이 늦게 남음 판단",
    clause: "11.4",
    min: 0,
    max: 180,
  },
  "hr.headcount_5plus": {
    value: 1,
    unit: "(1=5명 이상, 0=5명 미만)",
    label: "상시 근로자 5명 이상",
    clause: "11.4",
    min: 0,
    max: 1,
  },
  "leave.small_annual_days": {
    value: 15,
    unit: "일(5명 미만일 때)",
    label: "사내 연차 일수",
    clause: "11.4",
    min: 0,
    max: 25,
  },
  "competency.min_solo_level": {
    value: 2,
    unit: "단계",
    label: "단독 배정 최소 역량",
    clause: "11.2",
    min: 1,
    max: 4,
  },
  "auth.lock_attempts": {
    value: 5,
    unit: "회",
    label: "로그인 실패 잠금",
    clause: "설계 9.1",
    min: 3,
    max: 20,
  },
  "auth.lock_minutes": {
    value: 15,
    unit: "분",
    label: "잠금 시간",
    clause: "설계 9.1",
    min: 1,
  },
  "auth.temp_password_days": {
    value: 7,
    unit: "일",
    label: "임시 비밀번호 유효 기간",
    clause: "설계 9.1",
    min: 1,
    max: 30,
  },
} satisfies Record<string, Def>;

export type PolicyKey = keyof typeof DEFAULT_POLICY;
export type Policy = Record<PolicyKey, number>;

export const POLICY_KEYS = Object.keys(DEFAULT_POLICY) as PolicyKey[];
export const isPolicyKey = (k: string): k is PolicyKey => k in DEFAULT_POLICY;

export function defaultPolicy(): Policy {
  return Object.fromEntries(
    POLICY_KEYS.map((k) => [k, DEFAULT_POLICY[k].value]),
  ) as Policy;
}

/** onDate 에 시행 중인 값 전체 */
export async function loadPolicy(
  db: Db,
  onDate = seoulDate(),
): Promise<Policy> {
  const rows = await db
    .select({ key: policySetting.key, value: policySetting.value })
    .from(policySetting)
    .where(lte(policySetting.effectiveFrom, onDate))
    .orderBy(policySetting.effectiveFrom, policySetting.createdAt);
  const p = defaultPolicy();
  for (const r of rows)
    if (isPolicyKey(r.key) && typeof r.value === "number") p[r.key] = r.value;
  return p;
}

export async function policyHistory(db: Db, key: PolicyKey) {
  return db
    .select({
      value: policySetting.value,
      effectiveFrom: policySetting.effectiveFrom,
      revisionRequestNo: policySetting.revisionRequestNo,
      reason: policySetting.reason,
      changedBy: appUser.name,
      createdAt: policySetting.createdAt,
    })
    .from(policySetting)
    .leftJoin(appUser, eq(appUser.id, policySetting.changedBy))
    .where(eq(policySetting.key, key))
    .orderBy(desc(policySetting.createdAt));
}

export class PolicyError extends UserError {}

export type PolicyChangeInput = {
  key: string;
  value: number;
  effectiveFrom: string;
  reason: string;
  revisionRequestNo?: string | null;
};

/** 정책값 변경. 권한(대표) 확인은 호출하는 쪽에서 한다 */
export async function changePolicy(
  db: Db,
  actorId: string,
  input: PolicyChangeInput,
  today = seoulDate(),
) {
  if (!isPolicyKey(input.key)) throw new PolicyError("알 수 없는 정책값");
  const def: Def = DEFAULT_POLICY[input.key];
  if (!Number.isInteger(input.value))
    throw new PolicyError(`${def.label}: 정수로 입력해 주세요`);
  if (input.value < (def.min ?? 0))
    throw new PolicyError(`${def.label}: ${def.min ?? 0} 이상이어야 합니다`);
  if (def.max != null && input.value > def.max)
    throw new PolicyError(`${def.label}: ${def.max} 이하여야 합니다`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(input.effectiveFrom) ||
    input.effectiveFrom < today
  ) {
    throw new PolicyError("시행일은 오늘 이후 날짜여야 합니다");
  }
  if (!input.reason.trim()) throw new PolicyError("변경 사유를 적어 주세요");
  const before = (await loadPolicy(db, input.effectiveFrom))[input.key];
  if (before === input.value) throw new PolicyError("현재 값과 같습니다");
  await db.transaction(async (tx) => {
    await tx.insert(policySetting).values({
      key: input.key,
      value: input.value,
      effectiveFrom: input.effectiveFrom,
      reason: input.reason.trim(),
      revisionRequestNo: input.revisionRequestNo?.trim() || null,
      changedBy: actorId,
    });
    await writeAudit(tx, {
      actorId,
      action: "policy.change",
      entityType: "policy",
      entityId: input.key,
      before: { value: before },
      after: {
        value: input.value,
        effectiveFrom: input.effectiveFrom,
        revisionRequestNo: input.revisionRequestNo ?? null,
      },
    });
  });
}

/** 설정 화면용: 현재 값과 시행 예정인 변경 */
export async function policyOverview(db: Db, onDate = seoulDate()) {
  const current = await loadPolicy(db, onDate);
  const pending = await db
    .select({
      key: policySetting.key,
      value: policySetting.value,
      effectiveFrom: policySetting.effectiveFrom,
    })
    .from(policySetting)
    .where(gt(policySetting.effectiveFrom, onDate))
    .orderBy(policySetting.effectiveFrom);
  return POLICY_KEYS.map((key) => ({
    key,
    ...DEFAULT_POLICY[key],
    defaultValue: DEFAULT_POLICY[key].value,
    value: current[key],
    scheduled: pending.filter((p) => p.key === key && p.effectiveFrom > onDate),
  }));
}
