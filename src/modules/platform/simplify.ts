// 간소화(대표 2026-11-24): "앱에서 하는 업무가 많아지면 비용이 늘고 앱을 꺼리게 된다. 간소화는 설정에 두고 할 수 있게."
// 간소화는 모두 정책값(0/1)이라 설정 › 간소화에서 켜고 끈다. 바꾼 이력은 정책값 이력·감사 로그에 남는다.
// 끄면(0) 표준서 원래 절차대로 전부 기록한다. 법정 서류(견적서·정비명세서·개인정보 동의)는 여기서 끌 수 없다.
import type { Db } from "@/db/client";
import { changePolicy, loadPolicy, type Policy, type PolicyKey } from "./policy";
import { UserError } from "./errors";
import { seoulDate } from "./time";

export type SimplifyItem = {
  key: PolicyKey;
  title: string;
  /** 켜면 */
  on: string;
  /** 끄면(표준) */
  off: string;
  /** 표준서·법정과의 관계. std 는 표준서 절(앱 표준서 화면 링크용) */
  conflict: string;
  std?: string;
  /** 간편 모드에서 넣는 값 */
  simple: 0 | 1;
  /** 줄어드는 누르기(한 건 기준, 추정) */
  saves: string;
};

/** 효과 큰 순서(제안서 2장 순서) */
export const SIMPLIFY_ITEMS: SimplifyItem[] = [
  {
    key: "simple.work_order_auto",
    title: "고객 승인 때 작업 지시서 자동",
    on: "고객이 견적을 승인하는 순간 작업 지시서가 생기고, 공정마다 일이 가장 적은 기술자(역량 단독 기준을 넘는 사람)가 담당으로 들어갑니다. 공장장은 알림만 받고 바꿀 때만 엽니다. 수리 건에서 '이 건은 공장장이 직접 배정'을 고르면 그 건은 자동으로 하지 않습니다.",
    off: "공장장이 '작업 지시서 만들기'를 누르고 공정마다 담당·예정일을 정합니다.",
    conflict: "표준서 STD-04 4.1·3절·4절 1~2를 함께 고쳤습니다(켜면 자동, 끄면 공장장이 만듦).",
    std: "STD-04",
    simple: 1,
    saves: "3번 + 승인 뒤 기다림(수리 한 건)",
  },
  {
    key: "simple.step_groups",
    title: "공정 3묶음·시작 단추 없음",
    on: "작업 지시서의 공정을 세 묶음(판금 준비: 탈부착·외주·판금·퍼티 / 도장: 조색·마스킹·도장·건조 / 마무리: 도장 마무리·보정·조립)으로 보여 줍니다. '시작'은 누르지 않고, 묶음의 첫 사진을 올린 때가 시작으로 기록됩니다. 묶음이 끝나면 '묶음 끝' 한 번으로 그 안의 공정이 모두 끝나고, 자주 검사·조색 배합·건조 조건·용접 방식은 그 한 화면에서 적습니다.",
    off: "공정마다 '공정 시작'과 '공정 끝'을 따로 누릅니다.",
    conflict: "표준서 STD-04 4.1·4절 4를 함께 고쳤습니다(켜면 묶음 단위로 기록, 끄면 공정마다).",
    std: "STD-04",
    simple: 1,
    saves: "약 15번(수리 한 건)",
  },
  {
    key: "simple.photo_per_group",
    title: "공정 사진 묶음당 1장",
    on: "공정 3묶음이 켜져 있을 때 묶음마다 사진 1장이면 끝낼 수 있습니다. 보험 수리 건은 보험사 제출용으로 지금처럼 사진이 필요한 공정마다 1장씩 받습니다.",
    off: "사진이 필요한 공정마다 1장 이상 올립니다.",
    conflict: "표준서 STD-04 4.1에 반영했습니다(보험 건은 표준대로).",
    std: "STD-04",
    simple: 1,
    saves: "약 4번(수리 한 건)",
  },
  {
    key: "simple.qc_quick",
    title: "최종 검사 '전부 합격'·도막 측정 생략",
    on: "최종 검사표 위에 '전부 합격' 단추가 생겨 한 번에 체크하고, 문제 있는 줄만 끕니다. 자비 수리 건은 도막 두께 5점 측정을 묻지 않습니다(도막 결함 육안 검사는 그대로). 보험 수리 건은 도막 두께를 지금처럼 잽니다.",
    off: "검사 항목을 하나씩 체크하고, 도장한 차는 도막 두께 5점을 적습니다.",
    conflict: "표준서 STD-05 5절·F-05-01에 반영했습니다(켜면 자비 건 도막 측정 생략).",
    std: "STD-05",
    simple: 1,
    saves: "약 12번(수리 한 건)",
  },
  {
    key: "simple.deliver_sign_skip",
    title: "출고 인수 서명 생략",
    on: "자비 수리 건을 본인이 찾아가면 인수 서명 없이 인수자 이름·안내 확인 체크로 출고합니다. 대리인이 찾아가거나 보험 수리 건이면 지금처럼 서명을 받습니다.",
    off: "출고 때마다 인수 서명을 받습니다.",
    conflict: "표준서 STD-05 8.4·F-05-02에 반영했습니다(대리인·보험 건은 서명).",
    std: "STD-05",
    simple: 1,
    saves: "1번 + 고객 기다림(수리 한 건)",
  },
  {
    key: "simple.estimate_small",
    title: "소액 견적 내부 검토 생략",
    on: "견적 합계가 정책값 '소액 견적 기준'(처음 50만 원) 이하면 검토 요청 없이 바로 검토 끝이 되어 발급할 수 있습니다. 넘으면 지금처럼 전결 규정대로 공장장·대표가 검토합니다.",
    off: "모든 견적을 전결 규정대로 검토한 뒤 발급합니다.",
    conflict: "표준서 STD-03 3절·부록 B(전결 규정)에 반영했습니다.",
    std: "STD-03",
    simple: 1,
    saves: "2번 + 검토 기다림(수리 한 건)",
  },
  {
    key: "simple.deliver_payment",
    title: "출고 때 입금 전표 자동",
    on: "출고 화면에서 카드·현금·계좌 이체를 고르면 남은 금액 전부를 입금 전표로 함께 적습니다. 카드는 카드 전표, 현금·이체는 그 자리에서 고른 증빙(현금영수증 등)으로 적습니다.",
    off: "출고한 뒤 수납 화면에서 금액·방법·증빙을 다시 적습니다.",
    conflict: "STD-12 4.3 수납 기록은 그대로 남습니다(적는 화면만 합침). 나눠 받으면 '미수'로 출고하고 따로 적습니다.",
    std: "STD-12",
    simple: 1,
    saves: "화면 1개·약 5번(수리 한 건)",
  },
  {
    key: "simple.self_approve",
    title: "결재권자 본인 건 바로 승인",
    on: "승인할 사람이 올린 사람 자신뿐이면(대표가 쓴 지출 결의·공문·발주·견적·월 마감) 올리는 순간 승인됩니다. '대표 자기결재' 표시는 남습니다.",
    off: "결재함에서 자기 문서를 다시 열어 승인합니다.",
    conflict: "STD-00 5절 자기결재 표시는 그대로이고, STD-12 7절대로 월 마감 때 자기결재 건을 다시 봅니다.",
    std: "STD-00",
    simple: 1,
    saves: "대표가 올린 건마다 2~3번",
  },
  {
    key: "simple.push_first",
    title: "손님 안내는 앱 푸시 먼저",
    on: "내 차 수첩 앱에서 알림을 켠 손님에게는 수리 완료 안내·만족도 설문·예약 확인·전날 안내를 앱 푸시로 보내 문자 요금을 아낍니다. 푸시가 닿지 않으면 알림톡·문자로 갑니다. 견적 승인 링크는 언제나 알림톡·문자로 보냅니다.",
    off: "모든 손님 안내를 알림톡·문자로 보냅니다.",
    conflict: "없음(STD-06 7.1 '앱·문자로' 그대로).",
    simple: 1,
    saves: "푸시 켠 손님은 수리 한 건에 문자 최대 4통",
  },
  {
    key: "simple.reminder_skip",
    title: "예약 확인 직후 전날 안내 생략",
    on: "예약 확인을 보낸 지 2일이 안 된 예약에는 전날 16시 안내를 다시 보내지 않습니다.",
    off: "모든 예약에 전날 안내를 보냅니다.",
    conflict: "STD-01 1.2·4절 7단계(전날 안내)에 예외를 둡니다.",
    std: "STD-01",
    simple: 1,
    saves: "오늘·내일 잡은 예약마다 문자 1통",
  },
  {
    key: "simple.booth_log_auto",
    title: "도장 부스 운전 일지 자동 채움",
    on: "부스 운전 일지 칸을 그날 도장·건조 공정의 처음 시작·마지막 끝, 지난 일지의 온도·건조 시간·필터 상태, 그날 도료 사용량(L)으로 미리 채웁니다. 보고 다르면 고치고, 필터 차압은 직접 읽어 적습니다.",
    off: "운전 일지 8칸을 모두 손으로 적습니다.",
    conflict: "STD-10 5.3·STD-08 8절 운전 일지 작성 요령에 '미리 채움'을 더합니다. 방지시설 운영 일지 근거라 일지 자체는 그대로 남깁니다.",
    std: "STD-10",
    simple: 1,
    saves: "약 7칸(부스 가동일 하루)",
  },
  {
    key: "simple.punch_close",
    title: "퇴근 누르면 업무일지 마감까지",
    on: "출퇴근 화면에 '퇴근(다친 일·아차사고 없음)' 단추가 생겨, 한 번 누르면 안전 확인 '없음'으로 업무일지를 마감하고 퇴근합니다. 특이사항이 있으면 '특이사항 적고 퇴근'으로 지금처럼 적습니다.",
    off: "업무일지 화면에서 안전 확인을 답하고 마감한 뒤 퇴근을 누릅니다.",
    conflict: "STD-11 7.1 문구를 바꿉니다.",
    std: "STD-11",
    simple: 1,
    saves: "화면 1개·약 4번(사람마다 하루)",
  },
  {
    key: "simple.five_s_weekly",
    title: "3정5S 점검 주 1회",
    on: "구역 담당의 3정5S 점검 할 일이 매주 금요일부터 한 번만 뜨고, 점검률도 주 단위로 셉니다. 공장장의 월간 평가는 그대로입니다.",
    off: "영업일마다 작업 끝에 체크하고 사진 1장을 올립니다.",
    conflict: "STD-08 14.1(일일 점검)을 주 1회로 바꿉니다. 정리 습관이 느슨해질 수 있어 월간 평가는 그대로 둡니다.",
    std: "STD-08",
    simple: 1,
    saves: "체크 5개+사진 1장 × 주 4번(구역마다)",
  },
  {
    key: "simple.day_close_auto",
    title: "일일 마감 자동(현금 없는 날)",
    on: "현금을 받지 않은 날은 다음 날 아침 앱이 카드 단말기 합계를 카드 전표 합계로 보고 자동 마감합니다. 현금을 받은 날은 지금처럼 세어서 마감합니다.",
    off: "영업일마다 카드 단말기 합계와 현금을 직접 넣어 마감합니다.",
    conflict: "STD-12 7절(일 마감)에 예외를 둡니다. 카드 단말기와 전표 차이는 월 마감·카드사 입금 맞추기에서 잡습니다.",
    std: "STD-12",
    simple: 1,
    saves: "화면 1개·입력 2칸(현금 없는 영업일마다)",
  },
  {
    key: "simple.nc_quick",
    title: "가벼운 부적합은 '수정으로 끝' 한 번에 종결",
    on: "바로 고쳐 끝난 가벼운 부적합은 원인과 한 일만 적고 한 번에 종결합니다('재발 방지 조치 불필요' 판단이 남음). 중대 건, 고객 불만·사고·개인정보·내부심사·법규 건, 같은 유형이 90일 안에 3번째인 건은 자동으로 정식 절차입니다.",
    off: "모든 부적합을 원인 분석·조치·효과 확인·종결 4단계로 처리합니다.",
    conflict: "STD-Q 부적합 절·STD-05 6.5에 예외를 둡니다. ISO 9001 10.2는 시정 조치가 필요한지 판단하면 되므로 판단을 기록으로 남깁니다.",
    std: "STD-Q",
    simple: 1,
    saves: "화면 4개·입력 4칸 → 1번(가벼운 부적합 한 건)",
  },
  {
    key: "simple.qc_photo_reuse",
    title: "최종 검사 사진에 마무리 공정 사진 인정(자비 건)",
    on: "자비 건은 마무리 묶음(도장 마무리·보정·조립)에서 찍은 사진을 최종 검사 사진 장수에 넣어, 모자란 장수만 더 찍습니다. 보험 건은 따로 찍습니다.",
    off: "최종 검사 사진을 정한 장수만큼 따로 찍습니다.",
    conflict: "STD-05 5.5 문구에 예외를 둡니다. 불만·보증 때 근거가 약해질 수 있어 보험 건은 빼었습니다.",
    std: "STD-05",
    simple: 1,
    saves: "사진 3~4장(자비 차 한 대)",
  },
  {
    key: "simple.recurring_expense",
    title: "매달 나가는 돈 정기 결의",
    on: "임차료·전기·통신·보험료처럼 매달 나가는 돈을 대표가 한 번 등록하면, 매달 '이번 달 결의 올리기' 한 번으로 결의서를 올립니다. 금액이 지난번과 20% 안이면 대표 결재는 등록 승인으로 갈음하고, 연 1회 다시 등록해 확인합니다.",
    off: "매달 지출 결의서를 새로 쓰고 결재를 받습니다.",
    conflict: "STD-12 12.2(지출 결의)에 정기 결의를 더합니다. 결의서·결재 기록은 그대로 남습니다.",
    std: "STD-12",
    simple: 1,
    saves: "매달 결의서 5~8장 × 약 15번",
  },
  {
    key: "simple.po_from_estimate",
    title: "고객 승인 견적 부품 발주는 승인 생략",
    on: "고객이 승인한 견적의 부품을 견적 수량·단가 안에서 발주하면, 승인 요청을 누르는 순간 승인돼 바로 발주서를 보냅니다. 견적을 넘거나 재고 발주면 지금처럼 승인받습니다.",
    off: "모든 발주를 금액별 승인자에게 승인받고 보냅니다.",
    conflict: "STD-07 5.4·부록 B(전결 규정)에 예외를 둡니다. 고객 승인 견적이 구매 근거가 됩니다.",
    std: "STD-07",
    simple: 1,
    saves: "발주마다 2~3번+승인 기다림",
  },
  {
    key: "simple.survey_sample",
    title: "만족도 설문은 같은 손님 6개월에 한 번",
    on: "출고 7일 뒤 설문 문자를, 6개월 안에 설문을 보낸 손님에게는 다시 보내지 않습니다.",
    off: "출고한 모든 건에 설문 문자를 보냅니다.",
    conflict: "STD-06 6.3·7.1에 표본 기준을 둡니다. 품질목표 설문 지표의 표본이 작아집니다.",
    std: "STD-06",
    simple: 1,
    saves: "설문 문자 약 절반",
  },
  {
    key: "simple.std_rev_quiet",
    title: "개업 전 표준서 개정 교육 할 일 숨김",
    on: "개업일(설정 › 세금의 사업자등록증 개업일) 전이거나 비어 있으면 표준서를 고칠 때마다 쌓이는 '개정 교육 계획' 할 일을 띄우지 않습니다. 개업 뒤에도 '문구만 고침, 교육 불필요'로 한 번에 닫을 수 있습니다.",
    off: "표준서를 고칠 때마다 개정 교육 계획 할 일이 뜹니다.",
    conflict: "STD-11 5절 문구(개정 교육)에 예외를 둡니다.",
    std: "STD-11",
    simple: 1,
    saves: "대표 할 일 목록 정리",
  },
  {
    key: "simple.check_all",
    title: "'모두 이상 없음' 한 번에 체크",
    on: "자주 검사·출고 안내 확인 칸 위에 '모두 이상 없음(모두 안내함)' 단추가 생깁니다. 누르면 모두 체크되고, 문제 있는 줄만 끕니다. 설비 대장의 오늘 할 일에서도 이상 없는 설비를 골라 일상 점검을 한 번에 적습니다. 체크 기록은 그대로 남습니다.",
    off: "칸을 하나씩 체크합니다.",
    conflict: "없음(체크 기록은 그대로).",
    simple: 1,
    saves: "약 20번(수리 한 건)",
  },
  {
    key: "simple.photo_bulk",
    title: "입고 사진 한 번에 올리기",
    on: "입고 사진 위에 '여러 장 한 번에 올리기'가 생깁니다. 정면부터 왼쪽으로 한 바퀴 돌며 찍은 사진을 한꺼번에 고르면 찍은 순서대로 8방향·계기판 빈 자리에 들어가고, 남는 사진은 근접 사진으로 들어갑니다.",
    off: "자리마다 따로 찍거나 올립니다.",
    conflict: "없음(8방향·계기판은 그대로 필요).",
    simple: 1,
    saves: "약 8번(수리 한 건)",
  },
  {
    key: "intake.sign_skip",
    title: "입고 고객 서명 생략",
    on: "입고 점검을 확인 체크와 마친 직원 기록으로 마칩니다.",
    off: "서명란에 고객 서명을 받아야 점검을 마칩니다.",
    conflict: "표준서 STD-02 2.1·4절·F-02-01에 반영돼 있습니다(2026-11-24).",
    std: "STD-02",
    simple: 1,
    saves: "1번 + 고객 기다림(수리 한 건)",
  },
  {
    key: "simple.statement_deliver",
    title: "정비명세서 발급·인도 한 화면",
    on: "출고 화면에서 출고 주행거리·안내 확인·수납·인수를 한 번에 적고 누르면, 법정 정비명세서 발급과 출고가 함께 됩니다.",
    off: "정비명세서 발급과 인도를 따로 누릅니다.",
    conflict: "없음(법정 정비명세서는 그대로 발급).",
    simple: 1,
    saves: "약 2번(수리 한 건)",
  },
  {
    key: "simple.intake_agree_one",
    title: "입고 확인·이동 동의 한 체크",
    on: "'점검 내용 확인'과 '작업상 차량 이동·시험 주행 동의'를 한 칸으로 받습니다. 개인정보 동의는 상담 때 받은 것을 불러오고, 없을 때만 따로 묻습니다.",
    off: "두 칸을 따로 체크합니다.",
    conflict: "없음. 개인정보 필수 동의는 법정이라 따로 둡니다.",
    simple: 1,
    saves: "1번(수리 한 건)",
  },
  {
    key: "simple.estimate_send",
    title: "견적 발급 때 고객 링크 바로 보내기",
    on: "일반(자비) 견적을 발급하면 고객 승인 링크까지 바로 보냅니다.",
    off: "발급한 뒤 '승인 링크 보내기'를 따로 누릅니다.",
    conflict: "없음.",
    simple: 1,
    saves: "1번(수리 한 건)",
  },
  {
    key: "simple.diag_auto",
    title: "진단 확인하면 견적까지 바로",
    on: "공장장(또는 대표)이 '진단 확인하고 견적 쓰기'를 누르면 진단 확인과 함께 견적(초안)이 진단·공임 기준표로 채워져 바로 열립니다.",
    off: "진단 확인 뒤 견적 쓰기를 따로 누릅니다.",
    conflict: "없음(수리 방법 최종 결정은 공장장 그대로, STD-02 3절).",
    simple: 1,
    saves: "1번(수리 한 건)",
  },
  {
    key: "simple.journal_quiet",
    title: "특이사항 없는 업무일지 확인 생략",
    on: "마감할 때 특이사항·건의가 없고 안전 확인이 '없음'이면 확인 끝으로 닫힙니다. 무엇이든 적혀 있으면 지금처럼 공장장(공장장 일지는 대표)이 확인합니다.",
    off: "모든 업무일지를 공장장이 매일 확인합니다.",
    conflict: "없음(앱 규칙, 2026-11-11 결정).",
    simple: 1,
    saves: "하루 직원 수만큼",
  },
  {
    key: "simple.notice_digest",
    title: "급하지 않은 알림 하루 2번 묶기",
    on: "고객 승인·견적 검토·작업 배정·검사·출고처럼 급한 알림만 휴대폰을 바로 울리고, 나머지는 12시·17시에 'n건' 한 번으로 알립니다. 알림 목록에는 그대로 쌓입니다.",
    off: "모든 알림이 바로 휴대폰을 울립니다.",
    conflict: "없음.",
    simple: 1,
    saves: "방해 줄어듦",
  },
];

