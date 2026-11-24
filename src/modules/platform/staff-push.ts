// 직원 앱 푸시 알림(대표 지시 2026-11-21: 홈 화면에 추가한 직원 앱도 알림을 받게).
// 내 차 수첩 푸시(modules/carbook/push.ts)와 같은 방식이다. 푸시는 내용 없이 '깨우기'만 보내고,
// 휴대폰의 서비스 워커(public/sw.js)가 로그인 쿠키로 /api/staff/inbox 에서 알림 글을 받아 띄운다.
// 그래서 푸시 업체(구글·애플)는 알림 내용을 보지 못한다. 열쇠(VAPID)는 내 차 수첩과 같은 것을 쓴다.
import { and, asc, eq, gte, inArray, isNull } from "drizzle-orm";
import type { Db } from "@/db/client";
import { notification, staffPush } from "@/db/schema";
import { vapidAuth, vapidKeys } from "@/modules/carbook/push";
import { UserError } from "./errors";
import { loadPolicy } from "./policy";
import { seoulDate } from "./time";

/** 이만큼 지난 알림은 휴대폰으로 깨우지 않는다(처음 켰을 때 옛 알림이 쏟아지지 않게) */
const FRESH_MS = 30 * 60_000;

const pushHostOk = (endpoint: string) => {
  try {
    const u = new URL(endpoint);
    return u.protocol === "https:" && u.hostname.length > 3;
  } catch {
    return false;
  }
};

/** 이 휴대폰으로 알림 받기. 같은 기기는 한 줄(다른 직원이 같은 기기로 켜면 그 사람 것으로 바뀜) */
export async function subscribeStaffPush(db: Db, userId: string, endpoint: string, userAgent: string | null, now = new Date()) {
  if (!pushHostOk(endpoint) || endpoint.length > 1000) throw new UserError("이 기기는 푸시 알림을 받을 수 없습니다");
  const ua = userAgent?.slice(0, 300) ?? null;
  await db
    .insert(staffPush)
    .values({ userId, endpoint, userAgent: ua, createdAt: now })
    .onConflictDoUpdate({ target: staffPush.endpoint, set: { userId, userAgent: ua } });
}

export async function unsubscribeStaffPush(db: Db, userId: string, endpoint: string) {
  await db.delete(staffPush).where(and(eq(staffPush.endpoint, endpoint), eq(staffPush.userId, userId)));
}

/**
 * 아직 깨우지 않은 새 알림이 있는 직원의 기기마다 깨우기를 보낸다.
 * 받을 기기가 없는 사람의 알림은 깨운 것으로만 적는다(다음에 기기를 켜도 옛 알림을 보내지 않게).
 */
export async function pushPending(db: Db, now = new Date(), f: typeof fetch = fetch) {
  let rows = await db
    .select({ id: notification.id, userId: notification.userId, dedupeKey: notification.dedupeKey })
    .from(notification)
    .where(and(isNull(notification.pushedAt), isNull(notification.readAt), gte(notification.createdAt, new Date(now.getTime() - FRESH_MS))));
  // 간소화 '급하지 않은 알림 하루 2번 묶기': 급한 것만 바로 깨우고, 나머지는 12시·17시 묶음 알림(digestNotices)으로
  if (rows.length && (await loadPolicy(db, seoulDate(now)))["simple.notice_digest"] === 1) rows = rows.filter((r) => isUrgentNotice(r.dedupeKey));
  if (!rows.length) return { users: 0, sent: 0 };
  await db
    .update(notification)
    .set({ pushedAt: now })
    .where(inArray(notification.id, rows.map((r) => r.id)));
  const users = [...new Set(rows.map((r) => r.userId))];
  const subs = await db.select().from(staffPush).where(inArray(staffPush.userId, users));
  if (!subs.length) return { users: users.length, sent: 0 };
  const v = await vapidKeys(db);
  let sent = 0;
  for (const sub of subs) {
    try {
      const r = await f(sub.endpoint, { method: "POST", headers: { TTL: String(12 * 3600), Urgency: "high", Authorization: vapidAuth(v, sub.endpoint, now), "Content-Length": "0" } });
      if (r.status === 404 || r.status === 410) await db.delete(staffPush).where(eq(staffPush.id, sub.id));
      else if (r.ok) {
        sent++;
        await db.update(staffPush).set({ lastOkAt: now }).where(eq(staffPush.id, sub.id));
      }
    } catch {
      /* 이 기기는 건너뛴다 */
    }
  }
  return { users: users.length, sent };
}

