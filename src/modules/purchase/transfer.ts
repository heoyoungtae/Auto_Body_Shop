// 지점별 재고와 재고 이동 전표(본점·지점 3단계, 대표 결정 2026-11-19).
// 품목 목록과 회사 전체 수량·장부 금액(stock_item)은 하나다. 지점별 수량은 움직임(stock_move)의 지점 꼬리표로 나눈다:
//   다른 지점 = 그 지점 움직임의 합, 본점 = 회사 전체 − 다른 지점 − 이동 중.
// 그래서 지점이 하나뿐이면 본점 수량 = 회사 전체 수량이고, 아무것도 바뀌지 않는다.
// 이동: 보내기 때 보낸 곳에서 빠지고(이동 중), 받음 확인 때 받는 곳에 들어간다. 금액은 보낼 때의 평균 단가.
import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { appUser, branch, MAIN_BRANCH_ID, stockItem, stockMove, stockTransfer } from "@/db/schema";
import { can } from "@/modules/auth/permissions";
import type { Role } from "@/modules/auth/roles";
import { writeAudit } from "@/modules/platform/audit";
import { actorBranch, branchDocNo } from "@/modules/platform/docno";
import { UserError } from "@/modules/platform/errors";
import { notifyRole } from "@/modules/platform/notify";
import { avgUnit } from "./cost";

export class TransferError extends UserError {}
type Actor = { id: string; roles: Role[]; branchId?: string };
type Bal = { qty: number; won: number };

export const TRANSFER_STATUS = { sent: "이동 중", received: "받음", cancelled: "취소" } as const;

/** 이동 중인 수량·금액(품목별) */
async function inTransit(db: Db, itemIds?: string[]) {
  const rows = await db.select({ lines: stockTransfer.lines }).from(stockTransfer).where(eq(stockTransfer.status, "sent"));
  const out = new Map<string, Bal>();
  for (const r of rows)
    for (const l of r.lines) {
      if (itemIds && !itemIds.includes(l.itemId)) continue;
      const b = out.get(l.itemId) ?? (out.set(l.itemId, { qty: 0, won: 0 }), out.get(l.itemId)!);
      b.qty += l.qty;
      b.won += Math.round(l.qty * l.unitWon);
    }
  return out;
}

/** 품목별·지점별 재고. 지점이 하나면 본점 = 회사 전체 */
export async function branchStock(db: Db, itemIds?: string[]): Promise<{ by: Map<string, Map<string, Bal>>; transit: Map<string, Bal> }> {
  if (itemIds && !itemIds.length) return { by: new Map(), transit: new Map() };
  const items = await db
    .select({ id: stockItem.id, qty: stockItem.qty, valueWon: stockItem.valueWon })
    .from(stockItem)
    .where(itemIds ? inArray(stockItem.id, itemIds) : undefined);
  const others = await db
    .select({ itemId: stockMove.itemId, b: stockMove.branchId, qty: sql<number>`sum(${stockMove.qty})::int`, won: sql<number>`coalesce(sum(${stockMove.amountWon}), 0)::int` })
    .from(stockMove)
    .where(and(ne(stockMove.branchId, MAIN_BRANCH_ID), itemIds ? inArray(stockMove.itemId, itemIds) : undefined))
    .groupBy(stockMove.itemId, stockMove.branchId);
  const transit = await inTransit(db, itemIds);
  const by = new Map<string, Map<string, Bal>>();
  for (const i of items) by.set(i.id, new Map());
  for (const o of others) by.get(o.itemId)?.set(o.b, { qty: Math.max(0, o.qty), won: Math.max(0, o.won) });
  for (const i of items) {
    const m = by.get(i.id)!;
    const t = transit.get(i.id) ?? { qty: 0, won: 0 };
    let q = Math.max(0, i.qty) - t.qty;
    let w = (i.qty > 0 ? i.valueWon : 0) - t.won;
    for (const v of m.values()) {
      q -= v.qty;
      w -= v.won;
    }
    m.set(MAIN_BRANCH_ID, { qty: Math.max(0, q), won: q > 0 ? Math.max(0, w) : 0 });
  }
  return { by, transit };
}

/** 한 지점의 한 품목 수량 */
export async function qtyAt(db: Db, itemId: string, branchId: string) {
  const { by } = await branchStock(db, [itemId]);
  return by.get(itemId)?.get(branchId)?.qty ?? 0;
}

export type TransferInput = { toBranchId: string; lines: { itemId: string; qty: number }[]; note: string };

