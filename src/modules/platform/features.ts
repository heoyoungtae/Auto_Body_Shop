// 안 쓰는 기능 끄기(간소화, 대표 2026-11-24): 작은 공업사가 쓰지 않는 화면을 사이드 메뉴·메뉴 찾기에서 숨긴다.
// 숨겨도 기록·주소는 그대로 남고, 다시 켜면 돌아온다. 법정(견적서·정비명세서·개인정보·위험성평가 등)과
// 수리 흐름의 필수 화면은 목록에 없어 끌 수 없다. 설정 › 간소화에서 대표가 켜고 끈다.
import { and, eq, inArray, isNull, isNotNull, notInArray } from "drizzle-orm";
import type { Db } from "@/db/client";
import { appConfig, appUser, notification, staffProfile, userRole } from "@/db/schema";
import { writeAudit } from "./audit";
import { UserError } from "./errors";
import { linkHidden } from "./features-link";

export { linkHidden };

export type Feature = {
  key: string;
  title: string;
  /** 숨기는 메뉴 주소 */
  hrefs: string[];
  /** 끄면 생기는 일(표준서·ISO 관련 주의) */
  note: string;
  /** '소규모 공업사 간편 모드'를 누르면 함께 끈다(대표 결정 2026-11-25 나묶음). 표준으로 되돌리면 다시 켠다 */
  simple?: true;
};

