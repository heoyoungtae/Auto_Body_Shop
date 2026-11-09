// 구매·자재·외주(STD-07): 협력업체 등록·평가, 견적 승인 → 발주 자동 작성 → 전결 승인 → 발주서 → 입고 검수, 재고 사용·실사, 외주 의뢰
import { beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import * as schema from "@/db/schema";
import { myTodos } from "@/modules/dashboard/todo";
import { annualOutcome, countDiff, evalTotal, fifoTake, missingDocs } from "@/modules/purchase/rules";
import { confirmAnnual, createSupplier, decideSupplier, evaluateAnnual, evaluateInitial, getSupplier, stopSupplier } from "@/modules/purchase/supplier";
import { approveOrder, cancelOrder, getOrder, linkInvoice, listOrders, receiveOrder, recordReply, returnDone, saveOrderHeader, saveOrderLine, sendOrder, submitOrder } from "@/modules/purchase/order";
import { getItem, listStock, orderLowStock, recordCount, saveItem, useStock } from "@/modules/purchase/stock";
import { approveOutsource, createOutsource, getOutsource, judgeOutsource, noticeCustomer, outsourceSeed, recordResult, requestOutsource, vehicleOut, addOsPhoto } from "@/modules/purchase/outsource";
import { seedShop, testDb } from "./db";
import { approvedRepair, WEBP } from "./flow";

let db: Db;
let ids: Awaited<ReturnType<typeof seedShop>>;
beforeEach(async () => {
  db = await testDb();
  ids = await seedShop(db);
});
const now = new Date("2026-11-09T01:00:00Z");
const owner = () => ({ id: ids.owner, roles: ["owner" as const] });
const manager = () => ({ id: ids.manager, roles: ["plant_manager" as const] });
const tech = () => ({ id: ids.tech1, roles: ["technician" as const] });
const advisor = () => ({ id: ids.advisor, roles: ["advisor" as const] });
const account = () => ({ id: ids.account, roles: ["accounting" as const] });
const GOOD = { quality: 25, delivery: 20, price: 15, docs: 15, safety: 8 };

async function registered(name: string, kinds: string[], docs: string[]) {
  const id = await createSupplier(db, manager(), { name, bizNo: "", kinds, items: "", contactName: "", phone: "", email: "", leadDays: 2, returnTerms: "", docs, note: "" }, now);
  await evaluateInitial(db, manager(), id, { scores: GOOD, note: "" }, now);
  await decideSupplier(db, owner(), id, true, "", now);
  return id;
}

describe("구매 규칙", () => {
  it("서류·점수·정기 평가 결과·선입선출·실사 차이", () => {
    expect(missingDocs(["paint"], ["biz", "price"])).toEqual(["tds", "msds"]);
    expect(evalTotal(GOOD)).toBe(83);
    expect(evalTotal({ quality: 99 })).toBe(30);
    expect(annualOutcome(55, 58, { improveBelow: 70, stopBelow: 60 })).toBe("stop");
    expect(annualOutcome(55, 72, { improveBelow: 70, stopBelow: 60 })).toBe("improve");
    expect(annualOutcome(75, null, { improveBelow: 70, stopBelow: 60 })).toBe("ok");
    expect(fifoTake([{ id: "b", expiresOn: "2027-02-01", qty: 5 }, { id: "a", expiresOn: "2026-12-01", qty: 2 }], 4)).toEqual([{ id: "a", take: 2 }, { id: "b", take: 2 }]);
    expect(countDiff([{ book: 10, actual: 9, unitWon: 1000 }, { book: 10, actual: 10, unitWon: 1000 }]).pct).toBe(5);
  });
});

describe("협력업체", () => {
  it("후보 → 서류 확인 → 평가(70점) → 대표 승인, 정기 평가 확정, 거래 중지", async () => {
    await expect(createSupplier(db, tech(), { name: "x", bizNo: "", kinds: ["parts"], items: "", contactName: "", phone: "", email: "", leadDays: null, returnTerms: "", docs: [], note: "" })).rejects.toThrow(/공장장/);
    const id = await createSupplier(db, manager(), { name: "한빛도료", bizNo: "2208162517", kinds: ["paint"], items: "수용성 베이스", contactName: "김영업", phone: "031-111-2222", email: "", leadDays: 1, returnTerms: "7일 안 미개봉 반품", docs: ["biz", "price"], note: "" }, now);
    await expect(evaluateInitial(db, manager(), id, { scores: GOOD, note: "" }, now)).rejects.toThrow(/TDS/);
    const sup = (await getSupplier(db, id, now)).s;
    await (await import("@/modules/purchase/supplier")).updateSupplier(db, manager(), id, { ...sup, bizNo: sup.bizNo ?? "", items: sup.items ?? "", contactName: "", phone: "", email: "", returnTerms: "", note: "", docs: ["biz", "price", "tds", "msds"] }, now);
    const low = await evaluateInitial(db, manager(), id, { scores: { ...GOOD, quality: 5 }, note: "" }, now);
    expect(low).toEqual({ total: 63, pass: false });
    expect((await evaluateInitial(db, manager(), id, { scores: GOOD, note: "샘플 양호" }, now)).pass).toBe(true);
    expect((await myTodos(db, owner(), now)).some((t) => t.key === `sup-ap-${id}`)).toBe(true);
    await expect(decideSupplier(db, manager(), id, true, "", now)).rejects.toThrow(/대표/);
    await decideSupplier(db, owner(), id, true, "", now);
    expect((await getSupplier(db, id, now)).s.status).toBe("registered");
    // 정기 평가: 2025 58점, 2026 55점 → 2년 연속 60점 미만이면 거래 중지
    await evaluateAnnual(db, manager(), id, { year: 2025, scores: { quality: 15, delivery: 15, price: 15, docs: 10, safety: 3 }, note: "" }, now);
    const [e25] = await db.select().from(schema.supplierEval).where(eq(schema.supplierEval.year, 2025));
    expect(await confirmAnnual(db, owner(), e25.id, now)).toBe("improve");
    await evaluateAnnual(db, manager(), id, { year: 2026, scores: { quality: 15, delivery: 15, price: 15, docs: 7, safety: 3 }, note: "" }, now);
    await expect(evaluateAnnual(db, manager(), id, { year: 2026, scores: GOOD, note: "" }, now)).rejects.toThrow(/이미/);
    const [e26] = await db.select().from(schema.supplierEval).where(and(eq(schema.supplierEval.year, 2026), eq(schema.supplierEval.kind, "annual")));
    expect(await confirmAnnual(db, owner(), e26.id, now)).toBe("stop");
    expect((await getSupplier(db, id, now)).s.status).toBe("stopped");
    await stopSupplier(db, owner(), id, false, "", now);
    expect((await getSupplier(db, id, now)).s.status).toBe("registered");
  });
});

describe("발주·입고", () => {
  it("견적 승인 → 발주 자동 작성 → 승인(전결) → 보내기 → 납기 지연 알림 → 입고 검수(불합격·반품) → 세금계산서", async () => {
    const { roId } = await approvedRepair(db, ids, now);
    const [po] = await db.select().from(schema.purchaseOrder).where(eq(schema.purchaseOrder.repairOrderId, roId));
    expect(po.docNo).toMatch(/^PO-/);
    expect(po.status).toBe("draft");
    let g = await getOrder(db, po.id);
    expect(g.lines.length).toBeGreaterThan(0);
    expect(g.lines[0].partCode).toBe("D");
    expect(g.o.dueOn).toBe("2026-11-12");
    // 부품 구분은 견적과 같아야 한다
    const l = g.lines[0];
    await expect(saveOrderLine(db, manager(), po.id, l.id, { name: l.name, partCode: "A", qty: 1, unitWon: 150_000 })).rejects.toThrow(/고객/);
    await saveOrderLine(db, manager(), po.id, l.id, { name: l.name, partCode: "D", partNo: "86511-AA000", qty: 1, unitWon: 150_000 });
    await expect(submitOrder(db, manager(), po.id, false, now)).rejects.toThrow(/업체/);
    const sup = await registered("대한부품", ["parts"], ["biz", "price"]);
    await saveOrderHeader(db, manager(), po.id, { supplierId: sup, dueOn: "2026-11-12", note: "" }, now);
    g = await getOrder(db, po.id);
    // 공장장 본인 요청이면 50만 원 이하라도 대표가 승인
    const role = await submitOrder(db, manager(), po.id, false, now);
    expect(role).toBe("owner");
    await expect(sendOrder(db, manager(), po.id, { via: "phone", replyDueOn: "" }, now)).rejects.toThrow(/승인 전/);
    await expect(approveOrder(db, manager(), po.id, true, "", now)).rejects.toThrow(/대표/);
    await approveOrder(db, owner(), po.id, true, "", now);
    await sendOrder(db, manager(), po.id, { via: "phone", replyDueOn: "2026-11-11" }, now);
    // 납기 회신이 출고 약속(11/13)보다 늦으면 상담원에게 알림
    expect(await recordReply(db, manager(), po.id, "2026-11-15", now)).toBe(true);
    const notes = await db.select().from(schema.notification).where(eq(schema.notification.userId, ids.advisor));
    expect(notes.some((n) => n.title.includes("부품 납기 지연"))).toBe(true);
    await expect(cancelOrder(db, manager(), po.id, "", now)).rejects.toThrow(/이유/);
    // 입고 검수: 확인 항목 빠지면 막고, 불합격은 이유·반품 대기
    const lines = (await getOrder(db, po.id)).lines;
    const input = { lines: lines.map((x, i) => ({ lineId: x.id, ok: i === 0 ? 0 : x.qty, bad: i === 0 ? 1 : 0 })), checks: ["match", "look"], badNote: "", needNc: true };
    await expect(receiveOrder(db, advisor(), po.id, input, now)).rejects.toThrow(/기술자/);
    await expect(receiveOrder(db, tech(), po.id, input, now)).rejects.toThrow(/포장/);
    await expect(receiveOrder(db, tech(), po.id, { ...input, checks: ["match", "look", "pack"] }, now)).rejects.toThrow(/불합격 이유/);
    const r1 = await receiveOrder(db, tech(), po.id, { ...input, checks: ["match", "look", "pack"], badNote: "모서리 찍힘" }, now);
    expect(r1.all).toBe(false);
    const [nc] = await db.select().from(schema.nonconformance).where(eq(schema.nonconformance.refId, po.id));
    expect(nc.source).toBe("receipt");
    expect((await myTodos(db, manager(), now)).some((t) => t.key === `po-ret-${r1.receiptId}`)).toBe(true);
    await returnDone(db, manager(), r1.receiptId, "11/10 교환품 재발송", now);

    const r2 = await receiveOrder(db, tech(), po.id, { lines: [{ lineId: lines[0].id, ok: 1, bad: 0 }], checks: ["match", "look", "pack"], badNote: "", needNc: false }, now);
    expect(r2.all).toBe(true);
    await expect(linkInvoice(db, tech(), po.id, { invoiceNo: "1", invoiceOn: "2026-11-10" }, now)).rejects.toThrow(/회계/);
    await linkInvoice(db, account(), po.id, { invoiceNo: "20261110-0001", invoiceOn: "2026-11-10" }, now);
    expect((await listOrders(db, "done")).map((r) => r.o.id)).toContain(po.id);
  });
});


describe("재고", () => {
  it("품목 등록 → 미달 발주 요청 → 입고(로트·유효기간) → 선입선출 사용 → 실사 차이 부적합", async () => {
    const sup = await registered("한빛도료", ["paint"], ["biz", "price", "tds", "msds"]);
    const item = await saveItem(db, manager(), null, { name: "수용성 베이스 화이트", kind: "paint", spec: "1L", unit: "캔", location: "도료장 A-1", safetyQty: 4, unitWon: 50_000, expiryTracked: true, supplierId: sup, openingQty: 2, openingExpiresOn: "2026-11-30" }, now);
    expect((await listStock(db, "low", now)).map((r) => r.id)).toEqual([item]);
    expect((await listStock(db, "expiry", now)).map((r) => r.id)).toEqual([item]);
    const [poId] = await orderLowStock(db, manager(), [item], now);
    const g = await getOrder(db, poId);
    expect(g.o.supplierId).toBe(sup);
    expect(g.lines[0].qty).toBe(6);
    await saveOrderHeader(db, manager(), poId, { supplierId: sup, dueOn: "2026-11-11", note: "" }, now);
    // 30만 원 + 부가세 = 33만 원: 공장장 전결이지만 본인 요청이라 대표
    await submitOrder(db, manager(), poId, false, now);
    await approveOrder(db, owner(), poId, true, "", now);
    await sendOrder(db, manager(), poId, { via: "message", replyDueOn: "2026-11-11" }, now);
    const lineId = g.lines[0].id;
    await expect(receiveOrder(db, tech(), poId, { lines: [{ lineId, ok: 6, bad: 0 }], checks: ["match", "look", "pack", "expiry"], badNote: "", needNc: false }, now)).rejects.toThrow(/유효기간/);
    await receiveOrder(db, tech(), poId, { lines: [{ lineId, ok: 6, bad: 0, lot: "L2611", expiresOn: "2027-05-01" }], checks: ["match", "look", "pack", "expiry"], badNote: "", needNc: false }, now);
    let it = await getItem(db, item);
    expect(it.i.qty).toBe(8);
    expect(it.lots.map((l) => l.qty)).toEqual([2, 6]);
    const { roId } = await approvedRepair(db, ids, now);
    await expect(useStock(db, advisor(), { itemId: item, qty: 1 }, now)).rejects.toThrow(/기술자/);
    const u = await useStock(db, tech(), { itemId: item, qty: 3, repairOrderId: roId }, now);
    expect(u.left).toBe(5);
    it = await getItem(db, item);
    expect(it.lots.map((l) => l.qty)).toEqual([5]);
    // 실사: 장부 5, 실물 4 → 20% 차이(기준 2%) → 이유 필수·부적합
    await expect(recordCount(db, manager(), { kind: "monthly", lines: [{ itemId: item, actual: 4 }], note: "" }, now)).rejects.toThrow(/원인/);
    const c = await recordCount(db, manager(), { kind: "monthly", lines: [{ itemId: item, actual: 4 }], note: "사용 기록 누락 추정" }, now);
    expect(c.over).toBe(true);
    expect(c.nc?.docNo).toMatch(/^NC-/);
    expect((await getItem(db, item)).i.qty).toBe(4);
  });
});

describe("외주", () => {
  it("견적 값 불러오기 → 의뢰(전결) → 고객 알림 뒤 반출 → 결과·반입 → 사진 있어야 수용, 재작업", async () => {
    const { roId } = await approvedRepair(db, ids, now);
    const seed = await outsourceSeed(db, roId);
    expect(seed.ro.mileage).toBe(45000);
    const sup = await registered("정밀프레임", ["outsource"], ["biz", "license", "insurance"]);
    const cand = await createSupplier(db, manager(), { name: "임시보정", bizNo: "", kinds: ["outsource"], items: "", contactName: "", phone: "", email: "", leadDays: null, returnTerms: "", docs: [], note: "" }, now);
    const base = { workType: "adas", scope: "전방 레이더 보정", required: "보정 성적서", dueOn: "2026-11-11", amountWon: 300_000, moveOut: true };
    await expect(createOutsource(db, manager(), roId, { ...base, supplierId: cand }, false, now)).rejects.toThrow(/긴급/);
    const j = await createOutsource(db, manager(), roId, { ...base, supplierId: sup }, false, now);
    expect(j.docNo).toMatch(/^OS-/);
    await approveOutsource(db, owner(), j.id, true, "", now);
    await requestOutsource(db, manager(), j.id, now);
    await expect(vehicleOut(db, advisor(), j.id, 45010, now)).rejects.toThrow(/고객에게 먼저/);
    await noticeCustomer(db, advisor(), j.id, "고객 통화, 11/10 오전 반출 동의", now);
    await expect(vehicleOut(db, advisor(), j.id, 100, now)).rejects.toThrow(/입고 때/);
    await vehicleOut(db, advisor(), j.id, 45010, now);
    await expect(recordResult(db, manager(), j.id, { note: "보정 완료", inKm: 45000 }, now)).rejects.toThrow(/반출 때/);
    await recordResult(db, manager(), j.id, { note: "보정 완료", inKm: 45022 }, now);
    await expect(judgeOutsource(db, manager(), j.id, true, "", now)).rejects.toThrow(/사진/);
    await judgeOutsource(db, manager(), j.id, false, "경고등 남음", now);
    let g = await getOutsource(db, j.id);
    expect(g.j.status).toBe("requested");
    expect(g.j.redoCount).toBe(1);
    await vehicleOut(db, advisor(), j.id, 45022, now);
    await recordResult(db, manager(), j.id, { note: "재보정", inKm: 45030 }, now);
    await addOsPhoto(db, manager(), j.id, WEBP);
    await judgeOutsource(db, manager(), j.id, true, "", now);
    g = await getOutsource(db, j.id);
    expect(g.j.status).toBe("accepted");
  });
});
