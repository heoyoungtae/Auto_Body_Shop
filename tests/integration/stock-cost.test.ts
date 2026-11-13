// 보고서 센터 3단계(2026-11-13): 재고 원가 이동평균법, 재고현황·수불부·회전율 보고서
import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { moveCost } from "@/modules/purchase/cost";
import { approveOrder, createOrder, getOrder, receiveOrder, saveOrderHeader, sendOrder, submitOrder } from "@/modules/purchase/order";
import { createSupplier, decideSupplier, evaluateInitial } from "@/modules/purchase/supplier";
import { discardLot, getItem, recordCount, saveItem, useStock } from "@/modules/purchase/stock";
import { customPeriod } from "@/modules/report/period";
import { runReport } from "@/modules/report/run";
import { seedShop, testDb } from "./db";
import { approvedRepair } from "./flow";

let db: Db;
let ids: Awaited<ReturnType<typeof seedShop>>;
beforeEach(async () => {
  db = await testDb();
  ids = await seedShop(db);
});
const owner = () => ({ id: ids.owner, roles: ["owner" as const] });
const manager = () => ({ id: ids.manager, roles: ["plant_manager" as const] });
const tech = () => ({ id: ids.tech1, roles: ["technician" as const] });
const at = (d: string) => new Date(`${d}T01:00:00Z`);

describe("이동평균 계산", () => {
  it("들어올 땐 매입가, 나갈 땐 평균 단가, 다 쓰면 금액 0", () => {
    const b = { qty: 2, valueWon: 100_000, unitWon: 50_000 };
    expect(moveCost(b, 4, 56_000)).toMatchObject({ amountWon: 224_000, balQty: 6, balWon: 324_000, unitWon: 56_000 });
    const s = { qty: 6, valueWon: 324_000, unitWon: 56_000 };
    expect(moveCost(s, -3)).toMatchObject({ amountWon: -162_000, balQty: 3, balWon: 162_000, unitWon: 54_000 });
    // 끝전: 3개 100원에서 1개씩 → 33, 33, 34(마지막에 남은 것 전부)
    expect(moveCost({ qty: 3, valueWon: 100, unitWon: 0 }, -1).amountWon).toBe(-33);
    expect(moveCost({ qty: 1, valueWon: 34, unitWon: 0 }, -1)).toMatchObject({ amountWon: -34, balWon: 0 });
    // 실사로 늘어나면 평균 단가, 재고 없으면 최근 매입 단가
    expect(moveCost({ qty: 4, valueWon: 200_000, unitWon: 60_000 }, 1).amountWon).toBe(50_000);
    expect(moveCost({ qty: 0, valueWon: 0, unitWon: 60_000 }, 1).amountWon).toBe(60_000);
  });
});

