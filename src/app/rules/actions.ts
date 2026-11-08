"use server";
// 취업규칙 확인 서명
import { redirect } from "next/navigation";
import { getDb } from "@/db/runtime";
import { ackRules } from "@/modules/staff/documents";
import { errorUrl, noticeUrl, requireUser, userMessage } from "../_lib/session";

export async function ackRulesAction(form: FormData) {
  const user = await requireUser();
  const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(String(form.get("signature") ?? ""));
  try {
    await ackRules(await getDb(), user, m ? new Uint8Array(Buffer.from(m[1], "base64")) : null);
  } catch (e) {
    redirect(errorUrl("/rules", userMessage(e)));
  }
  redirect(noticeUrl("/rules", "확인 서명을 남겼습니다. 서명한 확인서는 '계약서·서약서'에서 볼 수 있습니다"));
}
