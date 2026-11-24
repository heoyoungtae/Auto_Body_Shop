// 간소화 2차(대표 2026-11-24 "1~3묶음 전부"): 켜면 줄어들고, 끄면 표준 절차 그대로
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { and, eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { consultation, notification, payment, policySetting, repairOrder, repairStatement } from "@/db/schema";
import type { PolicyKey } from "@/modules/platform/policy";
import { notifyRole } from "@/modules/platform/notify";
import { linkHidden, setFeature } from "@/modules/platform/features";
import { myTodos } from "@/modules/dashboard/todo";
import { deliver } from "@/modules/repair/inspect";
import { DELIVERY_NOTICES } from "@/modules/repair/inspect-rules";
import { createDraft, getDoc, submit } from "@/modules/approval/service";
import { createEstimate, getEstimate, saveEstimateHeader, saveLine, submitEstimate } from "@/modules/repair/estimate";
import { sendReminders } from "@/modules/customer/service";
import { approvedRepair, estimating, PNG } from "./flow";
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
const turnOn = (key: PolicyKey) => db.insert(policySetting).values({ key, value: 1, effectiveFrom: "2000-01-02", reason: "시험: 간소화 켬", changedBy: ids.owner });
const advisor = () => ({ id: ids.advisor, roles: ["advisor" as const] });
const owner = () => ({ id: ids.owner, roles: ["owner" as const] });

/** 출고 대기 수리 건(명세서 발급까지) */
async function ready(total: number) {
  const { roId, estimateId } = await approvedRepair(db, ids, now);
  await db.insert(repairStatement).values({ docNo: `IV-${roId.slice(0, 6)}`, repairOrderId: roId, estimateId, partsWon: 0, laborWon: total - Math.floor(total / 11), vatWon: Math.floor(total / 11), totalWon: total, issuedOn: "2026-11-09" });
  await db.update(repairOrder).set({ status: "ready" }).where(eq(repairOrder.id, roId));
  return roId;
}
const handover = (payMethod: string, extra: { receiptKind?: string; receiptNo?: string } = {}) => ({ payMethod, notices: Object.keys(DELIVERY_NOTICES), receiverName: "홍길동", proxy: false, proxyNote: "", signaturePng: PNG, ...extra });

describe("1-1 끈 기능의 할 일·알림도 멈춤", () => {
  it("꺼 둔 기능 화면으로 가는 알림·할 일은 만들지 않고, 다시 켜면 돌아온다", async () => {
    expect(linkHidden("/five-s/Z1?x=1", ["/five-s"])).toBe(true);
    expect(linkHidden("/five-sx", ["/five-s"])).toBe(false);
    expect(linkHidden("/equipment/lube", ["/equipment/lube"])).toBe(true);
    expect(linkHidden("/equipment/1", ["/equipment/lube"])).toBe(false);
    await setFeature(db, ids.owner, "tasks", false);
    await notifyRole(db, "plant_manager", "지시 확인", "t-1", "/tasks/abc");
    await notifyRole(db, "plant_manager", "다른 알림", "t-2", "/repairs/abc");
    const rows = await db.select().from(notification).where(eq(notification.userId, ids.manager));
    expect(rows.map((r) => r.title)).toEqual(["다른 알림"]);
    expect((await myTodos(db, { id: ids.manager, roles: ["plant_manager"] }, now)).some((t) => t.href.startsWith("/tasks"))).toBe(false);
    await setFeature(db, ids.owner, "tasks", true);
    await notifyRole(db, "plant_manager", "지시 확인", "t-1", "/tasks/abc");
    expect((await db.select().from(notification).where(eq(notification.userId, ids.manager))).length).toBe(2);
  });
});

describe("1-2 출고 때 입금 전표 자동", () => {
  it("켜면 카드 출고와 함께 남은 금액 입금 전표, 현금은 증빙을 확인하고, 끄면 따로 적는다", async () => {
    await turnOn("simple.deliver_payment");
    const a = await ready(330_000);
    const r = await deliver(db, advisor(), a, handover("card"), now);
    expect(r.payment?.amount).toBe(330_000);
    const [p] = await db.select().from(payment).where(eq(payment.repairOrderId, a));
    expect(p).toMatchObject({ method: "card", amountWon: 330_000, receiptKind: "card_slip" });

    const b = await ready(220_000);
    // 10만 원 이상 현금인데 발행 안 함 → 출고 전에 막음(출고도 안 됨)
    await expect(deliver(db, advisor(), b, handover("cash", { receiptKind: "none" }), now)).rejects.toThrow(/현금영수증/);
    expect((await db.select().from(repairOrder).where(eq(repairOrder.id, b)))[0].status).toBe("ready");
    const rb = await deliver(db, advisor(), b, handover("cash", { receiptKind: "cash_receipt", receiptNo: "123456789" }), now);
    expect(rb.payment?.amount).toBe(220_000);
    // 미수는 전표 없음
    const c = await ready(110_000);
    expect((await deliver(db, advisor(), c, handover("receivable"), now)).payment).toBeNull();
  });
  it("끄면 출고만 하고 입금 전표는 수납 화면에서 따로 적는다", async () => {
    const a = await ready(330_000);
    expect((await deliver(db, advisor(), a, handover("card"), now)).payment).toBeNull();
    expect(await db.select().from(payment).where(eq(payment.repairOrderId, a))).toEqual([]);
  });
});

describe("1-3 결재권자 본인 건 바로 승인", () => {
  it("대표가 올린 공문은 켜면 올리는 순간 확정(자기결재 표시 남음), 끄면 결재 대기", async () => {
    const d1 = await createDraft(db, { formCode: "F-Q-12", title: "공문 1", data: { body: "x" }, drafterId: ids.owner }, now);
    await submit(db, d1.id, ids.owner, now);
    expect((await getDoc(db, d1.id)).status).toBe("in_progress");
    await turnOn("simple.self_approve");
    const d2 = await createDraft(db, { formCode: "F-Q-12", title: "공문 2", data: { body: "x" }, drafterId: ids.owner }, now);
    await submit(db, d2.id, ids.owner, now);
    const g = await getDoc(db, d2.id);
    expect(g.status).toBe("confirmed");
    expect(g.flags).toContain("owner_self_approval");
    // 다른 사람이 올린 문서는 그대로 대표 결재를 기다린다
    const d3 = await createDraft(db, { formCode: "F-Q-12", title: "공문 3", data: { body: "x" }, drafterId: ids.advisor }, now);
    await submit(db, d3.id, ids.advisor, now);
    expect((await getDoc(db, d3.id)).status).toBe("in_progress");
  });
  it("대표가 올린 견적은 검토 끝으로 바로 넘어간다", async () => {
    await turnOn("simple.self_approve");
    const roId = await estimating(db, ids, now);
    const { id } = await createEstimate(db, advisor(), roId, now);
    const e = await getEstimate(db, id);
    for (const l of e.lines.filter((x) => x.category === "part")) await saveLine(db, advisor(), id, { id: l.id, payer: l.payer, category: "part", name: l.name, partCode: "D", partNo: "", qty: 1, unitWon: 180_000, laborMinutes: null, laborWon: null, note: "" }, now);
    await saveEstimateHeader(db, advisor(), id, { kind: e.kind, paintGrade: "metallic", dueDate: "2026-11-13", note: "", registeredOn: "2021-03-15" }, now);
    expect(await submitEstimate(db, owner(), id, now)).toBe("self");
    expect((await getEstimate(db, id)).status).toBe("approved");
  });
});

describe("1-5 예약 확인 직후 전날 안내 생략", () => {
  it("예약 확인을 보낸 지 2일이 안 됐으면 전날 안내를 보내지 않는다", async () => {
    const { roId } = await approvedRepair(db, ids, now);
    const [ro] = await db.select().from(repairOrder).where(eq(repairOrder.id, roId));
    const at = new Date("2026-11-10T01:00:00Z"); // 서울 11-10 10시 예약
    await db.update(consultation).set({ result: "reserved", reservedAt: at, confirmSentAt: new Date("2026-11-08T05:00:00Z"), reminderSentAt: null }).where(eq(consultation.id, ro.consultationId!));
    await turnOn("simple.reminder_skip");
    expect(await sendReminders(db, now, (async () => new Response("{}")) as typeof fetch)).toMatch(/생략 1건/);
    const [c] = await db.select().from(consultation).where(and(eq(consultation.id, ro.consultationId!)));
    expect(c.reminderSentAt).toBeNull();
  });
});
