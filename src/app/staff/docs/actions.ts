"use server";
// 근로계약서·서약서 화면의 서버 동작
import { redirect } from "next/navigation";
import { getDb } from "@/db/runtime";
import type { ContractTerms } from "@/modules/staff/contract-rules";
import { approveContract, cancelDocument, createPledge, markDelivered, saveContract, signDocument, updateLeaveChecks } from "@/modules/staff/documents";
import { errorUrl, noticeUrl, requireUser, userMessage } from "../../_lib/session";

const str = (form: FormData) => (k: string) => String(form.get(k) ?? "").trim();

function termsOf(form: FormData): ContractTerms {
  const s = str(form);
  const num = (k: string) => Number(s(k).replace(/[^\d]/g, "")) || 0;
  return {
    contractType: s("contractType") as ContractTerms["contractType"],
    startOn: s("startOn"),
    endOn: s("endOn"),
    place: s("place"),
    duties: s("duties"),
    workDays: form.getAll("workDays").map(Number),
    workStart: s("workStart"),
    workEnd: s("workEnd"),
    breakStart: s("breakStart"),
    breakEnd: s("breakEnd"),
    holiday: Number(s("holiday")),
    payType: s("payType") as ContractTerms["payType"],
    basePay: num("basePay"),
    allowances: [0, 1, 2].map((i) => ({ name: s(`allowName${i}`), amount: num(`allowAmount${i}`) })),
    bonus: s("bonus"),
    payDay: num("payDay"),
    payMethod: s("payMethod") as ContractTerms["payMethod"],
    insurances: form.getAll("insurances").map(String),
    extra: s("extra"),
  };
}

export async function saveContractAction(form: FormData) {
  const user = await requireUser();
  const s = str(form);
  const userId = s("userId");
  const docId = s("docId") || undefined;
  const back = `/staff/${userId}/docs/new?kind=contract${docId ? `&edit=${docId}` : ""}`;
  let id = "";
  let msg = "";
  try {
    const r = await saveContract(await getDb(), user, userId, termsOf(form), docId);
    id = r.doc.id;
    msg = r.doc.status === "ready" ? "저장했습니다. 직원에게 서명 요청 알림을 보냈습니다. 같이 있으면 아래 서명란에 바로 서명받으세요" : "저장했습니다. 대표가 확인하면 직원이 서명할 수 있습니다(대표에게 알림)";
    if (r.warnings.length) msg += ` · 주의: ${r.warnings.join(" / ")}`;
  } catch (e) {
    redirect(errorUrl(back, userMessage(e)));
  }
  redirect(noticeUrl(`/staff/docs/${id}`, msg));
}

export async function createPledgeAction(form: FormData) {
  const user = await requireUser();
  const s = str(form);
  const userId = s("userId");
  const kind = s("kind") === "pledge_leave" ? "pledge_leave" : "pledge_join";
  let id = "";
  try {
    const r = await createPledge(await getDb(), user, userId, kind, { leftOn: s("leftOn"), checks: form.getAll("checks").map(String), note: s("note") });
    id = r.doc.id;
  } catch (e) {
    redirect(errorUrl(`/staff/${userId}/docs/new?kind=${kind}`, userMessage(e)));
  }
  redirect(noticeUrl(`/staff/docs/${id}`, "준비했습니다. 직원에게 서명 요청 알림을 보냈습니다. 같이 있으면 아래 서명란에 바로 서명받으세요"));
}

export async function docAction(form: FormData) {
  const user = await requireUser();
  const s = str(form);
  const id = s("docId");
  const back = `/staff/docs/${id}`;
  const db = await getDb();
  let msg = "";
  try {
    const intent = s("intent");
    if (intent === "approve") {
      await approveContract(db, user, id);
      msg = "확인했습니다. 직원에게 서명 요청 알림을 보냈습니다";
    } else if (intent === "sign") {
      const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(s("signature"));
      await signDocument(db, user, id, m ? new Uint8Array(Buffer.from(m[1], "base64")) : null);
      msg = "서명했습니다. 내용이 이대로 고정되었습니다";
    } else if (intent === "deliver") {
      await markDelivered(db, user, id, s("how"));
      msg = "교부를 기록했습니다";
    } else if (intent === "checks") {
      await updateLeaveChecks(db, user, id, form.getAll("checks").map(String), s("note"));
      msg = "확인 항목을 저장했습니다";
    } else if (intent === "cancel") {
      await cancelDocument(db, user, id, s("reason"));
      msg = "취소했습니다";
    }
  } catch (e) {
    redirect(errorUrl(back, userMessage(e)));
  }
  redirect(noticeUrl(back, msg));
}
