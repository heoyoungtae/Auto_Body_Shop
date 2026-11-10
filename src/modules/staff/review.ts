// 인사평가(F-11-06), STD-11 6절·총람 11.6
// 매년 12월. 항목: 역량(11.3)·품질(재작업·보증)·안전·현장 관리(5S)·근태·개선 제안. 앱 기록을 근거로 하고 본인과 면담,
// 결과는 다음 해 교육 계획과 임금 조정에 쓴다.
import { and, asc, desc, eq, gte, inArray, isNotNull, lt } from "drizzle-orm";
import type { Db } from "@/db/client";
import {
  appUser,
  approvalDoc,
  competency,
  complaint,
  fiveSMonthly,
  fiveSZone,
  perfReview,
  staffProfile,
  suggestion,
  training,
  trainingAttendee,
  userRole,
  workOrder,
  workStep,
} from "@/db/schema";
import { can } from "@/modules/auth/permissions";
import type { Role } from "@/modules/auth/roles";
import { writeAudit } from "@/modules/platform/audit";
import { nextDocNo } from "@/modules/platform/docno";
import { UserError } from "@/modules/platform/errors";
import { notifyRole, notifyUser } from "@/modules/platform/notify";
import { LEAVE_FORM, type LeaveData } from "./attendance";
import { SKILLS, type Skill } from "./rules";
import { createTraining } from "./training";

export class ReviewError extends UserError {}
type Actor = { id: string; roles: Role[] };
const clean = (s: string | null | undefined) => (s ?? "").trim() || null;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export const REVIEW_ITEMS = {
  competency: { label: "역량", std: "11.3 역량 표" },
  quality: { label: "품질", std: "재작업·보증 건수" },
  safety: { label: "안전·현장 관리", std: "8.11 3정5S·안전 수칙" },
  attendance: { label: "근태", std: "11.4 지각·결근" },
  suggestion: { label: "개선 제안", std: "8.12 제안·채택" },
} as const;
export type ReviewItem = keyof typeof REVIEW_ITEMS;
export const REVIEW_STATUS = {
  draft: "작성 중",
  interview: "면담",
  confirmed: "확정",
} as const;
export const SCORE_LABEL = {
  5: "매우 우수",
  4: "우수",
  3: "보통",
  2: "미흡",
  1: "매우 미흡",
} as const;
export function gradeOf(avg: number) {
  return avg >= 4.5
    ? "S"
    : avg >= 3.5
      ? "A"
      : avg >= 2.5
        ? "B"
        : avg >= 1.5
          ? "C"
          : "D";
}

export type Evidence = {
  skills: { skill: string; level: number }[];
  steps: number;
  orders: number;
  reworkOrders: number;
  complaints: number;
  zones: { zone: string; avg: number; months: number }[];
  absentDays: number;
  sickDays: number;
  lateCount: number;
  annualUsed: number;
  suggestions: number;
  adopted: number;
  trainingHours: number;
};

