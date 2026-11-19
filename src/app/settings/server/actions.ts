"use server";
// 설정 › 서버: 지금 새 버전 올리기(대표)
import { redirect } from "next/navigation";
import { getDb } from "@/db/runtime";
import { requestUpdate } from "@/modules/platform/server-ops";
import { errorUrl, noticeUrl, requireUser, userMessage } from "../../_lib/session";

export async function requestUpdateAction() {
  const user = await requireUser();
  try {
    await requestUpdate(await getDb(), user);
  } catch (e) {
    redirect(errorUrl("/settings/server", userMessage(e)));
  }
  redirect(noticeUrl("/settings/server", "요청했습니다. 서버가 1분 안에 받아 새 버전을 만들기 시작합니다(5~10분). 바꿔 끼우는 몇 초 동안 앱이 끊깁니다"));
}