/** 보내기: 보내는 사람의 지금 지점에서 다른 지점으로 */
export async function sendTransfer(db: Db, actor: Actor, input: TransferInput, now = new Date()) {
  if (!can(actor, "stock.manage")) throw new TransferError("재고 이동은 공장장이 합니다");
  const from = actorBranch(actor);
  const [to] = await db.select().from(branch).where(eq(branch.id, input.toBranchId));
  if (!to || to.closedOn) throw new TransferError("받을 지점을 골라 주세요");
  if (to.id === from) throw new TransferError("지금 지점과 다른 지점으로 보냅니다. 화면 위에서 보내는 지점을 고르세요");
  const want = new Map<string, number>();
  for (const l of input.lines) {
    if (!l.itemId) continue;
    if (!Number.isInteger(l.qty) || l.qty < 1) throw new TransferError("보낼 수량을 확인해 주세요");
    want.set(l.itemId, (want.get(l.itemId) ?? 0) + l.qty);
  }
  if (!want.size) throw new TransferError("보낼 품목을 하나 이상 넣어 주세요");
  const ids = [...want.keys()];
  const items = await db.select().from(stockItem).where(inArray(stockItem.id, ids));
  if (items.length !== ids.length) throw new TransferError("없는 품목이 있습니다");
  const { by } = await branchStock(db, ids);
  const lines = items.map((i) => {
    const qty = want.get(i.id)!;
    const have = by.get(i.id)?.get(from)?.qty ?? 0;
    if (qty > have) throw new TransferError(`${i.name}: 이 지점 재고(${have}${i.unit})보다 많습니다`);
    return { itemId: i.id, name: i.name, unit: i.unit, qty, unitWon: Math.round(avgUnit(i)) };
  });
  const amountWon = lines.reduce((s, l) => s + l.qty * l.unitWon, 0);
  const t = await db.transaction(async (tx) => {
    const docNo = await branchDocNo(tx, "ST", now, from);
    const [r] = await tx.insert(stockTransfer).values({ docNo, fromBranchId: from, toBranchId: to.id, lines, amountWon, note: input.note.trim() || null, sentBy: actor.id, sentAt: now }).returning({ id: stockTransfer.id, docNo: stockTransfer.docNo });
    // 본점은 '회사 전체 − 다른 지점 − 이동 중'으로 계산하므로 본점에서 보낼 때는 움직임을 남기지 않는다
    if (from !== MAIN_BRANCH_ID)
      await tx.insert(stockMove).values(lines.map((l) => ({ branchId: from, itemId: l.itemId, qty: -l.qty, reason: "transfer", ref: docNo, note: `${to.name}(으)로 보냄`, unitWon: l.unitWon, amountWon: -l.qty * l.unitWon, by: actor.id, at: now })));
    return r;
  });
  await writeAudit(db, { actorId: actor.id, action: "transfer.send", entityType: "stock_transfer", entityId: t.docNo, after: { to: to.name, lines: lines.map((l) => `${l.name} ${l.qty}${l.unit}`), amountWon } });
  await notifyRole(db, "plant_manager", `재고 이동: ${t.docNo} ${to.name}(으)로 ${lines.length}개 품목 — 받으면 '받음 확인'을 누르세요`, `st-${t.id}`, `/stock/transfers/${t.id}`);
  return t;
}

