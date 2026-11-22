// 업체 고객 외상(외상매출금)·거래처 청구서·업체 주문 앱(테크베이) — 대표 결정 2026-11-17
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { appConfig, bankTx, consultation, customer, portalOrder, repairOrder, repairStatement } from "@/db/schema";
import { billPayFromTx, candidatesFor } from "@/modules/bank/service";
import { consentState, createBusinessCustomer, updateBusiness, type BusinessInput } from "@/modules/customer/service";
import { myTodos } from "@/modules/dashboard/todo";
import { billView, cancelBill, createBill, creditAccounts, creditCheck, creditLedger, recordBillPayment, setBillInvoice } from "@/modules/money/credit";
import { billDueDate, creditWarnings, monthlyInvoiceDeadline, reachedSteps } from "@/modules/money/credit-rules";
import { customerReceivables } from "@/modules/money/receipts";
import { importTechbayOrders, markPortalStep, portalOrderView, techbayLogin, techbayOrders, techbayRequestCode, techbayStatus } from "@/modules/partner/service";
import { deliver } from "@/modules/repair/inspect";
import { DELIVERY_NOTICES } from "@/modules/repair/inspect-rules";
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
const now = new Date("2026-11-10T01:00:00Z"); // 서울 2026-11-10(화)
const owner = () => ({ id: ids.owner, roles: ["owner" as const] });
const advisor = () => ({ id: ids.advisor, roles: ["advisor" as const] });
const acct = () => ({ id: ids.account, roles: ["accounting" as const] });
const tech = () => ({ id: ids.tech1, roles: ["technician" as const] });

const biz = (over: Partial<BusinessInput> = {}): BusinessInput => ({
  bizNo: "220-81-62517",
  contactName: "김과장",
  taxEmail: "tax@example.com",
  payTerm: "next_day",
  payDay: 10,
  creditLimitWon: 1_000_000,
  invoiceMode: "monthly",
  portal: "none",
  portalUrl: "",
  portalNote: "",
  ...over,
});

/** 업체 고객의 출고 대기 수리 건(명세서 발급까지) */
async function readyBiz(total: number, at = now) {
  const { roId, estimateId } = await approvedRepair(db, ids, at);
  const [ro] = await db.select().from(repairOrder).where(eq(repairOrder.id, roId));
  const [c] = await db.select().from(customer).where(eq(customer.id, ro.customerId));
  if (c.kind !== "business") await updateBusiness(db, ids.advisor, c.id, "business", biz());
  await db.insert(repairStatement).values({ docNo: `IV-${roId.slice(0, 6)}`, repairOrderId: roId, estimateId, partsWon: 0, laborWon: total - Math.floor(total / 11), vatWon: Math.floor(total / 11), totalWon: total, issuedOn: "2026-11-10" });
  await db.update(repairOrder).set({ status: "ready" }).where(eq(repairOrder.id, roId));
  return { roId, customerId: c.id };
}
const handover = (payMethod: string, creditOk = false) => ({ payMethod, notices: Object.keys(DELIVERY_NOTICES), receiverName: "김과장", proxy: false, proxyNote: "", signaturePng: PNG, creditOk });

describe("업체 외상 규칙", () => {
  it("받을 날·세금계산서 기한·진행 단계·경고", () => {
    expect(billDueDate("2026-11", "2026-12-01", "next_day", 10)).toBe("2026-12-10");
    expect(billDueDate("2026-11", "2026-12-01", "next_end", null)).toBe("2026-12-31");
    expect(billDueDate("2026-11", "2026-12-03", "month_end", null)).toBe("2026-12-03"); // 이미 지난 날이면 청구한 날
    expect(monthlyInvoiceDeadline("2026-12")).toBe("2027-01-10");
    expect(reachedSteps("checked")).toEqual(["intake"]);
    expect(reachedSteps("working")).toEqual(["intake", "working"]);
    expect(reachedSteps("delivered")).toEqual(["intake", "working", "ready", "delivered"]);
    expect(creditWarnings({ limit: 100, balance: 50, overdue: 0, overdueDays: 0 }, 60)[0]).toMatch(/한도/);
    expect(creditWarnings({ limit: null, balance: 50, overdue: 30, overdueDays: 4 }, 60)[0]).toMatch(/4일/);
  });
});