/** 앱 기록에서 한 사람 한 해 근거를 모은다(입력 없이) */
export async function collectEvidence(
  db: Db,
  userId: string,
  year: number,
): Promise<Evidence> {
  const from = new Date(`${year}-01-01T00:00:00+09:00`);
  const to = new Date(`${year + 1}-01-01T00:00:00+09:00`);
  const comp = await db
    .select()
    .from(competency)
    .where(
      and(eq(competency.userId, userId), isNotNull(competency.confirmedAt)),
    )
    .orderBy(desc(competency.confirmedAt));
  const skills = new Map<string, number>();
  for (const c of comp) if (!skills.has(c.skill)) skills.set(c.skill, c.level);
  const steps = await db
    .select({ wo: workStep.workOrderId, process: workStep.process })
    .from(workStep)
    .where(
      and(
        eq(workStep.endedBy, userId),
        gte(workStep.endedAt, from),
        lt(workStep.endedAt, to),
      ),
    );
  const mine = steps.filter((s) => s.process !== "rework");
  const woIds = [...new Set(mine.map((s) => s.wo))];
  let reworkOrders = 0;
  let complaints = 0;
  if (woIds.length) {
    const rw = await db
      .select({ wo: workStep.workOrderId })
      .from(workStep)
      .where(
        and(
          inArray(workStep.workOrderId, woIds),
          eq(workStep.process, "rework"),
        ),
      );
    reworkOrders = new Set(rw.map((r) => r.wo)).size;
    const ros = (
      await db
        .select({ ro: workOrder.repairOrderId })
        .from(workOrder)
        .where(inArray(workOrder.id, woIds))
    ).map((r) => r.ro);
    if (ros.length)
      complaints = (
        await db
          .select({ id: complaint.id })
          .from(complaint)
          .where(
            and(
              inArray(complaint.repairOrderId, ros),
              eq(complaint.category, "quality"),
            ),
          )
      ).length;
  }
  const myZones = await db
    .select({ code: fiveSZone.code })
    .from(fiveSZone)
    .where(eq(fiveSZone.ownerId, userId));
  const zones: Evidence["zones"] = [];
  for (const z of myZones) {
    const rows = (
      await db
        .select({ ym: fiveSMonthly.ym, total: fiveSMonthly.total })
        .from(fiveSMonthly)
        .where(eq(fiveSMonthly.zone, z.code))
    ).filter((r) => r.ym.startsWith(`${year}-`));
    if (rows.length)
      zones.push({
        zone: z.code,
        avg: Math.round(rows.reduce((s, r) => s + r.total, 0) / rows.length),
        months: rows.length,
      });
  }
  const leaves = (
    await db
      .select()
      .from(approvalDoc)
      .where(
        and(
          eq(approvalDoc.formCode, LEAVE_FORM),
          eq(approvalDoc.drafterId, userId),
          inArray(approvalDoc.status, ["confirmed", "checked"]),
        ),
      )
  )
    .map((d) => d.data as LeaveData)
    .filter((d) => d.fromDate.startsWith(`${year}-`));
  const sum = (k: string, f: (d: LeaveData) => number) =>
    leaves.filter((d) => d.leaveKind === k).reduce((s, d) => s + f(d), 0);
  const sg = await db
    .select({ status: suggestion.status })
    .from(suggestion)
    .where(
      and(
        eq(suggestion.proposerId, userId),
        gte(suggestion.createdAt, from),
        lt(suggestion.createdAt, to),
      ),
    );
  const tr = await db
    .select({ hours: trainingAttendee.hours })
    .from(trainingAttendee)
    .innerJoin(training, eq(training.id, trainingAttendee.trainingId))
    .where(
      and(
        eq(trainingAttendee.userId, userId),
        eq(training.year, year),
        isNotNull(trainingAttendee.signedAt),
      ),
    );
  return {
    skills: [...skills.entries()].map(([skill, level]) => ({ skill, level })),
    steps: mine.length,
    orders: woIds.length,
    reworkOrders,
    complaints,
    zones,
    absentDays: sum("absent", (d) => d.days),
    sickDays: sum("sick", (d) => d.days),
    lateCount: leaves.filter((d) => ["late", "early"].includes(d.leaveKind))
      .length,
    annualUsed: leaves.reduce((s, d) => s + (d.deduct ?? 0), 0),
    suggestions: sg.length,
    adopted: sg.filter((s) => s.status === "adopted" || s.status === "done")
      .length,
    trainingHours: tr.reduce((s, r) => s + r.hours, 0),
  };
}

/** 근거로 고르는 점수 제안(평가자가 바꿀 수 있음) */
export function suggestScores(e: Evidence): Record<ReviewItem, number> {
  const top = e.skills.length ? Math.max(...e.skills.map((s) => s.level)) : 0;
  const rate = e.orders ? e.reworkOrders / e.orders : 0;
  const z = e.zones.length
    ? e.zones.reduce((s, x) => s + x.avg, 0) / e.zones.length
    : null;
  return {
    competency:
      top >= 4 ? 5 : top === 3 ? 4 : top === 2 ? 3 : top === 1 ? 2 : 3,
    quality: !e.orders
      ? 3
      : e.complaints === 0 && rate < 0.02
        ? 5
        : rate < 0.05 && e.complaints <= 1
          ? 4
          : rate < 0.1
            ? 3
            : 2,
    safety: z == null ? 3 : z >= 90 ? 5 : z >= 80 ? 4 : z >= 70 ? 3 : 2,
    attendance: e.absentDays
      ? e.absentDays >= 3
        ? 1
        : 2
      : e.lateCount >= 6
        ? 3
        : e.lateCount >= 3
          ? 4
          : 5,
    suggestion:
      e.adopted >= 3 ? 5 : e.adopted >= 1 ? 4 : e.suggestions >= 1 ? 3 : 2,
  };
}

