"use server";
// 업무지시 화면의 서버 동작
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db/runtime";
import { UserError } from "@/modules/platform/errors";
import { addReportPhoto, confirmTask, forwardTask, issueInstruction, removeReportPhoto, reportTask, returnTask, saveAssignRoles } from "@/modules/task/service";
import { errorUrl, noticeUrl, requireUser, userMessage } from "../_lib/session";

const str = (form: FormData) => (k: string) => String(form.get(k) ?? "").trim();

export async function issueAction(form: FormData) {
  const user = await requireUser();
  const s = str(form);
  let id = "";
  let docNo = "";
  try {
    ({ id, docNo } = await issueInstruction(await getDb(), user, { title: s("title"), body: s("body"), assigneeIds: form.getAll("assigneeIds").map(String), dueOn: s("dueOn"), urgent: s("urgent") === "1", needPhoto: s("needPhoto") === "1", refType: s("refType"), refId: s("refId"), refLabel: s("refLabel") }));
  } catch (e) {
    const qs = new URLSearchParams({ refType: s("refType"), refId: s("refId"), refLabel: s("refLabel") }).toString();
    redirect(errorUrl(`/tasks/new?${qs}`, userMessage(e)));
  }
  redirect(noticeUrl(`/tasks/${id}`, `${docNo}로 지시했습니다. 받은 사람의 내 할 일에 올라갑니다`));
}

export async function taskAction(form: FormData) {
  const user = await requireUser();
  const s = str(form);
  const back = `/tasks/${s("ins")}`;
  const id = s("task");
  let msg = "저장했습니다";
  try {
    const db = await getDb();
    const intent = s("intent");
    if (intent === "forward") {
      await forwardTask(db, user, id, { assigneeIds: form.getAll("assigneeIds").map(String), note: s("note") });
      msg = "전달했습니다. 전달받은 사람들의 보고를 확인하면 위로 저절로 보고됩니다";
    } else if (intent === "report") {
      await reportTask(db, user, id, { result: s("result"), report: s("report") });
      msg = "결과보고를 올렸습니다";
    } else if (intent === "confirm") {
      await confirmTask(db, user, id);
      msg = "확인했습니다";
    } else if (intent === "return") {
      await returnTask(db, user, id, s("returnNote"));
      msg = "보완을 요청했습니다";
    } else throw new UserError("알 수 없는 요청");
  } catch (e) {
    redirect(errorUrl(back, userMessage(e)));
  }
  redirect(noticeUrl(back, msg));
}

type R = { ok: true } | { ok: false; error: string };

export async function uploadTaskPhotoAction(form: FormData): Promise<R> {
  const user = await requireUser();
  const file = form.get("file");
  try {
    if (!(file instanceof Blob)) throw new UserError("사진을 고르지 않았습니다");
    await addReportPhoto(await getDb(), user, String(form.get("task") ?? ""), new Uint8Array(await file.arrayBuffer()));
  } catch (e) {
    return { ok: false, error: userMessage(e) };
  }
  revalidatePath(`/tasks/${String(form.get("ins") ?? "")}`);
  return { ok: true };
}

export async function removeTaskPhotoAction(form: FormData): Promise<R> {
  const user = await requireUser();
  try {
    await removeReportPhoto(await getDb(), user, String(form.get("task") ?? ""), String(form.get("path") ?? ""));
  } catch (e) {
    return { ok: false, error: userMessage(e) };
  }
  revalidatePath(`/tasks/${String(form.get("ins") ?? "")}`);
  return { ok: true };
}

export async function saveTaskRolesAction(form: FormData) {
  const user = await requireUser();
  try {
    await saveAssignRoles(await getDb(), user, form.getAll("roles").map(String));
  } catch (e) {
    redirect(errorUrl("/settings/permissions", userMessage(e)));
  }
  redirect(noticeUrl("/settings/permissions", "업무지시 권한을 저장했습니다"));
}
