// 재고와 보관(STD-07 7절): 품목·안전 재고, 입고(발주 검수에서), 사용 기록(선입선출), 유효기간 알림·폐기, 실사
import { and, asc, desc, eq, gt, inArray } from "drizzle-orm";
import type { Db } from "@/db/client";
import { alias } from "drizzle-orm/pg-core";
import { avgUnit, postMove } from "./cost";
import { appUser, chemical, repairOrder, stockCount, stockItem, stockItemDoc, stockLot, stockMove, supplier } from "@/db/schema";
import { isExpCategory } from "@/modules/money/rules";
import { can } from "@/modules/auth/permissions";
import type { Role } from "@/modules/auth/roles";
import { writeAudit } from "@/modules/platform/audit";
import { UserError } from "@/modules/platform/errors";
import { notifyRole } from "@/modules/platform/notify";
import { loadPolicy } from "@/modules/platform/policy";
import { DOC_TYPES, MAX_DOC_BYTES, sniffDoc, storeFile } from "@/modules/platform/storage";
import { addDays, seoulDate } from "@/modules/platform/time";
import { issueNc } from "@/modules/quality/nc";
import { createOrder } from "./order";
import { belowSafety, COUNT_KINDS, countDiff, docExpiry, EXPIRY_ALERT_DAYS, fifoTake, isItemDocKind, isPackUnit, isStockKind, isStopReason, isVatMode, ITEM_DOC_KINDS, KIND_EXP_CATEGORY, splitVat, STOP_REASONS, suggestOrderQty, type CountKind, type StockKind, type VatMode } from "./rules";

export class StockError extends UserError {}
type Actor = { id: string; roles: Role[] };
const clean = (s: string | null | undefined) => (s ?? "").trim() || null;

async function itemRow(db: Db, id: string) {
  const [i] = await db.select().from(stockItem).where(eq(stockItem.id, id));
  if (!i) throw new StockError("재고 품목을 찾을 수 없습니다");
  return i;
}

/**
 * unitWon 은 vatMode 대로 적은 값(포함이면 부가세 포함 금액). 저장은 공급가로 바꿔서 한다.
 * expCategory 를 비우면 구분에서 정한다. chemicalId 는 화학물질 목록(MSDS) 연결
 */
export type ItemInput = {
  name: string;
  kind: string;
  spec: string;
  unit: string;
  location: string;
  safetyQty: number;
  unitWon: number;
  vatMode?: string;
  packAmount?: number | null;
  packUnit?: string;
  expCategory?: string;
  chemicalId?: string;
  expiryTracked: boolean;
  supplierId: string;
  openingQty?: number;
  openingExpiresOn?: string;
};

