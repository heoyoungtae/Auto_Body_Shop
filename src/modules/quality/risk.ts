// 리스크·기회 대장(F-Q-03, 총람 Q.4)
// 누구나 등록 → 가능성×영향 점수가 정책값(기본 6) 이상이면 대표 알림, 대응 계획·담당·기한을 정함
// → 담당이 대응 끝을 기록(잔여 점수 다시 매김) → 분기 1회 대표 검토
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import type { Db } from "@/db/client";
import { appUser, riskEvent, riskItem, riskReview } from "@/db/schema";
import { can } from "@/modules/auth/permissions";
import type { Role } from "@/modules/auth/roles";
import { writeAudit } from "@/modules/platform/audit";
import { nextDocNo } from "@/modules/platform/docno";
import { UserError } from "@/modules/platform/errors";
import { notifyRole, notifyUser } from "@/modules/platform/notify";
import { loadPolicy } from "@/modules/platform/policy";
import { addDays, seoulDate } from "@/modules/platform/time";
import {
  INITIAL_RISKS,
  isQuarterEndMonth,
  quarterKey,
  RISK_KIND,
  RISK_STATUS,
  riskScore,
  type RiskStatus,
} from "./risk-rules";

export class RiskError extends UserError {}
type Actor = { id: string; roles: Role[] };
const clean = (s: string | null | undefined) => (s ?? "").trim() || null;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const level = (n: number) => Number.isInteger(n) && n >= 1 && n <= 3;

async function row(db: Db, id: string) {
  const [x] = await db.select().from(riskItem).where(eq(riskItem.id, id));
  if (!x) throw new RiskError("리스크·기회 항목을 찾을 수 없습니다");
  return x;
}
async function event(
  db: Db,
  riskId: string,
  kind: string,
  detail: string | null,
  by: string,
  at: Date,
) {
  await db.insert(riskEvent).values({ riskId, kind, detail, by, at });
}
const alertScore = async (db: Db, now: Date) =>
  (await loadPolicy(db, seoulDate(now)))["risk.owner_alert_score"];

export type RiskInput = {
  kind: string;
  content: string;
  chapter: string;
  likelihood: number;
  impact: number;
  control: string;
};

function check(i: RiskInput) {
  if (!(i.kind in RISK_KIND))
    throw new RiskError("리스크인지 기회인지 골라 주세요");
  if (!i.content.trim())
    throw new RiskError("무엇이 일어날 수 있는지 내용을 적어 주세요");
  if (!level(i.likelihood) || !level(i.impact))
    throw new RiskError("가능성과 영향을 1~3 중에서 골라 주세요");
  return {
    kind: i.kind,
    content: i.content.trim(),
    chapter: clean(i.chapter),
    likelihood: i.likelihood,
    impact: i.impact,
    score: riskScore(i.likelihood, i.impact),
    control: clean(i.control),
  };
}

async function alertOwner(
  db: Db,
  x: {
    id: string;
    docNo: string;
    content: string;
    score: number;
    kind: string;
  },
  threshold: number,
) {
  if (x.score < threshold) return;
  await notifyRole(
    db,
    "owner",
    `${RISK_KIND[x.kind as keyof typeof RISK_KIND]} ${x.score}점: ${x.content.slice(0, 40)} — 대응 계획을 정하세요(${x.docNo})`,
    `risk-high-${x.id}-${x.score}`,
    `/risks/${x.id}`,
  );
}

/** 등록: 누구나 */
export async function createRisk(
  db: Db,
  actor: Actor,
  input: RiskInput,
  now = new Date(),
  source: string | null = null,
) {
  const v = check(input);
  const docNo = await nextDocNo(db, "RK", now);
  const [r] = await db
    .insert(riskItem)
    .values({
      ...v,
      docNo,
      source,
      createdBy: actor.id,
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: riskItem.id });
  await event(
    db,
    r.id,
    "create",
    `${v.likelihood}×${v.impact}=${v.score}점`,
    actor.id,
    now,
  );
  await writeAudit(db, {
    actorId: actor.id,
    action: "risk.create",
    entityType: "risk_item",
    entityId: docNo,
    after: { score: v.score },
  });
  await alertOwner(
    db,
    { id: r.id, docNo, content: v.content, score: v.score, kind: v.kind },
    await alertScore(db, now),
  );
  return { id: r.id, docNo };
}

