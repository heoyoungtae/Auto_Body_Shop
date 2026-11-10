// 환경(STD-10): 방지시설 운영 일지(F-10-01)와 폐기물 관리대장(F-10-02), 환경측면 등록
// 일일 가동·차압·필터 상태·도료 사용량은 도장 부스 운전 일지(F-08-04)를 그대로 쓰고, 여기서는 교체·자가측정·월 확인 서명을 더한다.
import { and, asc, desc, eq, gte, inArray, lt } from "drizzle-orm";
import type { Db } from "@/db/client";
import {
  appUser,
  envEvent,
  envMonthSign,
  equipment,
  equipmentRunLog,
  riskItem,
  supplier,
  wasteLog,
} from "@/db/schema";
import { can } from "@/modules/auth/permissions";
import type { Role } from "@/modules/auth/roles";
import { writeAudit } from "@/modules/platform/audit";
import { UserError } from "@/modules/platform/errors";
import { notifyRole } from "@/modules/platform/notify";
import { loadPolicy } from "@/modules/platform/policy";
import { addDays, seoulDate } from "@/modules/platform/time";
import { createRisk } from "@/modules/quality/risk";
import {
  daysBetween,
  ENV_ASPECTS,
  ENV_EVENTS,
  storageOf,
  WASTE_ITEMS,
  type EnvEventKind,
  type WasteItem,
} from "./env-rules";

export class EnvError extends UserError {}
type Actor = { id: string; roles: Role[] };
const clean = (s: string | null | undefined) => (s ?? "").trim() || null;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const must = (a: Actor) => {
  if (!can(a, "safety.manage"))
    throw new EnvError("안전환경 담당·대표가 합니다");
};
const ymOf = (d: string) => d.slice(0, 7);
const prevYm = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
};
const nextYmStart = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return m === 12
    ? `${y + 1}-01-01`
    : `${y}-${String(m + 1).padStart(2, "0")}-01`;
};

// ───────── 방지시설 운영(F-10-01) ─────────

export type EnvEventInput = {
  kind: string;
  equipmentId: string;
  on: string;
  detail: string;
  result: string;
  wasteKg: string;
};

/** 교체·자가측정·점검·누출 기록. 필터·활성탄은 도장 기술자도, 자가측정은 안전환경 담당 */
export async function recordEnvEvent(
  db: Db,
  actor: Actor,
  input: EnvEventInput,
  now = new Date(),
) {
  if (!(input.kind in ENV_EVENTS))
    throw new EnvError("무엇을 했는지 골라 주세요");
  const kind = input.kind as EnvEventKind;
  if (
    kind === "measure"
      ? !can(actor, "safety.manage")
      : !can(actor, "equip.check")
  )
    throw new EnvError(
      kind === "measure"
        ? "자가측정 결과는 안전환경 담당이 올립니다"
        : "현장 직원이 기록합니다",
    );
  if (!DATE.test(input.on) || input.on > seoulDate(now))
    throw new EnvError("한 날을 확인해 주세요");
  if ((kind === "filter" || kind === "carbon") && !input.equipmentId)
    throw new EnvError("어느 부스인지 골라 주세요");
  if (kind === "measure" && !input.result.trim())
    throw new EnvError("측정 결과(항목·값·기준 적합 여부)를 적어 주세요");
  if (kind === "spill" && !input.detail.trim())
    throw new EnvError("무엇이 얼마나 흘렀고 어떻게 치웠는지 적어 주세요");
  const kg = input.wasteKg.trim() ? Number(input.wasteKg) : 0;
  if (Number.isNaN(kg) || kg < 0)
    throw new EnvError("폐기물 무게는 숫자로 적어 주세요");
  const p = await loadPolicy(db, seoulDate(now));
  const nextDue =
    kind === "filter" || kind === "carbon"
      ? addDays(input.on, p["env.filter_change_days"])
      : null;
  let wasteLogId: string | null = null;
  if (kg > 0) {
    const item: WasteItem = kind === "spill" ? "rag" : "filter";
    const [w] = await db
      .insert(wasteLog)
      .values({
        kind: "gen",
        item,
        qty: kg,
        on: input.on,
        note: `${ENV_EVENTS[kind]}에서 발생`,
        by: actor.id,
        createdAt: now,
      })
      .returning({ id: wasteLog.id });
    wasteLogId = w.id;
  }
  const [r] = await db
    .insert(envEvent)
    .values({
      kind,
      equipmentId: input.equipmentId || null,
      on: input.on,
      detail: clean(input.detail),
      result: clean(input.result),
      nextDue,
      wasteLogId,
      by: actor.id,
      at: now,
    })
    .returning({ id: envEvent.id });
  if (kind === "spill")
    await notifyRole(
      db,
      "safety",
      `누출 처리 기록: ${input.detail.trim().slice(0, 50)} — 대량이면 사고 보고`,
      `env-spill-${r.id}`,
      "/environment",
    );
  return { id: r.id, nextDue, wasteLogId };
}

