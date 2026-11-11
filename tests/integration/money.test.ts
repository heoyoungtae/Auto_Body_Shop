// 회계(STD-12): 수납·취소 전표·미수, 지출 결의(근거 전표·전결·증빙·확인 계좌), 일일·월 마감과 잠금
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import {
  approvalDoc,
  payment,
  purchaseOrder,
  repairOrder,
  repairStatement,
} from "@/db/schema";
import { act } from "@/modules/approval/service";
import { listPayables, supplierLedger } from "@/modules/money/payable";
import { myTodos } from "@/modules/dashboard/todo";
import {
  closeDay,
  decideMonth,
  monthSummary,
  prepareMonth,
} from "@/modules/money/close";
import {
  attachEvidence,
  cancelExpense,
  createExpense,
  expenseSources,
  getExpense,
  payables,
  payExpense,
  type ExpenseInput,
} from "@/modules/money/expense";
import {
  customerReceivables,
  receiptView,
  recordPayment,
  reversePayment,
} from "@/modules/money/receipts";
import {
  evidenceWarning,
  receiptProblem,
  vatProblem,
} from "@/modules/money/rules";
import {
  createSupplier,
  setSupplierBank,
  verifySupplierBank,
} from "@/modules/purchase/supplier";
import { approvedRepair, PNG } from "./flow";
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
const now = new Date("2026-11-10T01:00:00Z"); // 서울 2026-11-10
const owner = () => ({ id: ids.owner, roles: ["owner" as const] });
const manager = () => ({ id: ids.manager, roles: ["plant_manager" as const] });
const advisor = () => ({ id: ids.advisor, roles: ["advisor" as const] });
const acct = () => ({ id: ids.account, roles: ["accounting" as const] });
const tech = () => ({ id: ids.tech1, roles: ["technician" as const] });

async function delivered(total: number, method = "card") {
  const { roId, estimateId } = await approvedRepair(db, ids, now);
  await db
    .insert(repairStatement)
    .values({
      docNo: `IV-${roId.slice(0, 6)}`,
      repairOrderId: roId,
      estimateId,
      partsWon: 0,
      laborWon: total,
      vatWon: 0,
      totalWon: total,
      issuedOn: "2026-11-10",
      payMethod: method,
      deliveredAt: now,
    });
  await db
    .update(repairOrder)
    .set({ status: "delivered" })
    .where(eq(repairOrder.id, roId));
  return roId;
}

const pay = (
  amountWon: number,
  over: Partial<Parameters<typeof recordPayment>[3]> = {},
) => ({
  method: "card",
  amountWon,
  receivedOn: "2026-11-10",
  receiptKind: "card_slip",
  receiptNo: "",
  payerName: "",
  note: "",
  ...over,
});

describe("회계 규칙", () => {
  it("증빙·부가세", () => {
    expect(receiptProblem("cash", "none", 150_000, "")).toMatch(/현금영수증/);
    expect(receiptProblem("cash", "none", 50_000, "")).toBeNull();
    expect(receiptProblem("card", "cash_receipt", 10, "1")).toMatch(
      /카드 전표/,
    );
    expect(receiptProblem("transfer", "cash_receipt", 200_000, "")).toMatch(
      /승인 번호/,
    );
    expect(vatProblem(100_000, 10_000)).toBeNull();
    expect(vatProblem(100_000, 0)).toBeNull();
    expect(vatProblem(100_000, 9_000)).toMatch(/10%/);
    expect(evidenceWarning("receipt", 50_000)).toMatch(/가산세/);
    expect(evidenceWarning("receipt", 30_000)).toBeNull();
  });
});