describe("재고 원가·보고서", () => {
  it("등록·입고·사용·폐기·실사가 금액을 남기고, 보고서가 기준일 재고·수불·회전율을 계산한다", async () => {
    const sup = await createSupplier(db, manager(), { name: "한빛도료", bizNo: "", kinds: ["paint"], items: "", contactName: "", phone: "", email: "", leadDays: 2, returnTerms: "", docs: ["biz", "price", "tds", "msds"], note: "" }, at("2026-10-01"));
    await evaluateInitial(db, manager(), sup, { scores: { quality: 25, delivery: 20, price: 15, docs: 15, safety: 8 }, note: "" }, at("2026-10-01"));
    await decideSupplier(db, owner(), sup, true, "", at("2026-10-01"));
    // 10/1 처음 등록 2캔 × 5만 = 10만
    const item = await saveItem(db, manager(), null, { name: "수용성 베이스 화이트", kind: "paint", spec: "1L", unit: "캔", location: "A-1", safetyQty: 1, unitWon: 50_000, expiryTracked: true, supplierId: sup, openingQty: 2, openingExpiresOn: "2026-10-20" }, at("2026-10-01"));
    expect((await getItem(db, item)).i.valueWon).toBe(100_000);
    // 10/10 입고 4캔 × 5.6만 = 22.4만 → 6캔 32.4만(평균 5.4만)
    const poId = await createOrder(db, manager(), { kind: "stock", supplierId: sup, lines: [{ name: "수용성 베이스 화이트", qty: 4, unitWon: 56_000, stockItemId: item }] }, at("2026-10-05"));
    await saveOrderHeader(db, manager(), poId, { supplierId: sup, dueOn: "2026-10-10", note: "" }, at("2026-10-05"));
    await submitOrder(db, manager(), poId, false, at("2026-10-05"));
    await approveOrder(db, owner(), poId, true, "", at("2026-10-05"));
    await sendOrder(db, manager(), poId, { via: "message", replyDueOn: "2026-10-06" }, at("2026-10-05"));
    const lineId = (await getOrder(db, poId)).lines[0].id;
    await receiveOrder(db, tech(), poId, { lines: [{ lineId, ok: 4, bad: 0, lot: "L1", expiresOn: "2027-05-01" }], checks: ["match", "look", "pack", "expiry"], badNote: "", needNc: false }, at("2026-10-10"));
    let it = await getItem(db, item);
    expect(it.i).toMatchObject({ qty: 6, valueWon: 324_000, unitWon: 56_000 });
    expect(it.moves[0].m).toMatchObject({ reason: "receive", unitWon: 56_000, amountWon: 224_000 });
    // 10/15 수리 건에 2캔(평균 5.4만) → 10.8만
    const { roId } = await approvedRepair(db, ids, at("2026-10-15"));
    await useStock(db, tech(), { itemId: item, qty: 2, repairOrderId: roId }, at("2026-10-15"));
    it = await getItem(db, item);
    expect(it.i.valueWon).toBe(216_000);
    expect(it.moves[0].m).toMatchObject({ reason: "use", amountWon: -108_000 });
    // 11/3 실사 4 → 3(1캔 감모, 평균 단가 5.4만)
    await recordCount(db, manager(), { kind: "monthly", lines: [{ itemId: item, actual: 3 }], note: "사용 기록 누락" }, at("2026-11-03"));
    it = await getItem(db, item);
    expect(it.i).toMatchObject({ qty: 3, valueWon: 162_000 });
    expect(it.moves[0].m).toMatchObject({ reason: "count", amountWon: -54_000 });

    const now = at("2026-11-13");
    // 10월 재고현황: 10월 말 4캔 21.6만, 9월 말 0
    const oct = customPeriod("2026-10-01", "2026-10-31");
    const st = await runReport(db, owner(), "stock", oct, "prev", now);
    expect(st.body.kpis.find((k) => k.key === "won")).toMatchObject({ value: 216_000, prev: 0 });
    expect(st.body.tables[0].rows[0].cells).toEqual(["수용성 베이스 화이트", "도료(퍼티·경화제 포함)", 4, "캔", 54_000, 216_000, 1]);
    // 10월 수불부: 기초 0 + 들어옴 32.4만 − 사용 10.8만 = 기말 21.6만, 수리 건별 10.8만
    const lg = await runReport(db, owner(), "stockledger", oct, "prev", now);
    const k = Object.fromEntries(lg.body.kpis.map((x) => [x.key, x.value]));
    expect(k).toMatchObject({ open: 0, in: 324_000, use: 108_000, adj: 0, close: 216_000 });
    expect(lg.body.tables[0].rows[0].cells).toEqual(["수용성 베이스 화이트", "캔", 0, 6, 2, 0, 4, 0, 324_000, 108_000, 0, 216_000]);
    expect(lg.body.tables[1].rows[0].cells[2]).toBe(108_000);
    // 11월: 기초 21.6만, 실사 감모 −5.4만, 기말 16.2만
    const nov = customPeriod("2026-11-01", "2026-11-30");
    const lg2 = await runReport(db, owner(), "stockledger", nov, "prev", now);
    expect(Object.fromEntries(lg2.body.kpis.map((x) => [x.key, x.value]))).toMatchObject({ open: 216_000, adj: -54_000, close: 162_000 });
    // 10월 회전율: 사용 10.8만 ÷ 평균 재고 (0 + 21.6만)/2 = 1회, 31일
    const tv = await runReport(db, owner(), "turnover", oct, "prev", now);
    const t = Object.fromEntries(tv.body.kpis.map((x) => [x.key, x.value]));
    expect(t).toMatchObject({ turns: 1, days: 31, use: 108_000, avg: 108_000 });
    const tv2 = await runReport(db, owner(), "turnover", nov, "prev", now);
    expect(tv2.body.kpis.find((x) => x.key === "loss")?.value).toBe(54_000);
    expect(tv2.body.tables.find((x) => x.key === "stockCounts")!.rows).toHaveLength(1);
  });

  it("폐기는 평균 단가로 빼고 손실로 잡힌다", async () => {
    const item = await saveItem(db, manager(), null, { name: "퍼티", kind: "paint", spec: "", unit: "통", location: "", safetyQty: 0, unitWon: 20_000, expiryTracked: true, supplierId: "", openingQty: 3, openingExpiresOn: "2026-11-05" }, at("2026-11-01"));
    const lot = (await getItem(db, item)).lots[0];
    await discardLot(db, manager(), lot.id, "", at("2026-11-06"));
    const it = await getItem(db, item);
    expect(it.i).toMatchObject({ qty: 0, valueWon: 0 });
    expect(it.moves[0].m).toMatchObject({ reason: "discard", qty: -3, amountWon: -60_000 });
    const tv = await runReport(db, owner(), "turnover", customPeriod("2026-11-01", "2026-11-30"), "prev", at("2026-11-13"));
    expect(tv.body.kpis.find((x) => x.key === "loss")?.value).toBe(60_000);
  });
});