/** 그 달 운영 일지: 부스 운전 일지 + 교체·측정 기록 + 월 서명 */
export async function envMonth(db: Db, ym: string) {
  const from = `${ym}-01`;
  const to = nextYmStart(ym);
  const booths = await db
    .select()
    .from(equipment)
    .where(eq(equipment.kind, "booth"));
  const logs = booths.length
    ? await db
        .select({ l: equipmentRunLog, by: appUser.name })
        .from(equipmentRunLog)
        .leftJoin(appUser, eq(appUser.id, equipmentRunLog.operatorId))
        .where(
          and(
            inArray(
              equipmentRunLog.equipmentId,
              booths.map((b) => b.id),
            ),
            gte(equipmentRunLog.logDate, from),
            lt(equipmentRunLog.logDate, to),
          ),
        )
        .orderBy(asc(equipmentRunLog.logDate))
    : [];
  const events = await db
    .select({ e: envEvent, by: appUser.name })
    .from(envEvent)
    .leftJoin(appUser, eq(appUser.id, envEvent.by))
    .where(and(gte(envEvent.on, from), lt(envEvent.on, to)))
    .orderBy(asc(envEvent.on));
  const [sign] = await db
    .select()
    .from(envMonthSign)
    .where(eq(envMonthSign.ym, ym));
  const paintL =
    Math.round(
      logs.reduce((a, x) => a + (Number(x.l.data.paintL) || 0), 0) * 10,
    ) / 10;
  return {
    booths,
    logs,
    events,
    sign: sign ?? null,
    paintL,
    days: new Set(logs.map((x) => x.l.logDate)).size,
  };
}

/** 월 확인 서명(익월 5일까지) */
export async function signEnvMonth(
  db: Db,
  actor: Actor,
  ym: string,
  note: string,
  now = new Date(),
) {
  must(actor);
  if (!/^\d{4}-\d{2}$/.test(ym) || ym >= ymOf(seoulDate(now)))
    throw new EnvError("지난달까지만 확인 서명합니다");
  const m = await envMonth(db, ym);
  const summary = `가동 ${m.days}일 · 도료·시너 ${m.paintL}L · 교체·측정 ${m.events.length}건`;
  await db
    .insert(envMonthSign)
    .values({ ym, by: actor.id, at: now, summary, note: clean(note) })
    .onConflictDoUpdate({
      target: envMonthSign.ym,
      set: { by: actor.id, at: now, summary, note: clean(note) },
    });
  await writeAudit(db, {
    actorId: actor.id,
    action: "env.sign",
    entityType: "env_month",
    entityId: ym,
    after: { summary },
  });
  return summary;
}

/** 부스별 마지막 필터 교체와 다음 교체일 */
export async function filterStatus(db: Db) {
  const booths = await db
    .select()
    .from(equipment)
    .where(eq(equipment.kind, "booth"));
  const ev = await db
    .select()
    .from(envEvent)
    .where(eq(envEvent.kind, "filter"))
    .orderBy(desc(envEvent.on));
  return booths
    .filter((b) => b.status !== "disposed")
    .map((b) => {
      const last = ev.find((e) => e.equipmentId === b.id);
      return {
        booth: b,
        last: last?.on ?? null,
        nextDue: last?.nextDue ?? null,
      };
    });
}

// ───────── 폐기물(F-10-02) ─────────

const isItem = (s: string): s is WasteItem => s in WASTE_ITEMS;

/** 발생 기록: 누구나(현장) */
export async function recordWasteGen(
  db: Db,
  actor: Actor,
  input: { item: string; qty: number; on: string; note: string },
  now = new Date(),
) {
  if (!can(actor, "equip.check") && !can(actor, "safety.manage"))
    throw new EnvError("현장 직원이 기록합니다");
  if (!isItem(input.item)) throw new EnvError("품목을 골라 주세요");
  if (!(input.qty > 0)) throw new EnvError("양(kg)을 적어 주세요");
  if (!DATE.test(input.on) || input.on > seoulDate(now))
    throw new EnvError("날짜를 확인해 주세요");
  const [r] = await db
    .insert(wasteLog)
    .values({
      kind: "gen",
      item: input.item,
      qty: input.qty,
      on: input.on,
      note: clean(input.note),
      by: actor.id,
      createdAt: now,
    })
    .returning({ id: wasteLog.id });
  return r.id;
}

