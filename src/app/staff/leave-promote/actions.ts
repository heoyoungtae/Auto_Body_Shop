"use server";
// 연차 사용 촉진 화면(대표·회계)과 출퇴근 화면(직원)의 서버 동작
import { redirect } from "next/navigation";
import { getDb } from "@/db/runtime";
import { answerNotice, assignDates, sendFirst } from "@/modules/staff/leave-promote";
import { errorUrl, noticeUrl, requireUser, userMessage } from "../../_lib/session";

const s = (form: FormData, k: string) => String(form.get(k) ?? "").trim();
const BACK = "/staff/leave-promote";

export async function sendFirstAction(form: FormData) {
  const user = await requireUser();
  let msg = "";
  try {
    const r = await sendFirst(await getDb(), user, s(form, "userId"));
    msg = r.inWindow ? "1차 촉진서를 보냈습니다" : "보냈습니다. 다만 법정 기간(연도 끝 6개월 전부터 10일) 밖이라 남은 연차 보상 면제 근거가 되지 않습니다";
  } catch (e) {
    redirect(errorUrl(BACK, userMessage(e)));
  }
  redirect(noticeUrl(BACK, msg));
}

export async function assignDatesAction(form: FormData) {
  const user = await requireUser();
  let msg = "";
  try {
    const r = await assignDates(await getDb(), user, s(form, "userId"), s(form, "dates"));
    msg = r.late ? "보냈습니다. 기한이 지나 남은 연차 보상 면제 근거가 되지 않을 수 있습니다" : "쓸 날을 지정해 보냈습니다. 직원이 받았음을 확인하면 표시됩니다";
  } catch (e) {
    redirect(errorUrl(BACK, userMessage(e)));
  }
  redirect(noticeUrl(BACK, msg));
}

export async function answerNoticeAction(form: FormData) {
  const user = await requireUser();
  try {
    await answerNotice(await getDb(), user, s(form, "id"), s(form, "plan"));
  } catch (e) {
    redirect(errorUrl("/attendance", userMessage(e)));
  }
  redirect(noticeUrl("/attendance", "보냈습니다. 낸 날에는 연차를 신청해 쓰세요"));
}
