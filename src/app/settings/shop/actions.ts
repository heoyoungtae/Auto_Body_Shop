"use server";
// 설정 › 사업장 정보. 바꾸기는 대표만.
import { redirect } from "next/navigation";
import { getDb } from "@/db/runtime";
import { saveShopInfo } from "@/modules/platform/shop";
import { errorUrl, noticeUrl, requireOwner, userMessage } from "../../_lib/session";

const PATH = "/settings/shop";
const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

export async function saveShopAction(form: FormData) {
  const user = await requireOwner();
  try {
    await saveShopInfo(await getDb(), user.id, { name: s(form, "name"), ceo: s(form, "ceo"), bizNo: s(form, "bizNo"), repairRegNo: s(form, "repairRegNo"), address: s(form, "address"), phone: s(form, "phone") });
  } catch (e) {
    redirect(errorUrl(PATH, userMessage(e)));
  }
  redirect(noticeUrl(PATH, "사업장 정보를 저장했습니다. 견적서·정비명세서에 바로 찍힙니다"));
}