/** 위탁 인계: 안전환경 담당. 등록된 폐기물 위탁 업체(허가 확인)만, 지정폐기물은 올바로 전자인계서 번호 필수, 보관량을 넘지 못함 */
export async function recordWasteOut(
  db: Db,
  actor: Actor,
  input: {
    item: string;
    qty: number;
    on: string;
    supplierId: string;
    slipNo: string;
    note: string;
  },
  now = new Date(),
) {
  must(actor);
  if (!isItem(input.item)) throw new EnvError("품목을 골라 주세요");
  if (!(input.qty > 0)) throw new EnvError("인계한 양(kg)을 적어 주세요");
  if (!DATE.test(input.on) || input.on > seoulDate(now))
    throw new EnvError("인계한 날을 확인해 주세요");
  const [s] = input.supplierId
    ? await db.select().from(supplier).where(eq(supplier.id, input.supplierId))
    : [];
  if (!s) throw new EnvError("위탁 업체를 골라 주세요");
  if (s.status !== "registered" || !s.kinds.includes("waste"))
    throw new EnvError(
      `${s.name}은(는) 등록된 폐기물 위탁 업체가 아닙니다. 협력업체에서 허가증을 확인해 등록하세요(STD-10 6.3)`,
    );
  if (!s.docs.includes("license"))
    throw new EnvError(
      `${s.name}의 폐기물 처리 허가증 확인이 없습니다. 협력업체 서류에서 확인하세요`,
    );
  const designated = WASTE_ITEMS[input.item].group === "designated";
  if (designated && !input.slipNo.trim())
    throw new EnvError(
      "지정폐기물은 올바로시스템 전자인계서 번호를 적어 주세요",
    );
  const st = (await wasteStock(db)).find((x) => x.item === input.item);
  if (!st || input.qty > st.stock + 1e-9)
    throw new EnvError(
      `보관량(${st?.stock ?? 0}kg)보다 많이 인계할 수 없습니다. 발생 기록이 빠졌으면 먼저 적으세요`,
    );
  const [r] = await db
    .insert(wasteLog)
    .values({
      kind: "out",
      item: input.item,
      qty: input.qty,
      on: input.on,
      supplierId: s.id,
      slipNo: clean(input.slipNo),
      note: clean(input.note),
      by: actor.id,
      createdAt: now,
    })
    .returning({ id: wasteLog.id });
  await writeAudit(db, {
    actorId: actor.id,
    action: "waste.out",
    entityType: "waste_log",
    entityId: r.id,
    after: { item: input.item, qty: input.qty, supplier: s.name },
  });
  return r.id;
}

/** 품목별 보관량·보관 시작일·한도까지 남은 날 */
export async function wasteStock(db: Db, now = new Date()) {
  const today = seoulDate(now);
  const p = await loadPolicy(db, today);
  const rows = await db.select().from(wasteLog);
  return (Object.keys(WASTE_ITEMS) as WasteItem[])
    .map((item) => {
      const mine = rows.filter((r) => r.item === item);
      const { stock, since } = storageOf(
        mine.filter((r) => r.kind === "gen"),
        mine.filter((r) => r.kind === "out"),
      );
      const designated = WASTE_ITEMS[item].group === "designated";
      const left =
        designated && since && stock > 0
          ? p["waste.designated_days"] - daysBetween(since, today)
          : null;
      return { item, stock, since: stock > 0 ? since : null, left, designated };
    })
    .filter((x) => x.stock > 0 || rows.some((r) => r.item === x.item));
}

export async function wasteLedger(db: Db, ym: string) {
  const from = `${ym}-01`;
  const to = nextYmStart(ym);
  const rows = await db
    .select({ w: wasteLog, by: appUser.name, sup: supplier.name })
    .from(wasteLog)
    .leftJoin(appUser, eq(appUser.id, wasteLog.by))
    .leftJoin(supplier, eq(supplier.id, wasteLog.supplierId))
    .where(and(gte(wasteLog.on, from), lt(wasteLog.on, to)))
    .orderBy(asc(wasteLog.on), asc(wasteLog.createdAt));
  const sum = (kind: string, designated?: boolean) =>
    Math.round(
      rows
        .filter(
          (r) =>
            r.w.kind === kind &&
            (designated === undefined ||
              (WASTE_ITEMS[r.w.item as WasteItem]?.group === "designated") ===
                designated),
        )
        .reduce((a, r) => a + r.w.qty, 0) * 10,
    ) / 10;
  return {
    rows,
    genDesignated: sum("gen", true),
    genAll: sum("gen"),
    out: sum("out"),
  };
}

