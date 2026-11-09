"use server";
// 문자 발송·문구 서식 화면의 서버 동작
import { redirect } from "next/navigation";
import { getDb } from "@/db/runtime";
import { can } from "@/modules/auth/permissions";
import { removeTemplate, saveTemplate, sendMessages, type Scope } from "@/modules/messaging/bulk";
import { UserError } from "@/modules/platform/errors";
import { errorUrl, noticeUrl, requireUser, userMessage } from "../_lib/session";

const str = (form: FormData) => (k: string) => String(form.get(k) ?? "").trim();

async function staff() {
  const user = await requireUser();
  if (!can(user, "consult.write")) throw new UserError("문자 발송은 상담원·공장장·대표가 합니다");
  return user;
}

export async function sendSmsAction(form: FormData) {
  const s = str(form);
  const qs = new URLSearchParams({ scope: s("scope"), purpose: s("purpose"), cid: s("cid"), months: s("months"), t: s("t") }).toString();
  const back = `/messages/send?${qs}`;
  let msg = "";
  try {
    const user = await staff();
    const scope: Scope = s("scope") === "one" ? { kind: "one", customerId: s("cid") } : s("scope") === "delivered" ? { kind: "delivered", months: Number(s("months")) || 6 } : { kind: "all" };
    const r = await sendMessages(await getDb(), user.id, { scope, purpose: s("purpose"), body: String(form.get("body") ?? ""), expected: Number(s("expected")) });
    msg = `${r.count}명에게 보냈습니다(성공 ${r.ok}${r.failed ? `, 실패 ${r.failed}: ${r.errors.join(", ")}` : ""})${r.demo ? " — 데모 상태라 실제로 나가지 않았습니다" : ""}. 발송 이력에서 확인합니다`;
  } catch (e) {
    redirect(errorUrl(back, userMessage(e)));
  }
  redirect(noticeUrl("/messages/log", msg));
}

export async function saveTemplateAction(form: FormData) {
  const s = str(form);
  try {
    const user = await staff();
    await saveTemplate(await getDb(), user.id, { id: s("id") || undefined, title: s("title"), purpose: s("purpose"), body: String(form.get("body") ?? "") });
  } catch (e) {
    redirect(errorUrl("/messages/templates", userMessage(e)));
  }
  redirect(noticeUrl("/messages/templates", `'${s("title")}' 서식을 저장했습니다`));
}

export async function removeTemplateAction(form: FormData) {
  const s = str(form);
  try {
    const user = await staff();
    await removeTemplate(await getDb(), user.id, s("id"));
  } catch (e) {
    redirect(errorUrl("/messages/templates", userMessage(e)));
  }
  redirect(noticeUrl("/messages/templates", "서식을 지웠습니다"));
}