describe("수납", () => {
  it("받을 금액은 명세서에서, 넘게 받지 않고, 취소 전표로만 고친다", async () => {
    const roId = await delivered(330_000);
    let v = await receiptView(db, roId);
    expect(v.due.due).toBe(330_000);
    expect(v.deliveredMethod).toBe("card");
    expect(
      (await myTodos(db, advisor(), now)).some(
        (t) => t.key === `pm-rec-${roId}`,
      ),
    ).toBe(true);

    await expect(
      recordPayment(db, tech(), roId, pay(1000), now),
    ).rejects.toThrow(/상담원/);
    await expect(
      recordPayment(db, advisor(), roId, pay(400_000), now),
    ).rejects.toThrow(/남은 금액/);
    await expect(
      recordPayment(
        db,
        advisor(),
        roId,
        pay(200_000, { method: "cash", receiptKind: "none" }),
        now,
      ),
    ).rejects.toThrow(/현금영수증/);
    const a = await recordPayment(db, advisor(), roId, pay(300_000), now);
    expect(a.docNo).toBe("PM-2611-0001");
    expect(a.remain).toBe(30_000);
    expect((await customerReceivables(db, now)).map((r) => r.remain)).toEqual([
      30_000,
    ]);

    await expect(reversePayment(db, advisor(), a.id, "", now)).rejects.toThrow(
      /사유/,
    );
    await reversePayment(db, advisor(), a.id, "금액 잘못 적음", now);
    await expect(
      reversePayment(db, advisor(), a.id, "또", now),
    ).rejects.toThrow(/이미/);
    v = await receiptView(db, roId);
    expect(v.paid).toBe(0);
    expect(v.payments.find((p) => p.id === a.id)!.reversed).toBe(true);
    await recordPayment(db, advisor(), roId, pay(330_000), now);
    expect(await customerReceivables(db, now)).toEqual([]);
    // 원래 전표는 그대로 남는다
    expect(
      (
        await db.select().from(payment).where(eq(payment.repairOrderId, roId))
      ).map((p) => p.amountWon),
    ).toEqual([300_000, -300_000, 330_000]);
  });

  it("일일 마감: 차이는 사유가 있어야 하고, 마감한 날에는 전표를 넣지 않는다", async () => {
    const roId = await delivered(500_000);
    await recordPayment(db, advisor(), roId, pay(200_000), now);
    await recordPayment(
      db,
      advisor(),
      roId,
      pay(100_000, {
        method: "cash",
        receiptKind: "cash_receipt",
        receiptNo: "C-1",
      }),
      now,
    );
    await expect(
      closeDay(
        db,
        advisor(),
        "2026-11-10",
        { cardTerminalWon: 200_000, cashCountedWon: 90_000, note: "" },
        now,
      ),
    ).rejects.toThrow(/차이/);
    await closeDay(
      db,
      advisor(),
      "2026-11-10",
      {
        cardTerminalWon: 200_000,
        cashCountedWon: 90_000,
        note: "거스름돈 잘못 줌",
      },
      now,
    );
    await expect(
      closeDay(
        db,
        advisor(),
        "2026-11-10",
        { cardTerminalWon: 0, cashCountedWon: 0, note: "" },
        now,
      ),
    ).rejects.toThrow(/이미/);
    await expect(
      recordPayment(db, advisor(), roId, pay(10_000), now),
    ).rejects.toThrow(/일일 마감/);
    // 다음 날은 적을 수 있다
    const later = new Date("2026-11-11T01:00:00Z");
    await recordPayment(
      db,
      advisor(),
      roId,
      pay(10_000, { receivedOn: "2026-11-11" }),
      later,
    );
  });
});