export async function wasteVendors(db: Db) {
  const rows = await db
    .select({
      id: supplier.id,
      name: supplier.name,
      kinds: supplier.kinds,
      status: supplier.status,
      docs: supplier.docs,
    })
    .from(supplier);
  return rows.filter(
    (s) => s.kinds.includes("waste") && s.status === "registered",
  );
}

// ───────── 환경측면(STD-10 4절) ─────────

export async function importEnvAspects(db: Db, actor: Actor, now = new Date()) {
  must(actor);
  const have = new Set(
    (await db.select({ c: riskItem.content }).from(riskItem)).map((r) => r.c),
  );
  let n = 0;
  for (const a of ENV_ASPECTS) {
    if (have.has(a.content)) continue;
    await createRisk(
      db,
      actor,
      { kind: "risk", chapter: "10장 환경", ...a },
      now,
      "환경측면(STD-10 4절)",
    );
    n++;
  }
  return n;
}

export async function envAspectCount(db: Db) {
  return (await db.select({ c: riskItem.content }).from(riskItem)).filter((r) =>
    r.c.startsWith("[환경측면]"),
  ).length;
}

// ───────── 할 일·알림 ─────────

export async function envTodos(db: Db, actor: Actor, today: string) {
  const out: {
    key: string;
    when: "late" | "today" | "soon";
    what: string;
    detail?: string;
    href: string;
    action: string;
  }[] = [];
  const p = await loadPolicy(db, today);
  if (can(actor, "safety.manage") && !actor.roles.includes("owner")) {
    for (const s of await wasteStock(db, new Date(`${today}T03:00:00Z`))) {
      if (s.left == null || s.left > p["waste.alert_days"]) continue;
      out.push({
        key: `waste-${s.item}`,
        when: s.left < 0 ? "late" : s.left <= 2 ? "today" : "soon",
        what: `지정폐기물 보관 한도: ${WASTE_ITEMS[s.item].label} ${s.stock}kg`,
        detail: `${s.since}부터 보관 · ${s.left < 0 ? `${-s.left}일 지남` : `${s.left}일 남음`}`,
        href: "/environment#waste",
        action: "위탁 인계",
      });
    }
    const last = prevYm(ymOf(today));
    const [sign] = await db
      .select()
      .from(envMonthSign)
      .where(eq(envMonthSign.ym, last));
    if (
      !sign &&
      (
        await db
          .select({ id: equipment.id })
          .from(equipment)
          .where(eq(equipment.kind, "booth"))
      ).length
    )
      out.push({
        key: `env-sign-${last}`,
        when: today.slice(8) > "05" ? "late" : "soon",
        what: `${last} 방지시설 운영 일지 확인 서명`,
        detail: "익월 5일까지(STD-10 5.6)",
        href: `/environment?ym=${last}`,
        action: "확인하기",
      });
    if (today.slice(5, 7) === "01" || !(await envAspectCount(db))) {
      if (!(await envAspectCount(db)))
        out.push({
          key: "env-aspects",
          when: "soon",
          what: "환경측면 파악(리스크·기회 대장 등록)",
          href: "/environment",
          action: "등록하기",
        });
    }
  }
  if (can(actor, "equip.check")) {
    for (const f of await filterStatus(db)) {
      if (!f.nextDue || f.nextDue > addDays(today, 3)) continue;
      out.push({
        key: `env-filter-${f.booth.id}`,
        when:
          f.nextDue < today ? "late" : f.nextDue === today ? "today" : "soon",
        what: `${f.booth.name} 필터 교체`,
        detail: `마지막 ${f.last} · 교체일 ${f.nextDue}`,
        href: "/environment#ops",
        action: "교체 기록",
      });
    }
  }
  return out;
}

/** 매일: 지정폐기물 보관 한도 알림(안전환경 담당, 지나면 대표도) */
export async function envDailyAlerts(db: Db, now = new Date()) {
  const today = seoulDate(now);
  const p = await loadPolicy(db, today);
  let n = 0;
  for (const s of await wasteStock(db, now)) {
    if (s.left == null || s.left > p["waste.alert_days"]) continue;
    const title = `지정폐기물 보관 ${s.left < 0 ? "한도 지남" : `한도 ${s.left}일 전`}: ${WASTE_ITEMS[s.item].label} ${s.stock}kg(${s.since}부터)`;
    await notifyRole(
      db,
      "safety",
      title,
      `waste-${s.item}-${s.since}-${s.left < 0 ? "late" : "soon"}`,
      "/environment#waste",
    );
    if (s.left < 0)
      await notifyRole(
        db,
        "owner",
        title,
        `waste-${s.item}-${s.since}-late`,
        "/environment#waste",
      );
    n++;
  }
  return `폐기물 보관 알림 ${n}건`;
}
