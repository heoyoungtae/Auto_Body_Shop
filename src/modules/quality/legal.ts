// 법규 대장(F-Q-06)·준수 평가(F-Q-07), 총람 Q.6
// 1 파악(부록 C 초안 → 대상 여부 판단) · 2 인허가 유효기간 30일·7일 전 알림 · 3 분기 1회 법령 개정 확인 ·
// 4 변경 시 재검토 · 5 12월 연간 준수 평가(미흡 → 부적합) · 6 관청 점검 지적과 시정 기한 · 7 법정 교육은 교육 계획에
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import type { Db } from "@/db/client";
import { appUser, legalEvalYear, legalEvent, legalItem } from "@/db/schema";
import { can } from "@/modules/auth/permissions";
import type { Role } from "@/modules/auth/roles";
import { writeAudit } from "@/modules/platform/audit";
import { UserError } from "@/modules/platform/errors";
import { notifyRole, notifyUser } from "@/modules/platform/notify";
import { loadPolicy } from "@/modules/platform/policy";
import { seoulDate } from "@/modules/platform/time";
import {
  APPENDIX_C,
  APPLIES,
  CYCLES,
  dueStage,
  EVAL_RESULTS,
  nextDueAfter,
  type Cycle,
  type EvalResult,
} from "./legal-rules";
import { openNc } from "./nc";

export class LegalError extends UserError {}
type Actor = { id: string; roles: Role[] };
const clean = (s: string | null | undefined) => (s ?? "").trim() || null;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const must = (a: Actor) => {
  if (!can(a, "legal.manage"))
    throw new LegalError("법규 대장은 안전환경 담당·대표가 관리합니다");
};

async function row(db: Db, id: string) {
  const [x] = await db.select().from(legalItem).where(eq(legalItem.id, id));
  if (!x) throw new LegalError("법규 항목을 찾을 수 없습니다");
  return x;
}
async function event(
  db: Db,
  itemId: string,
  e: Partial<typeof legalEvent.$inferInsert> & { kind: string },
  by: string,
  at: Date,
) {
  await db.insert(legalEvent).values({ ...e, itemId, by, at });
}

export type LegalInput = {
  area: string;
  lawName: string;
  clause: string;
  duty: string;
  stdRef: string;
  applies: string;
  basis: string;
  ownerId: string;
  cycle: string;
  nextDue: string;
  evidence: string;
  authority: string;
  permitNo: string;
  validUntil: string;
  note: string;
};

function check(i: LegalInput) {
  if (!i.area.trim()) throw new LegalError("분야를 골라 주세요");
  if (!i.lawName.trim()) throw new LegalError("법령명을 적어 주세요");
  if (!i.duty.trim()) throw new LegalError("의무 내용을 적어 주세요");
  if (!(i.applies in APPLIES)) throw new LegalError("대상 여부를 골라 주세요");
  if (i.applies !== "check" && !i.basis.trim())
    throw new LegalError(
      "대상인지 아닌지 판단한 근거를 적어 주세요(예: 상시 근로자 4명, 도장 부스 1기)",
    );
  if (!(i.cycle in CYCLES)) throw new LegalError("주기를 골라 주세요");
  if (i.nextDue && !DATE.test(i.nextDue))
    throw new LegalError("다음 기한 날짜를 확인해 주세요");
  if (i.validUntil && !DATE.test(i.validUntil))
    throw new LegalError("유효기간 날짜를 확인해 주세요");
  if (i.applies === "yes" && i.cycle !== "none" && !i.nextDue)
    throw new LegalError("주기가 있으면 다음 기한을 적어 주세요");
  return {
    area: i.area.trim(),
    lawName: i.lawName.trim(),
    clause: clean(i.clause),
    duty: i.duty.trim(),
    stdRef: clean(i.stdRef),
    applies: i.applies,
    basis: clean(i.basis),
    ownerId: i.ownerId || null,
    cycle: i.cycle,
    nextDue: i.nextDue || null,
    evidence: clean(i.evidence),
    authority: clean(i.authority),
    permitNo: clean(i.permitNo),
    validUntil: i.validUntil || null,
    note: clean(i.note),
  };
}