describe("업체 고객", () => {
  it("바로 등록: 사업자번호 검증, 개인정보 동의 대상 아님", async () => {
    await expect(createBusinessCustomer(db, ids.advisor, { name: "○○렌터카", phone: "02-123-4567", memo: "", ...biz({ bizNo: "123-45-67890" }) })).rejects.toThrow(/사업자등록번호/);
    await expect(createBusinessCustomer(db, ids.advisor, { name: "○○렌터카", phone: "", memo: "", ...biz({ payTerm: "prepay" }) })).rejects.toThrow(/결제 조건/);
    const id = await createBusinessCustomer(db, ids.advisor, { name: "○○렌터카", phone: "02-123-4567", memo: "", ...biz() });
    const [c] = await db.select().from(customer).where(eq(customer.id, id));
    expect(c).toMatchObject({ kind: "business", bizNo: "220-81-62517", payTerm: "next_day", payDay: 10, creditLimitWon: 1_000_000 });
    expect((await consentState(db, id)).required).toBe(true);
    await expect(createBusinessCustomer(db, ids.advisor, { name: "중복", phone: "", memo: "", ...biz() })).rejects.toThrow(/같은 사업자번호/);
  });
});

describe("외상 출고 → 청구서 → 입금", () => {
  it("업체만 외상, 받을 날 자동, 한도·연체 경고, 30일 독촉 대신 청구", async () => {
    const a = await readyBiz(550_000);
    // 개인 고객은 외상 불가
    await updateBusiness(db, ids.advisor, a.customerId, "person", biz());
    await expect(deliver(db, advisor(), a.roId, handover("credit"), now)).rejects.toThrow(/업체 고객만/);
    await updateBusiness(db, ids.advisor, a.customerId, "business", biz());
    await deliver(db, advisor(), a.roId, handover("credit"), now);
    const [st] = await db.select().from(repairStatement).where(eq(repairStatement.repairOrderId, a.roId));
    expect(st.payMethod).toBe("credit");
    expect(st.creditDueOn).toBe("2026-12-10"); // 익월 10일(목)

    const chk = await creditCheck(db, a.customerId, 600_000, now);
    expect(chk.balance).toBe(550_000);
    expect(chk.warnings[0]).toMatch(/한도/);
    // 30일 미수 독촉에서 빠짐
    const ar = (await customerReceivables(db, new Date("2026-12-20T01:00:00Z"))).find((r) => r.roId === a.roId)!;
    expect(ar.credit).toBe(true);
    expect((await myTodos(db, acct(), new Date("2026-12-20T01:00:00Z"))).some((t) => t.key === `ar-dun-${a.roId}`)).toBe(false);

    const [ro1] = await db.select().from(repairOrder).where(eq(repairOrder.id, a.roId));
    expect(ro1.status).toBe("delivered");
  });

  it("청구서: 묶기·받을 날·세금계산서·입금 나눠 적기·통장 맞추기", async () => {
    const a = await readyBiz(330_000);
    await deliver(db, advisor(), a.roId, handover("credit"), now);
    // 12월 초 할 일: 청구서 만들기
    const dec2 = new Date("2026-12-02T01:00:00Z");
    expect((await myTodos(db, acct(), dec2)).some((t) => t.key.startsWith(`bill-make-${a.customerId}`))).toBe(true);
    const led = await creditLedger(db, a.customerId, dec2);
    expect(led.suggested).toHaveLength(1);
    await expect(createBill(db, advisor(), a.customerId, led.suggested, "", dec2)).rejects.toThrow(/회계 담당/);
    const b = await createBill(db, acct(), a.customerId, led.suggested, "입금 계좌 안내", dec2);
    expect(b.dueOn).toBe("2026-12-10");
    expect(b.total).toBe(330_000);
    await expect(createBill(db, acct(), a.customerId, led.suggested, "", dec2)).rejects.toThrow(/이미 청구서/);
    // 세금계산서 할 일 → 번호 적기
    expect((await myTodos(db, acct(), dec2)).some((t) => t.key === `bill-tax-${b.id}`)).toBe(true);
    await setBillInvoice(db, acct(), b.id, { no: "20261202-41000000-12345678", on: "2026-12-02" }, dec2);
    expect((await myTodos(db, acct(), dec2)).some((t) => t.key === `bill-tax-${b.id}`)).toBe(false);

    // 받을 날 지남 → 연체 할 일, 출고 경고
    const dec15 = new Date("2026-12-15T01:00:00Z");
    expect((await myTodos(db, owner(), dec15)).some((t) => t.key === `credit-late-${a.customerId}`)).toBe(true);
    expect((await creditCheck(db, a.customerId, 0, dec15)).warnings[0]).toMatch(/받을 날이 지난/);

    // 일부 입금(직접) + 나머지는 통장 입금에서
    await expect(recordBillPayment(db, tech(), b.id, { amountWon: 1, receivedOn: "2026-12-15", method: "transfer", payerName: "", note: "" }, dec15)).rejects.toThrow(/수납 권한/);
    await expect(recordBillPayment(db, acct(), b.id, { amountWon: 400_000, receivedOn: "2026-12-15", method: "transfer", payerName: "", note: "" }, dec15)).rejects.toThrow(/남은 금액/);
    await recordBillPayment(db, acct(), b.id, { amountWon: 100_000, receivedOn: "2026-12-15", method: "transfer", payerName: "", note: "" }, dec15);
    const [tx] = await db.insert(bankTx).values({ kind: "in", on: "2026-12-16", amountWon: 230_000, party: "홍길동", accountLabel: "기업 123", source: "manual", dedupeKey: "t1" }).returning();
    const cands = candidatesFor(tx as never, { used: new Set(), pays: [], exps: [], claims: [], ar: [], runs: [], pyb: [], sups: [], bills: [{ id: b.id, docNo: b.docNo, name: "홍길동", totalWon: 330_000, remain: 230_000, dueOn: b.dueOn }], today: "2026-12-16" } as never);
    expect(cands.some((c) => c.kind === "bill" && c.act === "bill")).toBe(true);
    const r = await billPayFromTx(db, acct(), tx.id, b.id, new Date("2026-12-16T01:00:00Z"));
    expect(r.remain).toBe(0);
    const v = await billView(db, b.id);
    expect(v.paid).toBe(330_000);
    expect(v.pays.every((p) => p.receiptKind === "tax_invoice" && p.billId === b.id)).toBe(true);
    const [linked] = await db.select().from(bankTx).where(eq(bankTx.id, tx.id));
    expect(linked.matchKind).toBe("bill");
    // 다 받으면 잔액 0, 연체 할 일 없음
    expect((await creditAccounts(db, dec15)).find((x) => x.c.id === a.customerId)?.balance).toBe(0);
    await expect(cancelBill(db, acct(), b.id, "잘못", dec15)).rejects.toThrow(/입금이 적힌/);
  });

  it("청구서 취소하면 다시 청구 안 함으로", async () => {
    const a = await readyBiz(110_000);
    await deliver(db, advisor(), a.roId, handover("credit"), now);
    const b = await createBill(db, acct(), a.customerId, (await creditLedger(db, a.customerId, now)).lines.map((l) => l.statementId), "", now);
    await cancelBill(db, acct(), b.id, "다시 묶음", now);
    const led = await creditLedger(db, a.customerId, now);
    expect(led.lines[0].billId).toBeNull();
    expect(led.summary.unbilled).toBe(110_000);
  });
});

