// 보고서 센터 5단계(2026-11-13): 연간 예산 → 5번 손익분기·예산 대비, 월간 경영보고서 결재, 월 마감 승인 때 보고서 저장
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { approvalDoc, monthClose, repairOrder, repairStatement } from "@/db/schema";
import { getBudget, saveAnnualBudget, saveMonthBudget, spread } from "@/modules/acct/budget";
import { createFundSlip, saveOpening } from "@/modules/acct/service";
import { act } from "@/modules/approval/service";
import { decideMonth } from "@/modules/money/close";
import { createExpense, payExpense } from "@/modules/money/expense";
import { recordPayment } from "@/modules/money/receipts";
import { saveItem, useStock } from "@/modules/purchase/stock";
import { latestMonthly, submitMonthly } from "@/modules/report/monthly";
import { customPeriod, periodOf } from "@/modules/report/period";
import { runReport } from "@/modules/report/run";
import { getSnapshot } from "@/modules/report/snapshot";
import { seedShop, testDb } from "./db";
import { approvedRepair } from "./flow";

beforeAll(() => {
  process.env.STORAGE_DIR = mkdtempSync(join(tmpdir(), "abs-files-"));
});
let db: Db;
let ids: Awaited<ReturnType<typeof seedShop>>;
beforeEach(async () => {
  db = await testDb();
  ids = await seedShop(db);
});
const now = new Date("2026-12-02T01:00:00Z");
const at = (d: string) => new Date(`${d}T01:00:00Z`);
const owner = () => ({ id: ids.owner, roles: ["owner" as const] });
const acct = () => ({ id: ids.account, roles: ["accounting" as const] });
const manager = () => ({ id: ids.manager, roles: ["plant_manager" as const] });
const kpi = (r: { body: { kpis: { key: string; value: number | null }[] } }) => Object.fromEntries(r.body.kpis.map((k) => [k.key, k.value]));

/** 11월: 매출 30만, 원가 5만(쓴 도료), 임차료 100만, 이자 5만 */
async function november() {
  await saveOpening(db, acct(), { on: "2026-11-01", lines: [{ code: "103", won: 10_000_000 }] }, at("2026-11-01"));
  const { roId, estimateId } = await approvedRepair(db, ids, at("2026-11-05"));
  await db.insert(repairStatement).values({ docNo: "IV-2611-0001", repairOrderId: roId, estimateId, partsWon: 100_000, laborWon: 200_000, vatWon: 30_000, totalWon: 330_000, issuedOn: "2026-11-10", payMethod: "card", deliveredAt: at("2026-11-10") });
  await db.update(repairOrder).set({ status: "delivered" }).where(eq(repairOrder.id, roId));
  await recordPayment(db, owner(), roId, { method: "card", amountWon: 330_000, receivedOn: "2026-11-10", receiptKind: "card_slip", receiptNo: "", payerName: "", note: "" }, at("2026-11-10"));
  const x = await createExpense(db, acct(), { category: "rent", supplierId: "", payeeName: "건물주", sourceKind: "none", sourceId: "", purpose: "11월 임차료", supplyWon: 1_000_000, vatWon: 100_000, evidenceKind: "tax_invoice", evidenceNo: "TI-9", evidenceOn: "2026-11-05", dueOn: "", payMethod: "transfer", files: [] }, at("2026-11-05"));
  const [doc] = await db.select().from(approvalDoc).where(eq(approvalDoc.id, x.approvalDocId));
  for (const st of doc.steps as { kind: string; candidates: string[] }[]) if (st.kind === "approve") await act(db, x.approvalDocId, st.candidates[0], "approve", null, at("2026-11-06"));
  await payExpense(db, acct(), x.id, { paidOn: "2026-11-10", note: "임대인 국민 ***-1" }, at("2026-11-10"));
  const item = await saveItem(db, manager(), null, { name: "베이스", kind: "paint", spec: "", unit: "캔", location: "", safetyQty: 0, unitWon: 50_000, expiryTracked: false, supplierId: "", openingQty: 2 }, at("2026-11-01"));
  await useStock(db, { id: ids.tech1, roles: ["technician"] }, { itemId: item, qty: 1 }, at("2026-11-15"));
  await createFundSlip(db, acct(), { on: "2026-11-20", kind: "interest", amountWon: 50_000, memo: "" }, at("2026-11-20"));
}