async function row(db: Db, id: string) {
  const [r] = await db.select().from(perfReview).where(eq(perfReview.id, id));
  if (!r) throw new ReviewError("평가를 찾을 수 없습니다");
  return r;
}

/** 평가 대상: 그 해 재직한 사람(대표 제외) */
export async function reviewTargets(db: Db, year: number) {
  const users = await db
    .select({
      id: appUser.id,
      name: appUser.name,
      active: appUser.active,
      hiredOn: staffProfile.hiredOn,
      leftOn: staffProfile.leftOn,
    })
    .from(appUser)
    .leftJoin(staffProfile, eq(staffProfile.userId, appUser.id))
    .orderBy(asc(appUser.name));
  const owners = new Set(
    (
      await db
        .select({ u: userRole.userId })
        .from(userRole)
        .where(eq(userRole.role, "owner"))
    ).map((r) => r.u),
  );
  return users.filter(
    (u) =>
      !owners.has(u.id) &&
      u.active &&
      !u.leftOn &&
      (!u.hiredOn || u.hiredOn <= `${year}-12-31`),
  );
}

/** 평가 시작: 근거를 그때 값으로 고정하고 제안 점수를 넣는다 */
export async function startReview(
  db: Db,
  actor: Actor,
  userId: string,
  year: number,
  now = new Date(),
) {
  if (!can(actor, "review.write"))
    throw new ReviewError("인사평가는 공장장이 작성합니다");
  if (userId === actor.id)
    throw new ReviewError(
      "자기 평가는 쓸 수 없습니다(공장장 평가는 대표가 씁니다)",
    );
  const [dup] = await db
    .select({ id: perfReview.id })
    .from(perfReview)
    .where(and(eq(perfReview.year, year), eq(perfReview.userId, userId)));
  if (dup) return dup.id;
  const evidence = await collectEvidence(db, userId, year);
  const docNo = await nextDocNo(db, "PE", now);
  const [r] = await db
    .insert(perfReview)
    .values({
      docNo,
      year,
      userId,
      evidence: evidence as unknown as Record<string, unknown>,
      scores: suggestScores(evidence),
      reviewerId: actor.id,
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: perfReview.id });
  await writeAudit(db, {
    actorId: actor.id,
    action: "review.start",
    entityType: "perf_review",
    entityId: docNo,
    after: { year },
  });
  return r.id;
}

/** 근거 다시 모으기(작성 중일 때) */
export async function refreshEvidence(
  db: Db,
  actor: Actor,
  id: string,
  now = new Date(),
) {
  const r = await row(db, id);
  if (!can(actor, "review.write") || r.status !== "draft")
    throw new ReviewError("작성 중인 평가만 근거를 다시 모읍니다");
  await db
    .update(perfReview)
    .set({
      evidence: (await collectEvidence(
        db,
        r.userId,
        r.year,
      )) as unknown as Record<string, unknown>,
      updatedAt: now,
    })
    .where(eq(perfReview.id, id));
}

export type ReviewInput = {
  scores: Record<string, number>;
  comments: Record<string, string>;
  strengths: string;
  improve: string;
  trainingNeeds: string;
  wageNote: string;
};

