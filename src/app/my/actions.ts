"use server";
// 내 차 수첩 손님 동작: 들어가기(문자 인증)·나가기·견적 승인·보증 신청·차 판 기록
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/db/runtime";
import { claimWarranty, endAllSessions, endSession, markSold, myEstimateDoc, requestCode, sessionOf, verifyCode } from "@/modules/carbook/service";
import { PHONE_COOKIE } from "@/modules/carbook/rules";
import { approveByCarbook } from "@/modules/repair/estimate-approval";
import { errorUrl, requestMeta, userMessage } from "../_lib/session";
import { clearMyCookie, myToken, requireMy, setMyCookie } from "./_session";

/** 1단계: 인증번호 받기. 번호는 다음 칸까지 짧은 쿠키(10분)에만 둔다(주소창에 남기지 않음) */
export async function requestCodeAction(form: FormData) {
  const phone = String(form.get("phone") ?? "");
  let demo: string | undefined;
  try {
    demo = (await requestCode(await getDb(), phone, await requestMeta())).demoCode;
  } catch (e) {
    redirect(errorUrl("/my/login", userMessage(e)));
  }
  (await cookies()).set(PHONE_COOKIE, phone.replace(/\D/g, ""), { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/my", maxAge: 600 });
  redirect(`/my/login?step=code${demo ? `&demo=${demo}` : ""}`);
}

/** 2단계: 인증번호 확인 → 90일 로그인 */
export async function verifyCodeAction(form: FormData) {
  const jar = await cookies();
  const phone = jar.get(PHONE_COOKIE)?.value ?? "";
  const back = String(form.get("next") ?? "");
  let token: string, days: number;
  try {
    const meta = await requestMeta();
    ({ token, maxAgeDays: days } = await verifyCode(await getDb(), phone, String(form.get("code") ?? ""), meta));
  } catch (e) {
    redirect(errorUrl("/my/login?step=code", userMessage(e)));
  }
  // 링크로 들어와 있던 로그인은 끝내고 새 로그인으로 바꾼다
  await endSession(await getDb(), await myToken());
  await setMyCookie(token, days);
  jar.delete(PHONE_COOKIE);
  redirect(back.startsWith("/my") ? back : "/my");
}

export async function logoutAction(form: FormData) {
  const db = await getDb();
  const token = await myToken();
  if (form.get("all") === "1") {
    const s = await sessionOf(db, token);
    if (s) await endAllSessions(db, s.customerId);
  } else await endSession(db, token);
  await clearMyCookie();
  redirect("/my/login?bye=1");
}

export async function approveMyEstimateAction(form: FormData) {
  const s = await requireMy();
  const id = String(form.get("id") ?? "");
  const sig = String(form.get("signature") ?? "");
  const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(sig);
  let outcome: string;
  try {
    const db = await getDb();
    // 링크 로그인은 그 수리 건의 견적만(아니면 myEstimateDoc 이 막는다)
    if (s.scope === "link") await myEstimateDoc(db, s, id);
    const r = await approveByCarbook(db, s.customerId, id, { groups: form.getAll("groups").map(String), name: String(form.get("approverName") ?? ""), agree: form.getAll("agree").includes("yes"), signaturePng: m ? new Uint8Array(Buffer.from(m[1], "base64")) : null }, { ip: (await requestMeta()).ip });
    outcome = r.outcome;
  } catch (e) {
    redirect(errorUrl(`/my/estimate/${id}`, userMessage(e)));
  }
  redirect(`/my/estimate/${id}?done=${outcome}`);
}

export async function claimWarrantyAction(form: FormData) {
  const s = await requireMy();
  const roId = String(form.get("roId") ?? "");
  const photos: Uint8Array[] = [];
  for (const f of form.getAll("photo")) if (f instanceof File && f.size) photos.push(new Uint8Array(await f.arrayBuffer()));
  try {
    await claimWarranty(await getDb(), s, roId, { content: String(form.get("content") ?? ""), wish: String(form.get("wish") ?? ""), photos });
  } catch (e) {
    redirect(errorUrl(`/my/warranty/${roId}`, userMessage(e)));
  }
  redirect(`/my/repairs/${roId}?claimed=1`);
}

export async function markSoldAction(form: FormData) {
  const s = await requireMy(true);
  try {
    await markSold(await getDb(), s, String(form.get("vehicleId") ?? ""));
  } catch (e) {
    redirect(errorUrl("/my/more", userMessage(e)));
  }
  redirect("/my/more?sold=1");
}