export const FEATURES: Feature[] = [
  { key: "schedule", title: "일정표", hrefs: ["/schedule"], note: "입고·출고 예정은 대시보드와 수리 건에서 그대로 봅니다." },
  { key: "tasks", title: "업무지시", hrefs: ["/tasks"], note: "말로 지시하고 기록을 남기지 않는 가게에 맞습니다." },
  { key: "techbay", title: "업체 주문 앱(테크베이)", hrefs: ["/portal-orders", "/tv/techbay"], note: "테크베이 주문을 받지 않을 때 끕니다." },
  { key: "aos", title: "AOS 지급 엑셀 맞추기", hrefs: ["/claims/aos-paid"], note: "보험 지급은 보험 청구 화면에서 하나씩 확인합니다." },
  { key: "gifts", title: "기프티콘", hrefs: ["/gifts/send", "/gifts", "/settings/gift"], note: "감사 기프티콘을 보내지 않을 때 끕니다." },
  { key: "homepage", title: "홈페이지 관리", hrefs: ["/homepage/faq", "/homepage/notice", "/homepage/cases", "/homepage/articles", "/homepage/trust", "/settings/site"], note: "홈페이지 글은 그대로 공개됩니다. 손님 견적 요청함은 상담 화면에 남습니다." },
  { key: "tv", title: "TV 현황판", hrefs: ["/tv", "/settings/tv"], note: "TV를 두지 않을 때 끕니다." },
  { key: "budget", title: "연간 예산", hrefs: ["/money/budget"], note: "예산 대비 실적 보고서가 비게 됩니다." },
  { key: "reviews", title: "인사평가", hrefs: ["/reviews"], note: "ISO 9001 7.2(역량) 근거는 역량표·교육 기록으로 남습니다." },
  { key: "suggestions", title: "개선 제안", hrefs: ["/suggestions"], note: "ISO 9001 10.3 지속적 개선 근거가 줄어듭니다. 부적합·시정 조치는 그대로 씁니다." },
  { key: "five_s", title: "3정5S 점검", hrefs: ["/five-s"], note: "표준서 STD-08의 3정5S 점검 기록이 끊깁니다(심사 때 다른 기록으로 보여야 함)." },
  { key: "lube_pm", title: "설비 윤활·예방정비", hrefs: ["/equipment/lube", "/equipment/pm"], note: "표준서 STD-08 설비 보전 기록이 끊깁니다. 일상 점검·교정은 그대로 남습니다." },
  { key: "outsource", title: "외주 작업", hrefs: ["/outsource"], note: "외주를 맡기지 않을 때 끕니다. 표준서 STD-07 외주 관리 기록이 없게 됩니다." },
  { key: "corr", title: "공문·수발신", hrefs: ["/corr"], note: "공문을 주고받지 않을 때 끕니다. 받은 공문은 기록 보관함에 파일로 둡니다." },
  { key: "iso_mgmt", title: "내부 심사·경영검토·조직 상황", hrefs: ["/audits", "/qms/review", "/qms/context", "/reports/review"], note: "ISO 인증 심사를 받을 때는 다시 켜야 합니다(ISO 9001 4.1·9.2·9.3 기록)." },
  { key: "risks", title: "리스크·기회", hrefs: ["/risks"], note: "ISO 인증 심사를 받을 때는 다시 켜야 합니다(ISO 9001 6.1 기록). 안전 위험성평가는 따로 있어 그대로 합니다." },
  { key: "doc_review", title: "문서 정기 검토 할 일", hrefs: ["/qms/docs?f=review"], note: "절차서·지침서 연 1회 정기 검토 할 일·알림만 멈춥니다. 문서 목록은 그대로 씁니다(STD-Q 7절)." },
  { key: "branches", title: "지점·작업장", hrefs: ["/settings/branches", "/settings/workplaces"], note: "한 곳에서만 일할 때 끕니다. 이미 만든 지점·작업장 기록은 그대로 남습니다." },
  { key: "bulk_sms", title: "단체 문자", hrefs: ["/messages/send"], note: "여러 손님에게 한꺼번에 보내는 문자만 숨깁니다. 예약·출고 안내 같은 건별 문자는 그대로 갑니다." },
  { key: "depreciation", title: "감가상각 대장", hrefs: ["/money/depreciation"], note: "감가상각은 세무 대리인이 계산할 때 끕니다. 비품·설비 대장의 취득 기록은 그대로 남습니다." },
  // 3차 검토(대표 2026-11-25 '가+나 전부, 다는 끌 수 있게만'). 나묶음 6가지는 간편 모드에서 함께 끈다
  { key: "kakao", title: "카카오 알림톡", hrefs: ["/settings/kakao"], simple: true, note: "손님 안내는 지금처럼 같은 문구가 문자로 갑니다(문자 요금이 조금 더 듭니다). 알림톡 설정·문구 검수 할 일이 멈춥니다." },
  { key: "goals", title: "품질목표", hrefs: ["/qms/goals", "/reports/quality"], simple: true, note: "매달 목표 미달 부적합 자동 생성, 분기 검토 서명, 대시보드 '목표 미달' 칸, 품질 월보가 멈춥니다. ISO 인증 심사 전에는 다시 켜서 몇 달 기록을 쌓아야 합니다(ISO 9001 6.2)." },
  { key: "tools", title: "치공구 대장", hrefs: ["/tools", "/money/expenses/new?tool="], simple: true, note: "치공구 반납·분기 점검·안전재고 부족 할 일이 멈춥니다. 산 치공구는 지출 결의로 그대로 남습니다(STD-08.7 기록 없음)." },
  { key: "fixture_check", title: "비품 정기 점검", hrefs: ["/fixtures/check", "/fixtures?f=problem"], simple: true, note: "비품 라벨·연 1회 실물 확인 할 일만 멈춥니다. 비품 대장·수령 확인·감가상각 근거는 그대로 씁니다." },
  { key: "jd", title: "직무기술서 확인 서명", hrefs: ["/jobs"], simple: true, note: "직무기술서 확인 요청 알림과 신입 오리엔테이션의 직무기술서 항목이 빠집니다. 역량은 역량표·교육 기록으로 보입니다(ISO 9001 7.2)." },
  { key: "rules", title: "취업규칙 확인 서명", hrefs: ["/rules"], simple: true, note: "직원 10명 미만일 때만 끌 수 있습니다. 10명이 되면 작성·신고 의무가 생겨(근로기준법 제93조) 대표 할 일로 알립니다. 신입 오리엔테이션의 취업규칙 항목도 빠집니다." },
  // 다묶음: 끌 수만 있게, 간편 모드에서도 켜 둔다
  { key: "onboarding", title: "신입 오리엔테이션 점검표", hrefs: ["/staff/onboarding"], note: "신입별 점검표 할 일이 멈춥니다. 근로계약서·서약서·채용 시 안전교육은 각자 화면·할 일로 그대로 챙깁니다. 개업 때는 켜 두기를 권합니다." },
  { key: "survey", title: "만족도 설문", hrefs: ["/survey"], note: "출고 뒤 설문 문자를 보내지 않습니다(문자 요금 절약). 불만 접수·보증은 그대로입니다. ISO 9001 9.1.2 고객 만족 근거가 없어집니다." },
  { key: "elearning", title: "사내 교재", hrefs: ["/training/manuals", "/training/new?kind=std_rev"], note: "사내 교재 만들기·개정 할 일과 표준서 개정 교육 계획 할 일이 멈춥니다. 이미 배정한 앱 학습과 법정 안전보건교육은 '교육 훈련'에 그대로 남습니다." },
  { key: "bank", title: "통장·카드 자동 연동", hrefs: ["/money/bank", "/money/expenses/new?tx="], note: "장부를 세무사에게 맡기고 앱 회계를 쓰지 않을 때만 끕니다. 연동 설정·통장 맞추기·카드 결의·홈택스 증빙 할 일이 멈추고, 앱의 손익·자금 보고서가 실제와 달라질 수 있습니다." },
];

/** 취업규칙 작성·신고 의무가 생기는 상시 근로자 수(근로기준법 제93조) */
export const RULES_DUTY_HEADCOUNT = 10;