export async function saveItem(db: Db, actor: Actor, id: string | null, input: ItemInput, now = new Date()) {
  if (!can(actor, "stock.manage")) throw new StockError("재고 품목은 공장장·대표가 정합니다");
  if (!input.name.trim()) throw new StockError("품명을 적어 주세요");
  if (!isStockKind(input.kind)) throw new StockError("구분을 골라 주세요");
  if (!input.unit.trim()) throw new StockError("단위를 골라 주세요");
  if (!Number.isInteger(input.safetyQty) || input.safetyQty < 0) throw new StockError("안전 재고는 0 이상입니다");
  if (!Number.isInteger(input.unitWon) || input.unitWon < 0) throw new StockError("단가를 확인해 주세요");
  const vatMode: VatMode = input.vatMode ? (isVatMode(input.vatMode) ? input.vatMode : (() => { throw new StockError("단가의 부가세 방식을 골라 주세요"); })()) : "excluded";
  const pack = input.packAmount ?? null;
  if (pack != null && (!Number.isFinite(pack) || pack <= 0 || pack > 100_000)) throw new StockError("용량·중량은 0보다 큰 숫자로 적어 주세요");
  if (pack != null && !isPackUnit(input.packUnit ?? "")) throw new StockError("용량·중량의 단위(ml·L·g·kg)를 골라 주세요");
  const expCategory = input.expCategory || null;
  if (expCategory && !isExpCategory(expCategory)) throw new StockError("지출 계정을 골라 주세요");
  const chemicalId = input.chemicalId || null;
  if (chemicalId) {
    const [c] = await db.select({ active: chemical.active }).from(chemical).where(eq(chemical.id, chemicalId));
    if (!c) throw new StockError("연결할 화학물질을 찾을 수 없습니다");
  }
  if (input.supplierId) {
    const [sp] = await db.select({ status: supplier.status, name: supplier.name }).from(supplier).where(eq(supplier.id, input.supplierId));
    if (!sp) throw new StockError("주 거래 업체를 찾을 수 없습니다");
    if (sp.status === "stopped" || sp.status === "rejected") throw new StockError(`${sp.name}은(는) 거래하지 않는 업체입니다. 다른 업체를 고르세요`);
  }
  const v = {
    name: input.name.trim(),
    kind: input.kind,
    spec: clean(input.spec),
    unit: input.unit.trim(),
    location: clean(input.location),
    safetyQty: input.safetyQty,
    unitWon: splitVat(input.unitWon, vatMode).supply,
    vatMode,
    packAmount: pack,
    packUnit: pack != null ? input.packUnit! : null,
    // 구분 기본값과 같으면 비워 둔다(나중에 기본값을 바꾸면 따라가게)
    expCategory: expCategory === KIND_EXP_CATEGORY[input.kind as StockKind] ? null : expCategory,
    chemicalId,
    expiryTracked: input.expiryTracked,
    supplierId: input.supplierId || null,
    updatedAt: now,
  };
  if (id) {
    const before = await itemRow(db, id);
    if (before.expiryTracked && !v.expiryTracked && before.qty > 0) throw new StockError("남은 재고가 있는 동안에는 유효기간 관리를 끌 수 없습니다");
    await db.update(stockItem).set(v).where(eq(stockItem.id, id));
    await writeAudit(db, { actorId: actor.id, action: "stock.item", entityType: "stock_item", entityId: id, before: { safetyQty: before.safetyQty, location: before.location }, after: { safetyQty: v.safetyQty, location: v.location } });
    return id;
  }
  const opening = input.openingQty ?? 0;
  if (!Number.isInteger(opening) || opening < 0) throw new StockError("지금 수량을 확인해 주세요");
  if (opening > 0 && v.expiryTracked && !/^\d{4}-\d{2}-\d{2}$/.test(input.openingExpiresOn ?? "")) throw new StockError("지금 있는 것의 유효기간을 적어 주세요");
  const newId = await db.transaction(async (tx) => {
    const [i] = await tx.insert(stockItem).values({ ...v, qty: opening, createdAt: now }).returning({ id: stockItem.id });
    if (opening > 0) {
      if (v.expiryTracked) await tx.insert(stockLot).values({ itemId: i.id, expiresOn: input.openingExpiresOn!, qty: opening });
      await postMove(tx, { id: i.id, qty: 0, valueWon: 0, unitWon: v.unitWon }, { qty: opening, reason: "count", note: "처음 등록(기초 재고)", by: actor.id, at: now }, v.unitWon);
    }
    return i.id;
  });
  await writeAudit(db, { actorId: actor.id, action: "stock.item_create", entityType: "stock_item", entityId: newId, after: { name: v.name, opening } });
  return newId;
}

export type StopInput = { reason: string; note?: string; replacedById?: string };

/**
 * 사용 중지. 남은 수량이 없으면 바로 중지, 있으면 '소진 후 중지'(새 발주는 막고 남은 것은 쓴다. 0이 되면 중지).
 * 과거 기록·단가는 지우지 않는다. 대체 품목을 고르면 발주·사용 화면에서 '대신 ○○'로 안내한다
 */
export async function stopItem(db: Db, actor: Actor, id: string, input: StopInput, now = new Date()) {
  if (!can(actor, "stock.manage")) throw new StockError("재고 품목은 공장장·대표가 정합니다");
  const i = await itemRow(db, id);
  if (!i.active) throw new StockError("이미 사용 중지한 품목입니다");
  if (!isStopReason(input.reason)) throw new StockError("중지 사유를 골라 주세요");
  if (input.reason === "other" && !clean(input.note)) throw new StockError("기타 사유를 적어 주세요");
  const rep = input.replacedById || null;
  if (input.reason === "replaced" && !rep) throw new StockError("바꿀 대체 품목을 골라 주세요");
  if (rep) {
    if (rep === id) throw new StockError("대체 품목은 다른 품목이어야 합니다");
    const r = await itemRow(db, rep);
    if (!r.active || r.windDown) throw new StockError(`${r.name}도 사용 중지(예정) 품목입니다. 쓰는 품목을 고르세요`);
  }
  const now0 = i.qty <= 0;
  await db
    .update(stockItem)
    .set({ active: !now0, windDown: !now0, stopReason: input.reason, stopNote: clean(input.note), replacedById: rep, stoppedBy: actor.id, stoppedAt: now, updatedAt: now })
    .where(eq(stockItem.id, id));
  await writeAudit(db, { actorId: actor.id, action: now0 ? "stock.item_stop" : "stock.item_wind_down", entityType: "stock_item", entityId: id, after: { name: i.name, reason: STOP_REASONS[input.reason], qty: i.qty, replacedBy: rep } });
  return now0 ? ("stopped" as const) : ("windDown" as const);
}