describe("지출 결의", () => {
  async function supplierWithBank(verified: boolean) {
    const id = await createSupplier(
      db,
      manager(),
      {
        name: "한빛도료",
        bizNo: "",
        kinds: ["paint"],
        items: "",
        contactName: "",
        phone: "",
        email: "",
        leadDays: 2,
        returnTerms: "",
        docs: [],
        note: "",
      },
      now,
    );
    await setSupplierBank(
      db,
      acct(),
      id,
      { bankName: "KB국민", accountNo: "123-456-789012", holder: "한빛도료" },
      now,
    );
    if (verified)
      await verifySupplierBank(db, owner(), id, "대표 번호로 전화 확인", now);
    return id;
  }
  const base = (over: Partial<ExpenseInput> = {}): ExpenseInput => ({
    category: "paint",
    supplierId: "",
    payeeName: "",
    sourceKind: "none",
    sourceId: "",
    purpose: "",
    supplyWon: 200_000,
    vatWon: 20_000,
    evidenceKind: "tax_invoice",
    evidenceNo: "TI-1",
    evidenceOn: "2026-11-09",
    dueOn: "",
    payMethod: "transfer",
    files: [],
    ...over,
  });

  it("입고 끝난 발주서는 외상매입금이 되고, 업체별 지급 결의는 합계와 같아야 하며, 승인·증빙·확인 계좌가 있어야 지급한다", async () => {
    const sid = await supplierWithBank(false);
    const [po] = await db
      .insert(purchaseOrder)
      .values({
        docNo: "PO-2611-0009",
        kind: "stock",
        supplierId: sid,
        status: "received",
        supplyWon: 200_000,
        totalWon: 220_000,
        receivedAt: now,
        createdBy: ids.manager,
      })
      .returning();
    const src = (await expenseSources(db)).find((s) => s.id === sid)!;
    expect(src).toMatchObject({
      kind: "settle",
      remainWon: 220_000,
      category: "consumable",
      supplierName: "한빛도료",
    });
    // 입고 2026-11-10, 결제 조건 기본 익월 말 → 12-31(목)
    const [pb] = await listPayables(db, sid);
    expect(pb).toMatchObject({ kind: "trade", accruedOn: "2026-11-10", dueOn: "2026-12-31", amountWon: 220_000, status: "open" });
    expect((await payables(db))[0]).toMatchObject({
      name: "한빛도료",
      toDraft: 220_000,
      toPay: 0,
    });

    await expect(createExpense(db, tech(), base(), now)).rejects.toThrow(
      /공장장/,
    );
    await expect(
      createExpense(
        db,
        manager(),
        base({
          sourceKind: "settle",
          sourceId: sid,
          supplyWon: 300_000,
          vatWon: 30_000,
        }),
        now,
      ),
    ).rejects.toThrow(/합계는 220,000원/);
    await expect(
      createExpense(db, manager(), base({ sourceKind: "po", sourceId: po.id }), now),
    ).rejects.toThrow(/외상매입금·미지급금/);
    await expect(
      createExpense(
        db,
        manager(),
        base({ supplyWon: 100_000, vatWon: 10_000 }),
        now,
      ),
    ).rejects.toThrow(/용도/);
    const x = await createExpense(
      db,
      manager(),
      base({
        sourceKind: "settle",
        sourceId: sid,
        evidenceKind: "pending",
        evidenceNo: "",
        evidenceOn: "",
      }),
      now,
    );
    expect(x.docNo).toBe("EX-2611-0001");
    // 22만 원 → 전결 규정상 대표(30만 원 초과 아님 → 공장장 본인 결의는 위로)
    const [doc] = await db
      .select()
      .from(approvalDoc)
      .where(eq(approvalDoc.id, x.approvalDocId));
    expect(doc.status).toBe("in_progress");
    expect(x.docNo).toMatch(/^EX-/);
    expect((await listPayables(db, sid))[0].status).toBe("in_progress");
    // 이미 묶인 외상은 다시 결의하지 않는다
    await expect(
      createExpense(db, manager(), base({ sourceKind: "settle", sourceId: sid }), now),
    ).rejects.toThrow(/없습니다/);
    expect((await getExpense(db, acct(), x.id)).e.dueOn).toBe("2026-12-31");
    await expect(
      payExpense(db, acct(), x.id, { paidOn: "2026-11-10", note: "" }, now),
    ).rejects.toThrow(/승인/);

    const approver = (
      doc.steps as { kind: string; candidates: string[] }[]
    ).find((s) => s.kind === "approve")!.candidates[0];
    await act(db, x.approvalDocId, approver, "approve", null, now);
    expect((await getExpense(db, acct(), x.id)).status).toBe("approved");
    expect(
      (await myTodos(db, acct(), now)).some((t) => t.key === `exp-pay-${x.id}`),
    ).toBe(true);
    await expect(
      payExpense(db, acct(), x.id, { paidOn: "2026-11-10", note: "" }, now),
    ).rejects.toThrow(/증빙/);
    await attachEvidence(
      db,
      manager(),
      x.id,
      {
        evidenceKind: "tax_invoice",
        evidenceNo: "",
        evidenceOn: "2026-11-10",
        files: [{ name: "계산서.png", bytes: PNG }],
      },
      now,
    );
    await expect(
      payExpense(db, acct(), x.id, { paidOn: "2026-11-10", note: "" }, now),
    ).rejects.toThrow(/확인하지 않았습니다/);
    await verifySupplierBank(db, owner(), sid, "대표 번호로 전화 확인", now);
    await payExpense(db, acct(), x.id, { paidOn: "2026-11-10", note: "" }, now);
    const g = await getExpense(db, acct(), x.id);
    expect(g.status).toBe("paid");
    expect(g.e.paidTo).toBe("KB국민 123*****9012 한빛도료");
    expect(g.e.files).toHaveLength(1);
    await expect(cancelExpense(db, acct(), x.id, "잘못", now)).rejects.toThrow(
      /지급한/,
    );
    expect(await expenseSources(db)).toEqual([]);
    expect((await listPayables(db, sid))[0]).toMatchObject({ status: "paid", paidOn: "2026-11-10" });
    const led = await supplierLedger(db, sid, now);
    expect(led!.balance).toBe(0);
    expect(led!.ledger.map((l) => [l.plus, l.minus])).toEqual([
      [0, 220_000],
      [220_000, 0],
    ]);
  });

  it("근거 전표 없는 결의, 회수·취소, 지급 결의의 계산서 번호는 발주서에 붙고, 결의를 취소하면 외상이 풀린다", async () => {
    const x = await createExpense(
      db,
      acct(),
      base({
        category: "rent",
        payeeName: "건물주",
        purpose: "11월 임차료",
        payMethod: "transfer",
        evidenceKind: "bill",
        evidenceNo: "계약서",
      }),
      now,
    );
    await cancelExpense(db, acct(), x.id, "중복", now);
    expect((await getExpense(db, acct(), x.id)).status).toBe("cancelled");
    const [doc] = await db
      .select()
      .from(approvalDoc)
      .where(eq(approvalDoc.id, x.approvalDocId));
    expect(doc.status).toBe("discarded");

    const sid = await supplierWithBank(true);
    const [po] = await db
      .insert(purchaseOrder)
      .values({
        docNo: "PO-2611-0010",
        kind: "repair",
        supplierId: sid,
        status: "received",
        supplyWon: 100_000,
        totalWon: 110_000,
        receivedAt: now,
      })
      .returning();
    const y = await createExpense(
      db,
      acct(),
      base({
        sourceKind: "settle",
        sourceId: sid,
        supplyWon: 100_000,
        vatWon: 10_000,
        evidenceNo: "2611-777",
        evidenceOn: "2026-11-10",
      }),
      now,
    );
    expect((await getExpense(db, acct(), y.id)).settled.map((p) => p.sourceNo)).toEqual(["PO-2611-0010"]);
    const [after] = await db
      .select()
      .from(purchaseOrder)
      .where(eq(purchaseOrder.id, po.id));
    expect(after.invoiceNo).toBe("2611-777");
    await cancelExpense(db, acct(), y.id, "금액 확인", now);
    expect((await listPayables(db, sid))[0]).toMatchObject({ status: "open", invoiceNo: "2611-777" });
    expect((await expenseSources(db)).map((x) => x.id)).toEqual([sid]);
  });
});