/** Q.4 초기 등록 항목 7건을 넣는다(같은 내용이 있으면 건너뜀) */
export async function importInitialRisks(
  db: Db,
  actor: Actor,
  now = new Date(),
) {
  if (!can(actor, "risk.manage"))
    throw new RiskError("초기 항목은 품질 담당·대표가 넣습니다");
  const have = new Set(
    (await db.select({ c: riskItem.content }).from(riskItem)).map((r) => r.c),
  );
  let n = 0;
  for (const r of INITIAL_RISKS) {
    if (have.has(r.content)) continue;
    await createRisk(db, actor, { kind: "risk", ...r }, now, "Q.4 초기 항목");
    n++;
  }
  return n;
}

const editable = (
  actor: Actor,
  x: { createdBy: string | null; status: string },
) =>
  can(actor, "risk.manage") ||
  (x.createdBy === actor.id && x.status === "open");

/** 고치기: 품질 담당·대표, 또는 올린 사람(대응 전) */
export async function updateRisk(
  db: Db,
  actor: Actor,
  id: string,
  input: RiskInput,
  now = new Date(),
) {
  const x = await row(db, id);
  if (!editable(actor, x))
    throw new RiskError("올린 사람(대응 전)이나 품질 담당·대표가 고칩니다");
  const v = check(input);
  await db
    .update(riskItem)
    .set({ ...v, updatedAt: now })
    .where(eq(riskItem.id, id));
  await event(
    db,
    id,
    "edit",
    x.score !== v.score ? `점수 ${x.score} → ${v.score}` : "고침",
    actor.id,
    now,
  );
  if (v.score > x.score)
    await alertOwner(
      db,
      { id, docNo: x.docNo, content: v.content, score: v.score, kind: v.kind },
      await alertScore(db, now),
    );
}

/** 대응 계획·담당·기한 지정: 품질 담당·대표. 상태는 '대응 중' */
export async function planRisk(
  db: Db,
  actor: Actor,
  id: string,
  input: { plan: string; ownerId: string; due: string },
  now = new Date(),
) {
  if (!can(actor, "risk.manage"))
    throw new RiskError("대응 계획은 품질 담당·대표가 정합니다");
  const x = await row(db, id);
  if (x.status === "closed")
    throw new RiskError("종료한 항목입니다. 다시 열고 계획을 정하세요");
  if (!input.plan.trim())
    throw new RiskError("어떻게 대응할지 계획을 적어 주세요");
  if (!input.ownerId) throw new RiskError("대응 담당을 골라 주세요");
  if (!DATE.test(input.due)) throw new RiskError("대응 기한을 적어 주세요");
  await db
    .update(riskItem)
    .set({
      plan: input.plan.trim(),
      ownerId: input.ownerId,
      due: input.due,
      status: "acting",
      result: null,
      updatedAt: now,
    })
    .where(eq(riskItem.id, id));
  await event(
    db,
    id,
    "plan",
    `${input.plan.trim()} · 기한 ${input.due}`,
    actor.id,
    now,
  );
  if (input.ownerId !== actor.id)
    await notifyUser(
      db,
      input.ownerId,
      `리스크 대응 담당: ${x.content.slice(0, 40)} — 기한 ${input.due}`,
      `risk-plan-${id}-${input.due}`,
      `/risks/${id}`,
    );
}