/** 다시 쓰기: 사용 중지·소진 후 중지를 푼다 */
export async function resumeItem(db: Db, actor: Actor, id: string, now = new Date()) {
  if (!can(actor, "stock.manage")) throw new StockError("재고 품목은 공장장·대표가 정합니다");
  const i = await itemRow(db, id);
  if (i.active && !i.windDown) throw new StockError("쓰고 있는 품목입니다");
  await db.update(stockItem).set({ active: true, windDown: false, stopReason: null, stopNote: null, replacedById: null, stoppedBy: null, stoppedAt: null, updatedAt: now }).where(eq(stockItem.id, id));
  await writeAudit(db, { actorId: actor.id, action: "stock.item_resume", entityType: "stock_item", entityId: id, before: { stopReason: i.stopReason, windDown: i.windDown }, after: { name: i.name } });
}

/** 예전 이름(수량 0일 때 빼기). 사유 '더 안 씀'으로 중지한다 */
export const deactivateItem = (db: Db, actor: Actor, id: string) => stopItem(db, actor, id, { reason: "unused" });

/** 소진 후 중지 품목이 0이 되면 사용 중지로 바꾼다 */
async function finishWindDown(db: Db, id: string, qty: number, now: Date) {
  if (qty > 0) return;
  await db.update(stockItem).set({ active: false, windDown: false, updatedAt: now }).where(and(eq(stockItem.id, id), eq(stockItem.windDown, true)));
}

/** 안전 재고 아래로 떨어지면(5.2) 공장장에게 알린다(하루 한 번) */
async function safetyAlert(db: Db, i: { id: string; name: string; qty: number; safetyQty: number; unit: string; windDown?: boolean; active?: boolean }, now: Date) {
  // 소진 후 중지·중지 품목은 다시 사지 않으므로 알리지 않는다
  if (i.windDown || i.active === false || !belowSafety(i)) return false;
  await notifyRole(db, "plant_manager", `안전 재고 미달: ${i.name} ${i.qty}${i.unit}(안전 ${i.safetyQty}${i.unit}) — 발주 요청을 만드세요`, `stock-low-${i.id}-${seoulDate(now)}`, `/stock?f=low`);
  return true;
}

/** 사용 기록(7절): 기술자가 쓴 자재와 양. 유효기간 품목은 빠른 로트부터 뺀다. 유효기간 지난 로트는 못 쓴다 */
export async function useStock(db: Db, actor: Actor, input: { itemId: string; qty: number; repairOrderId?: string | null; note?: string }, now = new Date()) {
  if (!can(actor, "stock.use")) throw new StockError("자재 사용은 기술자·공장장이 적습니다");
  const i = await itemRow(db, input.itemId);
  if (!i.active) throw new StockError("쓰지 않는 품목입니다");
  if (!Number.isInteger(input.qty) || input.qty < 1) throw new StockError("쓴 양을 적어 주세요");
  const today = seoulDate(now);
  let takes: { id: string; take: number }[] = [];
  let lotNames: string[] = [];
  if (i.expiryTracked) {
    const lots = await db.select().from(stockLot).where(and(eq(stockLot.itemId, i.id), gt(stockLot.qty, 0)));
    const usable = lots.filter((l) => l.expiresOn >= today);
    const usableQty = usable.reduce((s, l) => s + l.qty, 0);
    if (input.qty > usableQty) throw new StockError(`쓸 수 있는 양은 ${usableQty}${i.unit}입니다${usableQty < i.qty ? "(유효기간 지난 것은 사용 금지 — 폐기 처리하세요)" : ""}`);
    takes = fifoTake(usable, input.qty);
    lotNames = takes.map((t) => usable.find((l) => l.id === t.id)?.lot ?? "").filter(Boolean);
  } else if (input.qty > i.qty) throw new StockError(`장부 수량(${i.qty}${i.unit})보다 많습니다. 실물이 더 있으면 실사로 맞춘 뒤 적으세요`);
  let roDoc: string | null = null;
  if (input.repairOrderId) {
    const [ro] = await db.select({ docNo: repairOrder.docNo }).from(repairOrder).where(eq(repairOrder.id, input.repairOrderId));
    if (!ro) throw new StockError("수리 건을 찾을 수 없습니다");
    roDoc = ro.docNo;
  }
  await db.transaction(async (tx) => {
    for (const t of takes) {
      const [l] = await tx.select({ qty: stockLot.qty }).from(stockLot).where(eq(stockLot.id, t.id));
      await tx.update(stockLot).set({ qty: l.qty - t.take }).where(eq(stockLot.id, t.id));
    }
    await tx.update(stockItem).set({ qty: i.qty - input.qty, updatedAt: now }).where(eq(stockItem.id, i.id));
    await postMove(tx, i, { qty: -input.qty, reason: "use", ref: roDoc, repairOrderId: input.repairOrderId || null, lot: lotNames.join(",") || null, note: clean(input.note), by: actor.id, at: now });
  });
  const after = { ...i, qty: i.qty - input.qty };
  await finishWindDown(db, i.id, after.qty, now);
  const low = await safetyAlert(db, after, now);
  return { left: after.qty, low };
}

