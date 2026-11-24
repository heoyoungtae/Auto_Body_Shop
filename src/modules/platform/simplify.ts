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
    saves: "3번 + 승인 뒤 기다림",
  },
  {
    key: "simple.check_all",
    title: "'모두 이상 없음' 한 번에 체크",
    on: "자주 검사·출고 안내 확인 칸 위에 '모두 이상 없음(모두 안내함)' 단추가 생깁니다. 누르면 모두 체크되고, 문제 있는 줄만 끕니다. 체크 기록은 그대로 남습니다.",
    off: "칸을 하나씩 체크합니다.",
    conflict: "없음(체크 기록은 그대로).",
    simple: 1,
    saves: "약 20번",
  },
  {
    key: "simple.photo_bulk",
    title: "입고 사진 한 번에 올리기",
    on: "입고 사진 위에 '여러 장 한 번에 올리기'가 생깁니다. 정면부터 왼쪽으로 한 바퀴 돌며 찍은 사진을 한꺼번에 고르면 찍은 순서대로 8방향·계기판 빈 자리에 들어가고, 남는 사진은 근접 사진으로 들어갑니다.",
    off: "자리마다 따로 찍거나 올립니다.",
    conflict: "없음(8방향·계기판은 그대로 필요).",
    simple: 1,
    saves: "약 8번",
  },
  {
    key: "intake.sign_skip",
    title: "입고 고객 서명 생략",
    on: "입고 점검을 확인 체크와 마친 직원 기록으로 마칩니다.",
    off: "서명란에 고객 서명을 받아야 점검을 마칩니다.",
    conflict: "표준서 STD-02 2.1·4절·F-02-01에 반영돼 있습니다(2026-11-24).",
    std: "STD-02",
    simple: 1,
    saves: "1번 + 고객 기다림",
  },
  {
    key: "simple.statement_deliver",
    title: "정비명세서 발급·인도 한 화면",
    on: "출고 화면에서 출고 주행거리·안내 확인·수납·인수를 한 번에 적고 누르면, 법정 정비명세서 발급과 출고가 함께 됩니다.",
    off: "정비명세서 발급과 인도를 따로 누릅니다.",
    conflict: "없음(법정 정비명세서는 그대로 발급).",
    simple: 1,
    saves: "약 2번",
  },
  {
    key: "simple.intake_agree_one",
    title: "입고 확인·이동 동의 한 체크",
    on: "'점검 내용 확인'과 '작업상 차량 이동·시험 주행 동의'를 한 칸으로 받습니다. 개인정보 동의는 상담 때 받은 것을 불러오고, 없을 때만 따로 묻습니다.",
    off: "두 칸을 따로 체크합니다.",
    conflict: "없음. 개인정보 필수 동의는 법정이라 따로 둡니다.",
    simple: 1,
    saves: "1번",
  },
  {
    key: "simple.estimate_send",
    title: "견적 발급 때 고객 링크 바로 보내기",
    on: "일반(자비) 견적을 발급하면 고객 승인 링크까지 바로 보냅니다.",
    off: "발급한 뒤 '승인 링크 보내기'를 따로 누릅니다.",
    conflict: "없음.",
    simple: 1,
    saves: "1번",
  },
  {
    key: "simple.diag_auto",
    title: "진단 확인하면 견적까지 바로",
    on: "공장장(또는 대표)이 '진단 확인하고 견적 쓰기'를 누르면 진단 확인과 함께 견적(초안)이 진단·공임 기준표로 채워져 바로 열립니다.",
    off: "진단 확인 뒤 견적 쓰기를 따로 누릅니다.",
    conflict: "없음(수리 방법 최종 결정은 공장장 그대로, STD-02 3절).",
    simple: 1,
    saves: "1번",
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
