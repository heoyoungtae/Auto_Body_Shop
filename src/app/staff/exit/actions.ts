"use server";
// 퇴직 처리 점검표(F-11-07) 화면의 서버 동작
import { redirect } from "next/navigation";
import { getDb } from "@/db/runtime";
import {
  checkExitItem,
  closeExit,
  lockExitAccount,
  startExit,
} from "@/modules/staff/exit";
import {
  errorUrl,
  noticeUrl,
  requireUser,
  userMessage,
} from "../../_lib/session";

const str = (form: FormData) => (k: string) => String(form.get(k) ?? "").trim();

export async function startExitAction(form: FormData) {
  const user = await requireUser();
  const s = str(form);
  let id = "";
  try {
    id = await startExit(await getDb(), user, {
      userId: s("userId"),
      leftOn: s("leftOn"),
      reason: s("reason"),
      noticeOn: s("noticeOn"),
    });
  } catch (e) {
    redirect(errorUrl("/staff/exit", userMessage(e)));
  }
  redirect(
    noticeUrl(
      `/staff/exit/${id}`,
      "퇴직 점검표를 열고 공장장에게 반납·인계를 알렸습니다",
    ),
  );
}

export async function exitAction(form: FormData) {
  const user = await requireUser();
  const s = str(form);
  const id = s("id");
  const back = `/staff/exit/${id}`;
  let msg = "확인했습니다";
  try {
    const db = await getDb();
    const intent = s("intent");
    if (intent === "check")
      await checkExitItem(db, user, id, s("key"), s("note"));
    else if (intent === "lock") {
      await lockExitAccount(db, user, id);
      msg = "계정을 잠갔습니다";
    } else if (intent === "close") {
      await closeExit(db, user, id);
      msg = "퇴직 처리를 마쳤습니다";
    }
  } catch (e) {
    redirect(errorUrl(back, userMessage(e)));
  }
  redirect(noticeUrl(back, msg));
}
