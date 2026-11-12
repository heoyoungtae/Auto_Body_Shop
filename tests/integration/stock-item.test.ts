// 재고 품목 등록 개선(2026-11-11 대표 지시): 단가 부가세 방식, 용량·중량, 지출 계정, 사용 중지·소진 후 중지,
// 성적서·인증서 문서와 기한 알림, 화학물질(MSDS) 연결, 발주 지출의 계정별 나누기
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { and, eq, like } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import * as schema from "@/db/schema";
import { myTodos } from "@/modules/dashboard/todo";
import { createExpense, expenseSources } from "@/modules/money/expense";
import { splitByShare } from "@/modules/money/rules";
import { createOrder, saveOrderLine } from "@/modules/purchase/order";
import { itemExpCategory, shownUnitWon, splitVat } from "@/modules/purchase/rules";
import { addItemDoc, getItem, lastVatMode, listStock, orderLowStock, recordCount, resumeItem, retireItemDoc, saveItem, stockDailyAlerts, stopItem, useStock, type ItemInput } from "@/modules/purchase/stock";
import { createSupplier } from "@/modules/purchase/supplier";
import { createChemical } from "@/modules/safety/chemical";
import { seedShop, testDb } from "./db";
import { WEBP } from "./flow";

beforeAll(() => {
  process.env.STORAGE_DIR = mkdtempSync(join(tmpdir(), "abs-files-"));
});
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
const base = (over: Partial<ItemInput> = {}): ItemInput => ({ name: "수용성 베이스 화이트", kind: "paint", spec: "", unit: "캔", location: "도료장 A-1", safetyQty: 2, unitWon: 55_000, expiryTracked: false, supplierId: "", ...over });

describe("규칙", () => {
  it("부가세 방식별 공급가·계정 나누기", () => {
    expect(splitVat(55_000, "included")).toEqual({ supply: 50_000, vat: 5_000, total: 55_000 });
    expect(splitVat(50_000, "excluded")).toEqual({ supply: 50_000, vat: 5_000, total: 55_000 });
    expect(splitVat(30_000, "none")).toEqual({ supply: 30_000, vat: 0, total: 30_000 });
    expect(shownUnitWon(50_000, "included")).toBe(55_000);
    expect(itemExpCategory({ kind: "part", expCategory: null })).toBe("parts");
    expect(itemExpCategory({ kind: "paint", expCategory: "equipment" })).toBe("equipment");
    expect(splitByShare([{ category: "paint", won: 100 }, { category: "paint", won: 50 }], 165)).toEqual([]);
    expect(splitByShare([{ category: "paint", won: 200 }, { category: "consumable", won: 100 }], 331)).toEqual([
      { category: "paint", won: 221 },
      { category: "consumable", won: 110 },
    ]);
  });
});

describe("품목 등록", () => {
  it("부가세 포함 단가는 공급가로 저장하고, 방식은 다음 등록 때 불러오며, 계정은 구분 기본이면 비워 둔다", async () => {
    expect(await lastVatMode(db)).toBe("excluded");
    const id = await saveItem(db, manager(), null, base({ vatMode: "included", packAmount: 4, packUnit: "L", expCategory: "paint" }), now);
    const { i } = await getItem(db, id);
    expect(i).toMatchObject({ unitWon: 50_000, vatMode: "included", packAmount: 4, packUnit: "L", expCategory: null });
    expect(await lastVatMode(db)).toBe("included");
    await saveItem(db, manager(), id, base({ vatMode: "excluded", unitWon: 52_000, expCategory: "equipment" }), now);
    expect((await getItem(db, id)).i).toMatchObject({ unitWon: 52_000, expCategory: "equipment", packAmount: null });
    await expect(saveItem(db, manager(), null, base({ vatMode: "x" }), now)).rejects.toThrow(/부가세/);
    await expect(saveItem(db, manager(), null, base({ packAmount: 4, packUnit: "" }), now)).rejects.toThrow(/단위/);
    await expect(saveItem(db, manager(), null, base({ expCategory: "nope" }), now)).rejects.toThrow(/계정/);
  });

  it("화학물질(MSDS)을 연결하면 품목에서 보이고, 거래 중지 업체는 고를 수 없다", async () => {
    const chem = await createChemical(db, owner(), { name: "베이스 화이트", maker: "한빛", category: "도료", hazards: "", monthlyUse: "", location: "위험물 보관함 1칸", ppe: [], flammable: true, msdsRevisedOn: "", trainedOn: "", note: "" }, null, now);
    const id = await saveItem(db, manager(), null, base({ chemicalId: chem }), now);
    expect((await getItem(db, id)).chem?.name).toBe("베이스 화이트");
    const sup = await createSupplier(db, manager(), { name: "끊긴업체", bizNo: "", kinds: ["paint"], items: "", contactName: "", phone: "", email: "", leadDays: null, returnTerms: "", docs: [], note: "" }, now);
    await db.update(schema.supplier).set({ status: "stopped" }).where(eq(schema.supplier.id, sup));
    await expect(saveItem(db, manager(), null, base({ supplierId: sup }), now)).rejects.toThrow(/거래하지 않는/);
  });
});

