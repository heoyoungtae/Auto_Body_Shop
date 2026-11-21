"use server";
// 설정 › 홈페이지 저장(대표)
import { redirect } from "next/navigation";
import { getDb } from "@/db/runtime";
import { saveSiteConfig } from "@/modules/site/service";
import { errorUrl, noticeUrl, requireUser, userMessage } from "../../_lib/session";

export async function saveSiteAction(form: FormData) {
  const user = await requireUser(["owner"]);
  const g = (k: string) => String(form.get(k) ?? "");
  try {
    await saveSiteConfig(await getDb(), user, {
      requests: form.get("requests") === "on",
      headline: g("headline"),
      lead: g("lead"),
      openOn: g("openOn"),
      about: g("about"),
      hours: g("hours"),
      kakao: g("kakao"),
      privacyOfficer: g("privacyOfficer"),
      privacyContact: g("privacyContact"),
      privacyFrom: g("privacyFrom"),
      insurers: g("insurers"),
      verifyNaver: g("verifyNaver"),
      verifyGoogle: g("verifyGoogle"),
    });
  } catch (e) {
    redirect(errorUrl("/settings/site", userMessage(e)));
  }
  redirect(noticeUrl("/settings/site", "저장했습니다. 홈페이지에 바로 보입니다"));
}
