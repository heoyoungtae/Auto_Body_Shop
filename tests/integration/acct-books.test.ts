// 보고서 센터 4단계(2026-11-13): 계정과목·자동 분개·기초 잔액·자금 전표 → 손익계산서·재무상태표·현금흐름표·자금일보·계정별 원장
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { approvalDoc, bankTx, repairOrder, repairStatement } from "@/db/schema";
import { ACCOUNTS, EXP_ACCOUNT, FUND_KINDS } from "@/modules/acct/accounts";
import { buildJournal, unbalanced } from "@/modules/acct/journal";
import { cancelFundSlip, createFundSlip, fundSeedFromTx, getOpening, saveOpening, txNeedingFund } from "@/modules/acct/service";
import { act } from "@/modules/approval/service";
import { createExpense, payExpense } from "@/modules/money/expense";
import { EXP_CATEGORIES } from "@/modules/money/rules";
import { recordPayment } from "@/modules/money/receipts";
import { saveItem, useStock } from "@/modules/purchase/stock";
import { customPeriod } from "@/modules/report/period";
import { runReport } from "@/modules/report/run";
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
const now = new Date("2026-11-25T01:00:00Z");
const at = (d: string) => new Date(`${d}T01:00:00Z`);
const owner = () => ({ id: ids.owner, roles: ["owner" as const] });
const acct = () => ({ id: ids.account, roles: ["accounting" as const] });
const manager = () => ({ id: ids.manager, roles: ["plant_manager" as const] });
const advisor = () => ({ id: ids.advisor, roles: ["advisor" as const] });
const kpi = (r: { body: { kpis: { key: string; value: number | null }[] } }) => Object.fromEntries(r.body.kpis.map((k) => [k.key, k.value]));

describe("계정과목표", () => {
  it("지출 계정은 모두 계정과목이 있고, 자금 전표 계정은 직접 고를 수 있는 계정이다", () => {
    const codes = new Set(ACCOUNTS.map((a) => a.code));
    expect(codes.size).toBe(ACCOUNTS.length);
    for (const c of Object.keys(EXP_CATEGORIES)) expect(codes.has(EXP_ACCOUNT[c]), c).toBe(true);
    for (const [k, v] of Object.entries(FUND_KINDS)) if (k !== "other") for (const c of [v.dr, v.cr]) expect(ACCOUNTS.find((a) => a.code === c)?.manual, `${k} ${c}`).toBe(true);
  });
});

