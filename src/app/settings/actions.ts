"use server";
import { redirect } from "next/navigation";
import { getDb } from "@/db/runtime";
import { proxyAssignment } from "@/db/schema";
import { isRole, type Role } from "@/modules/auth/roles";
import { resetPassword, setActive, setRoles } from "@/modules/auth/service";
import { changeBands, DelegationError, isDelegationTask, type Band } from "@/modules/platform/delegation";
import { writeAudit } from "@/modules/platform/audit";
import { changePolicy } from "@/modules/platform/policy";
import { assertRevisionRequestNo } from "@/modules/approval/service";
import { errorUrl, noticeUrl, requireOwner, userMessage } from "../_lib/session";

const s = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

export async function changePolicyAction(form: FormData) {
  const user = await requireOwner();
  const key = s(form, "key");
  try {
    await assertRevisionRequestNo(await getDb(), s(form, "revisionRequestNo") || null);
    await changePolicy(await getDb(), user.id, {
      key,
      value: Number(s(form, "value").replace(/[,\s]/g, "")),
      effectiveFrom: s(form, "effectiveFrom"),
      reason: s(form, "reason"),
      revisionRequestNo: s(form, "revisionRequestNo") || null,
    });
  } catch (e) {
    redirect(errorUrl(`/settings/policies?key=${encodeURIComponent(key)}`, userMessage(e)));
  }
  redirect(noticeUrl(`/settings/policies?key=${encodeURIComponent(key)}`, "바꿨습니다"));
}

export async function changeBandsAction(form: FormData) {
  const user = await requireOwner();
  const task = s(form, "task");
  try {
    if (!isDelegationTask(task)) throw new DelegationError("알 수 없는 업무");
    const bands: Band[] = [];
    for (let i = 0; i < 4; i++) {
      const role = s(form, `role${i}`);
      if (!role) continue;
      if (!isRole(role)) throw new DelegationError("역할을 확인해 주세요");
      const raw = s(form, `upTo${i}`).replace(/[,\s원%]/g, "");
      bands.push({ upTo: raw === "" ? null : Number(raw), role: role as Role });
    }
    await assertRevisionRequestNo(await getDb(), s(form, "revisionRequestNo") || null);
    await changeBands(await getDb(), user.id, task, bands, s(form, "effectiveFrom"), s(form, "revisionRequestNo") || null);
  } catch (e) {
    redirect(errorUrl(`/settings/delegation?task=${task}`, userMessage(e)));
  }
  redirect(noticeUrl("/settings/delegation", "전결 규정을 바꿨습니다"));
}

export async function updateUserAction(form: FormData) {
  const user = await requireOwner();
  const id = s(form, "id");
  const op = s(form, "op");
  try {
    const db = await getDb();
    if (op === "roles") await setRoles(db, user.id, id, form.getAll("roles").map(String));
    if (op === "lock") await setActive(db, user.id, id, false);
    if (op === "unlock") await setActive(db, user.id, id, true);
    if (op === "password") await resetPassword(db, user.id, id, s(form, "password"));
  } catch (e) {
    redirect(errorUrl("/settings/users", userMessage(e)));
  }
  redirect(noticeUrl("/settings/users", "저장했습니다"));
}

export async function addProxyAction(form: FormData) {
  const user = await requireOwner();
  const fromDate = s(form, "fromDate");
  const toDate = s(form, "toDate");
  const proxyId = s(form, "proxyId");
  if (!proxyId) redirect(errorUrl("/settings/users", "대리인을 골라 주세요"));
  if (!fromDate || !toDate) redirect(errorUrl("/settings/users", "대리 시작일과 종료일을 모두 골라 주세요"));
  if (toDate < fromDate) redirect(errorUrl("/settings/users", "종료일이 시작일보다 앞입니다"));
  const db = await getDb();
  await db.insert(proxyAssignment).values({ principalId: user.id, proxyId, fromDate, toDate });
  await writeAudit(db, { actorId: user.id, action: "proxy.add", entityType: "proxy", entityId: proxyId, after: { fromDate, toDate } });
  redirect(noticeUrl("/settings/users", "대리 승인자를 지정했습니다"));
}
