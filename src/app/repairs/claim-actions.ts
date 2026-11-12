"use server";
// 보험 청구(STD-03 6절·STD-12) 화면의 서버 동작
import { redirect } from "next/navigation";
import { getDb } from "@/db/runtime";
import { markRequested, recordDun, recordPayment, saveClaimInfo, saveScope, submitClaim } from "@/modules/repair/claims";
import { errorUrl, noticeUrl, requireUser, userMessage } from "../_lib/session";

export async function claimAction(form: FormData) {
  const user = await requireUser();
  const s = (k: string) => String(form.get(k) ?? "").trim();
  const n = (k: string) => (s(k) === "" ? null : Number(s(k).replace(/[^\d]/g, "")));
  const roId = s("roId");
  const back = `/repairs/${roId}/claim`;
  const db = await getDb();
  let msg = "";
  try {
    switch (s("intent")) {
      case "info":
        await saveClaimInfo(db, user, roId, { insurer: s("insurer"), claimNo: s("claimNo"), coverage: s("coverage"), faultPct: n("faultPct"), deductibleWon: n("deductibleWon"), adjusterName: s("adjusterName"), adjusterPhone: s("adjusterPhone") });
        msg = "접수 정보를 저장했습니다. 수리 건의 보험사·사고접수번호도 같이 바뀌었습니다";
        break;
      case "request":
        await markRequested(db, user, roId, s("requestNote"));
        msg = "손해사정 요청을 기록했습니다. 보험사 회신(손해사정 금액)이 오면 3단계에 적습니다";
        break;
      case "scope":
        await saveScope(db, user, roId, { adjustedWon: n("adjustedWon"), customerExtraWon: n("customerExtraWon"), agreed: form.getAll("extraAgreed").includes("1"), note: s("scopeNote") });
        msg = "승인 범위를 저장했습니다. 출고 때 고객에게 받을 금액이 정해졌습니다";
        break;
      case "claim":
        await submitClaim(db, user, roId, { claimedWon: n("claimedWon"), docs: form.getAll("docs").map(String) });
        msg = "청구를 기록했습니다. 회계 담당에게 입금 확인을 알렸습니다";
        break;
      case "paid":
        msg = `입금을 확인하고 입금 전표 ${await recordPayment(db, user, roId, { paidOn: s("paidOn"), paidWon: n("paidWon"), cutReason: s("cutReason") })}를 남겼습니다. 이 청구는 끝났습니다`;
        break;
      case "dun":
        await recordDun(db, user, roId, s("dunNote"));
        msg = "독촉을 기록했습니다";
        break;
    }
  } catch (e) {
    redirect(errorUrl(back, userMessage(e)));
  }
  redirect(noticeUrl(back, msg));
}