/** 유효기간 지난 로트 폐기(7절: 사용 금지 → 지정 폐기물 STD-10) */
export async function discardLot(db: Db, actor: Actor, lotId: string, note: string, now = new Date()) {
  if (!can(actor, "stock.manage")) throw new StockError("폐기는 공장장이 합니다");
  const [l] = await db.select().from(stockLot).where(eq(stockLot.id, lotId));
  if (!l || l.qty <= 0) throw new StockError("남은 수량이 없는 로트입니다");
  const i = await itemRow(db, l.itemId);
  await db.transaction(async (tx) => {
    await tx.update(stockLot).set({ qty: 0 }).where(eq(stockLot.id, lotId));
    await tx.update(stockItem).set({ qty: Math.max(0, i.qty - l.qty), updatedAt: now }).where(eq(stockItem.id, i.id));
    await postMove(tx, i, { qty: -Math.min(l.qty, Math.max(0, i.qty)), reason: "discard", lot: l.lot, note: clean(note) ?? `유효기간 ${l.expiresOn} 경과 — 지정 폐기물로 처리`, by: actor.id, at: now });
  });
  await writeAudit(db, { actorId: actor.id, action: "stock.discard", entityType: "stock_item", entityId: i.id, after: { lot: l.lot, qty: l.qty, expiresOn: l.expiresOn } });
  await finishWindDown(db, i.id, Math.max(0, i.qty - l.qty), now);
  await safetyAlert(db, { ...i, qty: Math.max(0, i.qty - l.qty) }, now);
}

/**
 * 실사(7절): 실물 수량을 적으면 장부를 맞추고, 금액 차이가 정책값(%)을 넘으면 부적합(F-Q-10)을 발행한다.
 * 유효기간 품목이 줄었으면 빠른 로트부터 빼고, 늘었으면 가장 늦은 로트에 더한다(로트가 없으면 유효기간을 모르는 채로 장부만 맞춤)
 */
export async function recordCount(db: Db, actor: Actor, input: { kind: string; lines: { itemId: string; actual: number }[]; note: string }, now = new Date()) {
  if (!can(actor, "stock.manage")) throw new StockError("실사는 공장장이 합니다");
  if (!(input.kind in COUNT_KINDS)) throw new StockError("실사 구분을 골라 주세요");
  const given = input.lines.filter((l) => Number.isInteger(l.actual) && l.actual >= 0);
  if (!given.length) throw new StockError("실물 수량을 하나 이상 적어 주세요");
  const items = await db.select().from(stockItem).where(inArray(stockItem.id, given.map((g) => g.itemId)));
  const byId = new Map(items.map((i) => [i.id, i]));
  const lines = given.filter((g) => byId.has(g.itemId)).map((g) => ({ itemId: g.itemId, name: byId.get(g.itemId)!.name, book: byId.get(g.itemId)!.qty, actual: g.actual, unitWon: Math.round(avgUnit(byId.get(g.itemId)!)) }));
  const d = countDiff(lines);
  const p = await loadPolicy(db, seoulDate(now));
  const over = d.pct > p["stock.count_diff_pct"];
  if (over && !input.note.trim()) throw new StockError(`차이가 ${d.pct}%로 기준(${p["stock.count_diff_pct"]}%)을 넘습니다. 짐작 가는 원인을 적어 주세요`);
  const countId = await db.transaction(async (tx) => {
    const [c] = await tx.insert(stockCount).values({ kind: input.kind, lines, bookWon: d.bookWon, diffWon: d.diffWon, note: clean(input.note), countedBy: actor.id, countedAt: now }).returning({ id: stockCount.id });
    for (const l of lines.filter((x) => x.actual !== x.book)) {
      const it = byId.get(l.itemId)!;
      const diff = l.actual - l.book;
      if (it.expiryTracked) {
        const lots = await tx.select().from(stockLot).where(and(eq(stockLot.itemId, it.id), gt(stockLot.qty, 0)));
        if (diff < 0) for (const t of fifoTake(lots, -diff)) await tx.update(stockLot).set({ qty: lots.find((x) => x.id === t.id)!.qty - t.take }).where(eq(stockLot.id, t.id));
        else if (lots.length) {
          const last = [...lots].sort((a, b) => b.expiresOn.localeCompare(a.expiresOn))[0];
          await tx.update(stockLot).set({ qty: last.qty + diff }).where(eq(stockLot.id, last.id));
        }
      }
      await tx.update(stockItem).set({ qty: l.actual, updatedAt: now }).where(eq(stockItem.id, it.id));
      if (it.windDown && l.actual <= 0) await tx.update(stockItem).set({ active: false, windDown: false }).where(eq(stockItem.id, it.id));
      await postMove(tx, it, { qty: diff, reason: "count", note: `${COUNT_KINDS[input.kind as CountKind]} 장부 ${l.book} → 실물 ${l.actual}`, by: actor.id, at: now });
    }
    return c.id;
  });
  let nc: { id: string; docNo: string } | null = null;
  if (over) {
    nc = await issueNc(db, actor.id, { source: "stock", refType: "stock_count", refId: countId, refLabel: COUNT_KINDS[input.kind as CountKind], content: `재고 실사 차이 ${d.pct}%(${d.diffWon.toLocaleString("ko-KR")}원, 기준 ${p["stock.count_diff_pct"]}%): ${input.note.trim()}` }, now);
    await db.update(stockCount).set({ ncId: nc.id }).where(eq(stockCount.id, countId));
  }
  await writeAudit(db, { actorId: actor.id, action: "stock.count", entityType: "stock_count", entityId: countId, after: { kind: input.kind, pct: d.pct, nc: nc?.docNo ?? null } });
  for (const l of lines) {
    const it = byId.get(l.itemId)!;
    await safetyAlert(db, { ...it, qty: l.actual }, now);
  }
  return { ...d, over, nc };
}