export const SIMPLIFY_KEYS = SIMPLIFY_ITEMS.map((i) => i.key);
export const isSimplifyKey = (k: string): k is PolicyKey => (SIMPLIFY_KEYS as string[]).includes(k);

/** 켜져 있나 */
export const simpleOn = (p: Policy, k: PolicyKey) => p[k] === 1;

/** 오늘 시행 중인 정책값으로 한 항목이 켜져 있나 */
export async function isSimple(db: Db, k: PolicyKey, now = new Date()) {
  return (await loadPolicy(db, seoulDate(now)))[k] === 1;
}

export async function simplifyOverview(db: Db, now = new Date()) {
  const p = await loadPolicy(db, seoulDate(now));
  const items = SIMPLIFY_ITEMS.map((i) => ({ ...i, value: p[i.key] }));
  const mode = items.every((i) => i.value === i.simple) ? "simple" : items.every((i) => i.value === 0) ? "standard" : "custom";
  return { items, mode: mode as "simple" | "standard" | "custom" };
}

/** 한 항목 켜기·끄기. 오늘부터 시행. 권한(대표) 확인은 부르는 쪽에서 한다 */
export async function setSimple(db: Db, actorId: string, key: string, on: boolean, now = new Date()) {
  if (!isSimplifyKey(key)) throw new UserError("알 수 없는 간소화 항목입니다");
  const it = SIMPLIFY_ITEMS.find((i) => i.key === key)!;
  const today = seoulDate(now);
  if ((await loadPolicy(db, today))[key] === (on ? 1 : 0)) return false;
  await changePolicy(db, actorId, { key, value: on ? 1 : 0, effectiveFrom: today, reason: `설정 › 간소화에서 ${on ? "켬" : "끔"}: ${it.title}` }, today);
  return true;
}

/** 간편 모드(권장 묶음 켬) 또는 표준(모두 끔)으로 한꺼번에. 바뀐 개수를 돌려준다 */
export async function applySimplifyMode(db: Db, actorId: string, mode: "simple" | "standard", now = new Date()) {
  const today = seoulDate(now);
  const p = await loadPolicy(db, today);
  let n = 0;
  for (const i of SIMPLIFY_ITEMS) {
    const v = mode === "simple" ? i.simple : 0;
    if (p[i.key] === v) continue;
    await changePolicy(db, actorId, { key: i.key, value: v, effectiveFrom: today, reason: mode === "simple" ? "설정 › 간소화: 간편 모드 켬" : "설정 › 간소화: 표준(전부 기록)으로" }, today);
    n++;
  }
  return n;
}