describe("사용 중지", () => {
  it("남은 게 있으면 소진 후 중지: 발주는 막고 사용은 되며, 0이 되면 사용 중지. 다시 쓰기", async () => {
    const newer = await saveItem(db, manager(), null, base({ name: "베이스 화이트 신형" }), now);
    const id = await saveItem(db, manager(), null, base({ safetyQty: 5, openingQty: 2 }), now);
    await expect(stopItem(db, tech(), id, { reason: "unused" }, now)).rejects.toThrow(/공장장/);
    await expect(stopItem(db, manager(), id, { reason: "replaced" }, now)).rejects.toThrow(/대체 품목/);
    await expect(stopItem(db, manager(), id, { reason: "other" }, now)).rejects.toThrow(/기타/);
    expect(await stopItem(db, manager(), id, { reason: "replaced", replacedById: newer }, now)).toBe("windDown");
    // 미달이어도 소진 후 중지 품목은 미달·발주 대상이 아니다
    expect((await listStock(db, "low", now)).map((r) => r.id)).not.toContain(id);
    await expect(orderLowStock(db, manager(), [id], now)).rejects.toThrow(/사용 중지/);
    // 발주서를 만들 때 품목을 한꺼번에 함께 넣는다: 틀린 줄이 있으면 발주서도 만들지 않는다
    await expect(createOrder(db, manager(), { kind: "stock", lines: [{ name: "마스킹 테이프", qty: 10, unitWon: 3_000 }, { name: "베이스", qty: 1, unitWon: 50_000, stockItemId: id }] }, now)).rejects.toThrow(/사용 중지/);
    const po2 = await createOrder(db, manager(), { kind: "stock", lines: [{ name: "마스킹 테이프", qty: 10, unitWon: 3_000 }, { name: "", qty: 1, unitWon: 0 }, { name: "연마지 P800", qty: 5, unitWon: 1_000 }] }, now);
    const lines2 = await db.select().from(schema.purchaseLine).where(eq(schema.purchaseLine.orderId, po2));
    expect(lines2.map((l) => l.name).sort()).toEqual(["마스킹 테이프", "연마지 P800"]);
    const po = await createOrder(db, manager(), { kind: "stock" }, now);
    await expect(saveOrderLine(db, manager(), po, null, { name: "베이스", qty: 1, unitWon: 50_000, stockItemId: id })).rejects.toThrow(/대신 베이스 화이트 신형/);
    await useStock(db, tech(), { itemId: id, qty: 2 }, now);
    const g = await getItem(db, id);
    expect(g.i).toMatchObject({ active: false, windDown: false, stopReason: "replaced" });
    expect(g.replacedBy?.name).toBe("베이스 화이트 신형");
    expect((await getItem(db, newer)).replaces.map((x) => x.id)).toEqual([id]);
    expect((await listStock(db, "stopped", now)).map((r) => r.id)).toEqual([id]);
    expect((await listStock(db, "all", now)).map((r) => r.id)).not.toContain(id);
    await expect(useStock(db, tech(), { itemId: id, qty: 1 }, now)).rejects.toThrow(/쓰지 않는/);
    await resumeItem(db, manager(), id, now);
    expect((await getItem(db, id)).i).toMatchObject({ active: true, windDown: false, stopReason: null });
  });

  it("수량 0이면 바로 중지, 실사로 0이 되어도 중지", async () => {
    const a = await saveItem(db, manager(), null, base({ name: "A" }), now);
    expect(await stopItem(db, manager(), a, { reason: "discontinued" }, now)).toBe("stopped");
    await expect(stopItem(db, manager(), a, { reason: "unused" }, now)).rejects.toThrow(/이미/);
    const b = await saveItem(db, manager(), null, base({ name: "B", unitWon: 0, openingQty: 3 }), now);
    await stopItem(db, manager(), b, { reason: "unused" }, now);
    await recordCount(db, manager(), { kind: "monthly", lines: [{ itemId: b, actual: 0 }], note: "다 씀" }, now);
    expect((await getItem(db, b)).i.active).toBe(false);
  });
});

