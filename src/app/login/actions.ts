"use server";
import { redirect } from "next/navigation";
import { getDb } from "@/db/runtime";
import { loginWithPassword, logout } from "@/modules/auth/service";
import { clearSessionCookie, errorUrl, requestMeta, sessionToken, setSessionCookie, userMessage } from "../_lib/session";

export async function loginAction(form: FormData) {
  let token: string;
  try {
    token = await loginWithPassword(await getDb(), String(form.get("loginId") ?? ""), String(form.get("password") ?? ""), await requestMeta());
  } catch (e) {
    redirect(errorUrl("/login", userMessage(e)));
  }
  await setSessionCookie(token);
  redirect("/home");
}

export async function logoutAction() {
  await logout(await getDb(), await sessionToken());
  await clearSessionCookie();
  redirect("/login");
}