/** 작성(점수·의견) → 면담으로 넘기기(submit=true면 본인에게 알림) */
export async function saveReview(
  db: Db,
  actor: Actor,
  id: string,
  input: ReviewInput,
  submit: boolean,
  now = new Date(),
) {
  const r = await row(db, id);
  if (!can(actor, "review.write"))
    throw new ReviewError("인사평가는 공장장이 작성합니다");
  if (r.userId === actor.id)
    throw new ReviewError("자기 평가는 쓸 수 없습니다");
  if (r.status !== "draft")
    throw new ReviewError(
      "면담으로 넘긴 평가는 고칠 수 없습니다(대표가 돌려보내야 함)",
    );
  const scores: Record<string, number> = {};
  const comments: Record<string, string> = {};
  for (const k of Object.keys(REVIEW_ITEMS)) {
    const v = input.scores[k];
    if (!Number.isInteger(v) || v < 1 || v > 5)
      throw new ReviewError(
        `${REVIEW_ITEMS[k as ReviewItem].label} 점수(1~5)를 골라 주세요`,
      );
    scores[k] = v;
    const c = clean(input.comments[k]);
    if ((v <= 2 || v === 5) && !c)
      throw new ReviewError(
        `${REVIEW_ITEMS[k as ReviewItem].label}: 5점이나 2점 이하는 근거를 적어 주세요`,
      );
    if (c) comments[k] = c;
  }
  const avg =
    Object.values(scores).reduce((s, v) => s + v, 0) /
    Object.keys(scores).length;
  if (submit && !clean(input.improve) && avg < 3.5)
    throw new ReviewError("보완할 점을 적어 주세요(면담에서 이야기할 내용)");
  await db
    .update(perfReview)
    .set({
      scores,
      comments,
      total: Math.round(avg * 100) / 100,
      grade: gradeOf(avg),
      strengths: clean(input.strengths),
      improve: clean(input.improve),
      trainingNeeds: clean(input.trainingNeeds),
      wageNote: clean(input.wageNote),
      status: submit ? "interview" : "draft",
      reviewerId: actor.id,
      updatedAt: now,
    })
    .where(eq(perfReview.id, id));
  if (submit) {
    await writeAudit(db, {
      actorId: actor.id,
      action: "review.submit",
      entityType: "perf_review",
      entityId: r.docNo,
      after: { grade: gradeOf(avg) },
    });
    await notifyUser(
      db,
      r.userId,
      `${r.year}년 인사평가 면담: 결과를 보고 의견을 남겨 주세요`,
      `pe-int-${id}`,
      `/reviews/${id}`,
    );
  }
}

/** 본인 확인: 면담일과 의견(이의 포함) */
export async function ackReview(
  db: Db,
  actor: Actor,
  id: string,
  input: { interviewedOn: string; comment: string },
  now = new Date(),
) {
  const r = await row(db, id);
  if (r.userId !== actor.id)
    throw new ReviewError("평가 받은 본인이 확인합니다");
  if (r.status !== "interview")
    throw new ReviewError("면담 단계에서 확인합니다");
  if (!DATE.test(input.interviewedOn))
    throw new ReviewError("면담한 날을 골라 주세요");
  await db
    .update(perfReview)
    .set({
      interviewedOn: input.interviewedOn,
      employeeComment: clean(input.comment),
      employeeAckAt: now,
      updatedAt: now,
    })
    .where(eq(perfReview.id, id));
  await notifyRole(
    db,
    "owner",
    `${r.year}년 인사평가 면담 확인됨 — 확정할 차례`,
    `pe-ack-${id}`,
    `/reviews/${id}`,
  );
}

/** 대표 확정: 필요 교육은 다음 해 교육 계획(수시)으로 올린다 */
export async function confirmReview(
  db: Db,
  actor: Actor,
  id: string,
  now = new Date(),
) {
  if (!can(actor, "review.confirm"))
    throw new ReviewError("인사평가 확정은 대표가 합니다");
  const r = await row(db, id);
  if (r.status !== "interview")
    throw new ReviewError("면담 단계 평가만 확정합니다");
  if (!r.employeeAckAt) throw new ReviewError("본인 면담 확인이 아직입니다");
  let trainingId: string | null = null;
  if (r.trainingNeeds) {
    const [u] = await db
      .select({ name: appUser.name })
      .from(appUser)
      .where(eq(appUser.id, r.userId));
    trainingId = await createTraining(
      db,
      actor,
      {
        year: r.year + 1,
        kind: "ojt",
        title: `${u?.name ?? ""} 역량 향상: ${r.trainingNeeds}`.slice(0, 80),
        plannedMonth: "",
        plannedHours: null,
        target: u?.name ?? "",
        organizerId: r.reviewerId ?? "",
      },
      now,
    );
  }
  await db
    .update(perfReview)
    .set({
      status: "confirmed",
      confirmedBy: actor.id,
      confirmedAt: now,
      trainingId,
      updatedAt: now,
    })
    .where(eq(perfReview.id, id));
  await writeAudit(db, {
    actorId: actor.id,
    action: "review.confirm",
    entityType: "perf_review",
    entityId: r.docNo,
    after: { grade: r.grade },
  });
  await notifyUser(
    db,
    r.userId,
    `${r.year}년 인사평가가 확정됐습니다(${r.grade})`,
    `pe-conf-${id}`,
    `/reviews/${id}`,
  );
}

