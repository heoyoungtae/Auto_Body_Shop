"use server";
// 일정표 화면의 서버 동작
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db/runtime";
import type { EventInput } from "@/modules/schedule/rules";
import { cancelEvent, createEvent, updateEvent } from "@/modules/schedule/service";
import { errorUrl, noticeUrl, requireUser, userMessage } from "../_lib/session";

const read = (form: FormData): EventInput => {
  const s = (k: string) => String(form.get(k) ?? "").trim();
  return {
    scope: s("scope"),
    kind: s("kind"),
    title: s("title"),
    startOn: s("startOn"),
    endOn: s("endOn"),
    startTime: s("startTime"),
    endTime: s("endTime"),
    place: s("place"),
    note: s("note"),
    attendeeIds: form.getAll("attendeeIds").map(String),
    repeat: s("repeat") || "none",
    repeatUntil: s("repeatUntil"),
    remindDays: s("remindDays"),
  };
};

const back = (d: string) => `/schedule?m=${d.slice(0, 7)}&d=${d}`;

export async function createEventAction(form: FormData) {
  const user = await requireUser();
  const input = read(form);
  try {
    await createEvent(await getDb(), user, input);
  } catch (e) {
    redirect(errorUrl(`/schedule/new?scope=${input.scope}&date=${input.startOn}`, userMessage(e)));
  }
  revalidatePath("/schedule");
  redirect(noticeUrl(back(input.startOn), input.scope === "shop" ? "공용 일정을 올렸습니다. 대상 직원에게 알림이 갑니다" : "내 일정을 올렸습니다(나만 봅니다)"));
}

export async function updateEventAction(form: FormData) {
  const user = await requireUser();
  const id = String(form.get("id") ?? "");
  const input = read(form);
  try {
    await updateEvent(await getDb(), user, id, input);
  } catch (e) {
    redirect(errorUrl(`/schedule/${id}`, userMessage(e)));
  }
  revalidatePath("/schedule");
  redirect(noticeUrl(`/schedule/${id}`, "고쳤습니다"));
}

export async function cancelEventAction(form: FormData) {
  const user = await requireUser();
  const id = String(form.get("id") ?? "");
  const date = String(form.get("date") ?? "");
  try {
    await cancelEvent(await getDb(), user, id, String(form.get("cancelReason") ?? ""));
  } catch (e) {
    redirect(errorUrl(`/schedule/${id}`, userMessage(e)));
  }
  revalidatePath("/schedule");
  redirect(noticeUrl(back(date), "일정을 취소했습니다"));
}
