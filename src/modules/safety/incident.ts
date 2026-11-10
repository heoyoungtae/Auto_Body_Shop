// 사고·아차사고 보고서(F-09-03, STD-09 9절)
// 누구나 보고(아차사고는 발생 당일, 보고자를 탓하지 않음) → 안전환경 담당·대표 즉시 알림, 사고는 부적합(Q.9) 자동 발행
// → 공장장·안전환경 담당이 24시간 안에 원인·재발 방지 → 법정 신고 대상 여부·위험성평가 수시 검토 → 안전환경 담당 종결
import { desc, eq, inArray } from "drizzle-orm";
import type { Db } from "@/db/client";
import { appUser, incident } from "@/db/schema";
import { decrypt, encrypt } from "@/modules/auth/crypto";
import { can } from "@/modules/auth/permissions";
import type { Role } from "@/modules/auth/roles";
import { writeAudit } from "@/modules/platform/audit";
import { nextDocNo } from "@/modules/platform/docno";
import { UserError } from "@/modules/platform/errors";
import { notifyRole } from "@/modules/platform/notify";
import { openNc } from "@/modules/quality/nc";
import {
  INC_KIND,
  INC_REPORT_HOURS,
  INC_SEVERITY,
  type IncKind,
  type IncSeverity,
} from "./rules";

export class IncidentError extends UserError {}
type Actor = { id: string; roles: Role[] };
const clean = (s: string | null | undefined) => (s ?? "").trim() || null;

async function row(db: Db, id: string) {
  const [x] = await db.select().from(incident).where(eq(incident.id, id));
  if (!x) throw new IncidentError("보고서를 찾을 수 없습니다");
  return x;
}

export type IncidentInput = {
  kind: string;
  occurredAt: string;
  place: string;
  process: string;
  description: string;
  severity: string;
  injured: string;
  injury: string;
  damage: string;
  immediate: string;
};

/** 보고: 누구나. occurredAt 은 "YYYY-MM-DDTHH:mm"(서울 시각) */
export async function reportIncident(
  db: Db,
  actor: Actor,
  input: IncidentInput,
  now = new Date(),
) {
  if (!(input.kind in INC_KIND))
    throw new IncidentError("사고인지 아차사고인지 골라 주세요");
  if (!(input.severity in INC_SEVERITY))
    throw new IncidentError("부상 정도를 골라 주세요");
  const kind = input.kind as IncKind;
  const severity = input.severity as IncSeverity;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(input.occurredAt))
    throw new IncidentError("언제 일어났는지 날짜와 시각을 적어 주세요");
  const at = new Date(`${input.occurredAt}:00+09:00`);
  if (at.getTime() > now.getTime() + 5 * 60_000)
    throw new IncidentError("일어난 시각이 지금보다 뒤입니다");
  if (!input.place.trim())
    throw new IncidentError("어디서 일어났는지 적어 주세요");
  if (!input.description.trim())
    throw new IncidentError("무슨 일이 있었는지 경위를 적어 주세요");
  if (kind === "near" && severity !== "none")
    throw new IncidentError("다친 사람이 있으면 아차사고가 아니라 사고입니다");
  if (severity !== "none" && !input.injured.trim())
    throw new IncidentError("다친 사람을 적어 주세요");
  const docNo = await nextDocNo(db, "AC", now);
  const [r] = await db
    .insert(incident)
    .values({
      docNo,
      kind,
      occurredAt: at,
      place: input.place.trim(),
      process: clean(input.process),
      description: input.description.trim(),
      severity,
      injuredEnc: clean(input.injured)
        ? encrypt(input.injured.trim(), "sensitive")
        : null,
      injuryEnc: clean(input.injury)
        ? encrypt(input.injury.trim(), "sensitive")
        : null,
      damage: clean(input.damage),
      immediate: clean(input.immediate),
      reportedBy: actor.id,
      reportedAt: now,
    })
    .returning({ id: incident.id });
  let ncId: string | null = null;
  if (kind === "accident") {
    const nc = await openNc(
      db,
      actor,
      {
        source: "accident",
        refType: "incident",
        refId: r.id,
        refLabel: docNo,
        content: `사고 ${docNo}(${input.place.trim()}): ${input.description.trim().slice(0, 120)}`,
        major: severity === "lost_time" || severity === "serious",
        occurredAt: at,
      },
      now,
    );
    ncId = nc.id;
    await db.update(incident).set({ ncId }).where(eq(incident.id, r.id));
  }
  // 부상 내용은 감사 로그에 남기지 않는다
  await writeAudit(db, {
    actorId: actor.id,
    action: "incident.report",
    entityType: "incident",
    entityId: docNo,
    after: { kind, severity },
  });
  const title = `${INC_KIND[kind]} 보고 ${docNo}: ${input.place.trim()} — ${INC_SEVERITY[severity]}${severity === "serious" ? " · 중대재해는 즉시 관할 노동관서 보고" : ""}`;
  await notifyRole(
    db,
    "safety",
    title,
    `incident-${r.id}`,
    `/incidents/${r.id}`,
  );
  await notifyRole(
    db,
    "owner",
    title,
    `incident-${r.id}`,
    `/incidents/${r.id}`,
  );
  if (kind === "accident")
    await notifyRole(
      db,
      "plant_manager",
      title,
      `incident-${r.id}`,
      `/incidents/${r.id}`,
    );
  return { id: r.id, docNo, ncId };
}

