// 내부심사 계획·보고서(F-Q-08, 총람 Q.7)
// 품질 담당·대표가 계획(심사일·범위·심사자·피심사자) → 심사자가 장별 발견 사항 기록(부적합은 F-Q-10 자동 발행)
// → 심사자 보고(종합 의견) → 대표 승인. 연 1회(11월) 모든 장을 심사하고, 심사자는 자기 업무를 심사하지 않는다.
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import type { Db } from "@/db/client";
import { appUser, auditFinding, internalAudit } from "@/db/schema";
import { can } from "@/modules/auth/permissions";
import type { Role } from "@/modules/auth/roles";
import { writeAudit } from "@/modules/platform/audit";
import { nextDocNo } from "@/modules/platform/docno";
import { UserError } from "@/modules/platform/errors";
import { notifyRole, notifyUser } from "@/modules/platform/notify";
import { addDays, seoulDate } from "@/modules/platform/time";
import { openNc } from "./nc";
import { STD_CHAPTERS, VERDICT, type Verdict } from "./risk-rules";

export class AuditError extends UserError {}
type Actor = { id: string; roles: Role[] };
const clean = (s: string | null | undefined) => (s ?? "").trim() || null;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

async function row(db: Db, id: string) {
  const [x] = await db
    .select()
    .from(internalAudit)
    .where(eq(internalAudit.id, id));
  if (!x) throw new AuditError("내부심사를 찾을 수 없습니다");
  return x;
}

export type AuditInput = {
  plannedOn: string;
  scope: string[];
  auditorId: string;
  externalAuditor: string;
  auditeeIds: string[];
  criteria: string;
};

function check(i: AuditInput) {
  if (!DATE.test(i.plannedOn)) throw new AuditError("심사일을 적어 주세요");
  const scope = STD_CHAPTERS.filter((c) => i.scope.includes(c));
  if (!scope.length) throw new AuditError("심사할 장을 하나 이상 골라 주세요");
  const ext = i.externalAuditor.trim();
  if (!i.auditorId && !ext)
    throw new AuditError("심사자를 고르거나 외부 심사원 이름을 적어 주세요");
  if (i.auditorId && ext)
    throw new AuditError("사내 심사자와 외부 심사원 중 하나만 정해 주세요");
  const auditees = [...new Set(i.auditeeIds.filter(Boolean))];
  if (!auditees.length)
    throw new AuditError("심사받는 업무의 담당자(피심사자)를 골라 주세요");
  if (i.auditorId && auditees.includes(i.auditorId))
    throw new AuditError(
      "심사자는 자기 업무를 심사할 수 없습니다. 피심사자에서 빼거나 다른 심사자를 고르세요",
    );
  return {
    plannedOn: i.plannedOn,
    year: Number(i.plannedOn.slice(0, 4)),
    scope,
    auditorId: i.auditorId || null,
    externalAuditor: ext || null,
    auditeeIds: auditees,
    criteria: clean(i.criteria),
  };
}

/** 계획: 품질 담당·대표. 심사자와 피심사자에게 알림 */
export async function planAudit(
  db: Db,
  actor: Actor,
  input: AuditInput,
  now = new Date(),
) {
  if (!can(actor, "audit.manage"))
    throw new AuditError("내부심사 계획은 품질 담당·대표가 세웁니다");
  const v = check(input);
  const docNo = await nextDocNo(db, "IA", now);
  const [r] = await db
    .insert(internalAudit)
    .values({ ...v, docNo, createdBy: actor.id, createdAt: now })
    .returning({ id: internalAudit.id });
  await writeAudit(db, {
    actorId: actor.id,
    action: "audit.plan",
    entityType: "internal_audit",
    entityId: docNo,
    after: { plannedOn: v.plannedOn, scope: v.scope.length },
  });
  if (v.auditorId)
    await notifyUser(
      db,
      v.auditorId,
      `내부심사 심사자 지정(${v.plannedOn}): ${v.scope.join(", ").slice(0, 60)}`,
      `audit-auditor-${r.id}`,
      `/audits/${r.id}`,
    );
  for (const u of v.auditeeIds)
    await notifyUser(
      db,
      u,
      `내부심사 예정(${v.plannedOn}): 관련 기록을 준비해 주세요`,
      `audit-auditee-${r.id}-${u}`,
      `/audits/${r.id}`,
    );
  return { id: r.id, docNo };
}

