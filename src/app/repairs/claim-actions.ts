"use server";
import { guardEdit, withLock } from "@/modules/platform/fresh";
import { repairOrder } from "@/db/schema";
// 보험 청구(STD-03 6절·STD-12) 화면의 서버 동작
import { redirect } from "next/navigation";
import { getDb } from "@/db/runtime";
import { addClaimNote, markAos, markRequested, recordDun, recordPayment, saveClaimInfo, saveScope, submitClaim } from "@/modules/repair/claims";
import { errorUrl, noticeUrl, requireUser, userMessage } from "../_lib/session";

export async function claimAction(form: FormData) {
  const user = await requireUser();
  const s = (k: string) => String(form.get(k) ?? "").trim();
  const n = (k: string) => (s(k) === "" ? null : Number(s(k).replace(/[^\d]/g, "")));
  const roId = s("roId");
  const seq = Math.max(1, Number(s("seq")) || 1);
  const back = `/repairs/${roId}/claim${seq > 1 ? `?c=${seq}` : ""}`;
  // 줄마다 인정 금액: adj:<줄 id> = 금액, adjNote:<줄 id> = 사유. 빈 칸은 전액 인정
  const lineAdjust: Record<string, { won: number; note?: string }> = {};
  for (const [k, v] of form.entries()) {
    if (!k.startsWith("adj:") || String(v).trim() === "") continue;
    const lid = k.slice(4);
    lineAdjust[lid] = { won: Number(String(v).replace(/[^\d]/g, "")), note: s(`adjNote:${lid}`) };
  }
  let msg = "";
  try {
    const root = await getDb();
    // 같은 전표는 한 번에 한 사람씩(동시에 눌러도 한 번만 처리)·고치기 양식은 먼저 고친 사람 확인
    await withLock(root, repairOrder, roId, (locked) =>
      guardEdit(locked, user, form, async (db) => {
        switch (s("intent")) {
          case "info":
            await saveClaimInfo(db, user, roId, { insurer: s("insurer"), claimNo: s("claimNo"), coverage: s("coverage"), faultPct: n("faultPct"), deductibleWon: n("deductibleWon"), adjusterName: s("adjusterName"), adjusterPhone: s("adjusterPhone") }, new Date(), seq);
            msg = seq === 1 ? "접수 정보를 저장했습니다. 수리 건의 보험사·사고접수번호도 같이 바뀌었습니다" : `${seq}번째 청구처 접수 정보를 저장했습니다`;
            break;
          case "request":
            await markRequested(db, user, roId, s("requestNote"), new Date(), seq);
            msg = "손해사정 요청을 기록했습니다. 보험사 회신(손해사정 금액)이 오면 3단계에 적습니다";
            break;
          case "scope":
            await saveScope(
              db,
              user,
              roId,
              {
                adjustedWon: n("adjustedWon"),
                customerExtraWon: n("customerExtraWon"),
                agreed: form.getAll("extraAgreed").includes("1"),
                note: s("scopeNote"),
                depreciationWon: n("depreciationWon"),
                partsDiscountWon: n("partsDiscountWon"),
                salvageWon: n("salvageWon"),
                otherDeductWon: n("otherDeductWon"),
                otherDeductPayer: s("otherDeductPayer"),
                otherDeductNote: s("otherDeductNote"),
                lineAdjust,
                dispute: s("dispute") === "disputed" ? "disputed" : "agreed",
                disputeNote: s("disputeNote"),
              },
              new Date(),
              seq,
            );
            msg = s("dispute") === "disputed" ? "이의 제기를 기록했습니다. 보험사 답이 오면 다시 적고 '동의'로 바꿉니다" : "승인 범위를 저장했습니다. 출고 때 고객에게 받을 금액이 정해졌습니다";
            break;
          case "claim":
            await submitClaim(db, user, roId, { claimedWon: n("claimedWon"), docs: form.getAll("docs").map(String) }, new Date(), seq);
            msg = "청구를 기록했습니다. 회계 담당에게 입금 확인을 알렸습니다";
            break;
          case "paid":
            msg = `입금을 확인하고 입금 전표 ${await recordPayment(db, user, roId, { paidOn: s("paidOn"), paidWon: n("paidWon"), cutReason: s("cutReason") }, new Date(), seq)}를 남겼습니다. 이 청구는 끝났습니다`;
            break;
          case "dun":
            await recordDun(db, user, roId, s("dunNote"), new Date(), seq);
            msg = "독촉을 기록했습니다";
            break;
          case "note":
            await addClaimNote(db, user, roId, { kind: s("kind"), note: s("note") }, new Date(), seq);
            msg = "연락 기록을 남겼습니다";
            break;
          case "aos":
            await markAos(db, user, roId, s("step"), s("done") === "1", new Date(), seq);
            msg = s("done") === "1" ? "AOS 진행을 기록했습니다" : "AOS 기록을 지웠습니다";
            break;
        }
      }),
    );
  } catch (e) {
    redirect(errorUrl(back, userMessage(e)));
  }
  redirect(noticeUrl(back, msg));
}
