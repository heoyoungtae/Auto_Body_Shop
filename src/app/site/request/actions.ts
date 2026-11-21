"use server";
// 홈페이지 견적 요청 동작: 인증번호 받기 → 확인 → 보내기. 인증한 번호와 확인증은 짧은 쿠키(30분)에만 둔다(주소창에 남기지 않음)
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/db/runtime";
import { requestWebCode, submitWebRequest, verifyWebCode } from "@/modules/site/service";
import { WEB_COOKIE, WEB_LIMIT } from "@/modules/site/rules";
import { errorUrl, requestMeta, userMessage } from "../../_lib/session";
import { setMyCookie } from "../../my/_session";

const PHONE = `${WEB_COOKIE}_phone`;
const secure = process.env.NODE_ENV === "production";

export async function webCodeAction(form: FormData) {
  const phone = String(form.get("phone") ?? "");
  let demo: string | undefined;
  try {
    demo = (await requestWebCode(await getDb(), phone, await requestMeta())).demoCode;
  } catch (e) {
    redirect(errorUrl("/request", userMessage(e)));
  }
  (await cookies()).set(PHONE, phone.replace(/\D/g, ""), { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: 600 });
  redirect(`/request?step=code${demo ? `&demo=${demo}` : ""}`);
}

export async function webVerifyAction(form: FormData) {
  const jar = await cookies();
  let v: { proof: string; phone: string };
  try {
    v = await verifyWebCode(await getDb(), jar.get(PHONE)?.value ?? "", String(form.get("code") ?? ""));
  } catch (e) {
    redirect(errorUrl("/request?step=code", userMessage(e)));
  }
  jar.set(WEB_COOKIE, `${v.proof}.${v.phone}`, { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: WEB_LIMIT.verifiedMinutes * 60 });
  jar.delete(PHONE);
  redirect("/request");
}

/** 다른 번호로 다시 하기 */
export async function webResetAction() {
  const jar = await cookies();
  jar.delete(WEB_COOKIE);
  jar.delete(PHONE);
  redirect("/request");
}

export async function webSubmitAction(form: FormData) {
  const jar = await cookies();
  const [proof = "", phone = ""] = (jar.get(WEB_COOKIE)?.value ?? "").split(".");
  const photos: Uint8Array[] = [];
  for (const f of form.getAll("photo")) if (f instanceof File && f.size) photos.push(new Uint8Array(await f.arrayBuffer()));
  let zones: unknown = [];
  try {
    zones = JSON.parse(String(form.get("damageZones") ?? "[]"));
  } catch {
    zones = [];
  }
  let r: Awaited<ReturnType<typeof submitWebRequest>>;
  try {
    r = await submitWebRequest(
      await getDb(),
      {
        proof,
        phone,
        name: String(form.get("name") ?? ""),
        vehicleId: String(form.get("vehicleId") ?? ""),
        plateNo: String(form.get("plateNo") ?? ""),
        model: String(form.get("model") ?? ""),
        bodyType: String(form.get("bodyType") ?? ""),
        damageParts: String(form.get("damageParts") ?? ""),
        damageZones: zones,
        insurance: String(form.get("insurance") ?? ""),
        insurer: String(form.get("insurer") ?? ""),
        wantDate: String(form.get("wantDate") ?? ""),
        needs: String(form.get("needs") ?? ""),
        agreeRequired: form.get("agree") === "1",
        agreeMarketing: form.getAll("marketing").includes("1"),
        photos,
      },
      await requestMeta(),
    );
  } catch (e) {
    redirect(errorUrl("/request", userMessage(e)));
  }
  jar.delete(WEB_COOKIE);
  // 답은 내 차 수첩에서 본다. 방금 문자 인증을 했으니 바로 들어간 상태로 보낸다
  if (r.token) {
    await setMyCookie(r.token, r.days);
    redirect(`/my/consult?sent=1&due=${r.replyDue}`);
  }
  redirect(`/request?sent=${r.docNo}&due=${r.replyDue}`);
}
