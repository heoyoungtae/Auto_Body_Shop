// 위험성평가(F-09-01, STD-09 4절)
// 최초(개업 전)·정기(매년 1월)·수시(변경·사고) 평가 → 공정별 유해위험 요인, 가능성×중대성 → 4점 이상 감소 대책·담당·기한
// → 확정하면 작업자에게 공유 → 대책 실행 후 잔류 위험 재평가. 지난 평가 줄을 불러와 바뀐 것만 고친다.
import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import type { Db } from "@/db/client";
import { appUser, hazardAssessment, hazardRow } from "@/db/schema";
import { can } from "@/modules/auth/permissions";
import type { Role } from "@/modules/auth/roles";
import { writeAudit } from "@/modules/platform/audit";
import { nextDocNo } from "@/modules/platform/docno";
import { UserError } from "@/modules/platform/errors";
import { notifyUser } from "@/modules/platform/notify";
import { addDays, seoulDate } from "@/modules/platform/time";
import {
  HA_KIND,
  HA_MEASURE_SCORE,
  INITIAL_HAZARDS,
  MEASURE_TYPES,
  PROCESSES,
} from "./rules";

export class HazardError extends UserError {}
type Actor = { id: string; roles: Role[] };
const clean = (s: string | null | undefined) => (s ?? "").trim() || null;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const level = (n: number) => Number.isInteger(n) && n >= 1 && n <= 3;
const must = (a: Actor) => {
  if (!can(a, "safety.manage"))
    throw new HazardError("위험성평가는 안전환경 담당·대표가 작성합니다");
};

async function head(db: Db, id: string) {
  const [x] = await db
    .select()
    .from(hazardAssessment)
    .where(eq(hazardAssessment.id, id));
  if (!x) throw new HazardError("위험성평가를 찾을 수 없습니다");
  return x;
}

/** 새 평가. copy: 지난 확정 평가의 줄을 불러옴(없으면 최초 초안 7줄) */
export async function startAssessment(
  db: Db,
  actor: Actor,
  input: {
    kind: string;
    reason: string;
    participants: string[];
    incidentId?: string;
    copy: boolean;
  },
  now = new Date(),
) {
  must(actor);
  if (!(input.kind in HA_KIND))
    throw new HazardError("최초·정기·수시 중 하나를 골라 주세요");
  if (input.kind === "adhoc" && !input.reason.trim())
    throw new HazardError(
      "수시 평가는 무엇이 바뀌었는지(새 설비·도료·공법, 사고) 적어 주세요",
    );
  const participants = [...new Set(input.participants.filter(Boolean))];
  if (!participants.length)
    throw new HazardError("평가에 참여한 작업자를 골라 주세요(근로자 참여)");
  const docNo = await nextDocNo(db, "HA", now);
  const [r] = await db
    .insert(hazardAssessment)
    .values({
      docNo,
      kind: input.kind,
      year: Number(seoulDate(now).slice(0, 4)),
      reason: clean(input.reason),
      incidentId: input.incidentId || null,
      participants,
      createdBy: actor.id,
      createdAt: now,
    })
    .returning({ id: hazardAssessment.id });
  let rows = 0;
  if (input.copy) {
    const [last] = await db
      .select()
      .from(hazardAssessment)
      .where(eq(hazardAssessment.status, "done"))
      .orderBy(desc(hazardAssessment.doneAt))
      .limit(1);
    const src = last
      ? (
          await db
            .select()
            .from(hazardRow)
            .where(eq(hazardRow.assessmentId, last.id))
        ).map((x) => {
          // 대책을 끝낸 줄은 잔류 위험을 새 점수로
          const l = x.measureDoneAt && x.residualL ? x.residualL : x.likelihood;
          const s = x.measureDoneAt && x.residualS ? x.residualS : x.severity;
          const current =
            x.measureDoneAt && x.measure
              ? [x.current, x.measure].filter(Boolean).join(", ")
              : x.current;
          return {
            process: x.process,
            hazard: x.hazard,
            current,
            likelihood: l,
            severity: s,
          };
        })
      : INITIAL_HAZARDS;
    for (const x of src)
      await db
        .insert(hazardRow)
        .values({
          assessmentId: r.id,
          ...x,
          score: x.likelihood * x.severity,
          createdAt: now,
        });
    rows = src.length;
  }
  await writeAudit(db, {
    actorId: actor.id,
    action: "hazard.start",
    entityType: "hazard_assessment",
    entityId: docNo,
    after: { kind: input.kind, rows },
  });
  return { id: r.id, docNo, rows };
}

export type HazardRowInput = {
  process: string;
  hazard: string;
  current: string;
  likelihood: number;
  severity: number;
  measureType: string;
  measure: string;
  ownerId: string;
  due: string;
};