describe("자동 분개·재무제표", () => {
  it("기초 잔액·매출·수납·지출·재고·자금 전표가 분개되고 손익계산서·재무상태표·현금흐름이 맞는다", async () => {
    // 개업일 11/1 기초 잔액: 통장 1,000만, 장기차입금 300만 → 자본금 700만
    await expect(saveOpening(db, advisor(), { on: "2026-11-01", lines: [] }, now)).rejects.toThrow(/회계/);
    await saveOpening(db, acct(), { on: "2026-11-01", lines: [{ code: "103", won: 10_000_000 }, { code: "293", won: 3_000_000 }] }, now);
    expect((await getOpening(db)).byCode.get("103")).toBe(10_000_000);

    // 11/10 정비명세서 33만(부품 10만·공임 20만·부가세 3만), 카드 수납
    const { roId, estimateId } = await approvedRepair(db, ids, at("2026-11-05"));
    await db.insert(repairStatement).values({ docNo: "IV-2611-0001", repairOrderId: roId, estimateId, partsWon: 100_000, laborWon: 200_000, vatWon: 30_000, totalWon: 330_000, issuedOn: "2026-11-10", payMethod: "card", deliveredAt: at("2026-11-10") });
    await db.update(repairOrder).set({ status: "delivered" }).where(eq(repairOrder.id, roId));
    await recordPayment(db, advisor(), roId, { method: "card", amountWon: 330_000, receivedOn: "2026-11-10", receiptKind: "card_slip", receiptNo: "", payerName: "", note: "" }, at("2026-11-10"));

    // 11/5 임차료 결의(110만), 11/10 지급
    const x = await createExpense(db, acct(), { category: "rent", supplierId: "", payeeName: "건물주", sourceKind: "none", sourceId: "", purpose: "11월 임차료", supplyWon: 1_000_000, vatWon: 100_000, evidenceKind: "tax_invoice", evidenceNo: "TI-9", evidenceOn: "2026-11-05", dueOn: "", payMethod: "transfer", files: [] }, at("2026-11-05"));
    const [doc] = await db.select().from(approvalDoc).where(eq(approvalDoc.id, x.approvalDocId));
    for (const st of doc.steps as { kind: string; candidates: string[] }[]) if (st.kind === "approve") await act(db, x.approvalDocId, st.candidates[0], "approve", null, at("2026-11-06"));
    await payExpense(db, acct(), x.id, { paidOn: "2026-11-10", note: "임대인 국민 ***-1" }, at("2026-11-10"));

    // 재고: 11/1 도료 2캔 × 5만 처음 등록, 11/15 1캔 사용
    const item = await saveItem(db, manager(), null, { name: "베이스", kind: "paint", spec: "", unit: "캔", location: "", safetyQty: 0, unitWon: 50_000, expiryTracked: false, supplierId: "", openingQty: 2 }, at("2026-11-01"));
    await useStock(db, { id: ids.tech1, roles: ["technician"] }, { itemId: item, qty: 1 }, at("2026-11-15"));

    // 11/20 대출 이자 5만(통장 내역 분류에서 바로)
    const [t] = await db.insert(bankTx).values({ kind: "out", on: "2026-11-20", amountWon: 50_000, party: "○○은행", memo: "대출이자", source: "manual", dedupeKey: "t-1", matchKind: "class", cls: "interest" }).returning();
    expect((await txNeedingFund(db)).map((r) => r.id)).toEqual([t.id]);
    const seed = await fundSeedFromTx(db, t.id);
    expect(seed).toMatchObject({ kind: "interest", amountWon: 50_000, on: "2026-11-20" });
    const fs = await createFundSlip(db, acct(), { on: seed!.on, kind: seed!.kind, amountWon: seed!.amountWon, memo: seed!.memo, bankTxId: t.id }, now);
    expect(fs.docNo).toMatch(/^FS-2611-/);
    expect(await txNeedingFund(db)).toEqual([]);
    await expect(createFundSlip(db, acct(), { on: "2026-11-20", kind: "interest", amountWon: 50_000, memo: "", bankTxId: t.id }, now)).rejects.toThrow(/이미/);
    // 잘못 적은 전표는 취소 전표로
    const wrong = await createFundSlip(db, acct(), { on: "2026-11-21", kind: "owner_out", amountWon: 999, memo: "" }, now);
    await cancelFundSlip(db, acct(), wrong.id, "잘못 적음", now);
    await expect(cancelFundSlip(db, acct(), wrong.id, "또", now)).rejects.toThrow(/이미/);
    await expect(createFundSlip(db, acct(), { on: "2026-11-21", kind: "other", amountWon: 1, memo: "x", drCode: "108", crCode: "103" }, now)).rejects.toThrow(/계정/);

    const js = await buildJournal(db, "2026-11-30", now);
    expect(unbalanced(js)).toEqual([]);

    const nov = customPeriod("2026-11-01", "2026-11-30");
    const pl = await runReport(db, owner(), "pl", nov, "prev", now);
    // 매출 30만 − 원가 5만(쓴 도료) − 임차료 100만 − 이자 5만 = −80만
    expect(kpi(pl)).toMatchObject({ sales: 300_000, gross: 250_000, op: -750_000, net: -800_000 });
    const bs = await runReport(db, owner(), "bs", nov, "prev", now);
    // 통장 1,000만 + 33만 − 110만 − 5만 = 918만, 부가세대급금 10만, 원재료 5만 / 부가세예수금 3만, 차입금 300만 / 자본금 710만 − 80만
    expect(kpi(bs)).toMatchObject({ asset: 9_330_000, liab: 3_030_000, equity: 6_300_000 });
    expect(bs.body.notes?.[0]).toMatch(/맞습니다/);
    const cf = await runReport(db, owner(), "cashflow", nov, "prev", now);
    expect(kpi(cf)).toMatchObject({ open: 10_000_000, op: -820_000, inv: 0, fin: 0, close: 9_180_000 });
    const fd = await runReport(db, owner(), "funds", nov, "prev", now);
    expect(kpi(fd)).toMatchObject({ cash: 0, bank: 9_180_000 });
    const lg = await runReport(db, owner(), "ledger", nov, "prev", now, { acct: "103" });
    expect(kpi(lg).bad).toBe(0);
    const det = lg.body.tables.find((x) => x.key === "ledgerDetail")!;
    expect(det.rows.at(-1)!.cells[5]).toBe(9_180_000);
    // 권한: 품질 담당은 회계 보고서를 못 본다
    await expect(runReport(db, { id: ids.owner, roles: ["quality"] }, "bs", nov, "prev", now)).rejects.toThrow("권한");
  });
});