export async function createLegal(
  db: Db,
  actor: Actor,
  input: LegalInput,
  now = new Date(),
) {
  must(actor);
  const v = check(input);
  const [r] = await db
    .insert(legalItem)
    .values({ ...v, createdBy: actor.id, createdAt: now, updatedAt: now })
    .returning({ id: legalItem.id });
  await event(
    db,
    r.id,
    { kind: "create", detail: `${APPLIES[v.applies as keyof typeof APPLIES]}` },
    actor.id,
    now,
  );
  await writeAudit(db, {
    actorId: actor.id,
    action: "legal.create",
    entityType: "legal_item",
    entityId: r.id,
    after: { law: v.lawName },
  });
  if (v.ownerId && v.ownerId !== actor.id)
    await notifyUser(
      db,
      v.ownerId,
      `법규 담당 지정: ${v.lawName} — ${v.duty.slice(0, 40)}`,
      `legal-owner-${r.id}-${v.ownerId}`,
      `/legal/${r.id}`,
    );
  return r.id;
}

/** 1·4 대상 여부 판단과 고치기(변경 시 재검토 포함) */
export async function updateLegal(
  db: Db,
  actor: Actor,
  id: string,
  input: LegalInput,
  now = new Date(),
) {
  must(actor);
  const x = await row(db, id);
  const v = check(input);
  await db
    .update(legalItem)
    .set({ ...v, updatedAt: now })
    .where(eq(legalItem.id, id));
  const parts = [
    x.applies !== v.applies &&
      `대상 여부 ${APPLIES[x.applies as keyof typeof APPLIES]} → ${APPLIES[v.applies as keyof typeof APPLIES]}`,
    x.nextDue !== v.nextDue && `기한 ${x.nextDue ?? "-"} → ${v.nextDue ?? "-"}`,
    x.validUntil !== v.validUntil &&
      `유효기간 ${x.validUntil ?? "-"} → ${v.validUntil ?? "-"}`,
  ].filter(Boolean);
  await event(
    db,
    id,
    { kind: "edit", detail: parts.join(", ") || "고침" },
    actor.id,
    now,
  );
  if (v.ownerId && v.ownerId !== x.ownerId && v.ownerId !== actor.id)
    await notifyUser(
      db,
      v.ownerId,
      `법규 담당 지정: ${v.lawName}`,
      `legal-owner-${id}-${v.ownerId}-${now.getTime()}`,
      `/legal/${id}`,
    );
}

/** 부록 C 초안을 대장에 넣는다(이미 같은 법령명이 있으면 건너뜀). 모두 '확인 필요'로 들어간다 */
export async function importAppendixC(db: Db, actor: Actor, now = new Date()) {
  must(actor);
  const have = new Set(
    (await db.select({ n: legalItem.lawName }).from(legalItem)).map((r) => r.n),
  );
  let n = 0;
  for (const c of APPENDIX_C) {
    if (have.has(c.lawName)) continue;
    const [r] = await db
      .insert(legalItem)
      .values({
        ...c,
        applies: "check",
        createdBy: actor.id,
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: legalItem.id });
    await event(
      db,
      r.id,
      { kind: "create", detail: "부록 C 초안에서 불러옴" },
      actor.id,
      now,
    );
    n++;
  }
  if (n)
    await writeAudit(db, {
      actorId: actor.id,
      action: "legal.import",
      entityType: "legal_item",
      entityId: "appendix-c",
      after: { count: n },
    });
  return n;
}

/** 이행 기록: 증빙을 남기고 주기가 있으면 다음 기한을 저절로 민다. 인허가 갱신이면 새 유효기간 */
export async function recordDone(
  db: Db,
  actor: Actor,
  id: string,
  input: { doneOn: string; evidence: string; validUntil: string },
  now = new Date(),
) {
  const x = await row(db, id);
  if (!can(actor, "legal.manage") && x.ownerId !== actor.id)
    throw new LegalError("담당자나 안전환경 담당이 기록합니다");
  if (!DATE.test(input.doneOn))
    throw new LegalError("이행한 날을 확인해 주세요");
  if (!input.evidence.trim())
    throw new LegalError("증빙(신고 번호·점검표·교육 기록 등)을 적어 주세요");
  if (input.validUntil && !DATE.test(input.validUntil))
    throw new LegalError("새 유효기간 날짜를 확인해 주세요");
  const next = nextDueAfter(x.cycle as Cycle, input.doneOn);
  await db
    .update(legalItem)
    .set({
      nextDue: next ?? x.nextDue,
      evidence: input.evidence.trim(),
      validUntil: input.validUntil || x.validUntil,
      updatedAt: now,
    })
    .where(eq(legalItem.id, id));
  await event(
    db,
    id,
    {
      kind: "done",
      detail: `${input.doneOn} 이행 · ${input.evidence.trim()}${next ? ` · 다음 기한 ${next}` : ""}${input.validUntil ? ` · 유효기간 ${input.validUntil}` : ""}`,
    },
    actor.id,
    now,
  );
  return next;
}