describe("월 마감", () => {
  it("일일 마감이 다 돼야 올리고, 대표가 승인하면 그 달 날짜로는 적지 않는다", async () => {
    const roId = await delivered(100_000);
    const oct = new Date("2026-10-20T01:00:00Z");
    await db
      .update(repairStatement)
      .set({ issuedOn: "2026-10-20" })
      .where(eq(repairStatement.repairOrderId, roId));
    await recordPayment(
      db,
      advisor(),
      roId,
      pay(60_000, { receivedOn: "2026-10-20" }),
      oct,
    );
    await expect(prepareMonth(db, acct(), "2026-11", "", now)).rejects.toThrow(
      /끝나지/,
    );
    await expect(prepareMonth(db, acct(), "2026-10", "", now)).rejects.toThrow(
      /2026-10-20/,
    );
    await closeDay(
      db,
      advisor(),
      "2026-10-20",
      { cardTerminalWon: 60_000, cashCountedWon: 0, note: "" },
      now,
    );
    const s = await monthSummary(db, "2026-10");
    expect(s.sales).toMatchObject({ count: 1, total: 100_000 });
    expect(s.collected.card).toBe(60_000);
    expect(s.receivables.customer).toBe(40_000);
    await prepareMonth(db, acct(), "2026-10", "", now);
    await expect(prepareMonth(db, acct(), "2026-10", "", now)).rejects.toThrow(
      /이미/,
    );
    await expect(
      decideMonth(db, acct(), "2026-10", true, "", now),
    ).rejects.toThrow(/대표/);
    await expect(
      decideMonth(db, owner(), "2026-10", false, "", now),
    ).rejects.toThrow(/이유/);
    await decideMonth(db, owner(), "2026-10", true, "", now);
    await expect(
      recordPayment(
        db,
        advisor(),
        roId,
        pay(10_000, { receivedOn: "2026-10-31" }),
        now,
      ),
    ).rejects.toThrow(/월 마감/);
  });
});