export async function updateAudit(
  db: Db,
  actor: Actor,
  id: string,
  input: AuditInput,
  now = new Date(),
) {
  if (!can(actor, "audit.manage"))
    throw new AuditError("계획은 품질 담당·대표가 고칩니다");
  const x = await row(db, id);
  if (x.status !== "planned")
    throw new AuditError("보고한 심사는 고칠 수 없습니다");
  const v = check(input);
  await db.update(internalAudit).set(v).where(eq(internalAudit.id, id));
  await writeAudit(db, {
    actorId: actor.id,
    action: "audit.edit",
    entityType: "internal_audit",
    entityId: x.docNo,
    after: { plannedOn: v.plannedOn },
  });
  if (v.auditorId && v.auditorId !== x.auditorId)
    await notifyUser(
      db,
      v.auditorId,
      `내부심사 심사자 지정(${v.plannedOn})`,
      `audit-auditor-${id}-${now.getTime()}`,
      `/audits/${id}`,
    );
}

/** 기록할 수 있는 사람: 지정 심사자, 외부 심사원이면 품질 담당·대표가 대신 */
export const mayRecord = (
  actor: Actor,
  x: { auditorId: string | null; status: string },
) =>
  x.status === "planned" &&
  (x.auditorId ? x.auditorId === actor.id : can(actor, "audit.manage"));

export type FindingInput = {
  chapter: string;
  target: string;
  evidence: string;
  finding: string;
  verdict: string;
};

export async function addFinding(
  db: Db,
  actor: Actor,
  id: string,
  input: FindingInput,
  now = new Date(),
) {
  const x = await row(db, id);
  if (!mayRecord(actor, x))
    throw new AuditError(
      x.status !== "planned"
        ? "보고한 심사에는 더 적을 수 없습니다"
        : "지정된 심사자가 기록합니다",
    );
  if (!x.scope.includes(input.chapter))
    throw new AuditError("심사 범위에 있는 장을 골라 주세요");
  if (!(input.verdict in VERDICT))
    throw new AuditError("적합·개선 권고·부적합 중 하나를 골라 주세요");
  const verdict = input.verdict as Verdict;
  if (!input.evidence.trim())
    throw new AuditError("확인한 기록·현장을 적어 주세요");
  if (verdict !== "ok" && !input.finding.trim())
    throw new AuditError("무엇이 기준과 다른지 발견 사항을 적어 주세요");
  if (seoulDate(now) < x.plannedOn)
    throw new AuditError(`심사일(${x.plannedOn})부터 기록합니다`);
  let ncId: string | null = null;
  if (verdict === "nc") {
    const nc = await openNc(
      db,
      actor,
      {
        source: "audit",
        refType: "internal_audit",
        refId: id,
        refLabel: x.docNo,
        content: `내부심사 ${x.docNo} 지적(${input.chapter}${input.target.trim() ? ` ${input.target.trim()}` : ""}): ${input.finding.trim()}`,
      },
      now,
    );
    ncId = nc.id;
  }
  await db
    .insert(auditFinding)
    .values({
      auditId: id,
      chapter: input.chapter,
      target: clean(input.target),
      evidence: input.evidence.trim(),
      finding: clean(input.finding),
      verdict,
      ncId,
      by: actor.id,
      at: now,
    });
  return ncId;
}

/** 발견 사항 지우기: 보고 전, 부적합으로 발행되지 않은 것만 */
export async function removeFinding(db: Db, actor: Actor, findingId: string) {
  const [f] = await db
    .select()
    .from(auditFinding)
    .where(eq(auditFinding.id, findingId));
  if (!f) throw new AuditError("발견 사항을 찾을 수 없습니다");
  const x = await row(db, f.auditId);
  if (!mayRecord(actor, x))
    throw new AuditError("지정된 심사자가 보고 전에만 지웁니다");
  if (f.ncId)
    throw new AuditError(
      "부적합으로 발행된 것은 지울 수 없습니다. 부적합 화면에서 처리하세요",
    );
  await db.delete(auditFinding).where(eq(auditFinding.id, findingId));
}

