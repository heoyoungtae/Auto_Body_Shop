// 발주·입고 검수(STD-07 5·6절, F-07-02)
// 수리 건 부품: 고객이 승인한 견적의 부품 줄로 발주서를 저절로 만든다(5.1). 도료·소모품: 안전 재고 아래면 재고 화면에서 만든다(5.2).
// 작성(공장장) → 승인(전결 '발주·외주': 금액별) → 발주서 보내기(승인 전에는 못 보냄) → 납기 회신 → 입고 검수(합격분 재고·차량 연결, 불합격분 반품 대기) → 세금계산서 연결.
import { and, asc, desc, eq, inArray, isNotNull, ne, notInArray } from "drizzle-orm";
import type { Db } from "@/db/client";
import { appUser, customer, estimate, estimateLine, purchaseLine, purchaseOrder, purchaseReceipt, repairOrder, stockItem, stockLot, stockMove, supplier, vehicle, workOrder } from "@/db/schema";
import { rolesOf } from "@/modules/approval/line";
import { can } from "@/modules/auth/permissions";
import { ROLE_LABEL, type Role } from "@/modules/auth/roles";
import { writeAudit } from "@/modules/platform/audit";
import { resolveApprover } from "@/modules/platform/delegation";
import { nextDocNo } from "@/modules/platform/docno";
import { UserError } from "@/modules/platform/errors";
import { notifyRole } from "@/modules/platform/notify";
import { IMAGE_TYPES, MAX_IMAGE_BYTES, removeStored, sniffImage, storeFile } from "@/modules/platform/storage";
import { addDays, seoulDate } from "@/modules/platform/time";
import { issueNc } from "@/modules/quality/nc";
import { isPartCode, PART_CODES } from "@/modules/repair/estimate-rules";
import { isSentVia, lateForRepair, poIssues, poTotals, RECEIPT_CHECKS, SENT_VIA, type ReceiptCheck } from "./rules";
import { markEmergency, usableSupplier } from "./supplier";

export class PurchaseError extends UserError {}
type Actor = { id: string; roles: Role[] };
const clean = (s: string | null | undefined) => (s ?? "").trim() || null;
const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

async function poRow(db: Db, id: string) {
  const [o] = await db.select().from(purchaseOrder).where(eq(purchaseOrder.id, id));
  if (!o) throw new PurchaseError("발주서를 찾을 수 없습니다");
  return o;
}

function mustOrder(actor: Actor) {
  if (!can(actor, "purchase.order")) throw new PurchaseError("발주는 공장장·대표가 합니다");
}

function mustDraft(o: { status: string; docNo: string }) {
  if (o.status !== "draft") throw new PurchaseError(`${o.docNo}는 작성 중이 아니라 고칠 수 없습니다${o.status === "review" ? "(승인 대기 — 승인자가 되돌리면 고칠 수 있음)" : ""}`);
}

async function recalc(db: Db, id: string) {
  const lines = await db.select({ qty: purchaseLine.qty, unitWon: purchaseLine.unitWon }).from(purchaseLine).where(eq(purchaseLine.orderId, id));
  const t = poTotals(lines);
  await db.update(purchaseOrder).set({ supplyWon: t.supply, totalWon: t.total, updatedAt: new Date() }).where(eq(purchaseOrder.id, id));
  return t;
}

/** 수리 건 출고 약속일: 작업 지시서 → 견적 순 */
export async function roDueDate(db: Db, roId: string) {
  const [w] = await db.select({ d: workOrder.dueDate }).from(workOrder).where(and(eq(workOrder.repairOrderId, roId), isNotNull(workOrder.dueDate))).orderBy(desc(workOrder.createdAt)).limit(1);
  if (w?.d) return w.d;
  const [e] = await db.select({ d: estimate.dueDate }).from(estimate).where(and(eq(estimate.repairOrderId, roId), isNotNull(estimate.dueDate))).orderBy(desc(estimate.createdAt)).limit(1);
  return e?.d ?? null;
}

export type OrderHeader = { supplierId: string; dueOn: string; note: string };

export async function createOrder(db: Db, actor: Actor, input: { kind: "repair" | "stock"; repairOrderId?: string | null; supplierId?: string | null; dueOn?: string | null; note?: string; lines?: LineInput[] }, now = new Date()) {
  mustOrder(actor);
  if (input.kind === "repair" && !input.repairOrderId) throw new PurchaseError("수리 건 부품 발주는 수리 건에서 만듭니다");
  const id = await db.transaction(async (tx) => {
    const docNo = await nextDocNo(tx, "PO", now);
    const [o] = await tx
      .insert(purchaseOrder)
      .values({ docNo, kind: input.kind, repairOrderId: input.repairOrderId ?? null, supplierId: input.supplierId || null, dueOn: input.dueOn || null, note: clean(input.note), createdBy: actor.id, createdAt: now, updatedAt: now })
      .returning({ id: purchaseOrder.id });
    let seq = 0;
    for (const l of input.lines ?? []) await tx.insert(purchaseLine).values({ orderId: o.id, seq: ++seq, ...lineValues(l) });
    return o.id;
  });
  await recalc(db, id);
  return id;
}