/** 안전 재고 미달 품목으로 발주 요청(작성 중)을 만든다. 업체별로 한 장씩 */
export async function orderLowStock(db: Db, actor: Actor, itemIds: string[], now = new Date()) {
  if (!itemIds.length) throw new StockError("발주할 품목을 골라 주세요");
  const items = await db.select().from(stockItem).where(inArray(stockItem.id, itemIds));
  const off = items.filter((i) => !i.active || i.windDown);
  if (off.length) throw new StockError(`사용 중지(예정) 품목은 발주하지 않습니다: ${off.map((i) => i.name).join(", ")}`);
  const groups = new Map<string, typeof items>();
  for (const i of items) groups.set(i.supplierId ?? "", [...(groups.get(i.supplierId ?? "") ?? []), i]);
  const ids: string[] = [];
  for (const [sup, list] of groups)
    ids.push(
      await createOrder(
        db,
        actor,
        {
          kind: "stock",
          supplierId: sup || null,
          note: "안전 재고 미달 발주 요청",
          lines: list.map((i) => ({ name: i.name, spec: i.spec ?? undefined, qty: Math.max(1, suggestOrderQty(i)), unitWon: i.unitWon, stockItemId: i.id })),
        },
        now,
      ),
    );
  return ids;
}

export type StockFilter = "all" | "low" | "expiry" | "paint" | "consumable" | "part" | "stopped" | "docs";

export async function listStock(db: Db, filter: StockFilter = "all", now = new Date()) {
  const today = seoulDate(now);
  const soon = addDays(today, EXPIRY_ALERT_DAYS);
  const rep = alias(stockItem, "rep");
  const items = await db
    .select({ i: stockItem, supplierName: supplier.name, replacedByName: rep.name })
    .from(stockItem)
    .leftJoin(supplier, eq(supplier.id, stockItem.supplierId))
    .leftJoin(rep, eq(rep.id, stockItem.replacedById))
    .where(eq(stockItem.active, filter !== "stopped"))
    .orderBy(stockItem.kind, stockItem.name);
  const lots = await db.select().from(stockLot).where(gt(stockLot.qty, 0)).orderBy(asc(stockLot.expiresOn));
  const lotsOf = new Map<string, typeof lots>();
  for (const l of lots) lotsOf.set(l.itemId, [...(lotsOf.get(l.itemId) ?? []), l]);
  const docs = await db.select({ itemId: stockItemDoc.itemId, expiresOn: stockItemDoc.expiresOn }).from(stockItemDoc).where(eq(stockItemDoc.active, true));
  const docState = new Map<string, "expired" | "soon">();
  for (const d of docs) {
    const st = docExpiry(d.expiresOn, today, soon);
    if (st === "expired") docState.set(d.itemId, "expired");
    else if (st === "soon" && docState.get(d.itemId) !== "expired") docState.set(d.itemId, "soon");
  }
  const rows = items.map(({ i, supplierName, replacedByName }) => {
    const ls = lotsOf.get(i.id) ?? [];
    return {
      ...i,
      supplierName,
      replacedByName,
      lots: ls,
      expired: ls.filter((l) => l.expiresOn < today),
      expiring: ls.filter((l) => l.expiresOn >= today && l.expiresOn <= soon),
      // 소진 후 중지 품목은 다시 사지 않으므로 미달로 보지 않는다
      low: !i.windDown && belowSafety(i),
      docState: docState.get(i.id) ?? null,
    };
  });
  return rows.filter((r) =>
    filter === "all" || filter === "stopped" ? true : filter === "low" ? r.low : filter === "expiry" ? r.expired.length || r.expiring.length : filter === "docs" ? !!r.docState : r.kind === filter,
  );
}

