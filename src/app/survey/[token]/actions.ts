"use server";
import { redirect } from "next/navigation";
import { getDb } from "@/db/runtime";
import { answerSurvey } from "@/modules/cs/service";
import { SURVEY_QUESTIONS } from "@/modules/cs/rules";
import { errorUrl, userMessage } from "../../_lib/session";

/** 고객이 링크에서 설문에 답한다(로그인 없음). 토큰이 곧 권한이다 */
export async function answerSurveyAction(form: FormData) {
  const token = String(form.get("token") ?? "");
  let low = false;
  try {
    const r = await answerSurvey(await getDb(), token, { scores: SURVEY_QUESTIONS.map((_, i) => Number(form.get(`q${i}`) ?? 0)), comment: String(form.get("comment") ?? "") });
    low = !!r.complaint;
  } catch (e) {
    redirect(errorUrl(`/survey/${token}`, userMessage(e)));
  }
  redirect(`/survey/${token}?done=${low ? "low" : "ok"}`);
}