/** 바로 깨울 알림(고객 차의 흐름·안전·보안). 키가 없거나 처음 보는 키는 급하지 않은 것으로 본다(묶음으로 감) */
const URGENT = ["est-", "work-", "qc-", "cp-", "jn-safety", "digest-", "sec-", "web-request", "consult-due", "inq-", "incident", "hz-", "eqfail-"];
export const isUrgentNotice = (key: string | null) => !!key && URGENT.some((p) => key.startsWith(p));

/**
 * 묶음 알림(12시·17시): 바로 깨우지 않은 급하지 않은 알림이 있는 사람에게 'n건' 한 줄을 만들어 휴대폰을 한 번 깨운다.
 * 묶인 알림은 깨운 것으로 적어 다시 울리지 않는다. 알림 목록에는 그대로 있다.
 */
export async function digestNotices(db: Db, slot: "noon" | "eve", now = new Date()) {
  if ((await loadPolicy(db, seoulDate(now)))["simple.notice_digest"] !== 1) return "알림 묶기 꺼짐";
  const rows = await db
    .select({ id: notification.id, userId: notification.userId, title: notification.title })
    .from(notification)
    .where(and(isNull(notification.pushedAt), isNull(notification.readAt)))
    .orderBy(asc(notification.createdAt));
  if (!rows.length) return "묶을 알림 없음";
  await db
    .update(notification)
    .set({ pushedAt: now, pushShownAt: now })
    .where(inArray(notification.id, rows.map((r) => r.id)));
  const by = new Map<string, string[]>();
  for (const r of rows) by.set(r.userId, [...(by.get(r.userId) ?? []), r.title]);
  for (const [userId, titles] of by)
    await db
      .insert(notification)
      .values({ userId, title: `알림 ${titles.length}건(${slot === "noon" ? "오전" : "오후"} 묶음): ${titles[0]}${titles.length > 1 ? ` 외 ${titles.length - 1}건` : ""}`, link: "/notifications", dedupeKey: `digest-${seoulDate(now)}-${slot}` })
      .onConflictDoNothing();
  schedulePush();
  return `알림 묶음 ${by.size}명 ${rows.length}건`;
}

/** 서비스 워커가 깨어나 가져가는 알림(아직 휴대폰에 띄우지 않은 것, 최근 것만). 가져가면 띄운 것으로 적는다 */
export async function takeStaffInbox(db: Db, userId: string, now = new Date()) {
  const rows = await db
    .select({ id: notification.id, title: notification.title, body: notification.body, link: notification.link })
    .from(notification)
    .where(and(eq(notification.userId, userId), isNull(notification.pushShownAt), isNull(notification.readAt), gte(notification.createdAt, new Date(now.getTime() - FRESH_MS))))
    .orderBy(asc(notification.createdAt))
    .limit(5);
  if (rows.length)
    await db
      .update(notification)
      .set({ pushShownAt: now })
      .where(inArray(notification.id, rows.map((r) => r.id)));
  return rows.map((r) => ({ id: r.id, title: r.title, body: r.body ?? "", url: r.link?.startsWith("/") ? r.link : "/notifications" }));
}

/**
 * 알림을 만든 뒤 부른다. 트랜잭션 안에서 만든 알림도 저장이 끝난 뒤 보이도록 잠깐 기다렸다가 앱 DB 로 보낸다.
 * 테스트에서는 보내지 않는다.
 */
export function schedulePush() {
  if (process.env.VITEST || process.env.NODE_ENV === "test") return;
  const g = globalThis as unknown as { __staffPushTimer?: ReturnType<typeof setTimeout> };
  if (g.__staffPushTimer) return;
  g.__staffPushTimer = setTimeout(async () => {
    g.__staffPushTimer = undefined;
    try {
      const { getDb } = await import("@/db/runtime");
      await pushPending(await getDb());
    } catch {
      /* 다음 알림 때 다시 보낸다 */
    }
  }, 1500);
}