/**
 * 5.1 견적 승인 → 승인한 부품 줄로 발주서(작성 중)를 만든다. 이미 발주서에 들어간 견적 줄은 빼고, 없으면 만들지 않는다.
 * 업체·단가는 공장장이 채운다(견적 단가를 기본으로 넣어 둠).
 */
export async function draftFromEstimate(db: Db, estimateId: string, actorId: string | null, now = new Date()) {
  const [e] = await db.select().from(estimate).where(eq(estimate.id, estimateId));
  if (!e || (e.status !== "accepted" && e.status !== "partial")) return null;
  const parts = await db.select().from(estimateLine).where(and(eq(estimateLine.estimateId, estimateId), eq(estimateLine.category, "part"), eq(estimateLine.approved, true))).orderBy(asc(estimateLine.seq));
  if (!parts.length) return null;
  const used = new Set(
    (
      await db
        .select({ id: purchaseLine.estimateLineId })
        .from(purchaseLine)
        .innerJoin(purchaseOrder, eq(purchaseOrder.id, purchaseLine.orderId))
        .where(and(inArray(purchaseLine.estimateLineId, parts.map((p) => p.id)), ne(purchaseOrder.status, "cancelled")))
    ).map((r) => r.id),
  );
  const left = parts.filter((p) => !used.has(p.id));
  if (!left.length) return null;
  const [ro] = await db.select({ docNo: repairOrder.docNo }).from(repairOrder).where(eq(repairOrder.id, e.repairOrderId));
  const due = await roDueDate(db, e.repairOrderId);
  const today = seoulDate(now);
  const id = await db.transaction(async (tx) => {
    const docNo = await nextDocNo(tx, "PO", now);
    const [o] = await tx
      .insert(purchaseOrder)
      .values({ docNo, kind: "repair", repairOrderId: e.repairOrderId, estimateId, dueOn: due && due > today ? addDays(due, -1) : null, note: `견적 ${e.docNo} 승인 부품`, createdBy: actorId, createdAt: now, updatedAt: now })
      .returning({ id: purchaseOrder.id, docNo: purchaseOrder.docNo });
    let seq = 0;
    for (const p of left)
      await tx.insert(purchaseLine).values({ orderId: o.id, seq: ++seq, name: p.name, partNo: p.partNo, partCode: p.partCode, qty: p.qty, unitWon: p.unitWon, estimateLineId: p.id });
    return o;
  });
  await recalc(db, id.id);
  await writeAudit(db, { actorId, action: "purchase.auto", entityType: "purchase_order", entityId: id.docNo, after: { estimate: e.docNo, lines: left.length } });
  await notifyRole(db, "plant_manager", `부품 발주 준비: ${id.docNo}(${ro?.docNo ?? ""}) ${left.length}개 품목 — 업체·단가·납기를 확인해 승인 요청하세요`, `po-auto-${id.id}`, `/purchases/${id.id}`);
  return id.id;
}

export async function saveOrderHeader(db: Db, actor: Actor, id: string, input: OrderHeader, now = new Date()) {
  mustOrder(actor);
  const o = await poRow(db, id);
  mustDraft(o);
  if (input.dueOn && !DATE.test(input.dueOn)) throw new PurchaseError("요청 납기 날짜를 확인해 주세요");
  if (input.supplierId) {
    const [s] = await db.select({ status: supplier.status, name: supplier.name }).from(supplier).where(eq(supplier.id, input.supplierId));
    if (!s) throw new PurchaseError("업체를 찾을 수 없습니다");
    if (s.status === "stopped" || s.status === "rejected") throw new PurchaseError(`${s.name}은(는) 거래할 수 없는 업체입니다`);
  }
  await db.update(purchaseOrder).set({ supplierId: input.supplierId || null, dueOn: input.dueOn || null, note: clean(input.note), updatedAt: now }).where(eq(purchaseOrder.id, id));
}

export type LineInput = { name: string; partNo?: string; spec?: string; partCode?: string | null; qty: number; unitWon: number; stockItemId?: string | null; note?: string };

