"use server";
// 보증·불만 처리(STD-06, F-06-02) 화면의 서버 동작
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db/runtime";
import { ackComplaint, addComplaintPhoto, agreeComplaint, approveCompensation, closeComplaint, judgeComplaint, receiveComplaint, removeComplaintPhoto } from "@/modules/cs/service";
import { UserError } from "@/modules/platform/errors";
import { errorUrl, noticeUrl, requireUser, userMessage } from "../_lib/session";

const str = (form: FormData) => (k: string) => String(form.get(k) ?? "").trim();

export async function receiveAction(form: FormData) {
  const user = await requireUser();
  const s = str(form);
  let id = "";
  let docNo = "";
  try {
    ({ id, docNo } = await receiveComplaint(await getDb(), user, { channel: s("channel"), category: s("category"), repairOrderId: s("repairOrderId") || undefined, who: s("who"), phone: s("phone"), content: s("content"), wish: s("wish"), urgent: s("urgent") === "1" }));
  } catch (e) {
    const ro = s("repairOrderId");
    redirect(errorUrl(`/complaints/new${ro ? `?ro=${ro}` : ""}`, userMessage(e)));
  }
  redirect(noticeUrl(`/complaints/${id}`, `${docNo}로 접수했습니다. 상담원에게 알렸습니다. 사진이 있으면 아래에 올리세요`));
}

export async function complaintAction(form: FormData) {
  const user = await requireUser();
  const s = str(form);
  const id = s("id");
  const intent = s("intent");
  const back = `/complaints/${id}`;
  let msg = "저장했습니다";
  try {
    const db = await getDb();
    if (intent === "ack") {
      await ackComplaint(db, user, id, s("ackNote"));
      msg = "접수 안내를 기록했습니다. 품질 담당에게 현물 확인·판정을 알렸습니다";
    } else if (intent === "judge") {
      await judgeComplaint(db, user, id, { inspectNote: s("inspectNote"), verdict: s("verdict"), reason: s("verdictReason"), needNc: s("needNc") === "1" });
      msg = "판정을 저장했습니다. 상담원이 고객에게 설명하고 동의를 받습니다";
    } else if (intent === "agree") {
      const won = s("compWon").replace(/[^\d]/g, "");
      await agreeComplaint(db, user, id, { plan: s("plan"), resolution: s("resolution"), warrantyRoId: s("warrantyRoId"), compWon: won ? Number(won) : null, compNote: s("compNote") });
      msg = s("compNote") || won ? "고객 동의를 기록했습니다. 보상은 대표 승인을 기다립니다" : "고객 동의를 기록했습니다";
    } else if (intent === "comp") {
      await approveCompensation(db, user, id);
      msg = "보상을 승인했습니다";
    } else if (intent === "close") {
      const r = await closeComplaint(db, user, id, { satisfied: s("satisfied") === "1", note: s("closeNote") });
      msg = r.closed ? "만족을 확인하고 종결했습니다" : "고객이 만족하지 않아 종결하지 않았습니다. 대표에게 면담을 요청했습니다";
    } else throw new UserError("알 수 없는 요청");
  } catch (e) {
    redirect(errorUrl(back, userMessage(e)));
  }
  redirect(noticeUrl(back, msg));
}

type R = { ok: true } | { ok: false; error: string };

export async function uploadCpPhotoAction(form: FormData): Promise<R> {
  const user = await requireUser();
  const file = form.get("file");
  const id = String(form.get("id") ?? "");
  try {
    if (!(file instanceof Blob)) throw new UserError("사진을 고르지 않았습니다");
    await addComplaintPhoto(await getDb(), user, id, new Uint8Array(await file.arrayBuffer()));
  } catch (e) {
    return { ok: false, error: userMessage(e) };
  }
  revalidatePath(`/complaints/${id}`);
  return { ok: true };
}

export async function removeCpPhotoAction(form: FormData): Promise<R> {
  const user = await requireUser();
  const id = String(form.get("id") ?? "");
  try {
    await removeComplaintPhoto(await getDb(), user, id, String(form.get("path") ?? ""));
  } catch (e) {
    return { ok: false, error: userMessage(e) };
  }
  revalidatePath(`/complaints/${id}`);
  return { ok: true };
}
