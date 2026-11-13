// 통장·카드·홈택스 내역 연동(대표 결정 2026-11-13, 무료 방식): 문자 수신 주소·엑셀 올리기·같은 거래 합치기·전표와 맞추기·할 일·현금흐름
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import * as schema from "@/db/schema";
import { act } from "@/modules/approval/service";
import {
  bankFlows,
  bankTodos,
  classifyTx,
  confirmClaimFromTx,
  importFile,
  ingestSms,
  issueToken,
  listTx,
  payFromTx,
  saveAccount,
  tokenOk,
  undoImport,
  unlinkTx,
  runMatching,
} from "@/modules/bank/service";
import { createExpense, type ExpenseInput } from "@/modules/money/expense";
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
const now = new Date("2026-11-12T01:00:00Z"); // 서울 2026-11-12(목)
const owner = () => ({ id: ids.owner, roles: ["owner" as const] });
const acct = () => ({ id: ids.account, roles: ["accounting" as const] });
const fx = (n: string) => new Uint8Array(readFileSync(`tests/fixtures/bank/${n}`));
const exp = (over: Partial<ExpenseInput>): ExpenseInput => ({ category: "consumable", supplierId: "", payeeName: "오토파츠몰", sourceKind: "none", sourceId: "", purpose: "연마지", supplyWon: 40_000, vatWon: 4_000, evidenceKind: "card", evidenceNo: "30012345", evidenceOn: "2026-11-12", dueOn: "", payMethod: "card", files: [], ...over });
async function approve(approvalDocId: string) {
  const [doc] = await db.select().from(schema.approvalDoc).where(eq(schema.approvalDoc.id, approvalDocId));
  const who = (doc.steps as { kind: string; candidates: string[] }[]).find((s) => s.kind === "approve")!.candidates[0];
  await act(db, approvalDocId, who, "approve", null, now);
}
async function setup() {
  const kb = await saveAccount(db, owner(), { kind: "bank", company: "kb", name: "사업용 국민", digits: "4567", payDay: null, sms: true });
  const card = await saveAccount(db, owner(), { kind: "card", company: "shinhan_card", name: "사업용 신한카드", digits: "1234", payDay: 14, sms: true });
  return { kb, card };
}

describe("연동 설정", () => {
  it("대표만 등록·주소 발급, 같은 회사 둘이면 끝자리 필수, 주소 열쇠는 해시로 확인", async () => {
    await expect(saveAccount(db, acct(), { kind: "bank", company: "kb", name: "", digits: "", payDay: null, sms: true })).rejects.toThrow(/대표/);
    await saveAccount(db, owner(), { kind: "bank", company: "kb", name: "", digits: "", payDay: null, sms: true });
    await expect(saveAccount(db, owner(), { kind: "bank", company: "kb", name: "둘째", digits: "", payDay: null, sms: true })).rejects.toThrow(/끝자리/);
    const t = await issueToken(db, owner(), now);
    expect(await tokenOk(db, t)).toBe(true);
    expect(await tokenOk(db, `${t}x`)).toBe(false);
    const t2 = await issueToken(db, owner(), now);
    expect(await tokenOk(db, t)).toBe(false);
    expect(await tokenOk(db, t2)).toBe(true);
  });
});

describe("문자 받기", () => {
  it("등록한 통장 문자만 넣고, 같은 문자는 한 번만, 등록 안 된 계좌 문자는 내용을 버린다", async () => {
    await setup();
    const sms = "[KB]11/10 09:12\n123456**4567\n한빛도료\n출금\n330,000\n잔액1,670,000";
    expect((await ingestSms(db, sms, now)).status).toBe("added");
    expect((await ingestSms(db, sms, now)).status).toBe("dup");
    const other = await ingestSms(db, "[신한] 11/12 10:00 110-***-999999 입금 50,000 잔액 100,000 엄마", now);
    expect(other.status).toBe("unknown");
    expect((await ingestSms(db, "[신한] 인증번호 [123456]", now)).status).toBe("ignored");
    const rows = await db.select().from(schema.bankTx);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: "out", on: "2026-11-10", at: "09:12", amountWon: 330_000, balanceWon: 1_670_000, party: "한빛도료", source: "sms" });
  });

  it("문자로 받은 거래를 엑셀로 다시 올리면 한 줄로 합치고(긴 이름·빈 칸 채움), 국민연금은 4대보험으로 분류", async () => {
    await setup();
    await ingestSms(db, "[KB]11/10 09:12\n123456**4567\n한빛도\n출금\n330,000\n잔액1,670,000", now);
    const r = await importFile(db, acct(), { bytes: fx("kb-bank.xlsx"), fileName: "kb-bank.xlsx", kind: "auto", accountId: "" }, now);
    expect(r).toMatchObject({ kind: "bank", added: 2, dup: 1, account: "사업용 국민 (4567)" });
    const rows = await db.select().from(schema.bankTx).orderBy(schema.bankTx.on, schema.bankTx.at);
    expect(rows).toHaveLength(3);
    expect(rows[0].party).toBe("한빛도료");
    const pension = rows.find((x) => x.party === "국민연금공단")!;
    expect(pension).toMatchObject({ matchKind: "class", cls: "social", matchedAuto: true });
    // 같은 파일을 또 올려도 늘지 않는다
    expect((await importFile(db, acct(), { bytes: fx("kb-bank.xlsx"), fileName: "kb-bank.xlsx", kind: "auto", accountId: "" }, now)).added).toBe(0);
  });
});