/** 조사: 원인·재발 방지(공장장·안전환경 담당·대표) */
export async function investigateIncident(
  db: Db,
  actor: Actor,
  id: string,
  input: {
    cause: string;
    prevention: string;
    damage: string;
    immediate: string;
  },
  now = new Date(),
) {
  if (!can(actor, "incident.investigate"))
    throw new IncidentError("조사는 공장장·안전환경 담당·대표가 합니다");
  const x = await row(db, id);
  if (x.status === "closed") throw new IncidentError("종결한 보고서입니다");
  if (!input.cause.trim())
    throw new IncidentError("원인을 적어 주세요(사람·방법·설비·재료·환경)");
  if (!input.prevention.trim())
    throw new IncidentError("재발 방지 대책을 적어 주세요");
  await db
    .update(incident)
    .set({
      cause: input.cause.trim(),
      prevention: input.prevention.trim(),
      damage: clean(input.damage) ?? x.damage,
      immediate: clean(input.immediate) ?? x.immediate,
      status: "investigated",
      investigatedBy: actor.id,
      investigatedAt: now,
    })
    .where(eq(incident.id, id));
  await writeAudit(db, {
    actorId: actor.id,
    action: "incident.investigate",
    entityType: "incident",
    entityId: x.docNo,
  });
}

/** 종결: 안전환경 담당·대표. 법정 신고 판단과 위험성평가 수시 검토 결과가 있어야 한다 */
export async function closeIncident(
  db: Db,
  actor: Actor,
  id: string,
  input: {
    legalNeeded: string;
    legalReportedOn: string;
    legalNote: string;
    hazardReview: string;
  },
  now = new Date(),
) {
  if (!can(actor, "safety.manage"))
    throw new IncidentError("종결은 안전환경 담당·대표가 합니다");
  const x = await row(db, id);
  if (x.status !== "investigated")
    throw new IncidentError(
      x.status === "closed"
        ? "이미 종결했습니다"
        : "먼저 원인과 재발 방지를 적어야 합니다",
    );
  if (input.legalNeeded !== "1" && input.legalNeeded !== "0")
    throw new IncidentError("법정 신고 대상인지 골라 주세요");
  const needed = input.legalNeeded === "1";
  if (needed && !/^\d{4}-\d{2}-\d{2}$/.test(input.legalReportedOn))
    throw new IncidentError(
      "신고 대상이면 신고한 날을 적어야 종결할 수 있습니다",
    );
  if (
    !needed &&
    x.kind === "accident" &&
    x.severity !== "none" &&
    x.severity !== "first_aid" &&
    !input.legalNote.trim()
  )
    throw new IncidentError(
      "휴업·중대 사고를 신고 대상이 아니라고 보면 그 근거를 적어 주세요",
    );
  if (!input.hazardReview.trim())
    throw new IncidentError(
      "위험성평가를 다시 봤는지(수시 평가 번호나 '변경 없음'과 이유) 적어 주세요",
    );
  await db
    .update(incident)
    .set({
      legalNeeded: needed,
      legalReportedOn: needed ? input.legalReportedOn : null,
      legalNote: clean(input.legalNote),
      hazardReview: input.hazardReview.trim(),
      status: "closed",
      closedBy: actor.id,
      closedAt: now,
    })
    .where(eq(incident.id, id));
  await writeAudit(db, {
    actorId: actor.id,
    action: "incident.close",
    entityType: "incident",
    entityId: x.docNo,
    after: { legal: needed },
  });
}