function checkRow(i: HazardRowInput) {
  if (!(PROCESSES as readonly string[]).includes(i.process))
    throw new HazardError("공정을 골라 주세요");
  if (!i.hazard.trim()) throw new HazardError("유해·위험 요인을 적어 주세요");
  if (!level(i.likelihood) || !level(i.severity))
    throw new HazardError("가능성과 중대성을 1~3 중에서 골라 주세요");
  const score = i.likelihood * i.severity;
  if (i.measureType && !(i.measureType in MEASURE_TYPES))
    throw new HazardError("대책 종류를 골라 주세요");
  if (i.due && !DATE.test(i.due))
    throw new HazardError("대책 기한을 확인해 주세요");
  if (i.measure.trim() && (!i.ownerId || !i.due || !i.measureType))
    throw new HazardError("대책을 적으면 종류·담당·기한도 정해 주세요");
  return {
    process: i.process,
    hazard: i.hazard.trim(),
    current: clean(i.current),
    likelihood: i.likelihood,
    severity: i.severity,
    score,
    measureType: i.measureType || null,
    measure: clean(i.measure),
    ownerId: i.ownerId || null,
    due: i.due || null,
  };
}

const draft = async (db: Db, id: string) => {
  const x = await head(db, id);
  if (x.status !== "draft")
    throw new HazardError(
      "확정한 평가는 고칠 수 없습니다. 바뀌면 수시 평가를 새로 하세요",
    );
  return x;
};

export async function addHazardRow(
  db: Db,
  actor: Actor,
  assessmentId: string,
  input: HazardRowInput,
  now = new Date(),
) {
  must(actor);
  await draft(db, assessmentId);
  const v = checkRow(input);
  const [r] = await db
    .insert(hazardRow)
    .values({ assessmentId, ...v, createdAt: now })
    .returning({ id: hazardRow.id });
  return r.id;
}

export async function updateHazardRow(
  db: Db,
  actor: Actor,
  rowId: string,
  input: HazardRowInput,
) {
  must(actor);
  const [x] = await db.select().from(hazardRow).where(eq(hazardRow.id, rowId));
  if (!x) throw new HazardError("평가 줄을 찾을 수 없습니다");
  await draft(db, x.assessmentId);
  await db
    .update(hazardRow)
    .set(checkRow(input))
    .where(eq(hazardRow.id, rowId));
}

export async function removeHazardRow(db: Db, actor: Actor, rowId: string) {
  must(actor);
  const [x] = await db.select().from(hazardRow).where(eq(hazardRow.id, rowId));
  if (!x) throw new HazardError("평가 줄을 찾을 수 없습니다");
  await draft(db, x.assessmentId);
  await db.delete(hazardRow).where(eq(hazardRow.id, rowId));
}

/** 확정: 4점 이상 줄은 모두 대책이 있어야 한다. 참여자와 대책 담당에게 결과 공유 알림 */
export async function finishAssessment(
  db: Db,
  actor: Actor,
  id: string,
  now = new Date(),
) {
  must(actor);
  const x = await draft(db, id);
  const rows = await db
    .select()
    .from(hazardRow)
    .where(eq(hazardRow.assessmentId, id));
  if (!rows.length) throw new HazardError("평가 줄이 없습니다");
  const need = rows.filter((r) => r.score >= HA_MEASURE_SCORE && !r.measure);
  if (need.length)
    throw new HazardError(
      `${HA_MEASURE_SCORE}점 이상인데 감소 대책이 없는 줄이 ${need.length}개 있습니다: ${need
        .map((r) => `${r.process} ${r.hazard}`)
        .slice(0, 3)
        .join(", ")}`,
    );
  await db
    .update(hazardAssessment)
    .set({ status: "done", doneBy: actor.id, doneAt: now })
    .where(eq(hazardAssessment.id, id));
  await writeAudit(db, {
    actorId: actor.id,
    action: "hazard.done",
    entityType: "hazard_assessment",
    entityId: x.docNo,
    after: { rows: rows.length },
  });
  const owners = new Set(
    rows.map((r) => r.ownerId).filter((v): v is string => !!v),
  );
  for (const u of new Set([...x.participants, ...owners])) {
    if (u === actor.id) continue;
    await notifyUser(
      db,
      u,
      `위험성평가 ${x.docNo} 결과 공유${owners.has(u) ? " — 맡은 감소 대책이 있습니다" : ""}`,
      `hazard-done-${id}-${u}`,
      `/hazards/${id}`,
    );
  }
  return rows.length;
}

