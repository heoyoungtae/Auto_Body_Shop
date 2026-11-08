"use server";
// 설정 › 영업일·휴무일. 바꾸기는 대표만.
import { redirect } from "next/navigation";
import { getDb } from "@/db/runtime";
import { addShopDay, removeShopDay, saveCalendarRules } from "@/modules/platform/calendar";
import { errorUrl, noticeUrl, requireOwner, userMessage } from "../../_lib/session";

const PATH = "/settings/calendar";
const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

export async function saveCalendarRulesAction(form: FormData) {
  const user = await requireOwner();
  try {
    await saveCalendarRules(await getDb(), user.id, { workdays: form.getAll("workdays").map(Number), excludeHolidays: s(form, "excludeHolidays") !== "no" });
  } catch (e) {
    redirect(errorUrl(PATH, userMessage(e)));
  }
  redirect(noticeUrl(PATH, "영업 규칙을 저장했습니다. 회신 기한·예약 달력에 바로 적용됩니다"));
}

export async function addShopDayAction(form: FormData) {
  const user = await requireOwner();
  try {
    await addShopDay(await getDb(), user.id, { date: s(form, "date"), kind: s(form, "kind"), name: s(form, "name") });
  } catch (e) {
    redirect(errorUrl(PATH, userMessage(e)));
  }
  redirect(noticeUrl(PATH, `${s(form, "date")}을(를) 넣었습니다`));
}

export async function removeShopDayAction(form: FormData) {
  const user = await requireOwner();
  try {
    await removeShopDay(await getDb(), user.id, s(form, "date"));
  } catch (e) {
    redirect(errorUrl(PATH, userMessage(e)));
  }
  redirect(noticeUrl(PATH, "지웠습니다"));
}