/** 3 분기 1회 법령 개정 확인. 개정이 있으면 내용을 적고 표준서·양식 개정(Q.5)으로 잇는다 */
export async function recordRevCheck(
  db: Db,
  actor: Actor,
  ids: string[],
  input: { changed: boolean; note: string },
  now = new Date(),
) {
  must(actor);
  if (!ids.length) throw new LegalError("확인한 항목을 골라 주세요");
  if (input.changed && !input.note.trim())
    throw new LegalError("무엇이 바뀌었는지와 영향을 적어 주세요");
  const today = seoulDate(now);
  for (const id of ids) {
    await row(db, id);
    await db
      .update(legalItem)
      .set({ revCheckedOn: today, updatedAt: now })
      .where(eq(legalItem.id, id));
    await event(
      db,
      id,
      {
        kind: "revcheck",
        changed: input.changed,
        detail: input.changed
          ? input.note.trim()
          : (clean(input.note) ?? "개정 없음"),
      },
      actor.id,
      now,
    );
  }
  if (input.changed)
    await notifyRole(
      db,
      "owner",
      `법령 개정 확인: ${input.note.trim()} — 표준서·양식 개정 검토`,
      `legal-rev-${now.getTime()}`,
      "/legal",
    );
  return ids.length;
}

/** 6 관청 점검·지적: 지적이 있으면 부적합으로 등록하고 시정 기한을 둔다 */
export async function recordInspection(
  db: Db,
  actor: Actor,
  id: string,
  input: { on: string; finding: string; fixDue: string },
  now = new Date(),
) {
  must(actor);
  const x = await row(db, id);
  if (!DATE.test(input.on))
    throw new LegalError("점검 받은 날을 확인해 주세요");
  if (input.fixDue && !DATE.test(input.fixDue))
    throw new LegalError("시정 기한을 확인해 주세요");
  const finding = input.finding.trim();
  let ncId: string | null = null;
  if (finding) {
    if (!input.fixDue)
      throw new LegalError("지적 사항이 있으면 시정 기한을 적어 주세요");
    const nc = await openNc(
      db,
      actor,
      {
        source: "legal",
        refType: "legal_item",
        refId: id,
        refLabel: x.lawName,
        content: `관청 점검 지적(${input.on}, ${x.authority ?? "관할 기관"}): ${finding} — 시정 기한 ${input.fixDue}`,
      },
      now,
    );
    ncId = nc.id;
  }
  await event(
    db,
    id,
    {
      kind: "inspect",
      fixDue: input.fixDue || null,
      ncId,
      detail: `${input.on} 점검${finding ? ` · 지적: ${finding}` : " · 지적 없음"}`,
    },
    actor.id,
    now,
  );
  return ncId;
}

/** 5 연간 준수 평가(12월). 미흡은 부적합(Q.9)으로 등록 */
export async function evaluateLegal(
  db: Db,
  actor: Actor,
  id: string,
  input: { year: number; result: string; evidence: string },
  now = new Date(),
) {
  must(actor);
  const x = await row(db, id);
  if (!(input.result in EVAL_RESULTS))
    throw new LegalError("준수·미흡·대상 아님 중 하나를 골라 주세요");
  const result = input.result as EvalResult;
  if (result !== "na" && !input.evidence.trim())
    throw new LegalError("판정의 증빙(기록·서류)을 적어 주세요");
  const [conf] = await db
    .select()
    .from(legalEvalYear)
    .where(eq(legalEvalYear.year, input.year));
  if (conf?.confirmedAt)
    throw new LegalError(`${input.year}년 평가는 대표가 이미 확정했습니다`);
  const [dup] = await db
    .select({ id: legalEvent.id })
    .from(legalEvent)
    .where(
      and(
        eq(legalEvent.itemId, id),
        eq(legalEvent.kind, "eval"),
        eq(legalEvent.year, input.year),
      ),
    );
  if (dup) await db.delete(legalEvent).where(eq(legalEvent.id, dup.id));
  let ncId: string | null = null;
  if (result === "lacking") {
    const nc = await openNc(
      db,
      actor,
      {
        source: "legal",
        refType: "legal_item",
        refId: id,
        refLabel: x.lawName,
        content: `${input.year}년 법규 준수 평가 미흡: ${x.lawName} — ${x.duty} · ${input.evidence.trim()}`,
      },
      now,
    );
    ncId = nc.id;
  }
  await event(
    db,
    id,
    {
      kind: "eval",
      year: input.year,
      result,
      ncId,
      detail: clean(input.evidence),
    },
    actor.id,
    now,
  );
  return { result, ncId };
}

