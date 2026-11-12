"use server";
// 설정 › 사업장 정보. 바꾸기는 대표만.
import { redirect } from "next/navigation";
import { getDb } from "@/db/runtime";
import { saveShopInfo, saveShopSeal } from "@/modules/platform/shop";
import { UserError } from "@/modules/platform/errors";
import { errorUrl, noticeUrl, requireOwner, userMessage } from "../../_lib/session";
import { saveTaxProfile } from "@/modules/money/tax-profile";

const PATH = "/settings/shop";
const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

export async function saveShopAction(form: FormData) {
  const user = await requireOwner();
  try {
    await saveShopInfo(await getDb(), user.id, { name: s(form, "name"), ceo: s(form, "ceo"), bizNo: s(form, "bizNo"), repairRegNo: s(form, "repairRegNo"), zip: s(form, "zip"), address: s(form, "address"), addressDetail: s(form, "addressDetail"), phone: s(form, "phone") });
  } catch (e) {
    redirect(errorUrl(PATH, userMessage(e)));
  }
  redirect(noticeUrl(PATH, "사업장 정보를 저장했습니다. 견적서·정비명세서에 바로 찍힙니다"));
}

export async function saveSealAction(form: FormData) {
  const user = await requireOwner();
  const clear = form.get("intent") === "clear";
  try {
    const m = /^data:image\/png;base64,(.+)$/.exec(s(form, "seal"));
    if (!clear && !m) throw new UserError("직인 그림을 골라 주세요");
    await saveShopSeal(await getDb(), user.id, clear ? null : new Uint8Array(Buffer.from(m![1], "base64")));
  } catch (e) {
    redirect(errorUrl(PATH, userMessage(e)));
  }
  redirect(noticeUrl(PATH, clear ? "직인을 지웠습니다. 이미 낸 서류에는 그대로 남습니다" : "직인을 등록했습니다. 앞으로 발급하는 견적서·정비명세서에 찍힙니다"));
}

export async function saveTaxAction(form: FormData) {
  const user = await requireOwner();
  try {
    await saveTaxProfile(await getDb(), user, {
      form: s(form, "form"),
      formSince: s(form, "formSince"),
      corpRegNo: s(form, "corpRegNo"),
      fiscalStartMonth: Number(s(form, "fiscalStartMonth") || 1),
      openedOn: s(form, "openedOn"),
      region: s(form, "region"),
      ceoYouth: s(form, "ceoYouth"),
      relief: s(form, "relief"),
      halfYearWithholding: form.get("halfYearWithholding") === "1",
      bankReported: form.get("bankReported") === "1",
      bankName: s(form, "bankName"),
      accountNo: s(form, "accountNo"),
      bankHolder: s(form, "bankHolder"),
      agentName: s(form, "agentName"),
      agentPhone: s(form, "agentPhone"),
    });
  } catch (e) {
    redirect(errorUrl(`${PATH}#tax`, userMessage(e)));
  }
  redirect(noticeUrl(PATH, "세금·사업 형태를 저장했습니다. 신고 일정과 절세 안내가 이 값으로 바뀝니다"));
}
