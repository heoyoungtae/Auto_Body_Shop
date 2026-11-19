"use server";
// 화면 위 '지금 지점' 바꾸기(지점이 둘 이상일 때만 보임). 접속 장소와 관계없이 사람마다 기억한다
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db/runtime";
import { setViewBranch } from "@/modules/platform/branch";
import { errorUrl, requireUser, userMessage } from "../_lib/session";

export async function setBranchAction(form: FormData) {
  const user = await requireUser();
  const back = String(form.get("back") ?? "/home");
  const safe = back.startsWith("/") && !back.startsWith("//") ? back : "/home";
  try {
    await setViewBranch(await getDb(), { id: user.id, roles: user.roles }, String(form.get("branch") ?? ""));
  } catch (e) {
    redirect(errorUrl(safe, userMessage(e)));
  }
  revalidatePath("/", "layout");
  redirect(safe);
}
