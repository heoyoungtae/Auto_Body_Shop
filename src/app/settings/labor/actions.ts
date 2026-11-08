"use server";
// 설정 › 공임 기준표(F-03-01). 바꾸기는 대표만(STD-03 7절: 공장장이 정하고 대표가 승인).
import { redirect } from "next/navigation";
import { getDb } from "@/db/runtime";
import { addLaborItem, changeLabor, setLaborHidden } from "@/modules/repair/labor-store";
import { errorUrl, noticeUrl, requireOwner, userMessage } from "../../_lib/session";

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

export async function changeLaborAction(form: FormData) {
  const user = await requireOwner();
  const code = s(form, "code");
  try {
    await changeLabor(await getDb(), user.id, { code, value: Number(s(form, "value").replace(/\D/g, "")), effectiveFrom: s(form, "effectiveFrom"), reason: s(form, "reason"), revisionRequestNo: s(form, "revisionRequestNo") });
  } catch (e) {
    redirect(errorUrl(`/settings/labor?code=${encodeURIComponent(code)}`, userMessage(e)));
  }
  redirect(noticeUrl("/settings/labor", "공임 기준표를 바꿨습니다. 시행일부터 새 견적에 적용됩니다(이미 낸 견적은 그대로)"));
}

export async function addLaborAction(form: FormData) {
  const user = await requireOwner();
  let code = "";
  try {
    code = await addLaborItem(await getDb(), user.id, { section: s(form, "section"), name: s(form, "name"), kind: s(form, "kind"), cat: s(form, "cat"), value: Number(s(form, "value").replace(/\D/g, "")), hint: s(form, "hint") });
  } catch (e) {
    redirect(errorUrl("/settings/labor", userMessage(e)));
  }
  redirect(noticeUrl(`/settings/labor?code=${code}`, "항목을 더했습니다. 견적 줄 '기준표에서 고르기'에 바로 나옵니다"));
}

export async function hideLaborAction(form: FormData) {
  const user = await requireOwner();
  const hidden = s(form, "hidden") === "1";
  try {
    await setLaborHidden(await getDb(), user.id, s(form, "code"), hidden);
  } catch (e) {
    redirect(errorUrl("/settings/labor", userMessage(e)));
  }
  redirect(noticeUrl("/settings/labor", hidden ? "견적 고르기 목록에서 숨겼습니다(이미 쓴 견적은 그대로)" : "다시 견적 고르기 목록에 나옵니다"));
}