describe("전표와 맞추기", () => {
  it("카드 승인 문자는 같은 승인번호의 카드 결의서와 저절로 이어지고, 결의서 없는 카드는 할 일이 된다", async () => {
    await setup();
    const e = await createExpense(db, acct(), exp({}), now);
    await approve(e.approvalDocId);
    await ingestSms(db, "신한카드(1234)승인 홍*동 44,000원(일시불)11/12 14:23 오토파츠몰 누적1,234,567원", now);
    await ingestSms(db, "신한카드(1234)승인 홍*동 12,000원(일시불)11/12 18:00 다이소 누적1,246,567원", now);
    const rows = await db.select().from(schema.bankTx).orderBy(schema.bankTx.amountWon);
    expect(rows[1]).toMatchObject({ matchKind: "expense", matchId: e.id, matchedAuto: true });
    expect(rows[0].matchKind).toBeNull();
    const todos = await bankTodos(db, acct(), "2026-11-12");
    expect(todos.map((t) => t.what)).toContain("카드 사용 결의: 다이소 12,000원");
    expect(todos.find((t) => t.what.includes("다이소"))!.href).toBe(`/money/expenses/new?tx=${rows[0].id}`);
    expect(await bankTodos(db, { id: ids.manager, roles: ["plant_manager"] }, "2026-11-12")).toEqual([]);
  });

  it("카드 취소는 원래 승인과 짝지어 둘 다 정리된다(엑셀)", async () => {
    await setup();
    const r = await importFile(db, acct(), { bytes: fx("card-small.xls"), fileName: "card-small.xls", kind: "auto", accountId: "" }, now);
    expect(r).toMatchObject({ kind: "card", added: 2 });
    const rows = await db.select().from(schema.bankTx);
    expect(rows.every((x) => x.matchKind === "tx")).toBe(true);
    expect(rows.find((x) => x.kind === "card")!.matchNote).toBe("취소됨");
  });

  it("승인된 결의서와 금액이 같은 출금은 '지급 처리' 후보 → 누르면 지급일=출금일로 지급하고 잇는다", async () => {
    await setup();
    const e = await createExpense(db, acct(), exp({ category: "rent", payeeName: "건물주", purpose: "11월 임차료", supplyWon: 300_000, vatWon: 30_000, evidenceKind: "tax_invoice", evidenceNo: "TI-1", payMethod: "transfer" }), now);
    await approve(e.approvalDocId);
    await ingestSms(db, "[KB]11/10 09:12\n123456**4567\n건물주\n출금\n330,000\n잔액1,670,000", now);
    const { list } = await listTx(db, acct(), { filter: "todo", from: "2026-11-01", to: "2026-11-30" }, now);
    expect(list[0].cands).toEqual([expect.objectContaining({ kind: "expense", id: e.id, act: "pay", sure: false })]);
    await payFromTx(db, acct(), list[0].t.id, e.id, now);
    const [x] = await db.select().from(schema.expense).where(eq(schema.expense.id, e.id));
    expect(x.paidOn).toBe("2026-11-10");
    const [t] = await db.select().from(schema.bankTx);
    expect(t).toMatchObject({ matchKind: "expense", matchNo: e.docNo, matchedAuto: false });
    // 풀면 다시 맞출 거래가 되고, 저절로 다시 잇지 않는다
    await unlinkTx(db, acct(), t.id);
    await runMatching(db, now);
    expect((await db.select().from(schema.bankTx))[0].matchKind).toBeNull();
  });

  it("보험사 입금: 보험사 이름이 비슷하고 청구액 이하면 후보 → 확인하면 보험 입금·입금 전표(PM)까지", async () => {
    await setup();
    const { roId } = await approvedRepair(db, ids, now);
    await db.update(schema.repairOrder).set({ insurance: "own", insurer: "삼성화재", claimNo: "1" }).where(eq(schema.repairOrder.id, roId));
    await db.insert(schema.insuranceClaim).values({ docNo: "CH-2611-0001", repairOrderId: roId, status: "claimed", insurer: "삼성화재", claimNo: "1", coverage: "own", claimedWon: 1_320_000, claimedAt: now });
    await ingestSms(db, "[KB]11/12 10:00\n123456**4567\n삼성화재해\n입금\n1,300,000\n잔액2,970,000", now);
    const { list } = await listTx(db, acct(), { filter: "todo" }, now);
    const c = list[0].cands.find((x) => x.act === "claim")!;
    expect(c).toMatchObject({ id: roId, cutWon: 20_000 });
    await expect(confirmClaimFromTx(db, acct(), list[0].t.id, roId, "", now)).rejects.toThrow(/감액 사유/);
    const pm = await confirmClaimFromTx(db, acct(), list[0].t.id, roId, "공임 일부 불인정", now);
    const [p] = await db.select().from(schema.payment).where(eq(schema.payment.docNo, pm));
    expect(p).toMatchObject({ amountWon: 1_300_000, receivedOn: "2026-11-12", payer: "insurer" });
    expect((await db.select().from(schema.bankTx))[0]).toMatchObject({ matchKind: "payment", matchId: p.id });
  });

  it("분류: 기타·개인은 사유가 필요하고, 현금흐름 자료는 분류별로 모으며 개인·내 계좌끼리는 뺀다", async () => {
    await setup();
    await importFile(db, acct(), { bytes: fx("kb-bank.xlsx"), fileName: "kb-bank.xlsx", kind: "bank", accountId: "" }, now);
    const rows = await db.select().from(schema.bankTx);
    const ins = rows.find((x) => x.kind === "in")!;
    await expect(classifyTx(db, acct(), ins.id, "personal", "", now)).rejects.toThrow(/사유/);
    await classifyTx(db, acct(), ins.id, "personal", "대표 개인 보험금", now);
    const f = await bankFlows(db, "2026-11-01", "2026-11-30");
    expect(f.inWon).toBe(0);
    expect(f.outWon).toBe(450_000);
    expect(f.groups.find((g) => g.key === "cls:social")).toMatchObject({ outWon: 120_000, flow: "영업" });
    expect(f.balances[0]).toMatchObject({ bal: 2_870_000, on: "2026-11-11" });
  });
});

