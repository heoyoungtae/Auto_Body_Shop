"use server";
// 설정 › 도메인(대표 2026-11-21)
import { redirect } from "next/navigation";
import { getDb } from "@/db/runtime";
import { ACCOUNT_KINDS, revealPassword, saveAccount, setManualExpiry, submitCfToken, type AccountKind } from "@/modules/platform/domain";
import { noteLoginFail } from "@/modules/platform/security";
import { UserError } from "@/modules/platform/errors";
import { errorUrl, noticeUrl, requestMeta, requireUser, userMessage } from "../../_lib/session";

const P = "/settings/domain";
const kindOf = (x: FormDataEntryValue | null): AccountKind => {
  const k = String(x ?? "");
  if (!(ACCOUNT_KINDS as readonly string[]).includes(k)) throw new UserError("알 수 없는 계정입니다");
  return k as AccountKind;
};

export async function saveAccountAction(form: FormData) {
  const user = await requireUser(["owner"]);
  try {
    const flags = form.getAll("flags").map(String);
    await saveAccount(await getDb(), user, kindOf(form.get("kind")), { ...Object.fromEntries(form.entries()), twoFactor: flags.includes("twoFactor"), autoRenew: flags.includes("autoRenew") });
  } catch (e) {
    redirect(errorUrl(P, userMessage(e)));
  }
  redirect(noticeUrl(P, "저장했습니다"));
}

export async function setExpiryAction(form: FormData) {
  const user = await requireUser(["owner"]);
  try {
    await setManualExpiry(await getDb(), user, String(form.get("expiry") ?? ""));
  } catch (e) {
    redirect(errorUrl(P, userMessage(e)));
  }
  redirect(noticeUrl(P, "만료일을 저장했습니다"));
}

export async function submitTokenAction(form: FormData) {
  const user = await requireUser(["owner"]);
  try {
    await submitCfToken(await getDb(), user, String(form.get("token") ?? ""));
  } catch (e) {
    redirect(errorUrl(P, userMessage(e)));
  }
  redirect(noticeUrl(P, "새 토큰을 넣었습니다. 서버가 1분 안에 확인해 저장하고 결과를 알려 드립니다"));
}

/** 금고 열기: 앱 비밀번호를 다시 넣으면 비밀번호를 돌려준다(화면이 30초 뒤 가림) */
export async function revealAction(_prev: { value?: string; error?: string; at?: number } | null, form: FormData) {
  const user = await requireUser(["owner"]);
  const db = await getDb();
  try {
    const value = await revealPassword(db, user, kindOf(form.get("kind")), String(form.get("appPassword") ?? ""));
    return { value, at: Date.now() };
  } catch (e) {
    // 틀린 비밀번호도 로그인 실패처럼 센다(빼앗긴 화면에서 마구 넣어 보는 것을 막음)
    if (e instanceof UserError && /맞지 않/.test(e.message)) await noteLoginFail(db, (await requestMeta()).ip ?? null).catch(() => {});
    return { error: userMessage(e), at: Date.now() };
  }
}
