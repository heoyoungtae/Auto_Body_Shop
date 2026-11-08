"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db/runtime";
import { addStepPhoto, assignRest, assignStep, createWorkOrder, finishStep, removeStepPhoto, saveWorkHeader, startStep } from "@/modules/repair/work";
import { UserError } from "@/modules/platform/errors";
import { errorUrl, noticeUrl, requireUser, userMessage } from "../_lib/session";

/** 수리 건에서: 승인 항목으로 작업 지시서 만들기 */
export async function createWorkOrderAction(form: FormData) {
  const user = await requireUser(["plant_manager", "owner"]);
  const roId = String(form.get("roId") ?? "");
  let res: { id: string; created: boolean };
  try {
    res = await createWorkOrder(await getDb(), user, roId);
  } catch (e) {
    redirect(errorUrl(`/repairs/${roId}#work`, userMessage(e)));
  }
  redirect(noticeUrl(`/work/${res.id}`, res.created ? "승인한 견적 항목으로 공정을 만들었습니다. 공정마다 담당과 예정일을 정하세요" : "이미 만든 작업 지시서입니다"));
}

export async function workAction(form: FormData) {
  const user = await requireUser();
  const s = (k: string) => String(form.get(k) ?? "").trim();
  const id = s("woId");
  const stepId = s("stepId");
  const back = `/work/${id}`;
  const intent = s("intent");
  const db = await getDb();
  let msg = "저장했습니다";
  try {
    if (intent === "header") await saveWorkHeader(db, user, id, { dueDate: s("dueDate"), note: s("note") });
    else if (intent === "assign") {
      const m = s("stdMinutes").replace(/[^\d]/g, "");
      await assignStep(db, user, stepId, { assignee: s("assignee"), mentor: s("mentor") || null, planDate: s("planDate"), stdMinutes: m ? Number(m) : null });
      msg = "담당을 정했습니다. 담당에게 알림을 보냈습니다";
    } else if (intent === "assignRest") {
      const n = await assignRest(db, user, id, { assignee: s("assignee"), planDate: s("planDate") });
      msg = `담당이 없던 공정 ${n}개를 배정했습니다. 공정마다 다른 사람이면 그 공정에서 바꾸세요`;
    } else if (intent === "start") {
      await startStep(db, user, stepId);
      msg = "공정을 시작했습니다. 끝나면 자주 검사를 확인하고 '공정 끝'을 누르세요";
    } else if (intent === "finish") {
      const detail: Record<string, string> = {};
      for (const k of ["colorCode", "paintMaker", "mixNo", "lot", "tempC", "minutes", "weld"]) if (form.has(k)) detail[k] = s(k);
      const r = await finishStep(db, user, stepId, { checks: form.getAll("checks").map(String), detail, note: s("stepNote") });
      msg = r.done ? "모든 공정이 끝났습니다. 수리 건이 최종 검사 대기로 넘어갔고 품질 담당에게 알렸습니다" : "공정을 끝냈습니다. 다음 공정을 시작할 수 있습니다";
    }
  } catch (e) {
    redirect(errorUrl(back + (stepId ? `#step-${stepId}` : ""), userMessage(e)));
  }
  redirect(noticeUrl(back, msg) + (stepId ? `#step-${stepId}` : ""));
}

/** 공정 사진(화면에서 줄여 보낸 그림). 화면이 직접 부르고 결과를 받는다 */
export async function uploadStepPhotoAction(form: FormData): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireUser();
  const file = form.get("file");
  try {
    if (!(file instanceof Blob)) throw new UserError("사진을 고르지 않았습니다");
    await addStepPhoto(await getDb(), user, String(form.get("stepId") ?? ""), new Uint8Array(await file.arrayBuffer()));
  } catch (e) {
    return { ok: false, error: userMessage(e) };
  }
  revalidatePath(`/work/${String(form.get("woId") ?? "")}`);
  return { ok: true };
}

export async function removeStepPhotoAction(form: FormData): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireUser();
  try {
    await removeStepPhoto(await getDb(), user, String(form.get("stepId") ?? ""), String(form.get("path") ?? ""));
  } catch (e) {
    return { ok: false, error: userMessage(e) };
  }
  revalidatePath(`/work/${String(form.get("woId") ?? "")}`);
  return { ok: true };
}
