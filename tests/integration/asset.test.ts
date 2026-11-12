// 비품·설비(대표 지시 2026-11-12): 지출 결의와 함께 대장 등록(입고 대기) → 들어옴 확인 → 결의 취소 시 정리,
// 관리자 정/부(휴가면 부), 수리 결의 → 수리 이력·자본적 지출, 사용계약 사용료 결의
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { approvalDoc, equipment, fixture } from "@/db/schema";
import { assetsOfExpense, assetDep, assetView, confirmArrival, depreciationOfMonth, leaseFeePrefill, listRepairs, managerToNotify, saveFinance, setManagers, unlinkedAssetExpenses, assetTodos } from "@/modules/asset/service";
import { cancelExpense, createExpense, type ExpenseInput } from "@/modules/money/expense";
import { registerFixture } from "@/modules/purchase/fixture";
import { LEAVE_FORM } from "@/modules/staff/attendance";
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
const now = new Date("2026-11-12T01:00:00Z");
const owner = () => ({ id: ids.owner, roles: ["owner" as const] });
const manager = () => ({ id: ids.manager, roles: ["plant_manager" as const] });
const acct = () => ({ id: ids.account, roles: ["accounting" as const] });
const base = (over: Partial<ExpenseInput> = {}): ExpenseInput => ({
  category: "equipment",
  supplierId: "",
  payeeName: "공구상사",
  sourceKind: "none",
  sourceId: "",
  purpose: "공구 구입",
  supplyWon: 3_000_000,
  vatWon: 300_000,
  evidenceKind: "tax_invoice",
  evidenceNo: "TI-9",
  evidenceOn: "2026-11-11",
  dueOn: "",
  payMethod: "transfer",
  files: [],
  ...over,
});