const mayViewInjury = (actor: Actor, x: { reportedBy: string | null }) =>
  can(actor, "incident.investigate") || x.reportedBy === actor.id;

export async function getIncident(db: Db, actor: Actor, id: string) {
  const x = await row(db, id);
  const ids = [x.reportedBy, x.investigatedBy, x.closedBy].filter(
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
  const see = mayViewInjury(actor, x);
  const { injuredEnc, injuryEnc, ...rest } = x;
  return {
    x: rest,
    names,
    injured: see && injuredEnc ? decrypt(injuredEnc) : null,
    injury: see && injuryEnc ? decrypt(injuryEnc) : null,
    hidden: !see && !!(injuredEnc || injuryEnc),
  };
}

export type IncidentFilter = "open" | "accident" | "near" | "all";
export async function listIncidents(db: Db, filter: IncidentFilter = "open") {
  const rows = await db
    .select({
      id: incident.id,
      docNo: incident.docNo,
      kind: incident.kind,
      occurredAt: incident.occurredAt,
      place: incident.place,
      process: incident.process,
      description: incident.description,
      severity: incident.severity,
      status: incident.status,
      reportedAt: incident.reportedAt,
    })
    .from(incident)
    .orderBy(desc(incident.occurredAt));
  return rows.filter((r) =>
    filter === "open"
      ? r.status !== "closed"
      : filter === "all"
        ? true
        : r.kind === filter,
  );
}

/** 올해 사고·아차사고 수(품질목표 '산업재해 0건'과 아차사고 보고 문화) */
export async function incidentStats(db: Db, year: number) {
  const rows = await db
    .select({
      kind: incident.kind,
      severity: incident.severity,
      at: incident.occurredAt,
    })
    .from(incident);
  const y = rows.filter((r) => r.at.getUTCFullYear() === year);
  return {
    accident: y.filter((r) => r.kind === "accident").length,
    lostTime: y.filter(
      (r) => r.severity === "lost_time" || r.severity === "serious",
    ).length,
    near: y.filter((r) => r.kind === "near").length,
  };
}

/** 내 할 일: 조사(24시간), 종결 */
export async function incidentTodos(db: Db, actor: Actor, now: Date) {
  const out: {
    key: string;
    when: "late" | "today" | "soon";
    what: string;
    detail?: string;
    href: string;
    action: string;
  }[] = [];
  if (!can(actor, "incident.investigate")) return out;
  const rows = await db
    .select()
    .from(incident)
    .where(inArray(incident.status, ["reported", "investigated"]));
  for (const x of rows) {
    if (x.status === "reported") {
      const late =
        now.getTime() - x.reportedAt.getTime() > INC_REPORT_HOURS * 3600_000;
      out.push({
        key: `inc-inv-${x.id}`,
        when: late ? "late" : "today",
        what: `${INC_KIND[x.kind as IncKind]} ${x.docNo} 원인·재발 방지`,
        detail: `${x.place} · ${INC_REPORT_HOURS}시간 안에`,
        href: `/incidents/${x.id}`,
        action: "조사하기",
      });
    } else if (can(actor, "safety.manage")) {
      out.push({
        key: `inc-close-${x.id}`,
        when: "soon",
        what: `${INC_KIND[x.kind as IncKind]} ${x.docNo} 종결(법정 신고·위험성평가 확인)`,
        href: `/incidents/${x.id}`,
        action: "종결하기",
      });
    }
  }
  return out;
}
