"use server";
import { redirect } from "next/navigation";
import { getDb } from "@/db/runtime";
import { act, ApprovalError, createDraft, requestCancel, submit, type ActType } from "@/modules/approval/service";
import { errorUrl, noticeUrl, requireUser, userMessage } from "../_lib/session";

export async function createRevisionRequestAction(form: FormData) {
  const user = await requireUser();
  const data = {
    target: String(form.get("target") ?? "").trim(),
    current: String(form.get("current") ?? "").trim(),
    proposed: String(form.get("proposed") ?? "").trim(),
    reason: String(form.get("reason") ?? "").trim(),
  };
  let id: string;
  try {
    if (!data.target || !data.proposed || !data.reason) throw new ApprovalError("대상, 바꿀 내용, 사유를 모두 적어 주세요");
    const db = await getDb();
    const doc = await createDraft(db, { formCode: "F-Q-05", title: String(form.get("title") ?? data.target), data, drafterId: user.id });
    await submit(db, doc.id, user.id);
    id = doc.id;
  } catch (e) {
    redirect(errorUrl("/approvals/new", userMessage(e)));
  }
  redirect(noticeUrl(`/approvals/${id}`, "상신했습니다"));
}

export async function actAction(form: FormData) {
  const user = await requireUser();
  const id = String(form.get("id"));
  const type = String(form.get("type")) as ActType;
  try {
    await act(await getDb(), id, user.id, type, String(form.get("comment") ?? "") || null);
  } catch (e) {
    redirect(errorUrl(`/approvals/${id}`, userMessage(e)));
  }
  redirect(noticeUrl(`/approvals/${id}`, type === "reject" ? "반려했습니다" : "처리했습니다"));
}

export async function resubmitAction(form: FormData) {
  const user = await requireUser();
  const id = String(form.get("id"));
  try {
    await submit(await getDb(), id, user.id);
  } catch (e) {
    redirect(errorUrl(`/approvals/${id}`, userMessage(e)));
  }
  redirect(noticeUrl(`/approvals/${id}`, "다시 상신했습니다"));
}

export async function cancelAction(form: FormData) {
  const user = await requireUser();
  const id = String(form.get("id"));
  let cancelId: string;
  try {
    cancelId = (await requestCancel(await getDb(), id, user.id, String(form.get("reason") ?? ""))).id;
  } catch (e) {
    redirect(errorUrl(`/approvals/${id}`, userMessage(e)));
  }
  redirect(noticeUrl(`/approvals/${cancelId}`, "취소 문서를 상신했습니다"));
}
