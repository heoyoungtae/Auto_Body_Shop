"use server";
// 근태 신청서(F-11-04)·재직증명서 신청 서버 동작
import { redirect } from "next/navigation";
import { getDb } from "@/db/runtime";
import { answerOrder, orderOvertime, requestCertificate, requestLeave } from "@/modules/staff/attendance";
import { punchIn, punchOut, savePunchConfig } from "@/modules/staff/punch";
import { errorUrl, noticeUrl, requestMeta, requireUser, userMessage } from "../_lib/session";

export async function requestLeaveAction(form: FormData) {
  const user = await requireUser();
  const s = (k: string) => String(form.get(k) ?? "").trim();
  const back = s("back").startsWith("/attendance") ? s("back") : "/attendance";
  let docNo = "";
  try {
    const d = await requestLeave(await getDb(), user, { leaveKind: s("leaveKind"), fromDate: s("fromDate"), toDate: s("toDate"), fromTime: s("fromTime"), toTime: s("toTime"), reason: s("reason") });
    docNo = d.docNo;
  } catch (e) {
    redirect(errorUrl(back, userMessage(e)));
  }
  redirect(noticeUrl(back.split("?")[0], `${docNo} 상신했습니다. 승인되면 알림이 갑니다`));
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

// ── 출퇴근(정비소 와이파이에서만), 연장근무 지시·답, 정비소 인터넷 주소 ─────────────

const hmNow = () => new Date(Date.now() + 9 * 3600_000).toISOString().slice(11, 16);

export async function punchInAction() {
  const user = await requireUser();
  let msg = "";
  try {
    const st = await punchIn(await getDb(), user, (await requestMeta()).ip ?? null);
    msg = `${st.inText} 출근했습니다`;
    if (st.late) msg += `. 정해진 출근(${st.schedule.start})보다 늦었습니다. 아래에서 지각 신고를 올려 주세요`;
    if (!st.business) msg += ". 오늘은 쉬는 날입니다. 휴일근로 승인이 없으면 시간이 인정되지 않습니다";
  } catch (e) {
    redirect(errorUrl("/attendance", userMessage(e)));
  }
  redirect(noticeUrl("/attendance", msg));
}

export async function punchOutAction() {
  const user = await requireUser();
  let msg = "";
  try {
    const st = await punchOut(await getDb(), user, (await requestMeta()).ip ?? null);
    msg = `${st.outText ?? hmNow()} 퇴근했습니다`;
    if (st.overstay) msg += ". 승인 없이 늦게 남았습니다. 아래에서 사후 연장 신청을 올려 주세요(안 올리면 수당에 들어가지 않습니다)";
  } catch (e) {
    redirect(errorUrl("/attendance", userMessage(e)));
  }
  redirect(noticeUrl("/attendance", msg));
}

export async function orderOvertimeAction(form: FormData) {
  const user = await requireUser();
  const s = (k: string) => String(form.get(k) ?? "").trim();
  try {
    await orderOvertime(await getDb(), user, { userId: s("userId"), fromDate: s("fromDate"), fromTime: s("fromTime"), toTime: s("toTime"), reason: s("reason") });
  } catch (e) {
    redirect(errorUrl("/attendance", userMessage(e)));
  }
  redirect(noticeUrl("/attendance", "연장근무를 지시했습니다. 직원이 동의하면 승인됩니다"));
}

export async function answerOrderAction(form: FormData) {
  const user = await requireUser();
  const s = (k: string) => String(form.get(k) ?? "").trim();
  const agree = s("intent") === "agree";
  let r = "";
  try {
    r = await answerOrder(await getDb(), user, s("docId"), agree, s("note"));
  } catch (e) {
    redirect(errorUrl("/attendance", userMessage(e)));
  }
  redirect(noticeUrl("/attendance", r === "declined" ? "거절했습니다. 지시한 사람에게 알렸습니다" : r === "approved" ? "동의했습니다. 연장근무가 승인되었습니다" : "동의했습니다. 결재가 끝나면 알림이 갑니다"));
}

export async function savePunchConfigAction(form: FormData) {
  const user = await requireUser();
  let ips: string[] = [];
  try {
    ips = await savePunchConfig(await getDb(), user, String(form.get("ips") ?? ""));
  } catch (e) {
    redirect(errorUrl("/attendance", userMessage(e)));
  }
  redirect(noticeUrl("/attendance", ips.length ? `저장했습니다. 이제 ${ips.join(", ")} 에서만 출퇴근을 누를 수 있습니다` : "저장했습니다. 주소가 비어 있어 어디서나 누를 수 있습니다"));
}
