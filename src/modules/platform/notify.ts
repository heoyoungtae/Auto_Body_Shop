import { and, count, desc, eq, isNull } from "drizzle-orm";
import type { Role } from "../auth/roles";
import { usersWithRole } from "../approval/line";
import type { Db } from "@/db/client";
import { notification } from "@/db/schema";
import { schedulePush } from "./staff-push";
import { hiddenHrefs, linkHidden } from "./features";

/** 꺼 둔 기능(설정 › 간소화 › 안 쓰는 기능 끄기)의 화면으로 가는 알림은 만들지 않는다 */
async function offLink(db: Db, link?: string) {
  return !!link && linkHidden(link, await hiddenHrefs(db));
}

export async function unreadCount(db: Db, userId: string): Promise<number> {
  const [r] = await db.select({ n: count() }).from(notification).where(and(eq(notification.userId, userId), isNull(notification.readAt)));
  return r.n;
}

export async function listNotifications(db: Db, userId: string) {
  return db.select().from(notification).where(eq(notification.userId, userId)).orderBy(desc(notification.createdAt)).limit(100);
}

export async function markAllRead(db: Db, userId: string) {
  await db.update(notification).set({ readAt: new Date() }).where(and(eq(notification.userId, userId), isNull(notification.readAt)));
}

/** 역할 전체에게 알림. dedupeKey 가 같으면 한 번만 만든다 */
export async function notifyRole(db: Db, role: Role, title: string, dedupeKey?: string, link?: string) {
  if (await offLink(db, link)) return;
  const ids = await usersWithRole(db, role);
  if (!ids.length) return;
  await db
    .insert(notification)
    .values(ids.map((userId) => ({ userId, title, link: link ?? null, dedupeKey: dedupeKey ?? null })))
    .onConflictDoNothing();
  schedulePush();
}

/** 한 사람에게 알림(작업 배정 등) */
export async function notifyUser(db: Db, userId: string, title: string, dedupeKey?: string, link?: string) {
  if (await offLink(db, link)) return;
  await db.insert(notification).values({ userId, title, link: link ?? null, dedupeKey: dedupeKey ?? null }).onConflictDoNothing();
  // 홈 화면에 둔 직원 앱으로 푸시(켠 사람만)
  schedulePush();
}
