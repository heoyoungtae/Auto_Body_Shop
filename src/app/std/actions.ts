"use server";
// 사내 표준서 화면의 서버 동작: 절 열람 제한(품질 담당·대표). 본문 변경은 문서 개정 요청서(F-Q-05)로만 한다
import { redirect } from "next/navigation";
import { getDb } from "@/db/runtime";
import { setSectionRoles } from "@/modules/quality/std";
import { stdKeyHref } from "@/modules/quality/std-ref";
import { errorUrl, noticeUrl, requireUser, userMessage } from "../_lib/session";

export async function stdRolesAction(form: FormData) {
  const user = await requireUser();
  const key = String(form.get("key") ?? "");
  const href = stdKeyHref(key);
  const [path, hash] = href.split("#");
  const roles = form.getAll("roles").map(String);
  try {
    await setSectionRoles(await getDb(), user, key, roles);
  } catch (e) {
    redirect(`${errorUrl(path, userMessage(e))}${hash ? `#${hash}` : ""}`);
  }
  redirect(`${noticeUrl(path, roles.length ? "열람 제한을 바꿨습니다" : "전 직원이 보도록 풀었습니다")}${hash ? `#${hash}` : ""}`);
}
