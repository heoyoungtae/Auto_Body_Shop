"use server";
// 내부심사(F-Q-08, Q.7) 화면의 서버 동작
import { redirect } from "next/navigation";
import { getDb } from "@/db/runtime";
import {
  addFinding,
  approveAudit,
  planAudit,
  removeFinding,
  reportAudit,
  returnAudit,
  updateAudit,
  type AuditInput,
} from "@/modules/quality/audit";
import { UserError } from "@/modules/platform/errors";
import { errorUrl, noticeUrl, requireUser, userMessage } from "../_lib/session";

const str = (form: FormData) => (k: string) => String(form.get(k) ?? "").trim();
function input(form: FormData): AuditInput {
  const s = str(form);
  return {
    plannedOn: s("plannedOn"),
    scope: form.getAll("scope").map(String),
    auditorId: s("auditorId"),
    externalAuditor: s("externalAuditor"),
    auditeeIds: form.getAll("auditeeIds").map(String),
    criteria: s("criteria"),
  };
}

export async function planAuditAction(form: FormData) {
  const user = await requireUser();
  let r = { id: "", docNo: "" };
  try {
    r = await planAudit(await getDb(), user, input(form));
  } catch (e) {
    redirect(errorUrl("/audits/new", userMessage(e)));
  }
  redirect(
    noticeUrl(
      `/audits/${r.id}`,
      `${r.docNo} 계획을 세웠습니다. 심사자와 피심사자에게 알림이 갑니다`,
    ),
  );
}

export async function auditAction(form: FormData) {
  const user = await requireUser();
  const s = str(form);
  const id = s("id");
  const back = `/audits/${id}`;
  let msg = "저장했습니다";
  try {
    const db = await getDb();
    const intent = s("intent");
    if (intent === "update") await updateAudit(db, user, id, input(form));
    else if (intent === "finding") {
      const nc = await addFinding(db, user, id, {
        chapter: s("chapter"),
        target: s("target"),
        evidence: s("evidence"),
        finding: s("finding"),
        verdict: s("verdict"),
      });
      msg = nc
        ? "부적합으로 기록하고 부적합 보고서를 발행했습니다"
        : "발견 사항을 기록했습니다";
    } else if (intent === "remove") {
      await removeFinding(db, user, s("findingId"));
      msg = "지웠습니다";
    } else if (intent === "report") {
      await reportAudit(db, user, id, s("summary"));
      msg = "보고했습니다. 대표 승인을 기다립니다";
    } else if (intent === "approve") {
      await approveAudit(db, user, id);
      msg = "승인했습니다. 경영검토 자료로 넘어갑니다";
    } else if (intent === "return") {
      await returnAudit(db, user, id, s("reason"));
      msg = "보완을 요청했습니다";
    } else throw new UserError("알 수 없는 요청");
  } catch (e) {
    redirect(errorUrl(back, userMessage(e)));
  }
  redirect(noticeUrl(back, msg));
}
