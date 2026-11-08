"use server";
import { redirect } from "next/navigation";
import { getDb } from "@/db/runtime";
import { acceptConsentRequest } from "@/modules/customer/service";
import { errorUrl, requestMeta, userMessage } from "../../_lib/session";

/** 고객이 링크에서 동의(로그인 없음). 토큰이 곧 권한이다 */
export async function acceptConsentAction(form: FormData) {
  const token = String(form.get("token") ?? "");
  const c = form.getAll("consent").map(String);
  const choice = { required: c.includes("required"), photo: c.includes("photo"), marketing: c.includes("marketing") };
  try {
    await acceptConsentRequest(await getDb(), token, choice, { ip: (await requestMeta()).ip });
  } catch (e) {
    redirect(errorUrl(`/consent/${token}`, userMessage(e)));
  }
  redirect(`/consent/${token}?done=${choice.required ? "yes" : "no"}`);
}
