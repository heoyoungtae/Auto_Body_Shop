"use server";
// 외주 의뢰(STD-07 8절, F-07-03) 화면의 서버 동작
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db/runtime";
import { addOsPhoto, approveOutsource, cancelOutsource, createOutsource, judgeOutsource, noticeCustomer, recordResult, removeOsPhoto, requestOutsource, resubmitOutsource, vehicleOut, type OsInput } from "@/modules/purchase/outsource";
import { UserError } from "@/modules/platform/errors";
import { errorUrl, noticeUrl, requireUser, userMessage } from "../_lib/session";

const str = (form: FormData) => (k: string) => String(form.get(k) ?? "").trim();
const num = (v: string) => {
  const d = v.replace(/[^\d]/g, "");
  return d ? Number(d) : NaN;
};

function input(form: FormData): OsInput {
  const s = str(form);
  return { supplierId: s("supplierId"), workType: s("workType"), scope: s("scope"), required: s("required"), dueOn: s("dueOn"), amountWon: num(s("amountWon")), moveOut: s("moveOut") !== "0" };
}

export async function createOutsourceAction(form: FormData) {
  const user = await requireUser();
  const s = str(form);
  let id = "";
  try {
    ({ id } = await createOutsource(await getDb(), user, s("repairOrderId"), input(form), s("emergency") === "1"));
  } catch (e) {
    redirect(errorUrl(`/outsource/new?ro=${s("repairOrderId")}`, userMessage(e)));
  }
  redirect(noticeUrl(`/outsource/${id}`, "외주 의뢰서를 만들고 승인을 요청했습니다"));
}

export async function outsourceAction(form: FormData) {
  const user = await requireUser();
  const s = str(form);
  const id = s("id");
  const back = `/outsource/${id}`;
  let msg = "저장했습니다";
  try {
    const db = await getDb();
    const intent = form.getAll("intent").map(String).pop();
    if (intent === "resubmit") {
      await resubmitOutsource(db, user, id, input(form), s("emergency") === "1");
      msg = "고쳐서 다시 승인을 요청했습니다";
    } else if (intent === "approve") {
      const ok = s("ok") === "1";
      await approveOutsource(db, user, id, ok, s("decideNote"));
      msg = ok ? "승인했습니다. 공장장이 업체에 의뢰합니다" : "되돌렸습니다";
    } else if (intent === "request") {
      await requestOutsource(db, user, id);
      msg = "의뢰했다고 기록했습니다";
    } else if (intent === "notice") {
      await noticeCustomer(db, user, id, s("noticeNote"));
      msg = "고객 알림을 기록했습니다. 이제 반출할 수 있습니다";
    } else if (intent === "out") {
      await vehicleOut(db, user, id, num(s("outKm")));
      msg = "반출을 기록했습니다";
    } else if (intent === "result") {
      const km = s("inKm");
      await recordResult(db, user, id, { note: s("resultNote"), inKm: km ? num(km) : null });
      msg = "결과를 기록했습니다. 사진·성적서를 올리고 공장장이 확인합니다";
    } else if (intent === "accept") {
      await judgeOutsource(db, user, id, true, "");
      msg = "외주 결과를 수용했습니다. 최종 검사에서 함께 확인합니다";
    } else if (intent === "redo") {
      await judgeOutsource(db, user, id, false, s("redoNote"));
      msg = "재작업을 요청했습니다";
    } else if (intent === "cancel") {
      await cancelOutsource(db, user, id, s("cancelReason"));
      msg = "외주를 취소했습니다";
    } else throw new UserError("알 수 없는 요청");
  } catch (e) {
    redirect(errorUrl(back, userMessage(e)));
  }
  redirect(noticeUrl(back, msg));
}

type R = { ok: true } | { ok: false; error: string };

export async function uploadOsPhotoAction(form: FormData): Promise<R> {
  const user = await requireUser();
  const file = form.get("file");
  const id = String(form.get("id") ?? "");
  try {
    if (!(file instanceof Blob)) throw new UserError("사진을 고르지 않았습니다");
    await addOsPhoto(await getDb(), user, id, new Uint8Array(await file.arrayBuffer()));
  } catch (e) {
    return { ok: false, error: userMessage(e) };
  }
  revalidatePath(`/outsource/${id}`);
  return { ok: true };
}

export async function removeOsPhotoAction(form: FormData): Promise<R> {
  const user = await requireUser();
  const id = String(form.get("id") ?? "");
  try {
    await removeOsPhoto(await getDb(), user, id, String(form.get("path") ?? ""));
  } catch (e) {
    return { ok: false, error: userMessage(e) };
  }
  revalidatePath(`/outsource/${id}`);
  return { ok: true };
}