describe("엑셀 올리기", () => {
  it("통장이 둘이면 고르라고 하고, 되돌리기는 사람이 맞춘 줄만 남긴다", async () => {
    await setup();
    const ibk = await saveAccount(db, owner(), { kind: "bank", company: "ibk", name: "기업", digits: "0111", payDay: null, sms: false });
    await expect(importFile(db, acct(), { bytes: fx("hana-bank.xls"), fileName: "hana-bank.xls", kind: "auto", accountId: "" }, now)).rejects.toThrow(/어느 통장/);
    const r = await importFile(db, acct(), { bytes: fx("ibk-big.xls"), fileName: "ibk-big.xls", kind: "auto", accountId: ibk.id }, now);
    expect(r.added).toBe(300);
    const one = (await db.select().from(schema.bankTx).where(eq(schema.bankTx.importId, r.importId)))[0];
    await classifyTx(db, acct(), one.id, "fee", "", now);
    expect(await undoImport(db, acct(), r.importId, now)).toEqual({ removed: 299, kept: 1 });
    await expect(undoImport(db, acct(), r.importId, now)).rejects.toThrow(/이미/);
  });

  it("홈택스 매입 세금계산서는 결의서의 증빙 번호와 이어진다", async () => {
    await setup();
    const { saveShopInfo } = await import("@/modules/platform/shop");
    await saveShopInfo(db, ids.owner, { name: "외관수리", ceo: "김대표", bizNo: "220-81-62517", repairRegNo: "제1호", address: "경기도", phone: "031-000-0000" });
    const e = await createExpense(db, acct(), exp({ category: "paint", payeeName: "한빛도료", supplyWon: 300_000, vatWon: 30_000, evidenceKind: "tax_invoice", evidenceNo: "20261110-41000000-12345678", payMethod: "transfer" }), now);
    const r = await importFile(db, acct(), { bytes: fx("hometax-tax.xlsx"), fileName: "hometax-tax.xlsx", kind: "auto", accountId: "" }, now);
    expect(r).toMatchObject({ kind: "tax", added: 2 });
    const rows = await db.select().from(schema.bankTx);
    expect(rows.find((x) => x.kind === "tax_buy")).toMatchObject({ matchKind: "expense", matchId: e.id });
    expect(rows.find((x) => x.kind === "tax_sale")!.matchKind).toBeNull();
    expect((await bankTodos(db, acct(), "2026-11-12")).some((t) => t.what === "홈택스 증빙 맞추기 1건")).toBe(true);
  });
});
