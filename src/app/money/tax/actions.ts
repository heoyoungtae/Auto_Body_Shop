"use server";
// 세금·절세 화면: 법령 개정 알림(법제처 Open API) 설정·확인
import { redirect } from "next/navigation";
import { getDb } from "@/db/runtime";
import { can } from "@/modules/auth/permissions";
import { ackLawChanges, checkLaws, saveLawKey } from "@/modules/money/law-watch";
import { errorUrl, noticeUrl, requireOwner, requireUser, userMessage } from "../../_lib/session";

const PATH = "/money/tax";
const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

export async function saveLawKeyAction(form: FormData) {
  const user = await requireOwner();
  const clear = s(form, "intent") === "clear";
  try {
    await saveLawKey(await getDb(), user, clear ? "" : s(form, "lawKey"));
  } catch (e) {
    redirect(errorUrl(PATH, userMessage(e)));
  }
  redirect(noticeUrl(PATH, clear ? "OC 값을 지웠습니다. 법령 개정 확인이 멈춥니다" : "OC 값을 저장했습니다. '지금 확인'으로 바로 시험해 보세요"));
}

export async function checkLawsAction() {
  const user = await requireOwner();
  const r = await checkLaws(await getDb(), new Date(), { force: true, actorId: user.id });
  redirect(r.status === "done" ? noticeUrl(PATH, r.message) : errorUrl(PATH, `확인하지 못했습니다: ${r.message}`));
}

export async function ackLawAction() {
  const user = await requireUser();
  if (!can(user, "payroll.view")) redirect(errorUrl(PATH, "대표·회계 담당만 확인합니다"));
  await ackLawChanges(await getDb(), user);
  redirect(noticeUrl(PATH, "법령 개정 알림을 확인했습니다"));
}
