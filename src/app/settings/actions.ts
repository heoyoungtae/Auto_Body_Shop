"use server";
import { syncNextMinWage } from "@/modules/staff/min-wage";
import { redirect } from "next/navigation";
import { getDb } from "@/db/runtime";
import { proxyAssignment } from "@/db/schema";
import { isRole, type Role } from "@/modules/auth/roles";
import { endSessions, setActive, setRoles } from "@/modules/auth/service";
import { changeBands, DelegationError, isDelegationTask, type Band } from "@/modules/platform/delegation";
import { writeAudit } from "@/modules/platform/audit";
import { changePolicy } from "@/modules/platform/policy";
import { applySimplifyMode, setSimple } from "@/modules/platform/simplify";
import { setFeature } from "@/modules/platform/features";
import { applyCandidate, dismissCandidate } from "@/modules/money/law-watch";
import { recordCheck } from "@/modules/platform/policy-check";
import { isPolicyGroup } from "@/modules/platform/policy-meta";
import { seoulDate } from "@/modules/platform/time";
import { UserError } from "@/modules/platform/errors";
import { assertRevisionRequestNo } from "@/modules/approval/service";
import { errorUrl, noticeUrl, requireOwner, requireUser, userMessage } from "../_lib/session";

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

/** 설정 › 간소화: 한 항목 켜고 끄기, 간편 모드·표준으로 한꺼번에(대표) */
export async function simplifyAction(form: FormData) {
  const user = await requireOwner();
  const intent = s(form, "intent");
  let msg = "";
  try {
    const db = await getDb();
    if (intent === "one") {
      const on = s(form, "on") === "1";
      const changed = await setSimple(db, user.id, s(form, "key"), on);
      msg = changed ? `${on ? "켰습니다" : "껐습니다"}. 오늘부터 적용됩니다` : "이미 그 값입니다";
    } else if (intent === "simple" || intent === "standard") {
      const n = await applySimplifyMode(db, user.id, intent);
      msg = n ? `${intent === "simple" ? "간편 모드로" : "표준(전부 기록)으로"} ${n}개 항목을 바꿨습니다` : "이미 그 모드입니다";
    } else if (intent === "feature") {
      const on = s(form, "on") === "1";
      const changed = await setFeature(db, user.id, s(form, "key"), on);
      msg = changed ? (on ? "메뉴에 다시 보입니다" : "메뉴에서 숨겼습니다. 기록은 그대로 남고 다시 켜면 돌아옵니다") : "이미 그 상태입니다";
    }
  } catch (e) {
    redirect(errorUrl("/settings/simplify", userMessage(e)));
  }
  redirect(noticeUrl("/settings/simplify", msg));
}

/** 법령 개정 새 값 후보: 적용(대표) 또는 그대로 두기(대표·회계) */
export async function policyCandidateAction(form: FormData) {
  const user = await requireUser();
  const key = s(form, "key");
  const url = `/settings/policies?key=${encodeURIComponent(key)}`;
  let msg = "";
  try {
    if (s(form, "intent") === "dismiss") {
      await dismissCandidate(await getDb(), user, key);
      msg = "후보를 넘겼습니다(값 그대로)";
    } else {
      const v = s(form, "value").replace(/[,\s]/g, "");
      await applyCandidate(await getDb(), user, key, v ? Number(v) : undefined);
      msg = "새 값을 시행일부터 적용했습니다";
    }
  } catch (e) {
    redirect(errorUrl(url, userMessage(e)));
  }
  redirect(noticeUrl(url, msg));
}

/** 분류 점검 완료(대표·회계) */
export async function policyCheckAction(form: FormData) {
  const user = await requireUser();
  const g = s(form, "g");
  const url = `/settings/policies?g=${encodeURIComponent(g)}`;
  try {
    if (!isPolicyGroup(g)) throw new UserError("분류를 골라 주세요");
    await recordCheck(await getDb(), user, g, s(form, "agent") === "1", s(form, "note"), seoulDate());
  } catch (e) {
    redirect(errorUrl(url, userMessage(e)));
  }
  redirect(noticeUrl(url, "점검 완료를 기록했습니다"));
}

/** 고시된 다음 해 최저임금을 지금 가져오기(대표) */
export async function syncMinWageAction() {
  const user = await requireOwner();
  const r = await syncNextMinWage(await getDb(), new Date(), { force: true, actorId: user.id });
  const url = `/settings/policies?key=wage.minimum_hourly`;
  if (r.status === "failed") redirect(errorUrl(url, `${r.message}. 직접 넣어 주세요`));
  redirect(noticeUrl(url, r.message));
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
  let msg = "저장했습니다";
  try {
    const db = await getDb();
    if (op === "roles") await setRoles(db, user.id, id, form.getAll("roles").map(String));
    if (op === "lock") {
      await setActive(db, user.id, id, false);
      msg = "계정을 잠갔습니다. 로그인된 기기도 모두 끊었습니다";
    }
    if (op === "unlock") await setActive(db, user.id, id, true);
    if (op === "logout") msg = `기기 ${await endSessions(db, user.id, id, s(form, "which") || "all", user.id === id ? user.sessionHash : undefined)}곳을 로그아웃했습니다`;
  } catch (e) {
    redirect(errorUrl(`/settings/users#u-${id}`, userMessage(e)));
  }
  redirect(noticeUrl("/settings/users", msg));
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