describe("업체 주문 앱(테크베이)", () => {
  /** 테크베이 API 흉내: 인증번호 → 로그인(쿠키) → 입고완료 목록 → 상세 */
  function fakeTechbay() {
    const calls: string[] = [];
    const f = (async (url: string, init?: RequestInit) => {
      const u = String(url);
      calls.push(`${init?.method ?? "GET"} ${u.replace("https://car-purchase-api.prnd.co.kr/reconditioning", "")}`);
      const json = (body: unknown, headers: Record<string, string> = {}, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });
      if (u.endsWith("/phone_number_verifications/request/")) return json({ hash_id: "h1" });
      if (u.endsWith("/login/")) return json({ reconditioning_shop_name: "외관수리" }, { "Set-Cookie": "sessionid=abc; Path=/" });
      if (u.includes("/reconditioning_orders/?")) return json({ results: [{ hash_id: "ord1", requested_at: "2026-11-09T10:00:00" }, { hash_id: "ord2" }], next: null });
      if (u.includes("/reconditioning_orders/ord1/"))
        return json({ car: { car_number: "34나 5678", model_part_name: "현대 디 올 뉴 그랜저 (GN7) (22년~현재)", year: 2023, mileage: 21000, vin: "KMHL141CBPA123456", fuel: "gasoline", exterior_description: "흰색" }, groups: [{ type_display: "외판", items: [{ content: "앞범퍼 도색" }, { content: "운전석 문 덴트" }] }], memo: "광택 포함" });
      if (u.includes("/reconditioning_orders/ord2/")) return json({ car: { car_number: "" }, groups: [] });
      return json({}, {}, 404);
    }) as unknown as typeof fetch;
    return { f, calls };
  }

  it("인증번호 로그인 → 주문 읽기 → 상담 만들기 → 진행 상태 등록할 일", async () => {
    const tb = fakeTechbay();
    await expect(techbayRequestCode(db, tech(), "010-1234-5678", tb.f)).rejects.toThrow(/대표·공장장·상담원/);
    await techbayRequestCode(db, advisor(), "010-1234-5678", tb.f);
    expect((await techbayStatus(db)).waitingCode).toBe(true);
    await techbayLogin(db, advisor(), "123456", tb.f, now);
    const st = await techbayStatus(db);
    expect(st).toMatchObject({ connected: true, shop: "외관수리", phone: "010-1234-5678", savedPhone: "010-1234-5678" });

    const cid = await createBusinessCustomer(db, ids.advisor, { name: "헤이딜러 상품화", phone: "", memo: "", ...biz({ portal: "techbay" }) });
    const list = await techbayOrders(db, advisor(), tb.f);
    expect(list.rows.map((r) => r.hashId)).toEqual(["ord1", "ord2"]);
    expect(list.rows[0]).toMatchObject({ plateNo: "34나5678", make: "현대", model: "디 올 뉴 그랜저 (GN7)", year: 2023 });

    const made = await importTechbayOrders(db, advisor(), cid, ["ord1"], tb.f, now);
    expect(made).toHaveLength(1);
    const [cs] = await db.select().from(consultation).where(eq(consultation.id, made[0].consultId));
    expect(cs.channel).toBe("partner");
    expect(cs.needs).toMatch(/앞범퍼 도색/);
    expect(cs.needs).toMatch(/광택 포함/);
    // 이미 불러온 주문은 다시 안 보임
    expect((await techbayOrders(db, advisor(), tb.f)).rows.map((r) => r.hashId)).toEqual(["ord2"]);
    await expect(importTechbayOrders(db, advisor(), cid, ["ord1"], tb.f, now)).resolves.toHaveLength(0);

    // 입고 전에는 등록할 일 없음 → 수리 건 생기면 '입고' 등록할 일
    let v = (await portalOrderView(db, { consultationId: cs.id }))!;
    expect(v.todo).toEqual([]);
    const { startRepair, seedDiagnosis } = await import("@/modules/repair/service");
    const { confirmTechbayCheck, techbayCheckView } = await import("@/modules/partner/techbay-check");
    // 테크베이 주문은 작업 내용을 줄마다 확인해야 입고된다(2026-11-22)
    await expect(startRepair(db, ids.advisor, cs.id, now)).rejects.toThrow(/줄마다 확인/);
    const view = (await techbayCheckView(db, cs.id))!;
    expect(view.lines.map((l) => l.status)).toEqual(["ok", "check"]);
    await expect(confirmTechbayCheck(db, advisor(), cs.id, {}, [], now)).rejects.toThrow(/2번/);
    expect(await confirmTechbayCheck(db, advisor(), cs.id, { 2: { asPartial: true } }, [], now)).toMatchObject({ total: 2, damage: 2, other: 0 });
    const [cs2] = await db.select().from(consultation).where(eq(consultation.id, cs.id));
    expect(cs2.damageZones.map((z) => z.part)).toEqual(["f_bumper", "l_f_door"]);
    expect(cs2.damageParts).toMatch(/① 앞범퍼 긁힘/);
    expect(cs2.methods).toContain("판금·도장");
    const { id: roId } = await startRepair(db, ids.advisor, cs.id, now);
    // 진단 줄: 요청 한 줄마다
    expect(await seedDiagnosis(db, ids.advisor, roId)).toBe(2);
    v = (await portalOrderView(db, { consultationId: cs.id }))!;
    expect(v.ro?.id).toBe(roId);
    expect(v.todo).toEqual(["intake"]);
    expect((await myTodos(db, advisor(), now)).some((t) => t.key === `portal-${v.o.id}-intake`)).toBe(true);
    await expect(markPortalStep(db, advisor(), v.o.id, "working", "", now)).rejects.toThrow(/아직/);
    await markPortalStep(db, advisor(), v.o.id, "intake", "", now);
    await expect(markPortalStep(db, advisor(), v.o.id, "intake", "", now)).rejects.toThrow(/이미/);
    expect((await portalOrderView(db, { orderId: v.o.id }))!.todo).toEqual([]);
    const [po] = await db.select().from(portalOrder).where(eq(portalOrder.id, v.o.id));
    expect(po.posted[0]).toMatchObject({ step: "intake", by: ids.advisor });
    // 세션 쿠키는 암호화해 보관
    const raw = JSON.stringify((await db.select().from(appConfig)).map((r) => r.data));
    expect(raw).not.toContain("sessionid=abc");
    expect(raw).not.toContain('"abc"');
  });
});