/** 지금 재직 중인 직원 수(대표 제외). 근로자 명부가 없어도 쓰는 로그인 계정은 센다(명부를 안 채워 의무를 놓치지 않게) */
export async function staffHeadcount(db: Db): Promise<number> {
  const owners = (await db.select({ id: userRole.userId }).from(userRole).where(eq(userRole.role, "owner"))).map((r) => r.id);
  const rows = await db
    .select({ id: appUser.id })
    .from(appUser)
    .leftJoin(staffProfile, eq(staffProfile.userId, appUser.id))
    .where(and(eq(appUser.active, true), isNull(appUser.retiredOn), isNull(staffProfile.leftOn), owners.length ? notInArray(appUser.id, owners) : undefined));
  return rows.length;
}

const KEY = "features_off";

/** 꺼 둔 기능 키 */
export async function featuresOff(db: Db): Promise<string[]> {
  const [r] = await db.select({ data: appConfig.data }).from(appConfig).where(eq(appConfig.key, KEY));
  const off = (r?.data as { off?: unknown } | undefined)?.off;
  return Array.isArray(off) ? off.filter((k): k is string => typeof k === "string" && FEATURES.some((f) => f.key === k)) : [];
}

/** 이 기능을 꺼 두었나 */
export async function featureOff(db: Db, key: string): Promise<boolean> {
  return (await featuresOff(db)).includes(key);
}

/** 메뉴에서 숨길 주소 */
export async function hiddenHrefs(db: Db): Promise<string[]> {
  const off = await featuresOff(db);
  return FEATURES.filter((f) => off.includes(f.key)).flatMap((f) => f.hrefs);
}

/** 끈 기능으로 가는 읽지 않은 알림은 읽은 것으로(안 읽은 수가 남아 있지 않게). 알림 목록에는 그대로 남는다 */
async function quietNotices(db: Db) {
  const hidden = await hiddenHrefs(db);
  if (!hidden.length) return;
  const rows = await db.select({ id: notification.id, link: notification.link }).from(notification).where(and(isNull(notification.readAt), isNotNull(notification.link)));
  const ids = rows.filter((r) => linkHidden(r.link, hidden)).map((r) => r.id);
  for (let i = 0; i < ids.length; i += 500) await db.update(notification).set({ readAt: new Date() }).where(inArray(notification.id, ids.slice(i, i + 500)));
}

/** 기능 하나 켜기·끄기. 권한(대표) 확인은 부르는 쪽에서 */
export async function setFeature(db: Db, actorId: string, key: string, on: boolean) {
  const f = FEATURES.find((x) => x.key === key);
  if (!f) throw new UserError("끌 수 없는 기능입니다");
  if (!on && key === "rules" && (await staffHeadcount(db)) >= RULES_DUTY_HEADCOUNT)
    throw new UserError(`직원이 ${RULES_DUTY_HEADCOUNT}명 이상이라 취업규칙은 끌 수 없습니다(근로기준법 제93조 작성·신고 의무)`);
  const before = await featuresOff(db);
  const off = on ? before.filter((k) => k !== key) : [...new Set([...before, key])];
  if (off.length === before.length && off.every((k) => before.includes(k))) return false;
  const data = { off };
  await db
    .insert(appConfig)
    .values({ key: KEY, data, updatedBy: actorId, updatedAt: new Date() })
    .onConflictDoUpdate({ target: appConfig.key, set: { data, updatedBy: actorId, updatedAt: new Date() } });
  await writeAudit(db, { actorId, action: "settings.features", entityType: "app_config", entityId: KEY, before: { off: before }, after: { [on ? "on" : "off"]: f.title } });
  if (!on) await quietNotices(db);
  return true;
}

/** 간편 모드면 나묶음(simple 표시)을 끄고, 표준이면 다시 켠다. 취업규칙은 직원 10명 이상이면 끄지 않는다. 바뀐 개수 */
export async function applyFeatureMode(db: Db, actorId: string, mode: "simple" | "standard") {
  const before = await featuresOff(db);
  const keys = FEATURES.filter((f) => f.simple).map((f) => f.key);
  let pick = keys;
  if (mode === "simple" && (await staffHeadcount(db)) >= RULES_DUTY_HEADCOUNT) pick = keys.filter((k) => k !== "rules");
  const off = mode === "simple" ? [...new Set([...before, ...pick])] : before.filter((k) => !keys.includes(k));
  const changed = off.length - before.length;
  if (!changed) return 0;
  const data = { off };
  await db
    .insert(appConfig)
    .values({ key: KEY, data, updatedBy: actorId, updatedAt: new Date() })
    .onConflictDoUpdate({ target: appConfig.key, set: { data, updatedBy: actorId, updatedAt: new Date() } });
  await writeAudit(db, { actorId, action: "settings.features", entityType: "app_config", entityId: KEY, before: { off: before }, after: { mode, off } });
  if (mode === "simple") await quietNotices(db);
  return Math.abs(changed);
}