function lineValues(l: LineInput) {
  if (!l.name.trim()) throw new PurchaseError("품명을 적어 주세요");
  if (!Number.isInteger(l.qty) || l.qty < 1) throw new PurchaseError("수량은 1 이상입니다");
  if (!Number.isInteger(l.unitWon) || l.unitWon < 0) throw new PurchaseError("단가를 확인해 주세요");
  if (l.partCode && !isPartCode(l.partCode)) throw new PurchaseError("부품 구분을 골라 주세요");
  return { name: l.name.trim(), partNo: clean(l.partNo), spec: clean(l.spec), partCode: l.partCode || null, qty: l.qty, unitWon: l.unitWon, stockItemId: l.stockItemId || null, note: clean(l.note) };
}

export async function saveOrderLine(db: Db, actor: Actor, orderId: string, lineId: string | null, input: LineInput) {
  mustOrder(actor);
  const o = await poRow(db, orderId);
  mustDraft(o);
  const v = lineValues(input);
  let keepItem: string | null = null;
  if (lineId) {
    const [l0] = await db.select({ s: purchaseLine.stockItemId }).from(purchaseLine).where(and(eq(purchaseLine.id, lineId), eq(purchaseLine.orderId, orderId)));
    keepItem = l0?.s ?? null;
  }
  // 사용 중지·소진 후 중지 품목은 새로 발주하지 않는다(이미 있는 줄을 고치는 것은 괜찮다)
  if (v.stockItemId && v.stockItemId !== keepItem) {
    const [it] = await db.select().from(stockItem).where(eq(stockItem.id, v.stockItemId));
    if (!it) throw new PurchaseError("재고 품목을 찾을 수 없습니다");
    if (!it.active || it.windDown) {
      const [rep] = it.replacedById ? await db.select({ name: stockItem.name }).from(stockItem).where(eq(stockItem.id, it.replacedById)) : [];
      throw new PurchaseError(`${it.name}은(는) ${it.active ? "소진 후 중지" : "사용 중지"} 품목이라 발주하지 않습니다${rep ? `. 대신 ${rep.name}을(를) 고르세요` : ""}`);
    }
  }
  if (lineId) {
    const [l] = await db.select().from(purchaseLine).where(and(eq(purchaseLine.id, lineId), eq(purchaseLine.orderId, orderId)));
    if (!l) throw new PurchaseError("줄을 찾을 수 없습니다");
    // 견적에서 온 부품은 고객이 고른 부품 구분을 바꿀 수 없다(바꾸려면 고객의 새 승인)
    if (l.estimateLineId && v.partCode !== l.partCode)
      throw new PurchaseError(`부품 구분은 견적에서 고객이 고른 '${PART_CODES[l.partCode as keyof typeof PART_CODES] ?? l.partCode}'와 같아야 합니다. 바꾸려면 추가 견적으로 고객 승인을 새로 받으세요`);
    if (l.estimateLineId && v.qty > l.qty) throw new PurchaseError("견적에서 승인한 수량보다 많이 발주할 수 없습니다");
    await db.update(purchaseLine).set(v).where(eq(purchaseLine.id, lineId));
  } else {
    const [{ n }] = await db.select({ n: purchaseLine.seq }).from(purchaseLine).where(eq(purchaseLine.orderId, orderId)).orderBy(desc(purchaseLine.seq)).limit(1).then((r) => (r.length ? r : [{ n: 0 }]));
    await db.insert(purchaseLine).values({ orderId, seq: n + 1, ...v });
  }
  await recalc(db, orderId);
}

export async function removeOrderLine(db: Db, actor: Actor, orderId: string, lineId: string) {
  mustOrder(actor);
  mustDraft(await poRow(db, orderId));
  await db.delete(purchaseLine).where(and(eq(purchaseLine.id, lineId), eq(purchaseLine.orderId, orderId)));
  await recalc(db, orderId);
}

/** 승인 요청(5.3~5.4): 승인자는 전결 규정 '발주·외주'로 금액에 따라 정한다 */
export async function submitOrder(db: Db, actor: Actor, id: string, emergency: boolean, now = new Date()) {
  mustOrder(actor);
  const o = await poRow(db, id);
  mustDraft(o);
  const lines = await db.select().from(purchaseLine).where(eq(purchaseLine.orderId, id));
  const issues = poIssues(o, lines);
  if (issues.length) throw new PurchaseError(issues.join(" / "));
  const s = await usableSupplier(db, o.supplierId!, emergency, seoulDate(now));
  const t = await recalc(db, id);
  const role = await resolveApprover(db, "purchase", t.total, actor.roles, seoulDate(now));
  await db.update(purchaseOrder).set({ status: "review", approverRole: role, submittedAt: now, returnNote: null, note: emergency && s.status !== "registered" ? [o.note, "긴급 사용(미등록 업체 1회)"].filter(Boolean).join("\n") : o.note, updatedAt: now }).where(eq(purchaseOrder.id, id));
  await writeAudit(db, { actorId: actor.id, action: "purchase.submit", entityType: "purchase_order", entityId: o.docNo, after: { total: t.total, approver: role, supplier: s.name, emergency: s.status !== "registered" } });
  await notifyRole(db, role, `발주 승인 요청: ${o.docNo} ${s.name} ${won(t.total)}`, `po-review-${id}-${now.getTime()}`, `/purchases/${id}`);
  return role;
}