/** 받음 확인: 받는 지점에서. 받은 수량이 적으면 차이를 적고(사유 필수), 차이는 받는 곳 실사 조정으로 남긴다 */
export async function receiveTransfer(db: Db, actor: Actor, id: string, input: { got: Record<string, number>; note: string }, now = new Date()) {
  if (!can(actor, "stock.manage")) throw new TransferError("받음 확인은 공장장이 합니다");
  const [t] = await db.select().from(stockTransfer).where(eq(stockTransfer.id, id));
  if (!t) throw new TransferError("없는 이동 전표입니다");
  if (t.status !== "sent") throw new TransferError("이미 끝난 이동 전표입니다");
  if (actorBranch(actor) !== t.toBranchId && !actor.roles.includes("owner")) throw new TransferError("받는 지점에서 확인합니다. 화면 위에서 받는 지점을 고르세요");
  const lines = t.lines.map((l) => {
    const g = input.got[l.itemId];
    const got = g == null || !Number.isFinite(g) ? l.qty : Math.trunc(g);
    if (got < 0 || got > l.qty) throw new TransferError(`${l.name}: 받은 수량은 0~${l.qty}입니다`);
    return { ...l, got };
  });
  const short = lines.filter((l) => l.got < l.qty);
  if (short.length && !input.note.trim()) throw new TransferError("보낸 것보다 적게 받았습니다. 사유를 적어 주세요(예: 파손, 덜 실림)");
  await db.transaction(async (tx) => {
    await tx.update(stockTransfer).set({ status: "received", lines, receivedBy: actor.id, receivedAt: now, receivedNote: input.note.trim() || null }).where(eq(stockTransfer.id, id));
    if (t.toBranchId !== MAIN_BRANCH_ID)
      await tx.insert(stockMove).values(lines.filter((l) => l.got > 0).map((l) => ({ branchId: t.toBranchId, itemId: l.itemId, qty: l.got, reason: "transfer", ref: t.docNo, note: "받음", unitWon: l.unitWon, amountWon: l.got * l.unitWon, by: actor.id, at: now })));
    // 모자란 것은 회사 전체 재고에서도 빠진다(받는 곳의 실사 조정으로 남김, 금액은 그때 평균 단가)
    for (const l of short) {
      const lost = l.qty - l.got;
      const [i] = await tx.select().from(stockItem).where(eq(stockItem.id, l.itemId));
      const qty = Math.max(0, i.qty - lost);
      const before = i.qty > 0 ? i.valueWon : 0;
      const won = qty > 0 ? Math.max(0, before - lost * l.unitWon) : 0;
      await tx.update(stockItem).set({ qty, valueWon: won, updatedAt: now }).where(eq(stockItem.id, i.id));
      await tx.insert(stockMove).values({ branchId: t.toBranchId, itemId: l.itemId, qty: -lost, reason: "count", ref: t.docNo, note: `이동 중 모자람: ${input.note.trim()}`, unitWon: l.unitWon, amountWon: won - before, by: actor.id, at: now });
      // 지점 합계는 움직임으로 세므로, 받은 적 없는 양을 빼지 않게 같은 양을 이동으로 되채운다(회사 전체에는 영향 없음)
      if (t.toBranchId !== MAIN_BRANCH_ID) await tx.insert(stockMove).values({ branchId: t.toBranchId, itemId: l.itemId, qty: lost, reason: "transfer", ref: t.docNo, note: "모자람 자리 맞춤", unitWon: l.unitWon, amountWon: before - won, by: actor.id, at: now });
    }
  });
  await writeAudit(db, { actorId: actor.id, action: "transfer.receive", entityType: "stock_transfer", entityId: t.docNo, after: { got: lines.map((l) => `${l.name} ${l.got}/${l.qty}`), note: input.note.trim() } });
}

/** 취소(이동 중일 때만): 보낸 곳으로 되돌린다 */
export async function cancelTransfer(db: Db, actor: Actor, id: string, reason: string, now = new Date()) {
  if (!can(actor, "stock.manage")) throw new TransferError("취소는 공장장이 합니다");
  const [t] = await db.select().from(stockTransfer).where(eq(stockTransfer.id, id));
  if (!t || t.status !== "sent") throw new TransferError("이동 중인 전표만 취소합니다");
  if (!reason.trim()) throw new TransferError("취소 사유를 적어 주세요");
  await db.transaction(async (tx) => {
    await tx.update(stockTransfer).set({ status: "cancelled", receivedBy: actor.id, receivedAt: now, receivedNote: reason.trim() }).where(eq(stockTransfer.id, id));
    if (t.fromBranchId !== MAIN_BRANCH_ID)
      await tx.insert(stockMove).values(t.lines.map((l) => ({ branchId: t.fromBranchId, itemId: l.itemId, qty: l.qty, reason: "transfer", ref: t.docNo, note: "이동 취소 — 되돌림", unitWon: l.unitWon, amountWon: l.qty * l.unitWon, by: actor.id, at: now })));
  });
  await writeAudit(db, { actorId: actor.id, action: "transfer.cancel", entityType: "stock_transfer", entityId: t.docNo, after: { reason: reason.trim() } });
}

export async function listTransfers(db: Db, branchId?: string | null, limit = 100) {
  const rows = await db.select({ t: stockTransfer, by: appUser.name }).from(stockTransfer).leftJoin(appUser, eq(appUser.id, stockTransfer.sentBy)).orderBy(desc(stockTransfer.sentAt)).limit(limit);
  return branchId ? rows.filter((r) => r.t.fromBranchId === branchId || r.t.toBranchId === branchId) : rows;
}

export async function getTransfer(db: Db, id: string) {
  const [t] = await db.select().from(stockTransfer).where(eq(stockTransfer.id, id));
  if (!t) throw new TransferError("없는 이동 전표입니다");
  const names = await db.select({ id: appUser.id, name: appUser.name }).from(appUser).where(inArray(appUser.id, [t.sentBy, t.receivedBy].filter((x): x is string => !!x)));
  return { ...t, sentByName: names.find((n) => n.id === t.sentBy)?.name ?? "", receivedByName: names.find((n) => n.id === t.receivedBy)?.name ?? "" };
}
