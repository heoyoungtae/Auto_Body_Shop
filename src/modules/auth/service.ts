// 사내 직원 로그인·세션·계정 관리 — 앱 설계서 9.1. 화면(쿠키)은 src/app/_lib/session.ts 가 맡는다.
// 거래처·고객 로그인은 1·2차에서 더한다(고객은 수리 건별 링크 + 문자 인증번호).
import { UserError } from "@/modules/platform/errors";
import { and, desc, eq, gt, inArray, ne } from "drizzle-orm";
import type { Db } from "@/db/client";
import { appUser, auditLog, session, userRole } from "@/db/schema";
import { writeAudit } from "../platform/audit";
import { loadPolicy } from "../platform/policy";
import { randomInt } from "node:crypto";
import { decrypt, encrypt, hashSecret, randomToken, sha256, verifySecret } from "./crypto";
import { isRole, type Role } from "./roles";

const SESSION_MS = 12 * 3600_000;
export const MIN_PASSWORD = 8;

export type Meta = { ip?: string | null; userAgent?: string | null };
export type CurrentUser = { id: string; name: string; loginId: string; roles: Role[]; mustChangePassword?: boolean; sessionHash?: string };

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
  const ok = verifySecret(password, user.passwordHash);
  if (ok && user.mustChangePassword && user.tempPasswordUntil && user.tempPasswordUntil < now) {
    await writeAudit(db, { actorId: user.id, action: "auth.temp_expired", entityType: "user", entityId: user.id, ...meta });
    throw new AuthError("임시 비밀번호 기한이 지났습니다. 대표에게 임시 비밀번호를 다시 받아 주세요");
  }
  if (!ok) {
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
  await db.update(appUser).set({ failedLogins: 0, lockedUntil: null, lastLoginAt: now }).where(eq(appUser.id, user.id));
  await writeAudit(db, { actorId: user.id, action: "auth.login", entityType: "user", entityId: user.id, ...meta });
  return token;
}

export async function getCurrentUser(db: Db, token: string | undefined | null, now = new Date()): Promise<CurrentUser | null> {
  if (!token) return null;
  const hash = sha256(token);
  const [row] = await db
    .select({ id: appUser.id, name: appUser.name, loginId: appUser.loginId, active: appUser.active, retiredOn: appUser.retiredOn, must: appUser.mustChangePassword, seen: session.lastSeenAt })
    .from(session)
    .innerJoin(appUser, eq(appUser.id, session.userId))
    .where(and(eq(session.tokenHash, hash), gt(session.expiresAt, now)));
  if (!row || !row.active || row.retiredOn) return null;
  // 접속 현황용: 마지막으로 연 때(5분에 한 번만 적는다)
  if (!row.seen || now.getTime() - row.seen.getTime() > 5 * 60_000) await db.update(session).set({ lastSeenAt: now }).where(eq(session.tokenHash, hash));
  const roles = await db.select({ role: userRole.role }).from(userRole).where(eq(userRole.userId, row.id));
  return { id: row.id, name: row.name, loginId: row.loginId, roles: roles.map((r) => r.role), mustChangePassword: row.must, sessionHash: hash };
}

export async function logout(db: Db, token: string | undefined | null) {
  if (token) await db.delete(session).where(eq(session.tokenHash, sha256(token)));
}

/** password 를 비우면 앱이 임시 비밀번호를 만들고, 첫 로그인 때 새 비밀번호를 정하게 한다 */
export type NewUser = { loginId: string; name: string; password?: string; roles: string[]; phone?: string | null; pendingRoles?: boolean };

// 헷갈리는 글자(l·o·i, 0·1)는 빼고 소리 내어 불러 주기 쉬운 영문 4자 + 숫자 4자
const TEMP_LETTERS = "abcdefghjkmnpqrstuvwxyz";
const TEMP_DIGITS = "23456789";
export function makeTempPassword(): string {
  const pick = (set: string, n: number) => Array.from({ length: n }, () => set[randomInt(set.length)]).join("");
  return `${pick(TEMP_LETTERS, 4)}${pick(TEMP_DIGITS, 4)}`;
}

