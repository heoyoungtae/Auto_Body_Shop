"use server";
// 작업장 등록·고치기·사용 중지(공장장·대표)
import { redirect } from "next/navigation";
import { getDb } from "@/db/runtime";
import { createWorkplace, setWorkplaceActive, updateWorkplace, type WorkplaceInput } from "@/modules/platform/branch";
import { errorUrl, noticeUrl, requireUser, userMessage } from "../../_lib/session";

const PATH = "/settings/workplaces";
const num = (v: FormDataEntryValue | null) => (v == null || String(v).trim() === "" ? null : Number(String(v).replace(/[^\d-]/g, "")));

function readForm(form: FormData): WorkplaceInput {
  return {
    name: String(form.get("name") ?? ""),
    kind: String(form.get("kind") ?? ""),
    bays: num(form.get("bays")),
    managerId: String(form.get("managerId") ?? "") || null,
    sortOrder: num(form.get("sortOrder")),
    note: String(form.get("note") ?? ""),
  };
}

export async function saveWorkplaceAction(form: FormData) {
  const user = await requireUser();
  const id = String(form.get("id") ?? "");
  const input = readForm(form);
  try {
    if (id) await updateWorkplace(await getDb(), user, id, input);
    else await createWorkplace(await getDb(), user, input);
  } catch (e) {
    redirect(errorUrl(id ? `${PATH}?edit=${id}` : PATH, userMessage(e)));
  }
  redirect(noticeUrl(PATH, id ? `'${input.name.trim()}' 작업장을 고쳤습니다` : `'${input.name.trim()}' 작업장을 등록했습니다`));
}

export async function toggleWorkplaceAction(form: FormData) {
  const user = await requireUser();
  const id = String(form.get("id") ?? "");
  const active = form.get("active") === "1";
  let name = "";
  try {
    name = await setWorkplaceActive(await getDb(), user, id, active);
  } catch (e) {
    redirect(errorUrl(PATH, userMessage(e)));
  }
  redirect(noticeUrl(PATH, active ? `'${name}' 작업장을 다시 씁니다` : `'${name}' 작업장을 사용 중지했습니다. 지난 기록은 그대로 남습니다`));
}