/** 발주에 넣을 수 있는 품목(쓰는 중, 소진 후 중지 아님) */
export const orderableStock = async (db: Db) => (await listStock(db, "all")).filter((r) => !r.windDown);

export async function getItem(db: Db, id: string) {
  const i = await itemRow(db, id);
  const lots = await db.select().from(stockLot).where(and(eq(stockLot.itemId, id), gt(stockLot.qty, 0))).orderBy(asc(stockLot.expiresOn));
  const moves = await db.select({ m: stockMove, by: appUser.name }).from(stockMove).leftJoin(appUser, eq(appUser.id, stockMove.by)).where(eq(stockMove.itemId, id)).orderBy(desc(stockMove.at)).limit(50);
  const docs = await db.select({ d: stockItemDoc, by: appUser.name }).from(stockItemDoc).leftJoin(appUser, eq(appUser.id, stockItemDoc.uploadedBy)).where(eq(stockItemDoc.itemId, id)).orderBy(desc(stockItemDoc.active), desc(stockItemDoc.createdAt));
  const [chem] = i.chemicalId ? await db.select().from(chemical).where(eq(chemical.id, i.chemicalId)) : [];
  const [rep] = i.replacedById ? await db.select({ id: stockItem.id, name: stockItem.name }).from(stockItem).where(eq(stockItem.id, i.replacedById)) : [];
  const [stopper] = i.stoppedBy ? await db.select({ name: appUser.name }).from(appUser).where(eq(appUser.id, i.stoppedBy)) : [];
  // 이 품목을 대체품으로 가리키는 중지 품목
  const replaces = await db.select({ id: stockItem.id, name: stockItem.name }).from(stockItem).where(eq(stockItem.replacedById, id));
  return { i, lots, moves, docs, chem: chem ?? null, replacedBy: rep ?? null, stoppedByName: stopper?.name ?? null, replaces };
}

// ── 품목 문서(시험성적서·ICP 성적서·인증서). MSDS 는 화학물질 목록(F-09-02)에서 ──
export type DocUpload = { name: string; bytes: Uint8Array };
export type ItemDocInput = { kind: string; title: string; issuer: string; issuedOn: string; expiresOn: string; result: string; lot: string; note: string; replaceId?: string };
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** 문서 올리기. 같은 종류의 앞 판을 고르면(replaceId) 앞 판은 '지난 판'으로 남긴다 */
export async function addItemDoc(db: Db, actor: Actor, itemId: string, input: ItemDocInput, file: DocUpload | null, now = new Date()) {
  if (!can(actor, "stock.manage")) throw new StockError("품목 문서는 공장장·대표가 올립니다");
  const i = await itemRow(db, itemId);
  if (!isItemDocKind(input.kind)) throw new StockError("문서 종류를 골라 주세요");
  if (input.issuedOn && !DATE.test(input.issuedOn)) throw new StockError("발행일을 확인해 주세요");
  if (input.expiresOn && !DATE.test(input.expiresOn)) throw new StockError("유효기간을 확인해 주세요");
  if (input.issuedOn && input.issuedOn > seoulDate(now)) throw new StockError("발행일은 오늘이나 그 전입니다");
  if (input.issuedOn && input.expiresOn && input.expiresOn < input.issuedOn) throw new StockError("유효기간이 발행일보다 빠릅니다");
  if (input.result && input.result !== "pass" && input.result !== "fail") throw new StockError("판정을 골라 주세요");
  if (input.kind === "other" && !clean(input.title)) throw new StockError("기타 문서는 문서 이름을 적어 주세요");
  if (!file?.bytes.length) throw new StockError("문서 파일(PDF나 사진)을 골라 주세요");
  if (file.bytes.length > MAX_DOC_BYTES) throw new StockError("파일이 너무 큽니다(8MB까지)");
  const type = sniffDoc(file.bytes);
  if (!type) throw new StockError("PDF나 사진(JPG·PNG·WEBP)만 올릴 수 있습니다");
  if (input.replaceId) {
    const [old] = await db.select().from(stockItemDoc).where(and(eq(stockItemDoc.id, input.replaceId), eq(stockItemDoc.itemId, itemId)));
    if (!old) throw new StockError("바꿀 앞 판을 찾을 수 없습니다");
  }
  const path = await storeFile(`stock/${itemId}`, file.bytes, DOC_TYPES[type]);
  const [d] = await db
    .insert(stockItemDoc)
    .values({
      itemId,
      kind: input.kind,
      title: clean(input.title),
      issuer: clean(input.issuer),
      issuedOn: input.issuedOn || null,
      expiresOn: input.expiresOn || null,
      result: input.result || null,
      lot: clean(input.lot),
      path,
      fileName: file.name.slice(0, 120) || `${ITEM_DOC_KINDS[input.kind]}.${DOC_TYPES[type]}`,
      note: clean(input.note),
      uploadedBy: actor.id,
      createdAt: now,
    })
    .returning({ id: stockItemDoc.id });
  if (input.replaceId) await db.update(stockItemDoc).set({ active: false }).where(eq(stockItemDoc.id, input.replaceId));
  await writeAudit(db, { actorId: actor.id, action: "stock.doc_add", entityType: "stock_item", entityId: itemId, after: { item: i.name, kind: ITEM_DOC_KINDS[input.kind], result: input.result || null, expiresOn: input.expiresOn || null, replaced: input.replaceId ?? null } });
  // 부적합 성적서는 그 품목을 쓰기 전에 공장장이 보게 알린다
  if (input.result === "fail") await notifyRole(db, "plant_manager", `부적합 ${ITEM_DOC_KINDS[input.kind]}: ${i.name}${input.lot ? `(로트 ${input.lot})` : ""} — 사용 전 확인하세요`, `stock-doc-fail-${d.id}`, `/stock/${itemId}`);
  return d.id;
}

