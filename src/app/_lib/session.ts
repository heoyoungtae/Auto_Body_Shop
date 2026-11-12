// 화면 계층의 세션 처리(쿠키). 권한 판단은 모두 서버에서 한다(설계서 9.1).
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/db/runtime";
import type { Role } from "@/modules/auth/roles";
import { getCurrentUser, type CurrentUser, type Meta } from "@/modules/auth/service";
import { UserError } from "@/modules/platform/errors";

export const SESSION_COOKIE = "abs_session";

export async function currentUser(): Promise<CurrentUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return getCurrentUser(await getDb(), token);
}

/** 로그인하지 않았으면 로그인 화면으로. roles 를 주면 그중 하나가 있어야 한다 */
export async function requireUser(roles?: Role[]): Promise<CurrentUser> {
  const user = await currentUser();
  if (!user) redirect("/login");
  // 임시 비밀번호로 들어왔으면 새 비밀번호를 정하기 전에는 다른 화면을 열 수 없다
  if (user.mustChangePassword) redirect("/account/first");
  if (roles && !user.roles.some((r) => roles.includes(r))) redirect(`/home?error=${encodeURIComponent("권한이 없습니다")}`);
  return user;
}

export const requireOwner = () => requireUser(["owner"]);

export async function setSessionCookie(token: string) {
  (await cookies()).set(SESSION_COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 12 * 3600 });
}

export async function sessionToken() {
  return (await cookies()).get(SESSION_COOKIE)?.value;
}

export async function clearSessionCookie() {
  (await cookies()).delete(SESSION_COOKIE);
}

export async function requestMeta(): Promise<Meta> {
  const h = await headers();
  return { ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null, userAgent: h.get("user-agent") };
}

export function errorUrl(path: string, message: string) {
  return `${path}${path.includes("?") ? "&" : "?"}error=${encodeURIComponent(message)}`;
}

export function noticeUrl(path: string, message: string) {
  return `${path}${path.includes("?") ? "&" : "?"}notice=${encodeURIComponent(message)}`;
}

/** 서비스 오류(사람이 읽을 메시지)만 화면에 보여 준다. 그 밖의 오류는 그대로 던진다 */
export function userMessage(e: unknown): string {
  if (e instanceof UserError) return e.message;
  throw e;
}