async function mustApprover(db: Db, actor: Actor, role: Role, createdBy: string | null, what: string, total: number) {
  if (actor.roles.includes(role) || actor.roles.includes("owner")) {
    if (createdBy === actor.id && !actor.roles.includes("owner")) throw new PurchaseError(`본인이 요청한 ${what}은(는) ${ROLE_LABEL.owner}가 승인합니다`);
    return;
  }
  throw new PurchaseError(`이 ${what}(${won(total)})은(는) ${ROLE_LABEL[role]}이(가) 승인합니다(전결 규정)`);
}

export async function approveOrder(db: Db, actor: Actor, id: string, ok: boolean, note: string, now = new Date()) {
  const o = await poRow(db, id);
  if (o.status !== "review") throw new PurchaseError("승인 대기 중인 발주가 아닙니다");
  const role = (o.approverRole as Role) ?? (await resolveApprover(db, "purchase", o.totalWon, o.createdBy ? await rolesOf(db, o.createdBy) : [], seoulDate(now)));
  await mustApprover(db, actor, role, o.createdBy, "발주", o.totalWon);
  if (!ok && !note.trim()) throw new PurchaseError("되돌리는 이유를 적어 주세요");
  await db
    .update(purchaseOrder)
    .set(ok ? { status: "approved", approvedBy: actor.id, approvedAt: now, updatedAt: now } : { status: "draft", returnNote: note.trim(), updatedAt: now })
    .where(eq(purchaseOrder.id, id));
  await writeAudit(db, { actorId: actor.id, action: ok ? "purchase.approve" : "purchase.return", entityType: "purchase_order", entityId: o.docNo, after: { note: clean(note) } });
  await notifyRole(db, "plant_manager", ok ? `발주 승인: ${o.docNo} — 발주서를 보내세요` : `발주 되돌림: ${o.docNo} — ${note.trim()}`, `po-decide-${id}-${now.getTime()}`, `/purchases/${id}`);
}

/** 발주서 보내기(5.5). 승인 전에는 못 보낸다. 미등록 업체 긴급 사용이면 그 업체의 1회를 쓴다 */
export async function sendOrder(db: Db, actor: Actor, id: string, input: { via: string; replyDueOn: string }, now = new Date()) {
  mustOrder(actor);
  const o = await poRow(db, id);
  if (o.status === "draft" || o.status === "review") throw new PurchaseError("승인 전에는 발주서를 보낼 수 없습니다");
  if (o.status !== "approved") throw new PurchaseError("이미 보낸 발주서입니다");
  if (!isSentVia(input.via)) throw new PurchaseError("보낸 방법을 골라 주세요");
  if (input.replyDueOn && !DATE.test(input.replyDueOn)) throw new PurchaseError("업체 회신 납기 날짜를 확인해 주세요");
  const today = seoulDate(now);
  const [s] = await db.select().from(supplier).where(eq(supplier.id, o.supplierId!));
  if (s && s.status !== "registered" && !s.emergencyOn) await markEmergency(db, s.id, today);
  await db.update(purchaseOrder).set({ status: "sent", sentAt: now, sentBy: actor.id, sentVia: input.via, replyDueOn: input.replyDueOn || null, updatedAt: now }).where(eq(purchaseOrder.id, id));
  await writeAudit(db, { actorId: actor.id, action: "purchase.send", entityType: "purchase_order", entityId: o.docNo, after: { via: SENT_VIA[input.via], replyDueOn: input.replyDueOn || null } });
  if (input.replyDueOn) await checkLate(db, o, input.replyDueOn, now);
}

/** 5.6 납기가 출고 약속일보다 늦으면 상담원에게 고객 안내를 알린다 */
async function checkLate(db: Db, o: { id: string; docNo: string; repairOrderId: string | null }, replyDueOn: string, now: Date) {
  if (!o.repairOrderId) return false;
  const due = await roDueDate(db, o.repairOrderId);
  if (!lateForRepair(replyDueOn, due)) return false;
  const [ro] = await db.select({ docNo: repairOrder.docNo, plateNo: vehicle.plateNo }).from(repairOrder).innerJoin(vehicle, eq(vehicle.id, repairOrder.vehicleId)).where(eq(repairOrder.id, o.repairOrderId));
  for (const role of ["advisor", "plant_manager"] as const)
    await notifyRole(db, role, `부품 납기 지연: ${ro?.plateNo ?? ""} ${ro?.docNo ?? ""} — 부품 ${replyDueOn} 도착(출고 약속 ${due}). 수리 일정을 고치고 고객에게 알리세요`, `po-late-${o.id}-${replyDueOn}-${role}`, `/repairs/${o.repairOrderId}`);
  return true;
}