/** 대응 끝: 담당이나 품질 담당·대표. 결과와 잔여 가능성·영향을 다시 매긴다 */
export async function finishRisk(
  db: Db,
  actor: Actor,
  id: string,
  input: { result: string; likelihood: number; impact: number },
  now = new Date(),
) {
  const x = await row(db, id);
  if (x.status !== "acting")
    throw new RiskError("대응 중인 항목만 끝낼 수 있습니다");
  if (!can(actor, "risk.manage") && x.ownerId !== actor.id)
    throw new RiskError("대응 담당이나 품질 담당·대표가 기록합니다");
  if (!input.result.trim())
    throw new RiskError("무엇을 했고 결과가 어떤지 적어 주세요");
  if (!level(input.likelihood) || !level(input.impact))
    throw new RiskError("대응 뒤 가능성과 영향을 1~3 중에서 골라 주세요");
  const score = riskScore(input.likelihood, input.impact);
  await db
    .update(riskItem)
    .set({
      result: input.result.trim(),
      likelihood: input.likelihood,
      impact: input.impact,
      score,
      status: "done",
      updatedAt: now,
    })
    .where(eq(riskItem.id, id));
  await event(
    db,
    id,
    "done",
    `${input.result.trim()} · 잔여 ${x.score} → ${score}점`,
    actor.id,
    now,
  );
  const threshold = await alertScore(db, now);
  if (score >= threshold)
    await notifyRole(
      db,
      "owner",
      `리스크 대응 뒤에도 ${score}점: ${x.content.slice(0, 40)} — 추가 대응 검토`,
      `risk-left-${id}-${now.getTime()}`,
      `/risks/${id}`,
    );
  return score;
}

/** 종료(해당 없어짐)·다시 열기: 품질 담당·대표 */
export async function closeRisk(
  db: Db,
  actor: Actor,
  id: string,
  reason: string,
  now = new Date(),
) {
  if (!can(actor, "risk.manage"))
    throw new RiskError("종료는 품질 담당·대표가 합니다");
  await row(db, id);
  if (!reason.trim()) throw new RiskError("종료하는 이유를 적어 주세요");
  await db
    .update(riskItem)
    .set({ status: "closed", updatedAt: now })
    .where(eq(riskItem.id, id));
  await event(db, id, "close", reason.trim(), actor.id, now);
}
export async function reopenRisk(
  db: Db,
  actor: Actor,
  id: string,
  reason: string,
  now = new Date(),
) {
  if (!can(actor, "risk.manage"))
    throw new RiskError("다시 열기는 품질 담당·대표가 합니다");
  const x = await row(db, id);
  if (x.status === "open" || x.status === "acting")
    throw new RiskError("이미 관리 중입니다");
  await db
    .update(riskItem)
    .set({ status: "open", updatedAt: now })
    .where(eq(riskItem.id, id));
  await event(db, id, "reopen", clean(reason), actor.id, now);
}

/** 분기 대표 검토(Q.4) */
export async function reviewRisks(
  db: Db,
  actor: Actor,
  note: string,
  now = new Date(),
) {
  if (!can(actor, "risk.review"))
    throw new RiskError("분기 검토는 대표가 합니다");
  const q = quarterKey(seoulDate(now));
  const s = await riskStats(db, now);
  const summary = `관리 중 ${s.open} · 대응 중 ${s.acting}(기한 지남 ${s.late}) · ${s.threshold}점 이상 ${s.high} · 대응 끝 ${s.done}`;
  await db
    .insert(riskReview)
    .values({ quarter: q, by: actor.id, at: now, summary, note: clean(note) })
    .onConflictDoUpdate({
      target: riskReview.quarter,
      set: { by: actor.id, at: now, summary, note: clean(note) },
    });
  await writeAudit(db, {
    actorId: actor.id,
    action: "risk.review",
    entityType: "risk_review",
    entityId: q,
    after: { summary },
  });
  return { quarter: q, summary };
}

export async function riskStats(db: Db, now = new Date()) {
  const today = seoulDate(now);
  const threshold = await alertScore(db, now);
  const rows = await db
    .select({
      status: riskItem.status,
      score: riskItem.score,
      due: riskItem.due,
    })
    .from(riskItem);
  const live = rows.filter((r) => r.status === "open" || r.status === "acting");
  return {
    threshold,
    open: rows.filter((r) => r.status === "open").length,
    acting: rows.filter((r) => r.status === "acting").length,
    done: rows.filter((r) => r.status === "done").length,
    high: live.filter((r) => r.score >= threshold).length,
    late: rows.filter((r) => r.status === "acting" && r.due && r.due < today)
      .length,
  };
}

export type RiskFilter = "live" | "high" | "mine" | "done" | "all";

