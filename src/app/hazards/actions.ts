"use server";
// 위험성평가(F-09-01) 화면의 서버 동작
import { redirect } from "next/navigation";
import { getDb } from "@/db/runtime";
import {
  addHazardRow,
  finishAssessment,
  finishMeasure,
  removeHazardRow,
  startAssessment,
  updateHazardRow,
  type HazardRowInput,
} from "@/modules/safety/hazard";
import { UserError } from "@/modules/platform/errors";
import { errorUrl, noticeUrl, requireUser, userMessage } from "../_lib/session";

const str = (form: FormData) => (k: string) => String(form.get(k) ?? "").trim();
function rowInput(form: FormData): HazardRowInput {
  const s = str(form);
  return {
    process: s("process"),
    hazard: s("hazard"),
    current: s("current"),
    likelihood: Number(s("likelihood")),
    severity: Number(s("severity")),
    measureType: s("measureType"),
    measure: s("measure"),
    ownerId: s("ownerId"),
    due: s("due"),
  };
}

export async function startAssessmentAction(form: FormData) {
  const user = await requireUser();
  const s = str(form);
  let r = { id: "", docNo: "", rows: 0 };
  try {
    r = await startAssessment(await getDb(), user, {
      kind: s("kind"),
      reason: s("reason"),
      participants: form.getAll("participants").map(String),
      incidentId: s("incident"),
      copy: s("copy") === "1",
    });
  } catch (e) {
    redirect(
      errorUrl(
        `/hazards/new?kind=${s("kind")}${s("incident") ? `&incident=${s("incident")}` : ""}`,
        userMessage(e),
      ),
    );
  }
  redirect(
    noticeUrl(
      `/hazards/${r.id}`,
      r.rows
        ? `${r.docNo}를 시작하고 ${r.rows}줄을 불러왔습니다. 바뀐 것만 고치세요`
        : `${r.docNo}를 시작했습니다. 공정별로 줄을 더하세요`,
    ),
  );
}

export async function hazardAction(form: FormData) {
  const user = await requireUser();
  const s = str(form);
  const id = s("id");
  const back = `/hazards/${id}${s("rowId") ? `#row-${s("rowId")}` : ""}`;
  let msg = "저장했습니다";
  try {
    const db = await getDb();
    const intent = s("intent");
    if (intent === "add") {
      await addHazardRow(db, user, id, rowInput(form));
      msg = "줄을 더했습니다";
    } else if (intent === "edit")
      await updateHazardRow(db, user, s("rowId"), rowInput(form));
    else if (intent === "remove") {
      await removeHazardRow(db, user, s("rowId"));
      msg = "줄을 지웠습니다";
    } else if (intent === "finish") {
      const n = await finishAssessment(db, user, id);
      msg = `${n}줄로 확정했습니다. 참여자와 대책 담당에게 결과가 공유됩니다`;
    } else if (intent === "measure") {
      const left = await finishMeasure(db, user, s("rowId"), {
        result: s("result"),
        residualL: Number(s("residualL")),
        residualS: Number(s("residualS")),
      });
      msg =
        left >= 4
          ? `대책을 기록했습니다. 잔류 위험이 아직 ${left}점이라 추가 대책이 필요합니다(다음 수시 평가)`
          : `대책을 기록했습니다. 잔류 위험 ${left}점`;
    } else throw new UserError("알 수 없는 요청");
  } catch (e) {
    redirect(errorUrl(back, userMessage(e)));
  }
  redirect(noticeUrl(back, msg));
}
