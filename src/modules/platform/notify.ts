import { and, count, desc, eq, isNull } from "drizzle-orm";
import type { Role } from "../auth/roles";
import { usersWithRole } from "../approval/line";
import type { Db } from "@/db/client";
import { notification } from "@/db/schema";

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
  const ids = await usersWithRole(db, role);
  if (!ids.length) return;
  await db
    .insert(notification)
    .values(ids.map((userId) => ({ userId, title, link: link ?? null, dedupeKey: dedupeKey ?? null })))
    .onConflictDoNothing();
}

/** 한 사람에게 알림(작업 배정 등) */
export async function notifyUser(db: Db, userId: string, title: string, dedupeKey?: string, link?: string) {
  await db.insert(notification).values({ userId, title, link: link ?? null, dedupeKey: dedupeKey ?? null }).onConflictDoNothing();
}
