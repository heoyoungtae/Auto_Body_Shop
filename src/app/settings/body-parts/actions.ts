"use server";
import { redirect } from "next/navigation";
import { getDb } from "@/db/runtime";
import { saveSubParts } from "@/modules/repair/sub-parts";
import { removeWord } from "@/modules/partner/techbay-check";
import { errorUrl, noticeUrl, requireUser, userMessage } from "../../_lib/session";

export async function saveSubPartsAction(form: FormData) {
  const user = await requireUser();
  const part = String(form.get("part") ?? "");
  let msg = "";
  try {
    const r = await saveSubParts(await getDb(), user, part, String(form.get("subs") ?? ""));
    msg = r.list.length ? `${r.label}에 ${r.list.length}개를 더해 두었습니다. 진단 화면의 '세부 부위' 목록에 바로 나옵니다` : `${r.label}에 더한 세부 부위를 모두 뺐습니다(기본 목록만 남음)`;
  } catch (e) {
    redirect(errorUrl(`/settings/body-parts?part=${encodeURIComponent(part)}`, userMessage(e)));
  }
  redirect(noticeUrl("/settings/body-parts", msg));
}

/** 테크베이 작업 내용에서 기억한 말 지우기 */
export async function removeTbWordAction(form: FormData) {
  const user = await requireUser();
  const word = String(form.get("word") ?? "");
  try {
    await removeWord(await getDb(), user, word);
  } catch (e) {
    redirect(errorUrl("/settings/body-parts#tb-words", userMessage(e)));
  }
  redirect(noticeUrl("/settings/body-parts#tb-words", `'${word}'을(를) 지웠습니다. 다음 주문부터는 이 말을 따로 알아듣지 않습니다`));
}
