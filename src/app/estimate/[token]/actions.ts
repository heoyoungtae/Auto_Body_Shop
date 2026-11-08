"use server";
import { redirect } from "next/navigation";
import { getDb } from "@/db/runtime";
import { approveByLink } from "@/modules/repair/estimate-approval";
import { errorUrl, requestMeta, userMessage } from "../../_lib/session";

/** 고객이 링크에서 견적 승인(로그인 없음). 토큰이 곧 권한이다 */
export async function approveEstimateAction(form: FormData) {
  const token = String(form.get("token") ?? "");
  const sig = String(form.get("signature") ?? "");
  const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(sig);
  let outcome: string;
  try {
    const r = await approveByLink(
      await getDb(),
      token,
      { groups: form.getAll("groups").map(String), name: String(form.get("approverName") ?? ""), agree: form.getAll("agree").includes("yes"), signaturePng: m ? new Uint8Array(Buffer.from(m[1], "base64")) : null },
      { ip: (await requestMeta()).ip },
    );
    outcome = r.outcome;
  } catch (e) {
    redirect(errorUrl(`/estimate/${token}`, userMessage(e)));
  }
  redirect(`/estimate/${token}?done=${outcome}`);
}
