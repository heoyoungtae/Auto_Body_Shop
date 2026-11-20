"use server";
// 내 차 수첩: 설정 저장(대표), 고객 초대 문자, 고객에게 보일 사진 고르기
import { redirect } from "next/navigation";
import { getDb } from "@/db/runtime";
import { saveCarbookConfig, sendInvite, setHiddenPhotos } from "@/modules/carbook/service";
import { errorUrl, noticeUrl, requireUser, userMessage } from "../../_lib/session";

export async function saveCarbookAction(form: FormData) {
  const user = await requireUser(["owner"]);
  try {
    await saveCarbookConfig(await getDb(), user, { enabled: form.get("enabled") === "on", hours: String(form.get("hours") ?? ""), notice: String(form.get("notice") ?? "") });
  } catch (e) {
    redirect(errorUrl("/settings/carbook", userMessage(e)));
  }
  redirect(noticeUrl("/settings/carbook", "저장했습니다"));
}

export async function inviteCarbookAction(form: FormData) {
  const user = await requireUser();
  const id = String(form.get("customerId") ?? "");
  let msg: string;
  try {
    const r = await sendInvite(await getDb(), user, id);
    msg = r.demo ? `시연 모드라 실제 문자는 가지 않았습니다. 링크: ${r.url}` : "내 차 수첩 초대 문자를 보냈습니다(링크 90일 유효)";
  } catch (e) {
    redirect(errorUrl(`/customers/${id}`, userMessage(e)));
  }
  redirect(noticeUrl(`/customers/${id}`, msg));
}

export async function hidePhotosAction(form: FormData) {
  const user = await requireUser();
  const roId = String(form.get("roId") ?? "");
  const shown = new Set(form.getAll("show").map(String));
  const all = form.getAll("all").map(String);
  try {
    await setHiddenPhotos(await getDb(), user, roId, all.filter((p) => !shown.has(p)));
  } catch (e) {
    redirect(errorUrl(`/repairs/${roId}`, userMessage(e)));
  }
  redirect(noticeUrl(`/repairs/${roId}`, "고객에게 보일 사진을 저장했습니다"));
}
