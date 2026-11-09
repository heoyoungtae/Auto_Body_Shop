// 대시보드(첫 화면) — 권한(역할)에 따라 보이는 패널이 다르다(사용자 지시 2026-11-08).
// 패널 숫자는 모두 앞선 전표에서 집계한다. 따로 입력하는 값은 없다.
import { and, desc, eq, gte, isNull, lt, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { consentRequest, consultation, customer, messageLog } from "@/db/schema";
import type { Role } from "@/modules/auth/roles";
import { listConsultations } from "@/modules/customer/service";
import { seoulDateTime } from "@/modules/customer/rules";
import { addBusinessDays, closedReason, isBusinessDay } from "@/modules/platform/business-days";
import { loadShopCalendar } from "@/modules/platform/calendar";
import { addDays, seoulDate } from "@/modules/platform/time";

export type PanelId = "todo" | "notes" | "mine" | "intake" | "due" | "consent" | "month" | "work" | "mywork" | "quality" | "equipment" | "safety" | "money";

/** 패널별로 보는 역할. stage 가 있으면 개발 예정(흐리게 표시) */
export const PANELS: Record<PanelId, { roles: Role[] | "all"; stage?: string; title: string; body?: string }> = {
  intake: { roles: ["owner", "plant_manager", "advisor"], title: "입고 예약" },
  due: { roles: ["owner", "plant_manager", "advisor"], title: "챙길 상담" },
  todo: { roles: "all", title: "결재 대기" },
  consent: { roles: ["owner", "plant_manager", "advisor"], title: "개인정보 동의 대기" },
  month: { roles: ["owner", "plant_manager"], title: "이번 달 상담·문자" },
  notes: { roles: "all", title: "최근 알림" },
  mine: { roles: "all", title: "내가 올린 문서" },
  work: { roles: ["owner", "plant_manager", "advisor"], stage: "1차", title: "작업 현황", body: "입고 차량별 현재 공정, 출고 예정일 지연, 검사 대기" },
  mywork: { roles: ["technician"], stage: "1차", title: "내 작업", body: "나에게 배정된 작업과 자주검사, 다음 공정" },
  quality: { roles: ["owner", "quality", "plant_manager"], title: "검사·부적합", body: "최종검사 대기, 열린 부적합과 시정 기한" },
  equipment: { roles: ["owner", "plant_manager", "technician"], title: "설비 점검", body: "오늘 안 한 일상점검(A등급 강조), 윤활 예정, 이번 달 5S 점수" },
  safety: { roles: ["owner", "safety"], stage: "2차", title: "안전·환경", body: "방지시설 일지 누락, 폐기물 보관 기한, 법규 기한" },
  money: { roles: ["owner", "accounting"], stage: "3차", title: "매출·미수", body: "이번 달 매출, 보험 미수와 독촉 대상, 지출 결의 대기" },
};

export function panelsFor(roles: Role[]): PanelId[] {
  return (Object.keys(PANELS) as PanelId[]).filter((id) => {
    const r = PANELS[id].roles;
    return r === "all" || r.some((x) => roles.includes(x));
  });
}

/** 오늘이 영업일인지, 다음 쉬는 날 */
export async function todayInfo(db: Db, now = new Date()) {
  const cal = await loadShopCalendar(db);
  const today = seoulDate(now);
  let nextOff: { date: string; reason: string } | null = null;
  for (let i = 1; i <= 60 && !nextOff; i++) {
    const d = addDays(today, i);
    const r = closedReason(cal, d);
    if (r) nextOff = { date: d, reason: r };
  }
  return { today, open: isBusinessDay(cal, today), reason: closedReason(cal, today), nextOff, nextBusiness: addBusinessDays(today, 1, cal) };
}

/** 오늘·다음 영업일 입고 예약 */
export async function intakePanel(db: Db, now = new Date()) {
  const { today, nextBusiness } = await todayInfo(db, now);
  const [a, b] = await Promise.all([listConsultations(db, "all", now, undefined, today), listConsultations(db, "all", now, undefined, nextBusiness)]);
  return { today, next: nextBusiness, todayRows: a, nextRows: b };
}

export const duePanel = (db: Db, now = new Date()) => listConsultations(db, "due", now);

/** 링크로 동의를 요청하고 아직 답이 없는 고객 */
export async function consentPanel(db: Db, now = new Date()) {
  return db
    .select({ customerId: customer.id, name: customer.name, phone: customer.phoneMasked, expiresAt: consentRequest.expiresAt, sentOk: consentRequest.sentOk })
    .from(consentRequest)
    .innerJoin(customer, eq(customer.id, consentRequest.customerId))
    .where(and(isNull(consentRequest.usedAt), gte(consentRequest.expiresAt, now)))
    .orderBy(consentRequest.expiresAt)
    .limit(20);
}

/** 이번 달 상담 수·예약 전환·경로별, 문자 발송 */
export async function monthPanel(db: Db, now = new Date()) {
  const today = seoulDate(now);
  const from = seoulDateTime(`${today.slice(0, 8)}01`, "00:00");
  const next = seoulDateTime(addDays(`${today.slice(0, 8)}28`, 4).slice(0, 8) + "01", "00:00");
  const inMonth = and(gte(consultation.at, from), lt(consultation.at, next));
  const [tot] = await db
    .select({ n: sql<number>`count(*)::int`, reserved: sql<number>`count(*) filter (where ${consultation.result} in ('reserved','converted'))::int`, declined: sql<number>`count(*) filter (where ${consultation.result} = 'declined')::int` })
    .from(consultation)
    .where(inMonth);
  const byChannel = await db.select({ channel: consultation.channel, n: sql<number>`count(*)::int` }).from(consultation).where(inMonth).groupBy(consultation.channel).orderBy(desc(sql`count(*)`));
  const [msg] = await db
    .select({ n: sql<number>`count(*)::int`, failed: sql<number>`count(*) filter (where ${messageLog.status} <> '성공')::int` })
    .from(messageLog)
    .where(and(gte(messageLog.createdAt, from), lt(messageLog.createdAt, next)));
  return { month: today.slice(0, 7), total: tot.n, reserved: tot.reserved, declined: tot.declined, rate: tot.n ? Math.round((tot.reserved / tot.n) * 100) : null, byChannel, messages: msg.n, failedMessages: msg.failed };
}
