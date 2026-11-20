"use server";
// 설정 › 서버: 지금 새 버전 올리기(대표)
import { redirect } from "next/navigation";
import { getDb } from "@/db/runtime";
import { requestUpdate, setAutoUpdate } from "@/modules/platform/server-ops";
import { errorUrl, noticeUrl, requireUser, userMessage } from "../../_lib/session";

export async function requestUpdateAction() {
  const user = await requireUser();
  try {
    await requestUpdate(await getDb(), user);
  } catch (e) {
    redirect(errorUrl("/settings/server", userMessage(e)));
  }
  // 안내는 화면의 진행 칸('요청함'·'올리는 중'·완료)이 맡는다. 주소에 안내를 붙이면 끝난 뒤에도 남아서 붙이지 않는다(대표 2026-11-20)
  redirect("/settings/server");
}

/** 자동 올리기 켜기·끄기와 시각(대표) */
export async function setAutoUpdateAction(form: FormData) {
  const user = await requireUser();
  let msg = "";
  try {
    const a = await setAutoUpdate(await getDb(), user, { on: form.get("on") === "on", time: String(form.get("time") ?? "") });
    msg = a.on ? `저장했습니다. 매일 ${a.time}에 새 버전이 있으면 저절로 올립니다(서버가 1분 안에 받아 갑니다)` : "저장했습니다. 자동 올리기를 껐습니다. 새 버전은 '지금 새 버전 올리기'로만 올라갑니다";
  } catch (e) {
    redirect(errorUrl("/settings/server", userMessage(e)));
  }
  redirect(noticeUrl("/settings/server", msg));
}