describe("지출 결의 → 비품·설비 대장", () => {
  it("결의를 올리면 입고 대기로 대장에 오르고 번호가 붙는다. 들어옴 확인하면 사용·상각 시작, 결의 취소하면 입고 대기만 지운다", async () => {
    await expect(
      createExpense(db, manager(), base({ assets: [{ kind: "fixture", name: "전동 샌더", qty: 3, unitWon: 1_100_000, cat: "tool" }] }), now),
    ).rejects.toThrow(/공급가/);
    await expect(createExpense(db, manager(), base({ assets: [{ kind: "equipment", name: "리프트", qty: 2, unitWon: 1_000_000, cat: "lift" }] }), now)).rejects.toThrow(/한 대씩/);
    const x = await createExpense(
      db,
      manager(),
      base({
        assets: [
          { kind: "fixture", name: "전동 샌더", qty: 2, unitWon: 400_000, cat: "tool", managerId: ids.account },
          { kind: "equipment", name: "2주식 리프트", qty: 1, unitWon: 2_200_000, cat: "lift", managerId: ids.tech1, subManagerId: ids.manager },
        ],
      }),
      now,
    );
    const list = await assetsOfExpense(db, x.id);
    expect(list).toHaveLength(3);
    expect(list.every((a) => a.status === "pending")).toBe(true);
    expect(new Set(list.map((a) => a.no)).size).toBe(3);
    const fx = await db.select().from(fixture).where(eq(fixture.expenseId, x.id));
    expect(fx[0]).toMatchObject({ priceWon: 400_000, depMethod: "expense", purchasedOn: "2026-11-11" });
    const [eq1] = await db.select().from(equipment).where(eq(equipment.expenseId, x.id));
    expect(eq1).toMatchObject({ price: 2_200_000, depMethod: "sl", usefulYears: 5, ownerId: ids.tech1, subManagerId: ids.manager });

    // 대장에 올라갔으니 '대장에 안 올린 결의'에 없다
    expect((await unlinkedAssetExpenses(db)).map((e) => e.id)).not.toContain(x.id);
    // 관리자 할 일: 들어옴 확인
    expect((await assetTodos(db, { id: ids.tech1, roles: ["technician"] }, "2026-11-12")).some((t) => t.key === `asset-arrive-${eq1.id}`)).toBe(true);

    await confirmArrival(db, { id: ids.tech1, roles: ["technician"] }, "equipment", eq1.id, "2026-11-12", now);
    const a = await assetView(db, "equipment", eq1.id);
    expect(a).toMatchObject({ status: "in_use", depStartOn: "2026-11-12" });
    expect((await assetDep(db, a, 2026)).thisYear).toBe(Math.round((2_200_000 * 2) / 5 / 12));
    expect((await depreciationOfMonth(db, "2026-11")).won).toBeGreaterThan(0);

    await cancelExpense(db, manager(), x.id, "업체 바꿈", now);
    const left = await db.select().from(fixture).where(eq(fixture.name, "전동 샌더"));
    expect(left).toHaveLength(0);
    const [still] = await db.select().from(equipment).where(eq(equipment.id, eq1.id));
    expect(still).toMatchObject({ status: "in_use", expenseId: null });
  });

  it("관리자 정/부: 같은 사람 안 됨, 정이 휴가면 알림은 부에게", async () => {
    const f = await registerFixture(db, acct(), { name: "노트북", category: "it", spec: "", purchasedOn: "2026-11-01", priceWon: 900_000, location: "사무실", holderId: "", warrantyUntil: "", supplierId: "", expenseRef: "", note: "" }, now);
    await expect(setManagers(db, acct(), "fixture", f.id, ids.account, ids.account, now)).rejects.toThrow(/다른 사람/);
    await setManagers(db, acct(), "fixture", f.id, ids.tech1, ids.account, now);
    const a = await assetView(db, "fixture", f.id);
    expect(await managerToNotify(db, a, "2026-11-20")).toBe(ids.tech1);
    await db.insert(approvalDoc).values({ docNo: "LV-1", formCode: LEAVE_FORM, title: "연차", status: "confirmed", drafterId: ids.tech1, steps: [], data: { fromDate: "2026-11-19", toDate: "2026-11-21" } });
    expect(await managerToNotify(db, a, "2026-11-20")).toBe(ids.account);
    expect(await managerToNotify(db, a, "2026-11-22")).toBe(ids.tech1);
  });

  it("설비 수리·유지 결의에서 대상을 고르면 수리 이력이 남고, 자본적 지출은 취득가에 더해진다", async () => {
    const f = await registerFixture(db, acct(), { name: "판금 공구 세트", category: "tool", spec: "", purchasedOn: "2026-01-05", priceWon: 6_000_000, location: "공구함 1", holderId: "", warrantyUntil: "", supplierId: "", expenseRef: "", note: "" }, now);
    const before = await assetDep(db, await assetView(db, "fixture", f.id), 2026);
    await createExpense(db, manager(), base({ category: "repair", purpose: "공구 세트 오버홀", supplyWon: 1_000_000, vatWon: 100_000, repairTarget: `fixture:${f.id}`, repairCapital: true }), now);
    const reps = await listRepairs(db, "fixture", f.id);
    expect(reps).toHaveLength(1);
    expect(reps[0].r).toMatchObject({ costWon: 1_000_000, capital: true });
    const after = await assetDep(db, await assetView(db, "fixture", f.id), 2026);
    expect(after.cost).toBe(before.cost + 1_000_000);
  });

  it("유상 임차 장비: 상각 안 하고, 사용료 결의 화면이 채워지며, 결의하면 낸 달이 적힌다", async () => {
    const f = await registerFixture(db, acct(), { name: "도막 측정기(렌탈)", category: "tool", spec: "", purchasedOn: "2026-09-10", priceWon: 0, location: "검사대", holderId: "", warrantyUntil: "", supplierId: "", expenseRef: "", note: "" }, now);
    await expect(saveFinance(db, acct(), "fixture", f.id, { ownership: "lease", depMethod: "sl", usefulYears: 5, depStartOn: "", contract: { party: "렌탈사", start: "2026-09-10", feeWon: 0, repairBy: "owner" } }, now)).rejects.toThrow(/월 사용료/);
    await saveFinance(db, acct(), "fixture", f.id, { ownership: "lease", depMethod: "sl", usefulYears: 5, depStartOn: "", contract: { party: "렌탈사", start: "2026-09-10", end: "2026-12-31", feeWon: 50_000, payDay: 10, repairBy: "owner" } }, now);
    const a = await assetView(db, "fixture", f.id);
    expect(a.depMethod).toBe("none");
    const pre = await leaseFeePrefill(db, "fixture", f.id, "2026-11-12");
    expect(pre).toMatchObject({ supply: 150_000, months: ["2026-09", "2026-10", "2026-11"] });
    const todos = await assetTodos(db, acct(), "2026-11-12");
    expect(todos.some((t) => t.key.startsWith(`asset-fee-${f.id}`))).toBe(true);
    expect(todos.some((t) => t.key === `asset-contract-${f.id}`)).toBe(true);
    await createExpense(db, acct(), base({ category: "rent", payeeName: "렌탈사", purpose: pre!.purpose, supplyWon: 150_000, vatWon: 15_000, lease: `fixture:${f.id}`, leaseYm: "2026-11" }), now);
    expect((await assetView(db, "fixture", f.id)).feeBilledYm).toBe("2026-11");
    expect(await leaseFeePrefill(db, "fixture", f.id, "2026-11-12")).toBeNull();
    void owner;
  });
});
