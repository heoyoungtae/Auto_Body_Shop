// 결재선 만들기: 양식 결재란(StepTemplate)을 실제 사람으로 푼다.
// 원칙: 기안자는 자기 문서를 검토·승인하지 않는다. 담당자가 기안자뿐이거나 없으면 대표에게 올린다.
// 대표가 기안했고 승인자가 대표뿐이면 대표 자기결재로 표시한다(경영검토에서 따로 본다).
import { UserError } from "@/modules/platform/errors";
import { and, eq, isNull } from "drizzle-orm";
import type { Db } from "@/db/client";
import { appUser, userRole } from "@/db/schema";
import type { Role } from "../auth/roles";
import { resolveApprover } from "../platform/delegation";
import type { DocumentFlag, ResolvedStep, StepTemplate } from "./types";

export class LineError extends UserError {}

export async function usersWithRole(db: Db, role: Role): Promise<string[]> {
  const rows = await db
    .select({ id: appUser.id })
    .from(userRole)
    .innerJoin(appUser, eq(appUser.id, userRole.userId))
    .where(and(eq(userRole.role, role), eq(appUser.active, true), isNull(appUser.retiredOn)));
  return rows.map((r) => r.id).sort();
}

export async function rolesOf(db: Db, userId: string): Promise<Role[]> {
  const rows = await db.select({ role: userRole.role }).from(userRole).where(eq(userRole.userId, userId));
  return rows.map((r) => r.role);
}

export async function buildLine(
  db: Db,
  templates: StepTemplate[],
  drafterId: string,
  data: Record<string, unknown>,
): Promise<{ steps: ResolvedStep[]; flags: DocumentFlag[] }> {
  const drafterRoles = await rolesOf(db, drafterId);
  const flags: DocumentFlag[] = [];
  const steps: ResolvedStep[] = [];
  for (const [seq, t] of templates.entries()) {
    let roles: (Role | "drafter")[] = t.assignees ?? [];
    if (t.delegation) {
      const raw = t.delegation.amountField ? data[t.delegation.amountField] : null;
      const amount = raw == null ? null : Number(raw);
      if (amount != null && !Number.isFinite(amount)) throw new LineError("금액을 확인해 주세요");
      roles = [await resolveApprover(db, t.delegation.task, amount, drafterRoles)];
    }
    let candidates: string[] = [];
    for (const r of roles) candidates.push(...(r === "drafter" ? [drafterId] : await usersWithRole(db, r)));
    candidates = [...new Set(candidates)];
    if (t.kind !== "draft") {
      const others = candidates.filter((c) => c !== drafterId);
      if (others.length) {
        candidates = others;
      } else {
        const owners = (await usersWithRole(db, "owner")).filter((c) => c !== drafterId);
        if (owners.length) {
          candidates = owners;
          if (!flags.includes("escalated")) flags.push("escalated");
        } else if (drafterRoles.includes("owner") && (t.kind === "approve" || t.kind === "review")) {
          candidates = [drafterId];
          if (!flags.includes("owner_self_approval")) flags.push("owner_self_approval");
        } else {
          throw new LineError(`${t.label} 담당자가 없습니다. 설정에서 역할을 지정해 주세요`);
        }
      }
    }
    steps.push({ seq, kind: t.kind, label: t.label, candidates, mode: t.mode ?? "any", status: "waiting", doneBy: [] });
  }
  return { steps, flags };
}
