// 외상매입금·미지급금(대표 결정 2026-11-11): 결제 조건·지급 기한(은행 쉬는 날 앞당김), 입고하면 채무, 업체별 지급 결의,
// 마감한 달 보호, 발생 기준 월 마감 계정·말일 잔액, 카드 미지급금, 내 할 일
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import * as schema from "@/db/schema";
import { act } from "@/modules/approval/service";
import { myTodos } from "@/modules/dashboard/todo";
import { monthSummary } from "@/modules/money/close";
import { createExpense, payExpense, type ExpenseInput } from "@/modules/money/expense";
import { balancesAt, bankCalendar, listPayables, payableGroups, payDueOn, syncPayables } from "@/modules/money/payable";
import { backToBusinessDay, cardDueOn, payableKind, termDate } from "@/modules/money/rules";
import { saveOrderHeader } from "@/modules/purchase/order";
import { createSupplier, getSupplier } from "@/modules/purchase/supplier";
import { seedShop, testDb } from "./db";

beforeAll(() => {
  process.env.STORAGE_DIR = mkdtempSync(join(tmpdir(), "abs-files-"));
});
let db: Db;
let ids: Awaited<ReturnType<typeof seedShop>>;
beforeEach(async () => {
  db = await testDb();
  ids = await seedShop(db);
});
const now = new Date("2026-11-10T01:00:00Z"); // 서울 2026-11-10(화)
const manager = () => ({ id: ids.manager, roles: ["plant_manager" as const] });
const acct = () => ({ id: ids.account, roles: ["accounting" as const] });

const sup = (over: { payTerm?: string; payDay?: number | null } = {}) =>
  createSupplier(db, manager(), { name: "한빛도료", bizNo: "", kinds: ["paint"], items: "", contactName: "", phone: "", email: "", leadDays: null, returnTerms: "", docs: [], note: "", ...over }, now);
async function receivedPo(supplierId: string, docNo: string, at: Date, over: Partial<typeof schema.purchaseOrder.$inferInsert> = {}) {
  const [po] = await db.insert(schema.purchaseOrder).values({ docNo, kind: "stock", supplierId, status: "received", supplyWon: 100_000, totalWon: 110_000, receivedAt: at, createdBy: ids.manager, ...over }).returning();
  return po;
}

describe("규칙", () => {
  it("결제 조건 날짜, 은행 쉬는 날 앞당김, 계정 구분, 카드 결제일", async () => {
    expect(termDate("2026-11-10", "now", null)).toBe("2026-11-10");
    expect(termDate("2026-11-10", "month_end", null)).toBe("2026-11-30");
    expect(termDate("2026-11-10", "next_end", null)).toBe("2026-12-31");
    expect(termDate("2026-01-20", "next_day", 31)).toBe("2026-02-28");
    expect(termDate("2026-12-05", "next_day", 10)).toBe("2027-01-10");
    expect(backToBusinessDay("2026-11-15", (d) => !["2026-11-14", "2026-11-15"].includes(d))).toBe("2026-11-13");
    const cal = await bankCalendar(db);
    // 2027-01-31(일) → 01-29(금), 2027-01-01(신정) → 2026-12-31(목)
    expect(payDueOn(cal, "2026-12-10", "next_end", null)).toBe("2027-01-29");
    expect(payDueOn(cal, "2026-12-10", "next_day", 1)).toBe("2026-12-31");
    expect(payableKind("paint", true)).toBe("trade");
    expect(payableKind("outsource", true)).toBe("trade");
    expect(payableKind("outsource", false)).toBe("other");
    expect(payableKind("equipment", true)).toBe("other");
    expect(cardDueOn("2026-11-28", 14)).toBe("2026-12-14");
  });
});