/** 문서 빼기(잘못 올림 등). 지우지 않고 지난 판으로 남긴다 */
export async function retireItemDoc(db: Db, actor: Actor, docId: string) {
  if (!can(actor, "stock.manage")) throw new StockError("품목 문서는 공장장·대표가 정합니다");
  const [d] = await db.select().from(stockItemDoc).where(eq(stockItemDoc.id, docId));
  if (!d) throw new StockError("문서를 찾을 수 없습니다");
  await db.update(stockItemDoc).set({ active: false }).where(eq(stockItemDoc.id, docId));
  await writeAudit(db, { actorId: actor.id, action: "stock.doc_retire", entityType: "stock_item", entityId: d.itemId, after: { doc: d.fileName } });
  return d.itemId;
}

/** 화학물질 고르기 목록(쓰는 것만) */
export async function chemicalOptions(db: Db) {
  return db.select({ id: chemical.id, name: chemical.name, maker: chemical.maker, hasMsds: chemical.msdsPath }).from(chemical).where(eq(chemical.active, true)).orderBy(chemical.name);
}

/** 대체 품목 고르기 목록(쓰는 품목, 자기 빼고) */
export async function replacementOptions(db: Db, exceptId: string) {
  return (await orderableStock(db)).filter((r) => r.id !== exceptId).map((r) => ({ id: r.id, name: r.name, spec: r.spec }));
}

/** 직전에 등록한 품목의 단가 방식(다음 등록 때 그대로 불러온다) */
export async function lastVatMode(db: Db): Promise<VatMode> {
  const [r] = await db.select({ m: stockItem.vatMode }).from(stockItem).orderBy(desc(stockItem.createdAt)).limit(1);
  return r && isVatMode(r.m) ? r.m : "excluded";
}

export async function listCounts(db: Db) {
  return db.select({ c: stockCount, by: appUser.name }).from(stockCount).leftJoin(appUser, eq(appUser.id, stockCount.countedBy)).orderBy(desc(stockCount.countedAt)).limit(12);
}

/** 수리 건에 쓴 자재(명세서·원가 참고) */
export async function usedOnRo(db: Db, roId: string) {
  return db.select({ m: stockMove, name: stockItem.name, unit: stockItem.unit }).from(stockMove).innerJoin(stockItem, eq(stockItem.id, stockMove.itemId)).where(and(eq(stockMove.repairOrderId, roId), eq(stockMove.reason, "use"))).orderBy(stockMove.at);
}