/** 업체 납기 회신 기록·변경 */
export async function recordReply(db: Db, actor: Actor, id: string, replyDueOn: string, now = new Date()) {
  mustOrder(actor);
  const o = await poRow(db, id);
  if (o.status !== "sent" && o.status !== "partial") throw new PurchaseError("보낸 발주서에만 납기 회신을 적습니다");
  if (!DATE.test(replyDueOn)) throw new PurchaseError("납기 날짜를 확인해 주세요");
  await db.update(purchaseOrder).set({ replyDueOn, updatedAt: now }).where(eq(purchaseOrder.id, id));
  await writeAudit(db, { actorId: actor.id, action: "purchase.reply", entityType: "purchase_order", entityId: o.docNo, before: { replyDueOn: o.replyDueOn }, after: { replyDueOn } });
  return checkLate(db, o, replyDueOn, now);
}

export type ReceiveInput = { lines: { lineId: string; ok: number; bad: number; lot?: string; expiresOn?: string; location?: string }[]; checks: string[]; badNote: string; needNc: boolean };

/** 입고 검수(6.1~6.4). 합격분은 재고 품목이면 재고에 더하고(유효기간 로트), 불합격분은 반품 대기로 둔다 */
export async function receiveOrder(db: Db, actor: Actor, id: string, input: ReceiveInput, now = new Date()) {
  if (!can(actor, "purchase.receive")) throw new PurchaseError("입고 검수는 기술자·공장장이 합니다");
  const o = await poRow(db, id);
  if (o.status !== "sent" && o.status !== "partial") throw new PurchaseError("보낸 발주서만 입고합니다");
  const lines = await db.select().from(purchaseLine).where(eq(purchaseLine.orderId, id));
  const byId = new Map(lines.map((l) => [l.id, l]));
  const items = new Map((await db.select().from(stockItem).where(inArray(stockItem.id, lines.map((l) => l.stockItemId).filter((x): x is string => !!x).concat(["00000000-0000-0000-0000-000000000000"])))).map((i) => [i.id, i]));
  const got = input.lines.filter((l) => l.ok > 0 || l.bad > 0);
  if (!got.length) throw new PurchaseError("들어온 수량을 적어 주세요");
  const hasPaint = got.some((g) => items.get(byId.get(g.lineId)?.stockItemId ?? "")?.expiryTracked);
  const need = (Object.keys(RECEIPT_CHECKS) as ReceiptCheck[]).filter((k) => !("paint" in RECEIPT_CHECKS[k]) || hasPaint);
  const missing = need.filter((k) => !input.checks.includes(k));
  if (missing.length) throw new PurchaseError(`확인하지 않은 항목: ${missing.map((k) => RECEIPT_CHECKS[k].label).join(", ")}`);
  for (const g of got) {
    const l = byId.get(g.lineId);
    if (!l) throw new PurchaseError("발주서에 없는 줄입니다");
    if (!Number.isInteger(g.ok) || !Number.isInteger(g.bad) || g.ok < 0 || g.bad < 0) throw new PurchaseError(`${l.name}: 수량을 확인해 주세요`);
    const left = l.qty - l.receivedQty;
    if (g.ok > left) throw new PurchaseError(`${l.name}: 합격 수량이 남은 수량(${left})보다 많습니다`);
    const it = l.stockItemId ? items.get(l.stockItemId) : null;
    if (it?.expiryTracked && g.ok > 0 && !(g.expiresOn && DATE.test(g.expiresOn))) throw new PurchaseError(`${l.name}: 유효기간을 적어 주세요`);
    if (it?.expiryTracked && g.ok > 0 && g.expiresOn! <= seoulDate(now)) throw new PurchaseError(`${l.name}: 유효기간이 지난 도료는 받지 말고 불합격으로 적으세요`);
  }
  const bad = got.filter((g) => g.bad > 0);
  if (bad.length && !input.badNote.trim()) throw new PurchaseError("불합격 이유(파손·변형·품번 다름 등)를 적어 주세요");
  const done = await db.transaction(async (tx) => {
    const [r] = await tx
      .insert(purchaseReceipt)
      .values({
        orderId: id,
        lines: got.map((g) => ({ lineId: g.lineId, ok: g.ok, bad: g.bad, lot: clean(g.lot), expiresOn: g.expiresOn || null, location: clean(g.location) })),
        checks: input.checks.filter((c) => c in RECEIPT_CHECKS),
        badNote: clean(input.badNote),
        receivedBy: actor.id,
        receivedAt: now,
      })
      .returning({ id: purchaseReceipt.id });
    for (const g of got) {
      const l = byId.get(g.lineId)!;
      await tx.update(purchaseLine).set({ receivedQty: l.receivedQty + g.ok, rejectedQty: l.rejectedQty + g.bad }).where(eq(purchaseLine.id, l.id));
      l.receivedQty += g.ok;
      const it = l.stockItemId ? items.get(l.stockItemId) : null;
      if (it && g.ok > 0) {
        await tx.update(stockItem).set({ qty: it.qty + g.ok, unitWon: l.unitWon || it.unitWon, location: clean(g.location) ?? it.location, updatedAt: now }).where(eq(stockItem.id, it.id));
        it.qty += g.ok;
        if (it.expiryTracked) await tx.insert(stockLot).values({ itemId: it.id, lot: clean(g.lot), expiresOn: g.expiresOn!, qty: g.ok });
        await tx.insert(stockMove).values({ itemId: it.id, qty: g.ok, reason: "receive", ref: o.docNo, lot: clean(g.lot), by: actor.id, at: now });
      }
    }
    const all = lines.every((l) => l.receivedQty >= l.qty);
    await tx.update(purchaseOrder).set({ status: all ? "received" : "partial", receivedAt: all ? now : null, updatedAt: now }).where(eq(purchaseOrder.id, id));
    return { receiptId: r.id, all };
  });
  await writeAudit(db, { actorId: actor.id, action: "purchase.receive", entityType: "purchase_order", entityId: o.docNo, after: { lines: got.length, bad: bad.length, all: done.all } });
  if (bad.length) {
    let nc: { id: string; docNo: string } | null = null;
    if (input.needNc) {
      nc = await issueNc(db, actor.id, { source: "receipt", refType: "purchase_order", refId: id, refLabel: o.docNo, content: `입고 불합격(${o.docNo}): ${bad.map((g) => `${byId.get(g.lineId)!.name} ${g.bad}개`).join(", ")} — ${input.badNote.trim()}` }, now);
      await db.update(purchaseReceipt).set({ ncId: nc.id }).where(eq(purchaseReceipt.id, done.receiptId));
    }
    await notifyRole(db, "plant_manager", `입고 불합격(반품 대기): ${o.docNo} ${bad.length}개 품목 — 업체에 반품·교환을 요청하세요`, `po-bad-${done.receiptId}`, `/purchases/${id}`);
  }
  if (o.repairOrderId && done.all) await notifyRole(db, "plant_manager", `부품 입고 끝: ${o.docNo} — 작업을 배정하세요`, `po-in-${id}`, `/repairs/${o.repairOrderId}`);
  return done;
}

