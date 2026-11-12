"use server";
import { redirect } from "next/navigation";
import { getDb } from "@/db/runtime";
import { getCurrentUser, loginWithPassword, logout } from "@/modules/auth/service";
import { clearSessionCookie, errorUrl, requestMeta, sessionToken, setSessionCookie, userMessage } from "../_lib/session";

export async function loginAction(form: FormData) {
  let token: string;
  try {
    token = await loginWithPassword(await getDb(), String(form.get("loginId") ?? ""), String(form.get("password") ?? ""), await requestMeta());
  } catch (e) {
    redirect(errorUrl("/login", userMessage(e)));
  }
  await setSessionCookie(token);
  // 첫 로그인(임시 비밀번호)이면 새 비밀번호부터 정한다
  const u = await getCurrentUser(await getDb(), token);
  redirect(u?.mustChangePassword ? "/account/first" : "/home");
}

export async function logoutAction() {
  await logout(await getDb(), await sessionToken());
  await clearSessionCookie();
  redirect("/login");
}