/** 매일: 안전 재고 미달·유효기간 30일 전·지남 알림 */
export async function stockDailyAlerts(db: Db, now = new Date()) {
  const today = seoulDate(now);
  const rows = await listStock(db, "all", now);
  let low = 0;
  let exp = 0;
  for (const r of rows) {
    if (await safetyAlert(db, r, now)) low++;
    for (const l of r.expiring) {
      exp++;
      await notifyRole(db, "plant_manager", `유효기간 임박: ${r.name}${l.lot ? `(로트 ${l.lot})` : ""} ${l.qty}${r.unit} — ${l.expiresOn}까지. 이것부터 쓰세요`, `stock-exp-${l.id}`, `/stock/${r.id}`);
    }
    for (const l of r.expired) {
      exp++;
      await notifyRole(db, "plant_manager", `유효기간 지남(사용 금지): ${r.name}${l.lot ? `(로트 ${l.lot})` : ""} ${l.qty}${r.unit} — 폐기 처리하세요`, `stock-expd-${l.id}`, `/stock/${r.id}`);
    }
  }
  // 품목 문서(성적서·인증서) 유효기간 30일 전·지남
  const soon = addDays(today, EXPIRY_ALERT_DAYS);
  const docs = await db.select({ d: stockItemDoc, name: stockItem.name }).from(stockItemDoc).innerJoin(stockItem, eq(stockItem.id, stockItemDoc.itemId)).where(and(eq(stockItemDoc.active, true), eq(stockItem.active, true)));
  let doc = 0;
  for (const { d, name } of docs) {
    const st = docExpiry(d.expiresOn, today, soon);
    if (st !== "expired" && st !== "soon") continue;
    doc++;
    const what = d.kind === "other" && d.title ? d.title : ITEM_DOC_KINDS[d.kind as keyof typeof ITEM_DOC_KINDS];
    await notifyRole(db, "plant_manager", st === "expired" ? `${name} ${what} 유효기간 지남(${d.expiresOn}) — 새 판을 업체에 요청해 올리세요` : `${name} ${what} 유효기간 ${d.expiresOn}까지 — 새 판을 업체에 요청하세요`, `stock-doc-${st}-${d.id}`, `/stock/${d.itemId}`);
  }
  return `재고 미달 ${low}·유효기간 ${exp}·문서 기한 ${doc}건 (${today})`;
}

/** 내 할 일: 공장장 — 안전 재고 미달, 유효기간 지난 로트, 월말·분기 말 실사 */
export async function stockTodos(db: Db, actor: Actor, today: string, now = new Date()) {
  const out: { key: string; when: "late" | "today" | "soon"; what: string; detail?: string; href: string; action: string }[] = [];
  if (!can(actor, "stock.manage")) return out;
  const rows = await listStock(db, "all", now);
  if (!rows.length) return out;
  const low = rows.filter((r) => r.low);
  if (low.length) out.push({ key: "stock-low", when: "today", what: `안전 재고 미달 ${low.length}개 품목`, detail: low.slice(0, 4).map((r) => `${r.name} ${r.qty}/${r.safetyQty}${r.unit}`).join(", "), href: "/stock?f=low", action: "발주 요청 만들기" });
  const docDue = rows.filter((r) => r.docState);
  if (docDue.length) out.push({ key: "stock-docs", when: docDue.some((r) => r.docState === "expired") ? "late" : "soon", what: `성적서·인증서 기한 ${docDue.length}개 품목`, detail: docDue.slice(0, 4).map((r) => `${r.name}${r.docState === "expired" ? "(지남)" : ""}`).join(", "), href: "/stock?f=docs", action: "새 판 받아 올리기" });
  const expired = rows.filter((r) => r.expired.length);
  if (expired.length) out.push({ key: "stock-expired", when: "late", what: `유효기간 지난 자재 ${expired.length}개 품목(사용 금지)`, detail: expired.slice(0, 4).map((r) => r.name).join(", "), href: "/stock?f=expiry", action: "폐기 처리" });
  // 월말 실사: 그 달 마지막 3일부터, 이번 달에 실사 기록이 없으면
  const month = today.slice(0, 7);
  const lastDay = addDays(`${addDays(`${month}-28`, 4).slice(0, 7)}-01`, -1);
  if (today >= addDays(lastDay, -2)) {
    const [c] = await db.select({ at: stockCount.countedAt }).from(stockCount).orderBy(desc(stockCount.countedAt)).limit(1);
    if (!c || seoulDate(c.at).slice(0, 7) !== month) {
      const quarter = ["03", "06", "09", "12"].includes(month.slice(5));
      out.push({ key: `stock-count-${month}`, when: today >= lastDay ? "today" : "soon", what: quarter ? "분기 말 전체 재고 실사" : "월말 재고 실사(도료·고가 소모품)", detail: `${lastDay}까지`, href: `/stock/count?kind=${quarter ? "quarterly" : "monthly"}`, action: "실사하기" });
    }
  }
  return out;
}