/** 불합격분 반품·교환 요청을 마쳤다고 기록 */
export async function returnDone(db: Db, actor: Actor, receiptId: string, note: string, now = new Date()) {
  mustOrder(actor);
  const [r] = await db.select().from(purchaseReceipt).where(eq(purchaseReceipt.id, receiptId));
  if (!r) throw new PurchaseError("검수 기록을 찾을 수 없습니다");
  if (r.returnDoneAt) throw new PurchaseError("이미 처리했습니다");
  if (!note.trim()) throw new PurchaseError("어떻게 처리했는지 적어 주세요(반품·교환·재발송 날짜)");
  await db.update(purchaseReceipt).set({ returnDoneAt: now, returnNote: note.trim() }).where(eq(purchaseReceipt.id, receiptId));
  await writeAudit(db, { actorId: actor.id, action: "purchase.return_done", entityType: "purchase_receipt", entityId: receiptId, after: { note: note.trim() } });
  return r.orderId;
}

export async function addReceiptPhoto(db: Db, actor: Actor, receiptId: string, bytes: Uint8Array) {
  if (!can(actor, "purchase.receive")) throw new PurchaseError("검수한 사람·공장장이 올립니다");
  const [r] = await db.select().from(purchaseReceipt).where(eq(purchaseReceipt.id, receiptId));
  if (!r) throw new PurchaseError("검수 기록을 찾을 수 없습니다");
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) throw new PurchaseError("사진이 비었거나 너무 큽니다(6MB까지)");
  const type = sniffImage(bytes);
  if (!type) throw new PurchaseError("사진 파일만 올릴 수 있습니다(JPG·PNG·WEBP)");
  if (r.photos.length >= 8) throw new PurchaseError("사진은 8장까지입니다");
  const path = await storeFile(`po/${r.orderId}`, bytes, IMAGE_TYPES[type]);
  await db.update(purchaseReceipt).set({ photos: [...r.photos, path] }).where(eq(purchaseReceipt.id, receiptId));
  return r.orderId;
}