/** 대표 확정(F-Q-07). 모든 '대상·확인 필요' 항목을 평가해야 확정된다 */
export async function confirmLegalYear(
  db: Db,
  actor: Actor,
  year: number,
  now = new Date(),
) {
  if (!can(actor, "legal.confirm"))
    throw new LegalError("준수 평가 확정은 대표가 합니다");
  const s = await evalSheet(db, year);
  const left = s.rows.filter((r) => !r.ev);
  if (left.length)
    throw new LegalError(`아직 평가하지 않은 항목이 ${left.length}개 있습니다`);
  const count = (k: EvalResult) =>
    s.rows.filter((r) => r.ev?.result === k).length;
  const summary = `준수 ${count("ok")} · 미흡 ${count("lacking")} · 대상 아님 ${count("na")}`;
  await db
    .insert(legalEvalYear)
    .values({ year, confirmedBy: actor.id, confirmedAt: now, summary })
    .onConflictDoUpdate({
      target: legalEvalYear.year,
      set: { confirmedBy: actor.id, confirmedAt: now, summary },
    });
  await writeAudit(db, {
    actorId: actor.id,
    action: "legal.eval_confirm",
    entityType: "legal_eval",
    entityId: String(year),
    after: { summary },
  });
  return summary;
}

export async function evalSheet(db: Db, year: number) {
  const items = (
    await db
      .select()
      .from(legalItem)
      .where(eq(legalItem.active, true))
      .orderBy(asc(legalItem.area), asc(legalItem.lawName))
  ).filter((x) => x.applies !== "no");
  const evs = items.length
    ? await db
        .select()
        .from(legalEvent)
        .where(
          and(
            eq(legalEvent.kind, "eval"),
            eq(legalEvent.year, year),
            inArray(
              legalEvent.itemId,
              items.map((x) => x.id),
            ),
          ),
        )
    : [];
  const byItem = new Map(evs.map((e) => [e.itemId, e]));
  const [conf] = await db
    .select()
    .from(legalEvalYear)
    .where(eq(legalEvalYear.year, year));
  return {
    rows: items.map((x) => ({ x, ev: byItem.get(x.id) ?? null })),
    confirmed: conf?.confirmedAt ? conf : null,
  };
}

export type LegalFilter = "all" | "check" | "due" | "permit" | "mine";

