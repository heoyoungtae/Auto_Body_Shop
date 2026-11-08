// 사내 직원 로그인·세션·계정 관리 — 앱 설계서 9.1. 화면(쿠키)은 src/app/_lib/session.ts 가 맡는다.
// 거래처·고객 로그인은 1·2차에서 더한다(고객은 수리 건별 링크 + 문자 인증번호).
import { UserError } from "@/modules/platform/errors";
import { and, eq, gt } from "drizzle-orm";
import type { Db } from "@/db/client";
import { appUser, session, userRole } from "@/db/schema";
import { writeAudit } from "../platform/audit";
import { loadPolicy } from "../platform/policy";
import { encrypt, hashSecret, randomToken, sha256, verifySecret } from "./crypto";
import { isRole, type Role } from "./roles";

const SESSION_MS = 12 * 3600_000;
export const MIN_PASSWORD = 8;

export type Meta = { ip?: string | null; userAgent?: string | null };
export type CurrentUser = { id: string; name: string; loginId: string; roles: Role[] };

export class AuthError extends UserError {}

const normLogin = (v: string) => v.trim().toLowerCase();

function checkPassword(pw: string) {
  if (pw.length < MIN_PASSWORD) throw new AuthError(`비밀번호는 ${MIN_PASSWORD}자 이상이어야 합니다`);
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) throw new AuthError("비밀번호에 영문과 숫자를 함께 넣어 주세요");
}

export async function loginWithPassword(db: Db, loginId: string, password: string, meta: Meta = {}, now = new Date()): Promise<string> {
  const [user] = await db.select().from(appUser).where(eq(appUser.loginId, normLogin(loginId)));
  const fail = new AuthError("아이디 또는 비밀번호가 맞지 않습니다");
  if (!user || !user.active || user.retiredOn) throw fail;
  if (user.lockedUntil && user.lockedUntil > now) {
    throw new AuthError(`로그인 실패가 많아 잠겼습니다. ${user.lockedUntil.toLocaleTimeString("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit" })} 이후 다시 시도해 주세요`);
  }
  if (!verifySecret(password, user.passwordHash)) {
    const policy = await loadPolicy(db);
    const failed = user.failedLogins + 1;
    const lock = failed >= policy["auth.lock_attempts"];
    await db
      .update(appUser)
      .set({ failedLogins: lock ? 0 : failed, lockedUntil: lock ? new Date(now.getTime() + policy["auth.lock_minutes"] * 60_000) : user.lockedUntil })
      .where(eq(appUser.id, user.id));
    await writeAudit(db, { actorId: user.id, action: lock ? "auth.locked" : "auth.login_failed", entityType: "user", entityId: user.id, ...meta });
    throw fail;
  }
  const token = randomToken();
  await db.insert(session).values({ tokenHash: sha256(token), userId: user.id, expiresAt: new Date(now.getTime() + SESSION_MS), ip: meta.ip ?? null, userAgent: meta.userAgent ?? null });
  await db.update(appUser).set({ failedLogins: 0, lockedUntil: null }).where(eq(appUser.id, user.id));
  await writeAudit(db, { actorId: user.id, action: "auth.login", entityType: "user", entityId: user.id, ...meta });
  return token;
}

export async function getCurrentUser(db: Db, token: string | undefined | null, now = new Date()): Promise<CurrentUser | null> {
  if (!token) return null;
  const [row] = await db
    .select({ id: appUser.id, name: appUser.name, loginId: appUser.loginId, active: appUser.active, retiredOn: appUser.retiredOn })
    .from(session)
    .innerJoin(appUser, eq(appUser.id, session.userId))
    .where(and(eq(session.tokenHash, sha256(token)), gt(session.expiresAt, now)));
  if (!row || !row.active || row.retiredOn) return null;
  const roles = await db.select({ role: userRole.role }).from(userRole).where(eq(userRole.userId, row.id));
  return { id: row.id, name: row.name, loginId: row.loginId, roles: roles.map((r) => r.role) };
}

export async function logout(db: Db, token: string | undefined | null) {
  if (token) await db.delete(session).where(eq(session.tokenHash, sha256(token)));
}

export type NewUser = { loginId: string; name: string; password: string; roles: string[]; phone?: string | null; pendingRoles?: boolean };