describe("채무", () => {
  it("업체 결제 조건을 따르고 발주서에서 바꿀 수 있으며, 일부 입고는 들어온 만큼씩 생긴다", async () => {
    await expect(sup({ payTerm: "next_day" })).rejects.toThrow(/결제일/);
    const sid = await sup({ payTerm: "next_day", payDay: 10 });
    expect((await getSupplier(db, sid, now)).s).toMatchObject({ payTerm: "next_day", payDay: 10 });
    const [po] = await db.insert(schema.purchaseOrder).values({ docNo: "PO-2611-0001", kind: "stock", supplierId: sid, status: "draft", createdBy: ids.manager }).returning();
    await saveOrderHeader(db, manager(), po.id, { supplierId: sid, dueOn: "", note: "", payTerm: "now" }, now);
    await db.insert(schema.purchaseLine).values({ orderId: po.id, seq: 1, name: "베이스", qty: 4, unitWon: 50_000, receivedQty: 1 });
    await db.update(schema.purchaseOrder).set({ status: "partial", supplyWon: 200_000, totalWon: 220_000, receivedAt: now }).where(eq(schema.purchaseOrder.id, po.id));
    await syncPayables(db, now);
    await syncPayables(db, now); // 두 번 돌려도 한 번만
    let ps = await listPayables(db, sid);
    expect(ps.map((p) => [p.amountWon, p.accruedOn, p.dueOn, p.payTerm])).toEqual([[55_000, "2026-11-10", "2026-11-10", "now"]]);
    await db.update(schema.purchaseLine).set({ receivedQty: 4 }).where(eq(schema.purchaseLine.orderId, po.id));
    await db.update(schema.purchaseOrder).set({ status: "received" }).where(eq(schema.purchaseOrder.id, po.id));
    await syncPayables(db, now);
    ps = await listPayables(db, sid);
    expect(ps.reduce((a, p) => a + p.amountWon, 0)).toBe(220_000);
    // 다른 발주서는 업체 조건(익월 10일)
    await receivedPo(sid, "PO-2611-0002", now);
    await syncPayables(db, now);
    expect((await listPayables(db, sid)).find((p) => p.sourceNo === "PO-2611-0002")?.dueOn).toBe("2026-12-10");
  });

  it("마감한 달에 입고된 것은 마감 숫자가 바뀌지 않게 오늘 날짜로 잡는다", async () => {
    const sid = await sup();
    await db.insert(schema.monthClose).values({ ym: "2026-10", status: "approved", snapshot: {}, preparedBy: ids.account, preparedAt: now });
    await receivedPo(sid, "PO-2610-0009", new Date("2026-10-20T01:00:00Z"));
    await syncPayables(db, now);
    expect((await listPayables(db, sid))[0].accruedOn).toBe("2026-11-10");
  });
});

describe("지급·마감", () => {
  const exp = (over: Partial<ExpenseInput>): ExpenseInput => ({ category: "equipment", supplierId: "", payeeName: "공구상", sourceKind: "none", sourceId: "", purpose: "판금 공구", supplyWon: 100_000, vatWon: 10_000, evidenceKind: "card", evidenceNo: "1234", evidenceOn: "2026-11-09", dueOn: "", payMethod: "card", files: [], ...over });
  async function approve(approvalDocId: string) {
    const [doc] = await db.select().from(schema.approvalDoc).where(eq(schema.approvalDoc.id, approvalDocId));
    const who = (doc.steps as { kind: string; candidates: string[] }[]).find((s) => s.kind === "approve")!.candidates[0];
    await act(db, approvalDocId, who, "approve", null, now);
  }

  it("업체별 잔액·기한·할 일, 카드 미지급금, 월 마감은 입고·증빙 날짜로 계정을 잡고 말일 잔액을 남긴다", async () => {
    const sid = await sup();
    await receivedPo(sid, "PO-2611-0003", now, { payTerm: "now" });
    await receivedPo(sid, "PO-2611-0004", now);
    const g = await payableGroups(db, now);
    expect(g.totals).toMatchObject({ trade: 220_000, overdue: 0, dueThisMonth: 110_000, dueNextMonth: 110_000 });
    expect(g.groups[0]).toMatchObject({ supplierId: sid, toSettle: 220_000 });
    const todo = (await myTodos(db, acct(), now)).find((t) => t.key.startsWith(`pay-due-${sid}`));
    expect(todo).toMatchObject({ when: "today", href: `/money/payables/${sid}` });
    expect(todo!.what).toMatch(/110,000원\(1건\)/);

    // 결의서로 승인한 카드 지출 → 지급(사용)하면 카드 결제일(12-14)까지 미지급금(카드)
    const c = await createExpense(db, acct(), exp({}), now);
    await approve(c.approvalDocId);
    expect((await payableGroups(db, now)).totals.other).toBe(110_000);
    await payExpense(db, acct(), c.id, { paidOn: "2026-11-10", note: "" }, now);
    expect((await payableGroups(db, now)).totals).toMatchObject({ other: 0, card: 110_000 });

    // 외상 하나를 지급 결의 → 결재
    const [first] = (await listPayables(db, sid)).filter((p) => p.sourceNo === "PO-2611-0003");
    const s = await createExpense(db, acct(), exp({ category: "", payeeName: "", sourceKind: "settle", sourceId: sid, payableIds: [first.id], purpose: "", evidenceKind: "tax_invoice", evidenceNo: "TI-9", payMethod: "transfer" }), now);
    expect((await payableGroups(db, now)).groups[0]).toMatchObject({ toSettle: 110_000, inSettle: 110_000 });
    await approve(s.approvalDocId);

    const m = await monthSummary(db, "2026-11");
    const cat = Object.fromEntries(m.expenses.byCategory.map((x) => [x.category, x.won]));
    // 외상 22만(소모품: 재고 발주 기본) + 카드 장비 11만. 지급 결의는 다시 세지 않는다
    expect(cat).toEqual({ consumable: 220_000, equipment: 110_000 });
    expect(m.payables.balance).toMatchObject({ trade: 220_000, other: 0, card: 110_000 });
    expect(m.payables.balance!.bySupplier).toEqual([{ name: "한빛도료", trade: 220_000, other: 0 }]);
    // 12-14 이후에는 카드 대금이 빠진 것으로 본다
    expect((await balancesAt(db, "2026-12-15", now)).card).toBe(0);
  });
});
