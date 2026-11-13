"use server";
// 월간 경영보고서 결재 올리기(보고서 센터 5단계)
import { redirect } from "next/navigation";
import { getDb } from "@/db/runtime";
import { submitMonthly } from "@/modules/report/monthly";
import { errorUrl, noticeUrl, requireUser, userMessage } from "../../_lib/session";

export async function monthlyAction(form: FormData) {
  const user = await requireUser();
  const ym = String(form.get("ym") ?? "");
  const back = `/reports/monthly?ym=${ym}`;
  let msg = "";
  try {
    const r = await submitMonthly(await getDb(), user, ym, String(form.get("comment") ?? ""));
    msg = `${r.docNo}로 결재를 올렸습니다. 대표가 승인하면 확정됩니다`;
  } catch (e) {
    redirect(errorUrl(back, userMessage(e)));
  }
  redirect(noticeUrl(back, msg));
}