/** 보고: 범위의 모든 장에 기록이 있어야 한다. 대표에게 승인 요청 */
export async function reportAudit(
  db: Db,
  actor: Actor,
  id: string,
  summary: string,
  now = new Date(),
) {
  const x = await row(db, id);
  if (!mayRecord(actor, x))
    throw new AuditError(
      x.status !== "planned"
        ? "이미 보고했습니다"
        : "지정된 심사자가 보고합니다",
    );
  const fs = await db
    .select({ chapter: auditFinding.chapter })
    .from(auditFinding)
    .where(eq(auditFinding.auditId, id));
  const left = x.scope.filter((c) => !fs.some((f) => f.chapter === c));
  if (left.length)
    throw new AuditError(`아직 기록이 없는 장이 있습니다: ${left.join(", ")}`);
  if (!summary.trim()) throw new AuditError("종합 의견·좋은 점을 적어 주세요");
  await db
    .update(internalAudit)
    .set({ status: "reported", summary: summary.trim(), reportedAt: now })
    .where(eq(internalAudit.id, id));
  await writeAudit(db, {
    actorId: actor.id,
    action: "audit.report",
    entityType: "internal_audit",
    entityId: x.docNo,
    after: { findings: fs.length },
  });
  await notifyRole(
    db,
    "owner",
    `내부심사 보고 ${x.docNo}: 승인해 주세요`,
    `audit-report-${id}`,
    `/audits/${id}`,
  );
}

/** 대표 승인. 되돌리기(보완 요청)도 대표가 */
export async function approveAudit(
  db: Db,
  actor: Actor,
  id: string,
  now = new Date(),
) {
  if (!can(actor, "audit.approve"))
    throw new AuditError("내부심사 승인은 대표가 합니다");
  const x = await row(db, id);
  if (x.status !== "reported") throw new AuditError("보고된 심사만 승인합니다");
  await db
    .update(internalAudit)
    .set({ status: "approved", approvedBy: actor.id, approvedAt: now })
    .where(eq(internalAudit.id, id));
  await writeAudit(db, {
    actorId: actor.id,
    action: "audit.approve",
    entityType: "internal_audit",
    entityId: x.docNo,
  });
  if (x.auditorId && x.auditorId !== actor.id)
    await notifyUser(
      db,
      x.auditorId,
      `내부심사 ${x.docNo} 승인됨`,
      `audit-approved-${id}`,
      `/audits/${id}`,
    );
}
export async function returnAudit(
  db: Db,
  actor: Actor,
  id: string,
  reason: string,
  now = new Date(),
) {
  if (!can(actor, "audit.approve"))
    throw new AuditError("보완 요청은 대표가 합니다");
  const x = await row(db, id);
  if (x.status !== "reported") throw new AuditError("보고된 심사만 되돌립니다");
  if (!reason.trim()) throw new AuditError("무엇을 보완할지 적어 주세요");
  await db
    .update(internalAudit)
    .set({ status: "planned", reportedAt: null })
    .where(eq(internalAudit.id, id));
  await writeAudit(db, {
    actorId: actor.id,
    action: "audit.return",
    entityType: "internal_audit",
    entityId: x.docNo,
    after: { reason: reason.trim() },
  });
  const to = x.auditorId ?? x.createdBy;
  if (to)
    await notifyUser(
      db,
      to,
      `내부심사 ${x.docNo} 보완 요청: ${reason.trim().slice(0, 60)}`,
      `audit-return-${id}-${now.getTime()}`,
      `/audits/${id}`,
    );
}

/** 그해 심사 범위에 들어가지 않은 장 */
export async function uncovered(db: Db, year: number) {
  const rows = await db
    .select({ scope: internalAudit.scope })
    .from(internalAudit)
    .where(eq(internalAudit.year, year));
  const done = new Set(rows.flatMap((r) => r.scope));
  return STD_CHAPTERS.filter((c) => !done.has(c));
}

