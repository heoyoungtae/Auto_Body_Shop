"use server";
// 정기 결의(간소화) 화면의 서버 동작
import { redirect } from "next/navigation";
import { getDb } from "@/db/runtime";
import { draftRecurring, removeRecurring, saveRecurring } from "@/modules/money/recurring";
import { errorUrl, noticeUrl, requireUser, userMessage } from "../../../_lib/session";

const BACK = "/money/expenses/recurring";
const str = (form: FormData) => (k: string) => String(form.get(k) ?? "").trim();
const won = (v: string) => {
  const d = v.replace(/[^\d]/g, "");
  return d ? Number(d) : null;
};

export async function recurringAction(form: FormData) {
  const user = await requireUser();
  const s = str(form);
  const intent = s("intent");
  let to = BACK;
  let msg = "";
  try {
    const db = await getDb();
    if (intent === "save") {
      await saveRecurring(db, user, {
        id: s("id") || undefined,
        category: s("category"),
        supplierId: s("supplierId"),
        payeeName: s("payeeName"),
        purpose: s("purpose"),
        supplyWon: won(s("supplyWon")),
        vatWon: won(s("vatWon")),
        evidenceKind: s("evidenceKind"),
        payMethod: s("payMethod"),
        day: Number(s("day")),
      });
      msg = "정기 결의를 등록했습니다. 등록이 곧 대표 승인이라, 매달 금액이 지난번과 20% 안이면 대표 결재를 다시 받지 않습니다";
    } else if (intent === "remove") {
      await removeRecurring(db, user, s("id"));
      msg = "정기 결의를 지웠습니다(이미 올린 결의서는 그대로)";
    } else if (intent === "draft") {
      const r = await draftRecurring(db, user, s("id"), { supplyWon: won(s("supplyWon")), vatWon: won(s("vatWon")), evidenceOn: s("evidenceOn") });
      to = `/money/expenses/${r.id}`;
      msg = r.auto ? `지출 결의서 ${r.docNo}를 올렸습니다. 대표 결재는 등록 승인으로 갈음했습니다` : `지출 결의서 ${r.docNo}를 올렸습니다${r.why ? `. ${r.why}` : ""}`;
    }
  } catch (e) {
    redirect(errorUrl(BACK, userMessage(e)));
  }
  redirect(noticeUrl(to, msg));
}