describe("연간 예산", () => {
  it("한 해 금액을 12달로 나누고(끝수는 12월), 한 달만 고칠 수 있다", async () => {
    expect(spread(1_000_000)).toHaveLength(12);
    expect(spread(1_000_000).reduce((a, x) => a + x, 0)).toBe(1_000_000);
    expect(spread(1200, [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1])).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1000, 200]);
    await expect(saveAnnualBudget(db, manager(), 2026, { annual: { sales: 1 }, method: "even" }, now)).rejects.toThrow(/대표/);
    await expect(saveAnnualBudget(db, owner(), 2026, { annual: {}, method: "even" }, now)).rejects.toThrow(/한 줄/);
    await saveAnnualBudget(db, owner(), 2026, { annual: { sales: 12_000_000, rent: 12_000_000, cogs: 2_400_000 }, method: "even" }, now);
    let b = await getBudget(db, 2026);
    expect(b.byYm.get("2026-11")).toMatchObject({ sales: 1_000_000, rent: 1_000_000, cogs: 200_000, labor: 0 });
    expect(b.total.sales).toBe(12_000_000);
    await saveMonthBudget(db, acct(), "2026-12", { sales: 2_000_000 }, now);
    b = await getBudget(db, 2026);
    expect(b.byYm.get("2026-12")!.sales).toBe(2_000_000);
    expect(b.byYm.get("2026-12")!.rent).toBe(1_000_000);
    // 월 마감을 올린 달은 그대로
    await db.insert(monthClose).values({ ym: "2026-11", status: "submitted", snapshot: {}, preparedBy: ids.account, preparedAt: now });
    await expect(saveMonthBudget(db, owner(), "2026-11", { sales: 1 }, now)).rejects.toThrow(/마감/);
    const r = await saveAnnualBudget(db, owner(), 2026, { annual: { sales: 24_000_000 }, method: "even" }, now);
    expect(r.skipped).toEqual(["2026-11"]);
    expect((await getBudget(db, 2026)).byYm.get("2026-11")!.sales).toBe(1_000_000);
  });

  it("지난해 달별 비율대로 나눈다", async () => {
    await november();
    await saveAnnualBudget(db, owner(), 2027, { annual: { sales: 6_000_000 }, method: "last" }, now);
    const b = await getBudget(db, 2027);
    // 지난해(2026)는 11월에만 매출이 있으므로 11월에 다 들어간다
    expect(b.byYm.get("2027-11")!.sales).toBe(6_000_000);
    expect(b.byYm.get("2027-01")!.sales).toBe(0);
  });
});

describe("5. 손익분기·예산 대비", () => {
  it("고정비·공헌이익률·손익분기 매출과 예산 달성률", async () => {
    await november();
    await saveAnnualBudget(db, owner(), 2026, { annual: { sales: 12_000_000, cogs: 2_400_000, rent: 12_000_000, nonop: 600_000 }, method: "even" }, now);
    const r = await runReport(db, owner(), "budget", periodOf("month", "2026-11-01"), "prev", now);
    const k = kpi(r);
    expect(k).toMatchObject({ sales: 300_000, salesAch: 30, op: -750_000, fixed: 1_050_000, bep: 1_260_000 });
    expect(k.cmPct).toBeCloseTo(83.3, 1);
    expect(k.bepPct).toBeCloseTo(23.8, 1);
    const t = r.body.tables.find((x) => x.key === "budgetTable")!;
    const row = (label: string) => t.rows.find((x) => String(x.cells[0]).trim().startsWith(label))!.cells;
    expect(row("매출액")).toEqual(["매출액", 1_000_000, 300_000, -700_000, 30]);
    expect(row("영업이익").slice(1, 3)).toEqual([1_000_000 - 200_000 - 1_000_000, -750_000]);
    expect(row("세전 이익")[2]).toBe(-800_000);
    // 한 주를 보면 그 달 예산을 날수로 나눈다(11/9~15 = 7/30)
    const w = await runReport(db, owner(), "budget", customPeriod("2026-11-09", "2026-11-15"), "prev", now);
    expect(w.body.tables[0].rows[0].cells[1]).toBe(233_333);
    // 권한: 회계 담당은 보고, 공장장은 못 본다
    await runReport(db, acct(), "budget", periodOf("month", "2026-11-01"), "prev", now);
    await expect(runReport(db, manager(), "budget", periodOf("month", "2026-11-01"), "prev", now)).rejects.toThrow("권한");
  });

  it("예산이 없으면 실적과 손익분기만", async () => {
    await november();
    const r = await runReport(db, owner(), "budget", periodOf("month", "2026-11-01"), "prev", now);
    expect(kpi(r).salesAch).toBeNull();
    expect(r.body.notes?.[0]).toMatch(/예산이 없습니다/);
  });
});

describe("월간 경영보고서·마감 저장본", () => {
  it("끝난 달만 결재로 올리고, 올린 숫자를 그대로 남긴다. 대표가 승인한다", async () => {
    await november();
    await expect(submitMonthly(db, manager(), "2026-11", "", now)).rejects.toThrow(/회계/);
    await expect(submitMonthly(db, acct(), "2026-12", "", now)).rejects.toThrow(/끝난 달/);
    const r = await submitMonthly(db, acct(), "2026-11", "임차료 대비 매출 부족", now);
    expect(r.docNo).toMatch(/^MR-2612-/);
    await expect(submitMonthly(db, acct(), "2026-11", "", now)).rejects.toThrow(/이미/);
    const cur = (await latestMonthly(db, "2026-11"))!;
    expect(cur.status).toBe("in_progress");
    const pl = cur.sections.find((s) => s.id === "pl")!;
    expect(pl.kpis.find((k) => k.key === "sales")!.value).toBe(300_000);
    expect(cur.sections.map((s) => s.id)).toContain("budget");
    const [doc] = await db.select().from(approvalDoc).where(eq(approvalDoc.id, r.docId));
    expect((doc.data as { report: string }).report).toMatch(/손익계산서/);
    await act(db, r.docId, ids.owner, "approve", null, now);
    expect((await latestMonthly(db, "2026-11"))!.status).toBe("confirmed");
  });

  it("월 마감 승인 때 그 달 보고서를 저장한다", async () => {
    await november();
    await db.insert(monthClose).values({ ym: "2026-11", status: "submitted", snapshot: {}, preparedBy: ids.account, preparedAt: now });
    await decideMonth(db, owner(), "2026-11", true, "", now);
    const s = await getSnapshot(db, "2026-11", "pl");
    expect(s!.body.kpis.find((k) => k.key === "sales")!.value).toBe(300_000);
    expect(await getSnapshot(db, "2026-11", "budget")).not.toBeNull();
    expect(await getSnapshot(db, "2026-10", "pl")).toBeNull();
  });
});
