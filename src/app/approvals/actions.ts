"use server";
// 문서 개정 요청서(F-Q-05) 승인 때 문서 목록 판을 올리는 후처리 등록
import "@/modules/quality/qms";
import { redirect } from "next/navigation";
import { getDb } from "@/db/runtime";
import {
  act,
  ApprovalError,
  createDraft,
  requestCancel,
  submit,
  type ActType,
} from "@/modules/approval/service";
import { isDelegationTask } from "@/modules/platform/delegation";
import { DEFAULT_POLICY, isPolicyKey } from "@/modules/platform/policy";
import { errorUrl, noticeUrl, requireUser, userMessage } from "../_lib/session";

export async function createRevisionRequestAction(form: FormData) {
  const user = await requireUser();
  const str = (k: string) => String(form.get(k) ?? "").trim();
  const back = `/approvals/new${str("docId") ? `?doc=${encodeURIComponent(str("docId"))}` : str("policyKey") ? `?policy=${encodeURIComponent(str("policyKey"))}` : str("delegationTask") ? `?task=${encodeURIComponent(str("delegationTask"))}` : ""}`;
  let id: string;
  try {
    const data: Record<string, unknown> = {
      target: str("target"),
      current: str("current"),
      proposed: str("proposed"),
      reason: str("reason"),
    };
    const policyKey = str("policyKey");
    if (policyKey) {
      if (!isPolicyKey(policyKey))
        throw new ApprovalError("알 수 없는 정책값입니다");
      const def = DEFAULT_POLICY[policyKey] as {
        unit: string;
        min?: number;
        max?: number;
        label: string;
      };
      const raw = str("proposedValue").replace(/[^\d]/g, "");
      if (!raw) throw new ApprovalError("바꿀 값을 숫자로 적어 주세요");
      const v = Number(raw);
      if (v < (def.min ?? 0) || (def.max != null && v > def.max))
        throw new ApprovalError(
          `${def.label}: ${def.min ?? 0}~${def.max ?? "제한 없음"} 사이로 적어 주세요`,
        );
      data.policyKey = policyKey;
      data.proposedValue = v;
      // 바꿀 내용을 따로 치지 않아도 값으로 채운다(중복 입력 없음)
      data.proposed = [
        `${v.toLocaleString("ko-KR")} ${def.unit}`,
        data.proposed,
      ]
        .filter(Boolean)
        .join("\n");
    }
    if (str("docId")) data.docId = str("docId");
    const task = str("delegationTask");
    if (task) {
      if (!isDelegationTask(task))
        throw new ApprovalError("알 수 없는 전결 업무입니다");
      data.delegationTask = task;
    }
    if (!data.target || !data.proposed || !data.reason)
      throw new ApprovalError("대상, 바꿀 내용, 사유를 모두 적어 주세요");
    const db = await getDb();
    const doc = await createDraft(db, {
      formCode: "F-Q-05",
      title: str("title") || String(data.target),
      data,
      drafterId: user.id,
    });
    await submit(db, doc.id, user.id);
    id = doc.id;
  } catch (e) {
    redirect(errorUrl(back, userMessage(e)));
  }
  redirect(
    noticeUrl(
      `/approvals/${id}`,
      "상신했습니다. 품질 담당에게 알림이 갔습니다",
    ),
  );
}

export async function actAction(form: FormData) {
  const user = await requireUser();
  const id = String(form.get("id"));
  const type = String(form.get("type")) as ActType;
  try {
    await act(
      await getDb(),
      id,
      user.id,
      type,
      String(form.get("comment") ?? "") || null,
    );
  } catch (e) {
    redirect(errorUrl(`/approvals/${id}`, userMessage(e)));
  }
  redirect(
    noticeUrl(
      `/approvals/${id}`,
      type === "reject" ? "반려했습니다" : "처리했습니다",
    ),
  );
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
    cancelId = (
      await requestCancel(
        await getDb(),
        id,
        user.id,
        String(form.get("reason") ?? ""),
      )
    ).id;
  } catch (e) {
    redirect(errorUrl(`/approvals/${id}`, userMessage(e)));
  }
  redirect(noticeUrl(`/approvals/${cancelId}`, "취소 문서를 상신했습니다"));
}
