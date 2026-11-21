"use server";
import { redirect } from "next/navigation";
import { getDb } from "@/db/runtime";
import { requestPurge } from "@/modules/quality/retention";
import { errorUrl, noticeUrl, requireUser, userMessage } from "../../_lib/session";

/** 파기 결재 올리기(대표가 올리면 바로 승인되어 지워진다) */
export async function requestPurgeAction(form: FormData) {
  const user = await requireUser();
  let doc: Awaited<ReturnType<typeof requestPurge>>;
  try {
    doc = await requestPurge(await getDb(), user, String(form.get("reason") ?? ""));
  } catch (e) {
    redirect(errorUrl("/records/purge", userMessage(e)));
  }
  redirect(noticeUrl(`/approvals/${doc.id}`, user.roles.includes("owner") ? `${doc.docNo} 승인되어 지웠습니다` : `${doc.docNo} 파기 결재를 대표에게 올렸습니다`));
}
