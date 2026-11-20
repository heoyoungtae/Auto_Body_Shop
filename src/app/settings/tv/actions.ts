"use server";
// TV 링크 만들기·끊기(대표)
import { redirect } from "next/navigation";
import { getDb } from "@/db/runtime";
import { issueTvToken, revokeTvToken } from "@/modules/dashboard/tv";
import { errorUrl, noticeUrl, requireUser, userMessage } from "../../_lib/session";

export async function tvLinkAction(form: FormData) {
  const user = await requireUser();
  const db = await getDb();
  let msg = "";
  try {
    // board=techbay 는 테크베이용 현황판 링크(열쇠 따로)
    const kind = form.get("board") === "techbay" ? "techbay" : "all";
    const name = kind === "techbay" ? "테크베이용 TV 링크" : "TV 링크";
    if (form.get("intent") === "revoke") {
      await revokeTvToken(db, user, new Date(), kind);
      msg = `${name}를 끊었습니다. 그 링크로 띄운 TV는 더 이상 새 값을 받지 못합니다`;
    } else {
      await issueTvToken(db, user, new Date(), kind);
      msg = `${name}를 만들었습니다. 예전 링크로 띄운 TV가 있으면 새 링크로 다시 여세요`;
    }
  } catch (e) {
    redirect(errorUrl("/settings/tv", userMessage(e)));
  }
  redirect(noticeUrl("/settings/tv", msg));
}