export async function returnReview(
  db: Db,
  actor: Actor,
  id: string,
  now = new Date(),
) {
  if (!can(actor, "review.confirm"))
    throw new ReviewError("돌려보내기는 대표가 합니다");
  const r = await row(db, id);
  if (r.status !== "interview")
    throw new ReviewError("면담 단계 평가만 돌려보냅니다");
  await db
    .update(perfReview)
    .set({ status: "draft", employeeAckAt: null, updatedAt: now })
    .where(eq(perfReview.id, id));
}

/** 보기: 평가자·대표, 본인은 면담 단계부터 */
export async function getReview(db: Db, actor: Actor, id: string) {
  const r = await row(db, id);
  const own = r.userId === actor.id;
  if (
    own
      ? r.status === "draft"
      : !(can(actor, "review.write") || can(actor, "review.confirm"))
  )
    throw new ReviewError("볼 수 없는 평가입니다");
  const ids = [r.userId, r.reviewerId, r.confirmedBy].filter(
    (x): x is string => !!x,
  );
  const names = new Map(
    (
      await db
        .select({ id: appUser.id, name: appUser.name })
        .from(appUser)
        .where(inArray(appUser.id, ids))
    ).map((u) => [u.id, u.name]),
  );
  return { r, names, own };
}

export async function listReviews(db: Db, actor: Actor, year: number) {
  const manage = can(actor, "review.write") || can(actor, "review.confirm");
  const rows = await db
    .select()
    .from(perfReview)
    .where(eq(perfReview.year, year));
  if (!manage)
    return {
      targets: [],
      rows: rows.filter((r) => r.userId === actor.id && r.status !== "draft"),
    };
  return { targets: await reviewTargets(db, year), rows };
}

/** 내 할 일: 12월 평가 작성(공장장)·면담 확인(본인)·확정(대표) */
export async function reviewTodos(db: Db, actor: Actor, today: string) {
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
  const rows = await db
    .select()
    .from(perfReview)
    .where(inArray(perfReview.year, [year, year - 1]));
  for (const r of rows.filter(
    (r) =>
      r.userId === actor.id && r.status === "interview" && !r.employeeAckAt,
  ))
    out.push({
      key: `pe-ack-${r.id}`,
      when: "today",
      what: `${r.year}년 인사평가 면담 확인`,
      href: `/reviews/${r.id}`,
      action: "확인하기",
    });
  if (can(actor, "review.confirm")) {
    const wait = rows.filter(
      (r) => r.status === "interview" && r.employeeAckAt,
    );
    if (wait.length)
      out.push({
        key: "pe-confirm",
        when: "today",
        what: `인사평가 확정 ${wait.length}건`,
        href: `/reviews?year=${wait[0].year}`,
        action: "확정하기",
      });
  }
  if (
    can(actor, "review.write") &&
    !actor.roles.includes("owner") &&
    (month === 12 || month === 1)
  ) {
    const y = month === 12 ? year : year - 1;
    const targets = (await reviewTargets(db, y)).filter(
      (t) => t.id !== actor.id,
    );
    const left = targets.filter(
      (t) =>
        !rows.some(
          (r) => r.year === y && r.userId === t.id && r.status !== "draft",
        ),
    );
    if (left.length)
      out.push({
        key: `pe-write-${y}`,
        when: month === 1 ? "late" : "soon",
        what: `${y}년 인사평가 ${left.length}명 남음`,
        detail: left
          .slice(0, 4)
          .map((t) => t.name)
          .join(", "),
        href: `/reviews?year=${y}`,
        action: "평가하기",
      });
  }
  return out;
}

export const skillName = (s: string) => SKILLS[s as Skill] ?? s;
