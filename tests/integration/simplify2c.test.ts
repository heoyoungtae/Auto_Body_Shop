// 간소화 2차 3묶음(대표 2026-11-24 "1~3묶음 전부"): 켜면 줄어들고, 끄면 표준 절차 그대로
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import * as schema from "@/db/schema";
import type { PolicyKey } from "@/modules/platform/policy";
import { linkHidden } from "@/modules/platform/features";
import { getNc, openNc, quickCloseNc } from "@/modules/quality/nc";
import { dismissRevisionTraining, revisionsNeedingTraining } from "@/modules/quality/std";
import { createSupplier, decideSupplier, evaluateInitial } from "@/modules/purchase/supplier";
import { saveOrderHeader, saveOrderLine, getOrder, submitOrder } from "@/modules/purchase/order";
import { draftRecurring, listRecurring, saveRecurring } from "@/modules/money/recurring";
import { getDoc } from "@/modules/approval/service";
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
const now = new Date("2026-11-09T01:00:00Z"); // 서울 2026-11-09(월)
const turnOn = (key: PolicyKey) => db.insert(schema.policySetting).values({ key, value: 1, effectiveFrom: "2000-01-02", reason: "시험: 간소화 켬", changedBy: ids.owner });
const owner = () => ({ id: ids.owner, roles: ["owner" as const] });
const mgr = () => ({ id: ids.manager, roles: ["plant_manager" as const] });
const tech = () => ({ id: ids.tech1, roles: ["technician" as const] });
const quality = () => ({ id: ids.quality, roles: ["quality" as const] });
const acct = () => ({ id: ids.account, roles: ["accounting" as const] });

describe("3-1 가벼운 부적합 수정으로 끝", () => {
  it("켜면 한 번에 종결, 중대·고객 불만·같은 유형 3번째는 정식 절차, 끄면 막는다", async () => {
    const a = await openNc(db, tech(), { source: "other", content: "도료 보관함 문 열림" }, now);
    await expect(quickCloseNc(db, quality(), a.id, { rootCause: "person", actionDone: "닫음" }, now)).rejects.toThrow(/꺼져/);
    await turnOn("simple.nc_quick");
    await expect(quickCloseNc(db, quality(), a.id, { rootCause: "person", actionDone: "" }, now)).rejects.toThrow(/고쳤는지/);
    await quickCloseNc(db, quality(), a.id, { rootCause: "person", actionDone: "문을 닫고 잠금 확인" }, now);
    const { n } = await getNc(db, a.id);
    expect(n).toMatchObject({ status: "closed", recurred: false, actionDone: "문을 닫고 잠금 확인" });
    const major = await openNc(db, tech(), { source: "other", content: "x", major: true }, now);
    await expect(quickCloseNc(db, quality(), major.id, { rootCause: "person", actionDone: "y" }, now)).rejects.toThrow(/중대/);
    const comp = await openNc(db, tech(), { source: "complaint", content: "x" }, now);
    await expect(quickCloseNc(db, quality(), comp.id, { rootCause: "person", actionDone: "y" }, now)).rejects.toThrow(/고객 불만/);
    // 'other'가 90일 안에 3번째(a, major, 이번)
    const third = await openNc(db, tech(), { source: "other", content: "z" }, now);
    await expect(quickCloseNc(db, quality(), third.id, { rootCause: "person", actionDone: "y" }, now)).rejects.toThrow(/90일/);
  });
});

describe("3-5 고객 승인 견적 부품 발주", () => {
  it("켜면 견적 안의 발주는 바로 승인, 단가가 견적을 넘으면 승인 요청", async () => {
    await turnOn("simple.po_from_estimate");
    const { roId } = await approvedRepair(db, ids, now);
    const [po] = await db.select().from(schema.purchaseOrder).where(eq(schema.purchaseOrder.repairOrderId, roId));
    const sup = await createSupplier(db, mgr(), { name: "대한부품", bizNo: "", kinds: ["parts"], items: "", contactName: "", phone: "", email: "", leadDays: 2, returnTerms: "", docs: ["biz", "price"], note: "" }, now);
    await evaluateInitial(db, mgr(), sup, { scores: { quality: 25, delivery: 20, price: 15, docs: 15, safety: 8 }, note: "" }, now);
    await decideSupplier(db, owner(), sup, true, "", now);
    await saveOrderHeader(db, mgr(), po.id, { supplierId: sup, dueOn: "2026-11-12", note: "" }, now);
    const g = await getOrder(db, po.id);
    // 견적 단가(18만 원) 안에서 사 온다
    for (const l of g.lines) await saveOrderLine(db, mgr(), po.id, l.id, { name: l.name, partNo: l.partNo ?? "", partCode: l.partCode, qty: l.qty, unitWon: 150_000 });
    expect(await submitOrder(db, mgr(), po.id, false, now)).toBe("estimate");
    expect((await getOrder(db, po.id)).o.status).toBe("approved");
  });
});

describe("3-4 정기 결의", () => {
  it("대표 등록 → 매달 한 번, 20% 안이면 대표 결재 갈음, 같은 달 두 번은 막음", async () => {
    await turnOn("simple.recurring_expense");
    await expect(saveRecurring(db, acct(), { category: "rent", supplierId: "", payeeName: "건물주", purpose: "공장 임차료", supplyWon: 1_000_000, vatWon: 100_000, evidenceKind: "tax_invoice", payMethod: "transfer", day: 25 }, now)).rejects.toThrow(/대표/);
    const id = await saveRecurring(db, owner(), { category: "rent", supplierId: "", payeeName: "건물주", purpose: "공장 임차료", supplyWon: 1_000_000, vatWon: 100_000, evidenceKind: "tax_invoice", payMethod: "transfer", day: 25 }, now);
    const r = await draftRecurring(db, acct(), id, { supplyWon: null, vatWon: null, evidenceOn: "" }, now);
    expect(r.auto).toBeGreaterThan(0);
    const doc = await getDoc(db, r.approvalDocId);
    expect(doc.status).toBe("confirmed");
    await expect(draftRecurring(db, acct(), id, { supplyWon: null, vatWon: null, evidenceOn: "" }, now)).rejects.toThrow(/이미/);
    expect((await listRecurring(db))[0]).toMatchObject({ lastYm: "2026-11", lastWon: 1_100_000 });
    // 다음 달 금액이 크게 오르면 다시 결재
    const r2 = await draftRecurring(db, acct(), id, { supplyWon: 2_000_000, vatWon: 200_000, evidenceOn: "" }, new Date("2026-12-20T01:00:00Z"));
    expect(r2.auto).toBe(0);
    expect(r2.why).toMatch(/20%/);
  });
});

describe("3-7 기능 끄기: 조건 화면만 숨김", () => {
  it("?가 붙은 항목은 그 조건 링크만 숨긴다", () => {
    expect(linkHidden("/qms/docs?f=review", ["/qms/docs?f=review"])).toBe(true);
    expect(linkHidden("/qms/docs", ["/qms/docs?f=review"])).toBe(false);
    expect(linkHidden("/qms/docs/abc", ["/qms/docs?f=review"])).toBe(false);
  });
});

describe("3-8 표준서 개정 교육 한 번에 닫기", () => {
  it("닫은 날까지의 개정은 교육 할 일에서 빠진다", async () => {
    expect(await dismissRevisionTraining(db, owner(), now)).toBe((await revisionsNeedingTraining(db)).length);
    expect(await revisionsNeedingTraining(db)).toEqual([]);
    await expect(dismissRevisionTraining(db, tech(), now)).rejects.toThrow(/교육 계획/);
  });
});