async function tempFields(db: Db, now: Date) {
  const temp = makeTempPassword();
  const days = (await loadPolicy(db))["auth.temp_password_days"];
  return { temp, set: { passwordHash: hashSecret(temp), mustChangePassword: true, tempPasswordEnc: encrypt(temp), tempPasswordUntil: new Date(now.getTime() + days * 86_400_000) } };
}

export async function createUser(db: Db, actorId: string | null, input: NewUser, now = new Date()): Promise<string> {
  const loginId = normLogin(input.loginId);
  if (!/^[a-z0-9._-]{3,30}$/.test(loginId)) throw new AuthError("아이디는 영문 소문자·숫자 3~30자로 정해 주세요");
  if (!input.name.trim()) throw new AuthError("이름을 적어 주세요");
  if (input.password) checkPassword(input.password);
  const roles = input.roles.filter(isRole);
  if (!roles.length && !input.pendingRoles) throw new AuthError("역할을 하나 이상 고르세요");
  const [exists] = await db.select({ id: appUser.id }).from(appUser).where(eq(appUser.loginId, loginId));
  if (exists) throw new AuthError("이미 있는 아이디입니다");
  const pw = input.password ? { passwordHash: hashSecret(input.password) } : (await tempFields(db, now)).set;
  return db.transaction(async (tx) => {
    const [u] = await tx
      .insert(appUser)
      .values({ loginId, name: input.name.trim(), ...pw, phoneEnc: input.phone ? encrypt(input.phone) : null, active: roles.length > 0 })
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
  if (current === next) throw new AuthError("지금 비밀번호와 다른 비밀번호로 정해 주세요");
  await db.update(appUser).set({ passwordHash: hashSecret(next), mustChangePassword: false, tempPasswordEnc: null, tempPasswordUntil: null }).where(eq(appUser.id, userId));
  await writeAudit(db, { actorId: userId, action: "user.password", entityType: "user", entityId: userId });
}

/** 첫 로그인(임시 비밀번호로 들어옴): 지금 비밀번호를 다시 묻지 않고 새 비밀번호만 정한다 */
export async function setFirstPassword(db: Db, userId: string, next: string) {
  const [u] = await db.select().from(appUser).where(eq(appUser.id, userId));
  if (!u?.mustChangePassword) throw new AuthError("이미 비밀번호를 정했습니다. 바꾸려면 내 계정에서 바꿉니다");
  checkPassword(next);
  if (verifySecret(next, u.passwordHash)) throw new AuthError("임시 비밀번호와 다른 비밀번호로 정해 주세요");
  await db.update(appUser).set({ passwordHash: hashSecret(next), mustChangePassword: false, tempPasswordEnc: null, tempPasswordUntil: null }).where(eq(appUser.id, userId));
  await writeAudit(db, { actorId: userId, action: "user.password_first", entityType: "user", entityId: userId });
}

/** 대표가 임시 비밀번호를 새로 발급한다(분실·기한 지남). 로그인된 기기는 모두 끊고, 다음 로그인 때 새 비밀번호를 정하게 한다 */
export async function resetPassword(db: Db, actorId: string, userId: string, now = new Date()) {
  const { temp, set } = await tempFields(db, now);
  await db.transaction(async (tx) => {
    await tx.update(appUser).set({ ...set, failedLogins: 0, lockedUntil: null }).where(eq(appUser.id, userId));
    await tx.delete(session).where(eq(session.userId, userId));
    await writeAudit(tx, { actorId, action: "user.password_reset", entityType: "user", entityId: userId });
  });
  return temp;
}

/** 아직 쓰지 않은 임시 비밀번호(대표·회계가 다시 알려 줄 때) */
export async function tempPasswordOf(db: Db, userId: string) {
  const [u] = await db.select({ enc: appUser.tempPasswordEnc, until: appUser.tempPasswordUntil, must: appUser.mustChangePassword }).from(appUser).where(eq(appUser.id, userId));
  if (!u?.must || !u.enc) return null;
  return { password: decrypt(u.enc), until: u.until };
}

// ── 로그인 계정 관리(접속 현황·기기 끊기) ──

/** 사용자 에이전트를 사람이 읽는 기기 이름으로(대략) */
export function deviceLabel(ua: string | null | undefined): string {
  if (!ua) return "알 수 없는 기기";
  const os = /iPhone/.test(ua) ? "아이폰" : /iPad/.test(ua) ? "아이패드" : /Android/.test(ua) ? (/Mobile/.test(ua) ? "안드로이드 휴대폰" : "안드로이드 태블릿") : /Windows/.test(ua) ? "윈도 PC" : /Mac OS X|Macintosh/.test(ua) ? "맥" : /Linux/.test(ua) ? "리눅스" : "기타 기기";
  const br = /SamsungBrowser/.test(ua) ? "삼성 인터넷" : /Whale/.test(ua) ? "웨일" : /Edg\//.test(ua) ? "엣지" : /KAKAOTALK/i.test(ua) ? "카카오톡" : /Chrome\//.test(ua) ? "크롬" : /Firefox\//.test(ua) ? "파이어폭스" : /Safari\//.test(ua) ? "사파리" : "브라우저";
  return `${os} · ${br}`;
}

export type SessionView = { id: string; device: string; ip: string | null; createdAt: Date; lastSeenAt: Date | null; expiresAt: Date; current: boolean };

export async function sessionsOf(db: Db, userIds: string[], currentHash?: string, now = new Date()) {
  if (!userIds.length) return new Map<string, SessionView[]>();
  const rows = await db.select().from(session).where(and(inArray(session.userId, userIds), gt(session.expiresAt, now))).orderBy(desc(session.createdAt));
  const out = new Map<string, SessionView[]>();
  for (const r of rows)
    out.set(r.userId, [...(out.get(r.userId) ?? []), { id: r.tokenHash.slice(0, 16), device: deviceLabel(r.userAgent), ip: r.ip, createdAt: r.createdAt, lastSeenAt: r.lastSeenAt, expiresAt: r.expiresAt, current: r.tokenHash === currentHash }]);
  return out;
}

/** 최근 로그인 기록(성공·실패·잠김), 사람마다 몇 건 */
export async function loginHistory(db: Db, userIds: string[], per = 5) {
  if (!userIds.length) return new Map<string, { at: Date; action: string; ip: string | null; device: string }[]>();
  const rows = await db
    .select()
    .from(auditLog)
    .where(and(eq(auditLog.entityType, "user"), inArray(auditLog.entityId, userIds), inArray(auditLog.action, ["auth.login", "auth.login_failed", "auth.locked", "auth.temp_expired"])))
    .orderBy(desc(auditLog.at))
    .limit(per * userIds.length * 3);
  const out = new Map<string, { at: Date; action: string; ip: string | null; device: string }[]>();
  for (const r of rows) {
    const list = out.get(r.entityId!) ?? [];
    if (list.length < per) list.push({ at: r.at, action: r.action, ip: r.ip, device: deviceLabel(r.userAgent) });
    out.set(r.entityId!, list);
  }
  return out;
}

/** 기기 하나(id = 토큰 해시 앞 16자) 또는 전부 로그아웃. 본인은 지금 쓰는 기기를 빼고 끊는다 */
export async function endSessions(db: Db, actorId: string, userId: string, which: string | "all", keepHash?: string) {
  const rows = await db.select({ h: session.tokenHash }).from(session).where(eq(session.userId, userId));
  const target = rows.map((r) => r.h).filter((h) => (which === "all" || h.startsWith(which)) && h !== keepHash);
  if (!target.length) throw new AuthError("끊을 기기가 없습니다");
  await db.delete(session).where(and(eq(session.userId, userId), inArray(session.tokenHash, target), ...(keepHash ? [ne(session.tokenHash, keepHash)] : [])));
  await writeAudit(db, { actorId, action: "user.logout_devices", entityType: "user", entityId: userId, after: { count: target.length } });
  return target.length;
}

export async function listUsers(db: Db) {
  const users = await db.select().from(appUser).orderBy(appUser.createdAt);
  const roles = await db.select().from(userRole);
  return users.map((u) => ({ ...u, roles: roles.filter((r) => r.userId === u.id).map((r) => r.role) }));
}
