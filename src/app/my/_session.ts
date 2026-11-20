// 내 차 수첩 손님 로그인(쿠키). 직원 로그인(abs_session)과 따로다. 권한 판단은 모두 서버(modules/carbook)에서 한다.
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/db/runtime";
import { sessionOf, type MySession } from "@/modules/carbook/service";
import { COOKIE } from "@/modules/carbook/rules";

export async function mySession(): Promise<MySession | null> {
  return sessionOf(await getDb(), (await cookies()).get(COOKIE)?.value);
}

/** 들어오지 않았으면 들어가기 화면으로. full 을 주면 문자 인증 로그인만(링크 로그인은 인증 화면으로) */
export async function requireMy(full = false): Promise<MySession> {
  const s = await mySession();
  if (!s) redirect("/my/login");
  if (full && s.scope !== "full") redirect("/my/login?more=1");
  return s;
}

export async function setMyCookie(token: string, days: number) {
  // 카카오톡 안 브라우저에서도 남도록 lax. 글자 그대로의 토큰은 이 쿠키에만 있다(DB 에는 해시)
  (await cookies()).set(COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: days * 86400 });
}

export async function myToken() {
  return (await cookies()).get(COOKIE)?.value;
}

export async function clearMyCookie() {
  (await cookies()).delete(COOKIE);
}
