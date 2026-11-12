// 보험 청구(STD-03 6절): 접수 확인 → 손해사정 요청 → 승인 범위(미승인분 합의) → 출고 뒤 청구 → 입금(감액 사유)
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { estimateLine, payment, repairOrder } from "@/db/schema";
import { dayTotals } from "@/modules/money/close";
import { receiptView } from "@/modules/money/receipts";
import { claimTodos, claimView, markRequested, recordPayment, saveClaimInfo, saveScope, submitClaim } from "@/modules/repair/claims";
import { claimDeadlines, splitClaim } from "@/modules/repair/claim-rules";
import { getEstimate } from "@/modules/repair/estimate";
import { approvedRepair } from "./flow";
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
const now = new Date("2026-11-09T01:00:00Z");

describe("보험 청구 규칙", () => {
  it("보험사 몫 = 손해사정 − 자기부담금, 고객 몫 = 일반 + 자기부담금 + 합의 미승인분, 나머지는 손실", () => {
    expect(splitClaim({ insuranceWon: 1_000_000, generalWon: 50_000, adjustedWon: 900_000, deductibleWon: 200_000, customerExtraWon: 30_000 })).toEqual({ adjusted: 900_000, insurerDue: 700_000, customerDue: 280_000, unapproved: 100_000, shopLoss: 70_000 });
    expect(splitClaim({ insuranceWon: 300_000, generalWon: 0, adjustedWon: null, deductibleWon: 500_000, customerExtraWon: 0 }).insurerDue).toBe(0);
    // 금요일 입고 → 다음 영업일 월요일, 출고 후 3영업일
    expect(claimDeadlines({ inDate: "2026-11-13", deliveredDate: "2026-11-13", claimedDate: "2026-11-13" })).toEqual({ requestBy: "2026-11-16", claimBy: "2026-11-18", dunFrom: "2026-12-13" });
  });
});

describe("보험 청구 흐름", () => {
  it("자비 건은 막고, 보험 건은 단계 순서·서류·과다 청구·감액 사유를 지킨다", async () => {
    const advisor = { id: ids.advisor, roles: ["advisor" as const] };
    const acct = { id: ids.account, roles: ["accounting" as const] };
    const { roId, estimateId } = await approvedRepair(db, ids, now);
    await expect(saveClaimInfo(db, advisor, roId, { insurer: "가나화재", claimNo: "1", coverage: "own", faultPct: null, deductibleWon: 0, adjusterName: "", adjusterPhone: "" }, now)).rejects.toThrow(/자비/);

    // 보험 건으로 바꾸고 견적 줄 일부를 보험으로
    await db.update(repairOrder).set({ insurance: "own", insurer: "가나화재", claimNo: "2611-1" }).where(eq(repairOrder.id, roId));
    const e = await getEstimate(db, estimateId);
    for (const l of e.lines.filter((x) => x.category !== "etc")) await db.update(estimateLine).set({ payer: "insurance" }).where(eq(estimateLine.id, l.id));
    let v = await claimView(db, roId);
    expect(v.status).toBe("none");
    expect(v.amounts.insuranceWon).toBeGreaterThan(0);
    expect((await claimTodos(db, now)).map((t) => t.kind)).toEqual(["info"]);

    await expect(markRequested(db, advisor, roId, "보냄", now)).rejects.toThrow(/1단계/);
    await expect(saveClaimInfo(db, advisor, roId, { insurer: "가나화재", claimNo: "2611-1", coverage: "own", faultPct: 30, deductibleWon: null, adjusterName: "", adjusterPhone: "" }, now)).rejects.toThrow(/자기부담금/);
    await saveClaimInfo(db, advisor, roId, { insurer: "가나화재", claimNo: "2611-1", coverage: "own", faultPct: 30, deductibleWon: 200_000, adjusterName: "김사정", adjusterPhone: "010-1111-2222" }, now);
    v = await claimView(db, roId);
    expect(v.claim!.docNo).toBe("CH-2611-0001");
    await expect(saveScope(db, advisor, roId, { adjustedWon: 1, customerExtraWon: 0, agreed: false, note: "" }, now)).rejects.toThrow(/2단계/);
    await markRequested(db, advisor, roId, "사진 12장·견적 전송", now);

    const ins = v.amounts.insuranceWon;
    await expect(saveScope(db, advisor, roId, { adjustedWon: ins - 100_000, customerExtraWon: 50_000, agreed: false, note: "블렌딩 불인정" }, now)).rejects.toThrow(/합의/);
    await expect(saveScope(db, advisor, roId, { adjustedWon: ins - 100_000, customerExtraWon: 0, agreed: false, note: "" }, now)).rejects.toThrow(/이유/);
    await saveScope(db, advisor, roId, { adjustedWon: ins - 100_000, customerExtraWon: 50_000, agreed: true, note: "블렌딩 불인정" }, now);
    v = await claimView(db, roId);
    expect(v.amounts.insurerDue).toBe(ins - 300_000);
    expect(v.amounts.customerDue).toBe(v.amounts.generalWon + 250_000);
    expect(v.amounts.shopLoss).toBe(50_000);

    // 출고 전에는 청구 불가
    await expect(submitClaim(db, advisor, roId, { claimedWon: null, docs: ["bill", "statement", "photos", "parts"] }, now)).rejects.toThrow(/출고/);
    await db.update(repairOrder).set({ status: "delivered" }).where(eq(repairOrder.id, roId));
    await expect(submitClaim(db, advisor, roId, { claimedWon: null, docs: ["bill"] }, now)).rejects.toThrow(/서류 3가지/);
    await expect(submitClaim(db, advisor, roId, { claimedWon: ins, docs: ["bill", "statement", "photos", "parts"] }, now)).rejects.toThrow(/과다 청구/);
    await submitClaim(db, advisor, roId, { claimedWon: null, docs: ["bill", "statement", "photos", "parts"] }, now);
    v = await claimView(db, roId);
    expect(v.claim!.claimedWon).toBe(ins - 300_000);

    await expect(recordPayment(db, advisor, roId, { paidOn: "2026-11-09", paidWon: 1, cutReason: "" }, now)).rejects.toThrow(/회계/);
    await expect(recordPayment(db, acct, roId, { paidOn: "2026-11-09", paidWon: ins - 310_000, cutReason: "" }, now)).rejects.toThrow(/감액 사유/);
    // 30일 지나면 회계 독촉 할 일
    expect((await claimTodos(db, new Date("2026-12-10T01:00:00Z"))).map((t) => t.kind)).toEqual(["dun"]);
    const voucher = await recordPayment(db, acct, roId, { paidOn: "2026-11-09", paidWon: ins - 310_000, cutReason: "공임 시간 차이" }, now);
    v = await claimView(db, roId);
    expect([v.status, v.claim!.cutWon]).toEqual(["paid", 10_000]);
    // 입금 확인과 함께 보험사 입금 전표(PM)가 남고, 고객 받은 돈에는 섞이지 않는다
    const [pm] = await db.select().from(payment).where(eq(payment.docNo, voucher));
    expect([pm.payer, pm.method, pm.amountWon, pm.receivedOn]).toEqual(["insurer", "transfer", ins - 310_000, "2026-11-09"]);
    expect((await receiptView(db, roId)).paid).toBe(0);
    expect((await dayTotals(db, "2026-11-09")).insurer).toBe(ins - 310_000);
    expect(await claimTodos(db, now)).toEqual([]);
  });
});