describe("성적서·인증서", () => {
  it("파일 필수, 부적합은 알림, 새 판은 앞 판을 남기고, 기한 30일 전·지남을 알리고 할 일에 올린다", async () => {
    const id = await saveItem(db, manager(), null, base(), now);
    const doc = { kind: "icp", title: "", issuer: "KTR", issuedOn: "2025-12-01", expiresOn: "2026-11-30", result: "pass", lot: "", note: "" };
    await expect(addItemDoc(db, manager(), id, doc, null, now)).rejects.toThrow(/파일/);
    await expect(addItemDoc(db, tech(), id, doc, { name: "a.webp", bytes: WEBP }, now)).rejects.toThrow(/공장장/);
    await expect(addItemDoc(db, manager(), id, { ...doc, expiresOn: "2025-01-01" }, { name: "a.webp", bytes: WEBP }, now)).rejects.toThrow(/발행일보다/);
    await expect(addItemDoc(db, manager(), id, doc, { name: "a.txt", bytes: new Uint8Array([1, 2, 3, 4, 5, 6]) }, now)).rejects.toThrow(/PDF/);
    const d1 = await addItemDoc(db, manager(), id, doc, { name: "icp.webp", bytes: WEBP }, now);
    expect((await listStock(db, "docs", now)).map((r) => r.id)).toEqual([id]);
    await stockDailyAlerts(db, now);
    const notes = await db.select().from(schema.notification).where(and(eq(schema.notification.userId, ids.manager), like(schema.notification.dedupeKey, "stock-doc-%")));
    expect(notes.map((n) => n.title)).toEqual([expect.stringContaining("ICP 성적서(유해물질) 유효기간 2026-11-30까지")]);
    expect((await myTodos(db, manager(), now)).some((t) => t.key === "stock-docs")).toBe(true);
    // 같은 종류 새 판 → 앞 판은 지난 판
    await addItemDoc(db, manager(), id, { ...doc, issuedOn: "2026-11-05", expiresOn: "2027-11-04", replaceId: d1 }, { name: "icp2.webp", bytes: WEBP }, now);
    const g = await getItem(db, id);
    expect(g.docs.map((x) => [x.d.issuedOn, x.d.active])).toEqual([
      ["2026-11-05", true],
      ["2025-12-01", false],
    ]);
    expect(await listStock(db, "docs", now)).toEqual([]);
    const bad = await addItemDoc(db, manager(), id, { ...doc, kind: "coa", expiresOn: "", result: "fail", lot: "L2611" }, { name: "coa.webp", bytes: WEBP }, now);
    const [n] = await db.select().from(schema.notification).where(eq(schema.notification.dedupeKey, `stock-doc-fail-${bad}`));
    expect(n.title).toMatch(/부적합 시험성적서.*로트 L2611/);
    await retireItemDoc(db, manager(), bad);
    expect((await getItem(db, id)).docs.filter((x) => x.d.active)).toHaveLength(1);
  });
});

describe("지출 계정", () => {
  it("발주서에 도료·소모품이 섞이면 외상과 지급 결의를 품목 계정별로 나눈다", async () => {
    const sup = await createSupplier(db, manager(), { name: "한빛도료", bizNo: "", kinds: ["paint"], items: "", contactName: "", phone: "", email: "", leadDays: null, returnTerms: "", docs: [], note: "" }, now);
    const paint = await saveItem(db, manager(), null, base(), now);
    const tape = await saveItem(db, manager(), null, base({ name: "마스킹테이프", kind: "consumable", unit: "롤" }), now);
    const [po] = await db.insert(schema.purchaseOrder).values({ docNo: "PO-2611-0099", kind: "stock", supplierId: sup, status: "received", supplyWon: 300_000, totalWon: 330_000, receivedAt: now, createdBy: ids.manager }).returning();
    await db.insert(schema.purchaseLine).values([
      { orderId: po.id, seq: 1, name: "베이스", qty: 4, unitWon: 50_000, stockItemId: paint, receivedQty: 4 },
      { orderId: po.id, seq: 2, name: "테이프", qty: 20, unitWon: 5_000, stockItemId: tape, receivedQty: 20 },
    ]);
    const src = (await expenseSources(db)).find((s) => s.id === sup)!;
    expect(src.category).toBe("paint");
    expect(src.split).toEqual([
      { category: "paint", won: 220_000 },
      { category: "consumable", won: 110_000 },
    ]);
    const x = await createExpense(db, manager(), { category: "paint", supplierId: "", payeeName: "", sourceKind: "settle", sourceId: sup, purpose: "", supplyWon: 300_000, vatWon: 30_000, evidenceKind: "pending", evidenceNo: "", evidenceOn: "", dueOn: "", payMethod: "transfer", files: [] }, now);
    const [e] = await db.select().from(schema.expense).where(eq(schema.expense.id, x.id));
    expect(e.split).toEqual(src.split);
  });
});