export async function createUser(db: Db, actorId: string | null, input: NewUser): Promise<string> {
  const loginId = normLogin(input.loginId);
  if (!/^[a-z0-9._-]{3,30}$/.test(loginId)) throw new AuthError("아이디는 영문 소문자·숫자 3~30자로 정해 주세요");
  if (!input.name.trim()) throw new AuthError("이름을 적어 주세요");
  checkPassword(input.password);
  const roles = input.roles.filter(isRole);
  if (!roles.length && !input.pendingRoles) throw new AuthError("역할을 하나 이상 고르세요");
  const [exists] = await db.select({ id: appUser.id }).from(appUser).where(eq(appUser.loginId, loginId));
  if (exists) throw new AuthError("이미 있는 아이디입니다");
  return db.transaction(async (tx) => {
    const [u] = await tx
      .insert(appUser)
      .values({ loginId, name: input.name.trim(), passwordHash: hashSecret(input.password), phoneEnc: input.phone ? encrypt(input.phone) : null, active: roles.length > 0 })
      .returning({ id: appUser.id });
    if (roles.length) await tx.insert(userRole).values(roles.map((role) => ({ userId: u.id, role })));
    await writeAudit(tx, { actorId, action: "user.create", entityType: "user", entityId: u.id, after: { loginId, roles } });
    return u.id;
  });
}

export async function setRoles(db: Db, actorId: string, userId: string, rolesIn: string[]) {
  const roles = rolesIn.filter(isRole);
  if (!roles.length) throw new AuthError("역할을 하나 이상 고르세요");
  const before = await db.select({ role: userRole.role }).from(userRole).where(eq(userRole.userId, userId));
  if (before.some((r) => r.role === "owner") && !roles.includes("owner")) {
    const owners = await db.select({ userId: userRole.userId }).from(userRole).where(eq(userRole.role, "owner"));
    if (owners.length <= 1) throw new AuthError("대표 역할을 가진 사람이 한 명은 있어야 합니다");
  }
  await db.transaction(async (tx) => {
    await tx.delete(userRole).where(eq(userRole.userId, userId));
    await tx.insert(userRole).values(roles.map((role) => ({ userId, role })));
    // 회계 담당이 등록해 역할을 기다리던 계정은 역할을 받으면 바로 쓸 수 있게 연다
    if (!before.length) await tx.update(appUser).set({ active: true }).where(eq(appUser.id, userId));
    await writeAudit(tx, { actorId, action: "user.roles", entityType: "user", entityId: userId, before: before.map((r) => r.role), after: roles });
  });
}

export async function setActive(db: Db, actorId: string, userId: string, active: boolean) {
  if (actorId === userId && !active) throw new AuthError("본인 계정은 잠글 수 없습니다");
  await db.transaction(async (tx) => {
    await tx.update(appUser).set({ active, failedLogins: 0, lockedUntil: null }).where(eq(appUser.id, userId));
    if (!active) await tx.delete(session).where(eq(session.userId, userId));
    await writeAudit(tx, { actorId, action: active ? "user.activate" : "user.deactivate", entityType: "user", entityId: userId });
  });
}

export async function changePassword(db: Db, userId: string, current: string, next: string) {
  const [u] = await db.select().from(appUser).where(eq(appUser.id, userId));
  if (!u || !verifySecret(current, u.passwordHash)) throw new AuthError("현재 비밀번호가 맞지 않습니다");
  checkPassword(next);
  await db.update(appUser).set({ passwordHash: hashSecret(next) }).where(eq(appUser.id, userId));
  await writeAudit(db, { actorId: userId, action: "user.password", entityType: "user", entityId: userId });
}

/** 대표가 직원 비밀번호를 새로 정해 준다(분실 시) */
export async function resetPassword(db: Db, actorId: string, userId: string, next: string) {
  checkPassword(next);
  await db.transaction(async (tx) => {
    await tx.update(appUser).set({ passwordHash: hashSecret(next), failedLogins: 0, lockedUntil: null }).where(eq(appUser.id, userId));
    await tx.delete(session).where(eq(session.userId, userId));
    await writeAudit(tx, { actorId, action: "user.password_reset", entityType: "user", entityId: userId });
  });
}

export async function listUsers(db: Db) {
  const users = await db.select().from(appUser).orderBy(appUser.createdAt);
  const roles = await db.select().from(userRole);
  return users.map((u) => ({ ...u, roles: roles.filter((r) => r.userId === u.id).map((r) => r.role) }));
}
