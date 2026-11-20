// '고치는 중' 표시(대표 결정 2026-11-20). 막지 않고 알려 주기만 한다.
// 전표 화면이 20초마다 "나 이 전표 보고 있음(또는 고치는 중)"을 알리고, 같은 전표를 연 다른 사람을 받아 간다.
import { and, asc, eq, inArray, lt, ne, gt } from "drizzle-orm";
import type { Db } from "@/db/client";
import { appUser, editPresence, userRole } from "@/db/schema";
import { ROLE_LABEL, type Role } from "@/modules/auth/roles";

/** 이만큼 소식이 없으면 화면을 닫은 것으로 본다 */
export const PRESENCE_STALE_MS = 60_000;

export type Viewer = { name: string; role: string | null; editing: boolean; since: string; self: boolean };

const DOC_RE = /^[a-z]+:[0-9a-f-]{36}$/;
const TAB_RE = /^[A-Za-z0-9_-]{6,40}$/;

export const validDoc = (doc: string) => DOC_RE.test(doc);
export const validTab = (tab: string) => TAB_RE.test(tab);

/** 알리고, 같은 전표를 연 다른 화면 목록을 돌려준다(내 다른 창도 '내가 다른 창에서'로 보인다) */
export async function heartbeat(db: Db, userId: string, doc: string, tab: string, editing: boolean, now = new Date()): Promise<Viewer[]> {
  if (!validDoc(doc) || !validTab(tab)) return [];
  await db
    .insert(editPresence)
    .values({ doc, tab, userId, editing, since: now, at: now })
    .onConflictDoUpdate({ target: [editPresence.doc, editPresence.tab], set: { editing, at: now, userId } });
  // 오래된 줄은 가끔 치운다(표가 커지지 않게)
  if (now.getSeconds() < 5) await db.delete(editPresence).where(lt(editPresence.at, new Date(now.getTime() - 10 * PRESENCE_STALE_MS)));
  return viewers(db, doc, tab, userId, now);
}

export async function viewers(db: Db, doc: string, myTab: string, userId: string, now = new Date()): Promise<Viewer[]> {
  const rows = await db
    .select({ userId: editPresence.userId, name: appUser.name, editing: editPresence.editing, since: editPresence.since })
    .from(editPresence)
    .innerJoin(appUser, eq(appUser.id, editPresence.userId))
    .where(and(eq(editPresence.doc, doc), ne(editPresence.tab, myTab), gt(editPresence.at, new Date(now.getTime() - PRESENCE_STALE_MS))))
    .orderBy(asc(editPresence.since));
  if (!rows.length) return [];
  const roles = await db.select().from(userRole).where(inArray(userRole.userId, [...new Set(rows.map((r) => r.userId))]));
  const roleOf = (id: string) => {
    const r = roles.find((x) => x.userId === id);
    return r ? ROLE_LABEL[r.role as Role] : null;
  };
  // 한 사람이 창을 여럿 열었으면 한 줄로(고치는 중인 창이 있으면 고치는 중)
  const byUser = new Map<string, Viewer>();
  for (const r of rows) {
    const v = byUser.get(r.userId);
    if (v) v.editing ||= r.editing;
    else byUser.set(r.userId, { name: r.name, role: roleOf(r.userId), editing: r.editing, since: r.since.toISOString(), self: r.userId === userId });
  }
  return [...byUser.values()];
}

/** 화면을 닫을 때 */
export async function leave(db: Db, doc: string, tab: string) {
  if (!validDoc(doc) || !validTab(tab)) return;
  await db.delete(editPresence).where(and(eq(editPresence.doc, doc), eq(editPresence.tab, tab)));
}