export async function removeReceiptPhoto(db: Db, actor: Actor, receiptId: string, path: string) {
  if (!can(actor, "purchase.receive")) throw new PurchaseError("검수한 사람·공장장이 지웁니다");
  const [r] = await db.select().from(purchaseReceipt).where(eq(purchaseReceipt.id, receiptId));
  if (!r || !r.photos.includes(path)) return r?.orderId ?? null;
  await db.update(purchaseReceipt).set({ photos: r.photos.filter((p) => p !== path) }).where(eq(purchaseReceipt.id, receiptId));
  await removeStored(path);
  return r.orderId;
}

/** 6.5 세금계산서·거래명세서 연결(회계 담당) */
export async function linkInvoice(db: Db, actor: Actor, id: string, input: { invoiceNo: string; invoiceOn: string }, now = new Date()) {
  if (!can(actor, "purchase.invoice")) throw new PurchaseError("세금계산서 연결은 회계 담당이 합니다");
  const o = await poRow(db, id);
  if (o.status !== "partial" && o.status !== "received") throw new PurchaseError("입고한 발주에만 연결합니다");
  if (!input.invoiceNo.trim()) throw new PurchaseError("세금계산서(거래명세서) 번호를 적어 주세요");
  if (!DATE.test(input.invoiceOn)) throw new PurchaseError("발행일을 확인해 주세요");
  await db.update(purchaseOrder).set({ invoiceNo: input.invoiceNo.trim(), invoiceOn: input.invoiceOn, invoiceBy: actor.id, updatedAt: now }).where(eq(purchaseOrder.id, id));
  await writeAudit(db, { actorId: actor.id, action: "purchase.invoice", entityType: "purchase_order", entityId: o.docNo, after: { invoiceNo: input.invoiceNo.trim(), invoiceOn: input.invoiceOn } });
}

/** 취소: 들어온 것이 없을 때만 */
export async function cancelOrder(db: Db, actor: Actor, id: string, reason: string, now = new Date()) {
  mustOrder(actor);
  const o = await poRow(db, id);
  if (o.status === "partial" || o.status === "received") throw new PurchaseError("이미 입고한 발주는 취소할 수 없습니다. 반품으로 처리하세요");
  if (o.status === "cancelled") throw new PurchaseError("이미 취소했습니다");
  if (!reason.trim()) throw new PurchaseError("취소 이유를 적어 주세요");
  await db.update(purchaseOrder).set({ status: "cancelled", cancelReason: reason.trim(), updatedAt: now }).where(eq(purchaseOrder.id, id));
  await writeAudit(db, { actorId: actor.id, action: "purchase.cancel", entityType: "purchase_order", entityId: o.docNo, after: { reason: reason.trim(), wasSent: o.status === "sent" } });
}

export type OrderFilter = "open" | "review" | "receiving" | "done" | "all";

export async function listOrders(db: Db, filter: OrderFilter = "open") {
  const rows = await db
    .select({ o: purchaseOrder, supplierName: supplier.name, roDocNo: repairOrder.docNo, plateNo: vehicle.plateNo })
    .from(purchaseOrder)
    .leftJoin(supplier, eq(supplier.id, purchaseOrder.supplierId))
    .leftJoin(repairOrder, eq(repairOrder.id, purchaseOrder.repairOrderId))
    .leftJoin(vehicle, eq(vehicle.id, repairOrder.vehicleId))
    .orderBy(desc(purchaseOrder.createdAt))
    .limit(300);
  const st = (s: string) =>
    filter === "all" ? true : filter === "open" ? !["received", "cancelled"].includes(s) : filter === "review" ? s === "draft" || s === "review" || s === "approved" : filter === "receiving" ? s === "sent" || s === "partial" : s === "received" || s === "cancelled";
  return rows.filter((r) => st(r.o.status));
}

export async function ordersOfRo(db: Db, roId: string) {
  return db.select({ id: purchaseOrder.id, docNo: purchaseOrder.docNo, status: purchaseOrder.status, totalWon: purchaseOrder.totalWon, replyDueOn: purchaseOrder.replyDueOn, dueOn: purchaseOrder.dueOn }).from(purchaseOrder).where(eq(purchaseOrder.repairOrderId, roId)).orderBy(purchaseOrder.createdAt);
}

