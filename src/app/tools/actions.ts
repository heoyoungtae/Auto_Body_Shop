"use server";
// 치공구(STD-08 8.7, F-08-08) 화면의 서버 동작
import { redirect } from "next/navigation";
import { getDb } from "@/db/runtime";
import { checkoutTool, disposeTool, inspectTool, markToolLabeled, registerTool, reportLost, restoreTool, returnTool, updateTool, type ToolInput } from "@/modules/equipment/tools";
import { TOOL_CHECK, TOOL_DECISION, type ToolCheck, type ToolDecision } from "@/modules/equipment/rules";
import { UserError } from "@/modules/platform/errors";
import { errorUrl, noticeUrl, requireUser, userMessage } from "../_lib/session";

const str = (form: FormData) => (k: string) => String(form.get(k) ?? "").trim();

function input(form: FormData): ToolInput {
  const s = str(form);
  return { name: s("name"), spec: s("spec"), purchasedOn: s("purchasedOn"), location: s("location"), keep: s("keep"), holderId: s("holderId"), managerId: s("managerId"), special: s("special") === "1", note: s("note") };
}

export async function registerToolAction(form: FormData) {
  const user = await requireUser();
  let r = { id: "", no: "" };
  try {
    r = await registerTool(await getDb(), user, input(form));
  } catch (e) {
    redirect(errorUrl("/tools/new", userMessage(e)));
  }
  redirect(noticeUrl(`/tools/${r.id}`, `${r.no}로 등록했습니다. 라벨을 인쇄해 붙이세요`));
}

export async function toolAction(form: FormData) {
  const user = await requireUser();
  const s = str(form);
  const id = s("id");
  const back = s("back") || `/tools/${id}`;
  let msg = "저장했습니다";
  try {
    const db = await getDb();
    const intent = s("intent");
    if (intent === "update") await updateTool(db, user, id, input(form));
    else if (intent === "out") {
      await checkoutTool(db, user, id, s("outNote"));
      msg = "반출을 기록했습니다. 다 쓰면 '반납'을 누르세요";
    } else if (intent === "return") {
      const broken = s("broken") === "1";
      await returnTool(db, user, id, { broken, note: s("returnNote") });
      msg = broken ? "반납했습니다. 상한 곳은 공장장에게 알렸습니다(수리 중)" : "반납했습니다";
    } else if (intent === "check") {
      const r = await inspectTool(db, user, id, { result: s("result"), decision: s("decision"), note: s("checkNote") });
      msg = r.result === "missing" ? "누락(분실)으로 기록하고 대표에게 알렸습니다" : `점검: ${TOOL_CHECK[r.result as ToolCheck]}${r.decision ? ` → ${TOOL_DECISION[r.decision as ToolDecision]}` : ""}`;
      if (r.decision === "replace") msg += ". 새로 살 것은 발주(전결)로 진행하세요";
    } else if (intent === "lost") {
      await reportLost(db, user, id, s("lostNote"));
      msg = "분실로 기록하고 대표에게 알렸습니다. 대체 구입은 전결에 따라 발주합니다";
    } else if (intent === "restore") {
      await restoreTool(db, user, id, s("restoreNote"));
      msg = "다시 쓸 수 있게 했습니다";
    } else if (intent === "dispose") {
      await disposeTool(db, user, id, s("disposeNote"));
      msg = "폐기했습니다";
    } else if (intent === "label") {
      await markToolLabeled(db, user, id);
      msg = "라벨 부착을 기록했습니다";
    } else throw new UserError("알 수 없는 요청");
  } catch (e) {
    redirect(errorUrl(back, userMessage(e)));
  }
  redirect(noticeUrl(back, msg));
}