export async function listRisks(
  db: Db,
  actor: Actor,
  filter: RiskFilter = "live",
  now = new Date(),
) {
  const threshold = await alertScore(db, now);
  const rows = await db
    .select()
    .from(riskItem)
    .orderBy(desc(riskItem.score), asc(riskItem.docNo));
  const list = rows.filter((x) => {
    const live = x.status === "open" || x.status === "acting";
    if (filter === "live") return live;
    if (filter === "high") return live && x.score >= threshold;
    if (filter === "mine")
      return x.ownerId === actor.id || x.createdBy === actor.id;
    if (filter === "done") return x.status === "done" || x.status === "closed";
    return true;
  });
  const ids = [
    ...new Set(
      list
        .flatMap((r) => [r.ownerId, r.createdBy])
        .filter((x): x is string => !!x),
    ),
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
  const q = quarterKey(seoulDate(now));
  const [review] = await db
    .select()
    .from(riskReview)
    .where(eq(riskReview.quarter, q));
  const [last] = await db
    .select()
    .from(riskReview)
    .orderBy(desc(riskReview.quarter))
    .limit(1);
  return {
    list,
    names,
    threshold,
    quarter: q,
    review: review ?? null,
    lastReview: last ?? null,
  };
}

export async function getRisk(db: Db, id: string) {
  const x = await row(db, id);
  const events = await db
    .select({ e: riskEvent, by: appUser.name })
    .from(riskEvent)
    .leftJoin(appUser, eq(appUser.id, riskEvent.by))
    .where(eq(riskEvent.riskId, id))
    .orderBy(desc(riskEvent.at));
  const ids = [x.ownerId, x.createdBy].filter((v): v is string => !!v);
  const names = new Map(
    (ids.length
      ? await db
          .select({ id: appUser.id, name: appUser.name })
          .from(appUser)
          .where(inArray(appUser.id, ids))
      : []
    ).map((u) => [u.id, u.name]),
  );
  return { x, events, names, threshold: await alertScore(db, new Date()) };
}

/** 내 할 일: 대응 담당 기한, 품질 담당·대표는 계획 없는 고점수 항목, 대표는 분기 검토 */
export async function riskTodos(db: Db, actor: Actor, today: string) {
  const out: {
    key: string;
    when: "late" | "today" | "soon";
    what: string;
    detail?: string;
    href: string;
    action: string;
  }[] = [];
  const now = new Date(`${today}T03:00:00Z`);
  const mine = await db
    .select()
    .from(riskItem)
    .where(and(eq(riskItem.ownerId, actor.id), eq(riskItem.status, "acting")));
  for (const x of mine) {
    if (!x.due) continue;
    const when =
      x.due < today
        ? "late"
        : x.due === today
          ? "today"
          : x.due <= addDays(today, 7)
            ? "soon"
            : null;
    if (when)
      out.push({
        key: `risk-act-${x.id}`,
        when,
        what: `리스크 대응: ${x.content.slice(0, 40)}`,
        detail: `기한 ${x.due}`,
        href: `/risks/${x.id}`,
        action: "대응 끝 기록",
      });
  }
  if (can(actor, "risk.manage")) {
    const threshold = await alertScore(db, now);
    const open = await db
      .select()
      .from(riskItem)
      .where(eq(riskItem.status, "open"));
    const high = open.filter((x) => x.score >= threshold);
    if (high.length)
      out.push({
        key: "risk-plan",
        when: "today",
        what: `${threshold}점 이상 리스크 ${high.length}건 대응 계획 없음`,
        href: "/risks?f=high",
        action: "계획 정하기",
      });
  }
  if (can(actor, "risk.review") && isQuarterEndMonth(today)) {
    const q = quarterKey(today);
    const [r] = await db
      .select()
      .from(riskReview)
      .where(eq(riskReview.quarter, q));
    if (!r)
      out.push({
        key: `risk-review-${q}`,
        when: today.slice(8) >= "20" ? "today" : "soon",
        what: `리스크·기회 대장 분기 검토(${q})`,
        href: "/risks",
        action: "검토하기",
      });
  }
  return out;
}

export { RISK_STATUS };
export type { RiskStatus };
