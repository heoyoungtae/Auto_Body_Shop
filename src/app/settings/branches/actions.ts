"use server";
// 설정 › 본점·지점: 지점 등록·고치기, 직원 소속·지점별 역할(대표)
import { redirect } from "next/navigation";
import { getDb } from "@/db/runtime";
import { createBranch, listBranches, setUserBranches, updateBranch, type BranchInput } from "@/modules/platform/branch";
import { errorUrl, noticeUrl, requireUser, userMessage } from "../../_lib/session";

const PATH = "/settings/branches";
const s = (form: FormData, k: string) => String(form.get(k) ?? "");

export async function saveBranchAction(form: FormData) {
  const user = await requireUser();
  const id = s(form, "id");
  const input: BranchInput = {
    name: s(form, "name"),
    code: s(form, "code"),
    bizNo: s(form, "bizNo"),
    subBizNo: s(form, "subBizNo"),
    repairRegNo: s(form, "repairRegNo"),
    zip: s(form, "zip"),
    address: s(form, "address"),
    addressDetail: s(form, "addressDetail"),
    phone: s(form, "phone"),
    openedOn: s(form, "openedOn"),
    closedOn: s(form, "closedOn"),
  };
  try {
    if (id) await updateBranch(await getDb(), user, id, input);
    else await createBranch(await getDb(), user, input);
  } catch (e) {
    redirect(errorUrl(id ? `${PATH}?edit=${id}` : `${PATH}?edit=new`, userMessage(e)));
  }
  redirect(noticeUrl(PATH, id ? `'${input.name.trim()}' 지점을 고쳤습니다` : `'${input.name.trim()}' 지점을 등록했습니다. 아래에서 그 지점에서 일할 직원을 정하세요`));
}

export async function saveStaffBranchAction(form: FormData) {
  const user = await requireUser();
  const userId = s(form, "userId");
  const db = await getDb();
  const access: Record<string, "same" | string[]> = {};
  for (const b of await listBranches(db)) {
    const v = form.getAll(`acc_${b.id}`).map(String);
    if (v.includes("same")) access[b.id] = "same";
    else if (v.length) access[b.id] = v;
  }
  try {
    await setUserBranches(db, user, userId, { homeBranchId: s(form, "home"), access });
  } catch (e) {
    redirect(errorUrl(`${PATH}?staff=${userId}#staff`, userMessage(e)));
  }
  redirect(noticeUrl(`${PATH}#staff`, "직원 지점을 저장했습니다. 그 직원이 다음에 화면을 열 때부터 적용됩니다"));
}