export async function getOrder(db: Db, id: string) {
  const o = await poRow(db, id);
  const lines = await db.select().from(purchaseLine).where(eq(purchaseLine.orderId, id)).orderBy(asc(purchaseLine.seq));
  const receipts = await db.select().from(purchaseReceipt).where(eq(purchaseReceipt.orderId, id)).orderBy(asc(purchaseReceipt.receivedAt));
  const [sup] = o.supplierId ? await db.select().from(supplier).where(eq(supplier.id, o.supplierId)) : [];
  const ro = o.repairOrderId
    ? (
        await db
          .select({ id: repairOrder.id, docNo: repairOrder.docNo, plateNo: vehicle.plateNo, model: vehicle.model, customerName: customer.name })
          .from(repairOrder)
          .innerJoin(vehicle, eq(vehicle.id, repairOrder.vehicleId))
          .innerJoin(customer, eq(customer.id, repairOrder.customerId))
          .where(eq(repairOrder.id, o.repairOrderId))
      )[0]
    : null;
  const roDue = o.repairOrderId ? await roDueDate(db, o.repairOrderId) : null;
  const [est] = o.estimateId ? await db.select({ id: estimate.id, docNo: estimate.docNo }).from(estimate).where(eq(estimate.id, o.estimateId)) : [];
  const itemIds = lines.map((l) => l.stockItemId).filter((x): x is string => !!x);
  const items = new Map((itemIds.length ? await db.select().from(stockItem).where(inArray(stockItem.id, itemIds)) : []).map((i) => [i.id, i]));
  const uids = [...new Set([o.createdBy, o.approvedBy, o.sentBy, o.invoiceBy, ...receipts.map((r) => r.receivedBy)].filter((x): x is string => !!x))];
  const names = new Map((uids.length ? await db.select({ id: appUser.id, name: appUser.name }).from(appUser).where(inArray(appUser.id, uids)) : []).map((u) => [u.id, u.name]));
  return { o, lines, receipts, supplier: sup ?? null, ro, roDue, estimate: est ?? null, items, names };
}

/** 내 할 일: 승인할 발주, 작성 중·승인된 발주(보내기), 입고 기다림(납기 지남), 반품 대기, 세금계산서 */
export async function orderTodos(db: Db, actor: Actor, today: string) {
  const out: { key: string; when: "late" | "today" | "soon"; what: string; detail?: string; href: string; action: string }[] = [];
  const rows = await db.select({ o: purchaseOrder, supplierName: supplier.name }).from(purchaseOrder).leftJoin(supplier, eq(supplier.id, purchaseOrder.supplierId)).where(notInArray(purchaseOrder.status, ["cancelled"]));
  for (const { o, supplierName } of rows) {
    const href = `/purchases/${o.id}`;
    const label = `${o.docNo}${supplierName ? ` ${supplierName}` : ""}`;
    if (o.status === "review" && o.approverRole && (actor.roles.includes(o.approverRole as Role) || actor.roles.includes("owner")) && o.createdBy !== actor.id)
      out.push({ key: `po-rv-${o.id}`, when: "today", what: `발주 승인: ${label} ${won(o.totalWon)}`, href, action: "승인하기" });
    if (can(actor, "purchase.order")) {
      if (o.status === "draft") out.push({ key: `po-dr-${o.id}`, when: o.dueOn && o.dueOn <= addDays(today, 1) ? "today" : "soon", what: `발주 작성 중: ${label}`, detail: o.returnNote ? `되돌림: ${o.returnNote}` : "업체·단가·납기를 채워 승인 요청", href, action: "이어 쓰기" });
      if (o.status === "approved") out.push({ key: `po-send-${o.id}`, when: "today", what: `발주서 보내기: ${label}`, detail: "승인됐습니다", href, action: "보내기" });
    }
    if ((o.status === "sent" || o.status === "partial") && can(actor, "purchase.receive")) {
      const due = o.replyDueOn ?? o.dueOn;
      if (due && due < today) out.push({ key: `po-late-${o.id}`, when: "late", what: `입고 늦음: ${label}`, detail: `납기 ${due} — 업체에 확인하세요`, href, action: "열기" });
      else if (due && due <= today) out.push({ key: `po-in-${o.id}`, when: "today", what: `입고 예정: ${label}`, detail: `납기 ${due}`, href, action: "입고 검수" });
    }
    if ((o.status === "received" || o.status === "partial") && !o.invoiceNo && can(actor, "purchase.invoice") && !actor.roles.includes("owner"))
      out.push({ key: `po-iv-${o.id}`, when: "soon", what: `세금계산서 연결: ${label}`, href, action: "연결하기" });
  }
  if (can(actor, "purchase.order")) {
    const pending = await db.select({ r: purchaseReceipt, docNo: purchaseOrder.docNo }).from(purchaseReceipt).innerJoin(purchaseOrder, eq(purchaseOrder.id, purchaseReceipt.orderId)).where(isNotNull(purchaseReceipt.badNote));
    for (const p of pending.filter((x) => !x.r.returnDoneAt)) out.push({ key: `po-ret-${p.r.id}`, when: "today", what: `반품 대기: ${p.docNo}`, detail: p.r.badNote ?? undefined, href: `/purchases/${p.r.orderId}`, action: "반품·교환 처리" });
  }
  return out;
}