export async function listAudits(db: Db, year: number) {
  const list = await db
    .select()
    .from(internalAudit)
    .where(eq(internalAudit.year, year))
    .orderBy(asc(internalAudit.plannedOn));
  const counts = list.length
    ? await db
        .select({
          auditId: auditFinding.auditId,
          verdict: auditFinding.verdict,
        })
        .from(auditFinding)
        .where(
          inArray(
            auditFinding.auditId,
            list.map((x) => x.id),
          ),
        )
    : [];
  const ids = [
    ...new Set(list.map((x) => x.auditorId).filter((v): v is string => !!v)),
  ];
  const names = new Map(
    (ids.length
      ? await db
          .select({ id: appUser.id, name: appUser.name })
          .from(appUser)
          .where(inArray(appUser.id, ids))
      : []
    ).map((u) => [u.id, u.name]),
  );
  const tally = (id: string) => ({
    ok: counts.filter((c) => c.auditId === id && c.verdict === "ok").length,
    improve: counts.filter((c) => c.auditId === id && c.verdict === "improve")
      .length,
    nc: counts.filter((c) => c.auditId === id && c.verdict === "nc").length,
  });
  return { list, names, tally, left: await uncovered(db, year) };
}

export async function getAudit(db: Db, id: string) {
  const x = await row(db, id);
  const findings = await db
    .select({ f: auditFinding, by: appUser.name })
    .from(auditFinding)
    .leftJoin(appUser, eq(appUser.id, auditFinding.by))
    .where(eq(auditFinding.auditId, id))
    .orderBy(asc(auditFinding.at));
  const ids = [x.auditorId, x.approvedBy, ...x.auditeeIds].filter(
    (v): v is string => !!v,
  );
  const names = new Map(
    (ids.length
      ? await db
          .select({ id: appUser.id, name: appUser.name })
          .from(appUser)
          .where(inArray(appUser.id, ids))
      : []
    ).map((u) => [u.id, u.name]),
  );
  return { x, findings, names };
}

/** 지난 심사에서 이어 쓸 값(같은 범위·기준·심사자) */
export async function lastAudit(db: Db) {
  const [x] = await db
    .select()
    .from(internalAudit)
    .orderBy(desc(internalAudit.plannedOn))
    .limit(1);
  return x ?? null;
}

/** 내 할 일: 품질 담당은 10~11월에 올해 계획·빠진 장, 심사자는 심사일 7일 전부터, 대표는 승인 */
export async function auditTodos(db: Db, actor: Actor, today: string) {
  const out: {
    key: string;
    when: "late" | "today" | "soon";
    what: string;
    detail?: string;
    href: string;
    action: string;
  }[] = [];
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  if (
    can(actor, "audit.manage") &&
    !actor.roles.includes("owner") &&
    month >= 10
  ) {
    const left = await uncovered(db, year);
    if (left.length)
      out.push({
        key: `audit-plan-${year}`,
        when: month === 12 ? "late" : month === 11 ? "today" : "soon",
        what: `${year}년 내부심사 계획: 아직 범위에 없는 장 ${left.length}개`,
        detail: "11월에 모든 장을 심사합니다(Q.7)",
        href: "/audits/new",
        action: "계획 세우기",
      });
  }
  const mine = await db
    .select()
    .from(internalAudit)
    .where(eq(internalAudit.status, "planned"));
  for (const x of mine) {
    if (!mayRecord(actor, x) || x.plannedOn > addDays(today, 7)) continue;
    out.push({
      key: `audit-do-${x.id}`,
      when:
        x.plannedOn < addDays(today, -14)
          ? "late"
          : x.plannedOn <= today
            ? "today"
            : "soon",
      what: `내부심사 ${x.docNo}(${x.plannedOn})`,
      detail: x.scope.join(", ").slice(0, 60),
      href: `/audits/${x.id}`,
      action: "심사 기록",
    });
  }
  if (can(actor, "audit.approve")) {
    const rep = await db
      .select()
      .from(internalAudit)
      .where(and(eq(internalAudit.status, "reported")));
    for (const x of rep)
      out.push({
        key: `audit-approve-${x.id}`,
        when: "today",
        what: `내부심사 보고 ${x.docNo} 승인`,
        href: `/audits/${x.id}`,
        action: "승인하기",
      });
  }
  return out;
}
