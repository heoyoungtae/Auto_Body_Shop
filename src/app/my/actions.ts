"use server";
// 내 차 수첩 손님 동작: 들어가기(문자 인증)·나가기·견적 승인·보증 신청·차 판 기록, 2단계: 이용 동의·내 기록·알림 설정·그만 쓰기
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/db/runtime";
import { claimWarranty, endAllSessions, endSession, markSold, myEstimateDoc, requestCode, sessionOf, verifyCode } from "@/modules/carbook/service";
import { PHONE_COOKIE } from "@/modules/carbook/rules";
import { addEntry, deleteEntry, leaveCarbook, saveInsurance, savePrefs, setConsent } from "@/modules/carbook/records";
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

// ── 2단계 ──
const num = (v: FormDataEntryValue | null) => {
  const t = String(v ?? "").replace(/,/g, "").trim();
  return t === "" ? null : Number(t);
};
const safeBack = (v: FormDataEntryValue | null, dflt: string) => {
  const b = String(v ?? "");
  return b.startsWith("/my") && !b.startsWith("//") ? b : dflt;
};

export async function consentAction(form: FormData) {
  const s = await requireMy(true);
  const agreed = form.get("agree") === "yes";
  const back = safeBack(form.get("back"), "/my/log");
  try {
    await setConsent(await getDb(), s, agreed, { ip: (await requestMeta()).ip });
  } catch (e) {
    redirect(errorUrl(back, userMessage(e)));
  }
  redirect(agreed ? back : "/my/more?withdrawn=1");
}

export async function addEntryAction(form: FormData) {
  const s = await requireMy(true);
  const vehicleId = String(form.get("vehicleId") ?? "");
  const again = form.get("again") === "1";
  const kind = String(form.get("kind") ?? "");
  try {
    await addEntry(await getDb(), s, {
      vehicleId,
      kind,
      sub: String(form.get("sub") ?? "") || null,
      on: String(form.get("on") ?? ""),
      mileage: num(form.get("mileage")),
      amount: num(form.get("amount")),
      qty: num(form.get("qty")),
      unitPrice: num(form.get("unitPrice")),
      place: String(form.get("place") ?? ""),
      memo: String(form.get("memo") ?? ""),
      intervalKm: num(form.get("intervalKm")),
      intervalMonths: num(form.get("intervalMonths")),
      insuranceUntil: String(form.get("insuranceUntil") ?? "") || null,
    });
  } catch (e) {
    redirect(errorUrl(`/my/log/new?kind=${encodeURIComponent(kind)}&car=${encodeURIComponent(vehicleId)}`, userMessage(e)));
  }
  redirect(again ? `/my/log/new?kind=${encodeURIComponent(kind)}&car=${encodeURIComponent(vehicleId)}&saved=1` : `/my/log?car=${encodeURIComponent(vehicleId)}&saved=1`);
}

export async function deleteEntryAction(form: FormData) {
  const s = await requireMy(true);
  const car = String(form.get("car") ?? "");
  try {
    await deleteEntry(await getDb(), s, String(form.get("id") ?? ""));
  } catch (e) {
    redirect(errorUrl(`/my/log?car=${encodeURIComponent(car)}`, userMessage(e)));
  }
  redirect(`/my/log?car=${encodeURIComponent(car)}&deleted=1`);
}

/** 더보기 › 알림: 받을 알림과 차마다 보험 만기일을 한 번에 */
export async function savePrefsAction(form: FormData) {
  const s = await requireMy(true);
  try {
    const db = await getDb();
    await savePrefs(db, s, form.getAll("alerts").map(String));
    for (const [k, v] of form.entries()) if (k.startsWith("ins_")) await saveInsurance(db, s, k.slice(4), String(v) || null);
  } catch (e) {
    redirect(errorUrl("/my/more", userMessage(e)));
  }
  redirect("/my/more?prefs=1");
}

export async function leaveAction() {
  const s = await requireMy(true);
  try {
    await leaveCarbook(await getDb(), s, { ip: (await requestMeta()).ip });
  } catch (e) {
    redirect(errorUrl("/my/more", userMessage(e)));
  }
  await clearMyCookie();
  redirect("/my/login?left=1");
}