export async function listLegal(
  db: Db,
  actor: Actor,
  filter: LegalFilter = "all",
  now = new Date(),
) {
  const rows = await db
    .select()
    .from(legalItem)
    .where(eq(legalItem.active, true))
    .orderBy(asc(legalItem.area), asc(legalItem.lawName));
  const p = await loadPolicy(db, seoulDate(now));
  const today = seoulDate(now);
  const stage = (d: string | null) =>
    dueStage(
      d,
      today,
      p["legal.alert_days_first"],
      p["legal.alert_days_second"],
    );
  const ids = [
    ...new Set(rows.map((r) => r.ownerId).filter((x): x is string => !!x)),
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
  const list = rows.filter((x) => {
    if (filter === "check") return x.applies === "check";
    if (filter === "due")
      return x.applies !== "no" && (stage(x.nextDue) || stage(x.validUntil));
    if (filter === "permit") return !!x.permitNo || !!x.validUntil;
    if (filter === "mine") return x.ownerId === actor.id;
    return true;
  });
  return { list, names, stage };
}

export async function getLegal(db: Db, id: string) {
  const x = await row(db, id);
  const events = await db
    .select({ e: legalEvent, by: appUser.name })
    .from(legalEvent)
    .leftJoin(appUser, eq(appUser.id, legalEvent.by))
    .where(eq(legalEvent.itemId, id))
    .orderBy(desc(legalEvent.at));
  const [owner] = x.ownerId
    ? await db
        .select({ name: appUser.name })
        .from(appUser)
        .where(eq(appUser.id, x.ownerId))
    : [];
  return { x, events, ownerName: owner?.name ?? null };
}

const quarterStart = (today: string) =>
  `${today.slice(0, 5)}${String(Math.floor((Number(today.slice(5, 7)) - 1) / 3) * 3 + 1).padStart(2, "0")}-01`;

/** 2 인허가·이행 기한 알림(30일 전·7일 전·지남), 매일 */
export async function legalDailyAlerts(db: Db, now = new Date()) {
  const today = seoulDate(now);
  const { list, stage } = await listLegal(
    db,
    { id: "", roles: [] },
    "all",
    now,
  );
  let n = 0;
  for (const x of list.filter((r) => r.applies !== "no")) {
    for (const [kind, date, label] of [
      ["valid", x.validUntil, "유효기간"],
      ["due", x.nextDue, "기한"],
    ] as const) {
      const st = stage(date);
      if (!st) continue;
      const title = `법규 ${label} ${st === "late" ? "지남" : "다가옴"}: ${x.lawName} — ${x.duty.slice(0, 30)} (${date})`;
      const key = `legal-${kind}-${x.id}-${date}-${st}`;
      if (x.ownerId)
        await notifyUser(db, x.ownerId, title, key, `/legal/${x.id}`);
      await notifyRole(db, "safety", title, key, `/legal/${x.id}`);
      if (st !== "first")
        await notifyRole(db, "owner", title, key, `/legal/${x.id}`);
      n++;
    }
  }
  return `법규 기한 알림 ${n}건(${today})`;
}

/** 내 할 일: 담당 항목 기한, 안전환경 담당은 대상 여부 확인·분기 개정 확인·12월 준수 평가, 대표는 확정 */
export async function legalTodos(db: Db, actor: Actor, today: string) {
  const out: {
    key: string;
    when: "late" | "today" | "soon";
    what: string;
    detail?: string;
    href: string;
    action: string;
  }[] = [];
  const now = new Date(`${today}T03:00:00Z`);
  const manage = can(actor, "legal.manage");
  if (
    !manage &&
    !(
      await db
        .select({ id: legalItem.id })
        .from(legalItem)
        .where(eq(legalItem.ownerId, actor.id))
    ).length
  )
    return out;
  const { list, stage } = await listLegal(db, actor, "all", now);
  for (const x of list.filter(
    (r) =>
      r.applies !== "no" && (r.ownerId === actor.id || (manage && !r.ownerId)),
  )) {
    const st = stage(x.validUntil) ?? stage(x.nextDue);
    if (st)
      out.push({
        key: `legal-due-${x.id}`,
        when: st === "late" ? "late" : st === "second" ? "today" : "soon",
        what: `법규: ${x.lawName} — ${x.duty.slice(0, 30)}`,
        detail:
          x.validUntil && stage(x.validUntil)
            ? `유효기간 ${x.validUntil}`
            : `기한 ${x.nextDue}`,
        href: `/legal/${x.id}`,
        action: "이행 기록",
      });
  }
  if (manage && !actor.roles.includes("owner")) {
    const chk = list.filter((x) => x.applies === "check");
    if (chk.length)
      out.push({
        key: "legal-check",
        when: "soon",
        what: `법규 대상 여부 확인 ${chk.length}건`,
        detail:
          "국가법령정보센터에서 조문을 보고 대상·대상 아님과 근거를 적습니다",
        href: "/legal?f=check",
        action: "확인하기",
      });
    const qs = quarterStart(today);
    if (Number(today.slice(5, 7)) % 3 === 0) {
      const left = list.filter(
        (x) => x.applies !== "no" && (!x.revCheckedOn || x.revCheckedOn < qs),
      );
      if (left.length)
        out.push({
          key: `legal-rev-${qs}`,
          when: today.slice(8) >= "20" ? "today" : "soon",
          what: `법령 개정 확인 ${left.length}건(이번 분기)`,
          href: "/legal/revcheck",
          action: "확인하기",
        });
    }
    if (today.slice(5, 7) === "12") {
      const y = Number(today.slice(0, 4));
      const s = await evalSheet(db, y);
      const left = s.rows.filter((r) => !r.ev).length;
      if (left && !s.confirmed)
        out.push({
          key: `legal-eval-${y}`,
          when: today >= `${y}-12-20` ? "today" : "soon",
          what: `${y}년 법규 준수 평가 ${left}건 남음`,
          href: "/legal/eval",
          action: "평가하기",
        });
    }
  }
  if (can(actor, "legal.confirm") && today.slice(5, 7) === "12") {
    const y = Number(today.slice(0, 4));
    const s = await evalSheet(db, y);
    if (s.rows.length && !s.rows.some((r) => !r.ev) && !s.confirmed)
      out.push({
        key: `legal-confirm-${y}`,
        when: "today",
        what: `${y}년 법규 준수 평가 확정`,
        href: "/legal/eval",
        action: "확정하기",
      });
  }
  return out;
}

export { APPLIES, CYCLES, EVAL_RESULTS };