/** 대책 실행·잔류 위험(4.4): 대책 담당이나 안전환경 담당 */
export async function finishMeasure(
  db: Db,
  actor: Actor,
  rowId: string,
  input: { result: string; residualL: number; residualS: number },
  now = new Date(),
) {
  const [x] = await db.select().from(hazardRow).where(eq(hazardRow.id, rowId));
  if (!x) throw new HazardError("평가 줄을 찾을 수 없습니다");
  const h = await head(db, x.assessmentId);
  if (h.status !== "done")
    throw new HazardError("평가를 확정한 뒤에 대책을 기록합니다");
  if (!x.measure) throw new HazardError("대책이 없는 줄입니다");
  if (x.measureDoneAt) throw new HazardError("이미 대책을 끝냈습니다");
  if (!can(actor, "safety.manage") && x.ownerId !== actor.id)
    throw new HazardError("대책 담당이나 안전환경 담당이 기록합니다");
  if (!input.result.trim()) throw new HazardError("무엇을 했는지 적어 주세요");
  if (!level(input.residualL) || !level(input.residualS))
    throw new HazardError("대책 뒤 가능성과 중대성을 1~3 중에서 골라 주세요");
  await db
    .update(hazardRow)
    .set({
      measureDoneAt: now,
      measureDoneBy: actor.id,
      measureResult: input.result.trim(),
      residualL: input.residualL,
      residualS: input.residualS,
    })
    .where(eq(hazardRow.id, rowId));
  return input.residualL * input.residualS;
}

export async function listAssessments(db: Db) {
  const list = await db
    .select()
    .from(hazardAssessment)
    .orderBy(desc(hazardAssessment.createdAt));
  const rows = list.length
    ? await db
        .select({
          a: hazardRow.assessmentId,
          score: hazardRow.score,
          measure: hazardRow.measure,
          done: hazardRow.measureDoneAt,
        })
        .from(hazardRow)
        .where(
          inArray(
            hazardRow.assessmentId,
            list.map((x) => x.id),
          ),
        )
    : [];
  const tally = (id: string) => {
    const r = rows.filter((x) => x.a === id);
    return {
      rows: r.length,
      high: r.filter((x) => x.score >= HA_MEASURE_SCORE).length,
      open: r.filter((x) => x.measure && !x.done).length,
    };
  };
  return { list, tally };
}

export async function getAssessment(db: Db, id: string) {
  const x = await head(db, id);
  const rows = await db
    .select()
    .from(hazardRow)
    .where(eq(hazardRow.assessmentId, id))
    .orderBy(desc(hazardRow.score), asc(hazardRow.process));
  const ids = [
    ...new Set(
      [...x.participants, ...rows.map((r) => r.ownerId), x.doneBy].filter(
        (v): v is string => !!v,
      ),
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
  return { x, rows, names };
}

/** 내 할 일: 대책 담당 기한, 안전환경 담당은 1월 정기 평가·작성 중 평가 */
export async function hazardTodos(db: Db, actor: Actor, today: string) {
  const out: {
    key: string;
    when: "late" | "today" | "soon";
    what: string;
    detail?: string;
    href: string;
    action: string;
  }[] = [];
  const mine = await db
    .select({ r: hazardRow, a: hazardAssessment })
    .from(hazardRow)
    .innerJoin(
      hazardAssessment,
      eq(hazardAssessment.id, hazardRow.assessmentId),
    )
    .where(
      and(
        eq(hazardRow.ownerId, actor.id),
        eq(hazardAssessment.status, "done"),
        isNull(hazardRow.measureDoneAt),
      ),
    );
  for (const { r, a } of mine) {
    if (!r.due || r.due > addDays(today, 7)) continue;
    out.push({
      key: `haz-m-${r.id}`,
      when: r.due < today ? "late" : r.due === today ? "today" : "soon",
      what: `위험 감소 대책: ${r.process} ${r.hazard}`.slice(0, 60),
      detail: `${a.docNo} · 기한 ${r.due}`,
      href: `/hazards/${a.id}#row-${r.id}`,
      action: "대책 기록",
    });
  }
  if (can(actor, "safety.manage") && !actor.roles.includes("owner")) {
    const year = Number(today.slice(0, 4));
    const all = await db.select().from(hazardAssessment);
    if (!all.some((x) => x.status === "done"))
      out.push({
        key: "haz-initial",
        when: "soon",
        what: "최초 위험성평가(개업 전)",
        href: "/hazards/new?kind=initial",
        action: "평가하기",
      });
    else if (
      today.slice(5, 7) <= "01" &&
      !all.some((x) => x.year === year && x.kind !== "adhoc")
    )
      out.push({
        key: `haz-regular-${year}`,
        when: today.slice(8) >= "20" ? "today" : "soon",
        what: `${year}년 정기 위험성평가(1월)`,
        href: "/hazards/new?kind=regular",
        action: "평가하기",
      });
    for (const d of all.filter((x) => x.status === "draft"))
      out.push({
        key: `haz-draft-${d.id}`,
        when: "soon",
        what: `위험성평가 ${d.docNo} 작성 중 — 확정하고 공유`,
        href: `/hazards/${d.id}`,
        action: "이어 쓰기",
      });
  }
  return out;
}
