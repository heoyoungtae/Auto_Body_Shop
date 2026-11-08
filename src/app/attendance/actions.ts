"use server";
// 근태 신청서(F-11-04)·재직증명서 신청 서버 동작
import { redirect } from "next/navigation";
import { getDb } from "@/db/runtime";
import { requestCertificate, requestLeave } from "@/modules/staff/attendance";
import { errorUrl, noticeUrl, requireUser, userMessage } from "../_lib/session";

export async function requestLeaveAction(form: FormData) {
  const user = await requireUser();
  const s = (k: string) => String(form.get(k) ?? "").trim();
  let docNo = "";
  try {
    const d = await requestLeave(await getDb(), user, { leaveKind: s("leaveKind"), fromDate: s("fromDate"), toDate: s("toDate"), fromTime: s("fromTime"), toTime: s("toTime"), reason: s("reason") });
    docNo = d.docNo;
  } catch (e) {
    redirect(errorUrl("/attendance", userMessage(e)));
  }
  redirect(noticeUrl("/attendance", `${docNo} 상신했습니다. 승인되면 알림이 갑니다`));
}

export async function requestCertificateAction(form: FormData) {
  const user = await requireUser();
  const s = (k: string) => String(form.get(k) ?? "").trim();
  let docNo = "";
  try {
    const d = await requestCertificate(await getDb(), user, { purpose: s("purpose"), submitTo: s("submitTo"), copies: Number(s("copies").replace(/[^\d]/g, "") || "1") });
    docNo = d.docNo;
  } catch (e) {
    redirect(errorUrl("/certificates", userMessage(e)));
  }
  redirect(noticeUrl("/certificates", `${docNo} 신청했습니다. 대표가 승인하면 여기서 인쇄합니다`));
}
