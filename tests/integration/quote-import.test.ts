// 견적서(단가표)로 품목 일괄 등록 + 업체별 단가표·단가 이력(대표 요청 2026-11-20)
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { and, eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import * as schema from "@/db/schema";
import { writeXlsx } from "@/modules/platform/xlsx-write";
import { quoteTemplate } from "@/modules/purchase/quote-template";
import { approveOrder, createOrder, getOrder, receiveOrder, saveOrderHeader, sendOrder, submitOrder } from "@/modules/purchase/order";
import { itemPriceHistory, itemPrices, priceBook } from "@/modules/purchase/price";
import { commitQuote, discardQuote, getQuote, readQuote, setQuoteSupplier, type CommitRow } from "@/modules/purchase/quote-import";
import { getItem, orderLowStock, recordCount, saveItem, setTrackMode, trackReview, useStock } from "@/modules/purchase/stock";
import { createSupplier, decideSupplier, evaluateInitial } from "@/modules/purchase/supplier";
import { seedShop, testDb } from "./db";
import { PK_LINES } from "../fixtures/paint-korea-quote";

beforeAll(() => {
  process.env.STORAGE_DIR = mkdtempSync(join(tmpdir(), "abs-files-"));
});
let db: Db;
let ids: Awaited<ReturnType<typeof seedShop>>;
beforeEach(async () => {
  db = await testDb();
  ids = await seedShop(db);
});
const at = (d: string) => new Date(`${d}T01:00:00Z`);
const owner = () => ({ id: ids.owner, roles: ["owner" as const] });
const manager = () => ({ id: ids.manager, roles: ["plant_manager" as const] });
const tech = () => ({ id: ids.tech1, roles: ["technician" as const] });
const sup = (name: string, bizNo = "") => createSupplier(db, manager(), { name, bizNo, kinds: ["paint", "consumable"], items: "", contactName: "", phone: "", email: "", leadDays: null, returnTerms: "", docs: ["biz", "price", "tds", "msds"], note: "" }, at("2026-11-01"));

/** 업체가 보낸 엑셀 모양(머리 정보 + 표 + 이하 여백 + 총합계) */
function quoteXlsx(lines = PK_LINES) {
  return new Uint8Array(
    writeXlsx([
      {
        name: "견적서",
        rows: [
          [null, "견 적 서"],
          ["견적일자 : 2026년 11월 17일", null, "등록번호", "131-86-58023"],
          [null, null, "상호", "㈜페인트코리아", "성명", "김용배"],
          ["유효기간 : 발행일로부터30일"],
          ["번 호", "품 목 명", "단위", "수 량", "단 가", "공급가액"],
          ...lines.map(([n, u, q, p], i) => [i + 1, n, u, q, p, q * p]),
          [null, "********** 이 하 여 백 **********"],
          [null, "총 합 계", null, null, null, 3_438_500],
        ],
      },
    ]),
  );
}
/** 확인 화면 기본값 그대로(같은 품목=갱신, 새 품목=등록, 중복=건너뜀, 확인 필요=새 품목) */
async function defaults(id: string): Promise<CommitRow[]> {
  const { q } = await getQuote(db, id);
  return q.lines.map((l, idx) => ({
    idx,
    action: l.match === "same" ? "update" : l.match === "dup" ? "skip" : "new",
    itemId: l.itemId ?? undefined,
    name: l.name,
    kind: l.kind,
    spec: l.spec ?? "",
    unit: l.unit,
    packAmount: l.packAmount,
    packUnit: l.packUnit ?? "",
    unitWon: l.unitWon,
  }));
}

describe("견적서로 품목 일괄 등록", () => {
  it("엑셀을 읽어 사업자번호로 업체를 찾고, 있는 품목은 단가만 갱신·없는 품목은 등록, 10% 넘게 오르면 대표 알림", async () => {
    const pk = await sup("㈜페인트코리아", "1318658023");
    const tape = await saveItem(db, manager(), null, { name: "마스킹테이프", kind: "consumable", spec: "24MM", unit: "박스", location: "", safetyQty: 2, unitWon: 45_000, expiryTracked: false, supplierId: pk }, at("2026-11-02"));
    // 기술자는 못 한다
    await expect(readQuote(db, tech(), { file: { name: "q.xlsx", bytes: quoteXlsx() } })).rejects.toThrow(/공장장·대표/);
    // 사진은 아직 못 읽는다
    await expect(readQuote(db, manager(), { file: { name: "q.jpg", bytes: new Uint8Array([1, 2, 3, 4, 5]) } })).rejects.toThrow(/사진은 아직/);

    const qid = await readQuote(db, manager(), { file: { name: "페인트코리아_견적.xlsx", bytes: quoteXlsx() } }, at("2026-11-20"));
    const { q } = await getQuote(db, qid);
    expect(q).toMatchObject({ supplierId: pk, quotedOn: "2026-11-17", validUntil: "2026-12-17", readTotalWon: 3_438_500, totalWon: 3_438_500, status: "draft", readBizNo: "131-86-58023", readName: "㈜페인트코리아" });
    expect(q.docNo).toMatch(/^QT-/);
    expect(q.path).toMatch(/^quotes\//);
    expect(q.lines).toHaveLength(40);
    expect(q.lines[20]).toMatchObject({ supName: "마스킹테이프 24MM", match: "same", itemId: tape });
    expect(q.lines[0]).toMatchObject({ match: "new", kind: "paint", unit: "통", packAmount: 18, packUnit: "L" });
    expect(q.lines[4]).toMatchObject({ supName: "7000F CLEAR", unit: "캔", packAmount: 2.5, packUnit: "L" });

    const rows = await defaults(qid);
    // 같은 이름 품목을 새로 만들려 하면 막는다
    await expect(commitQuote(db, manager(), qid, { supplierId: pk, quotedOn: "2026-11-17", validUntil: "2026-12-17", vatMode: "excluded", rows: rows.map((r) => (r.idx === 20 ? { ...r, action: "new", name: "마스킹테이프", spec: "24MM", kind: "consumable", unit: "박스" } : r)) })).rejects.toThrow(/21번째 줄.*이미 있습니다/);
    // 같은 품목을 두 줄에서 고르면 막는다
    await expect(commitQuote(db, manager(), qid, { supplierId: pk, quotedOn: "2026-11-17", validUntil: "2026-12-17", vatMode: "excluded", rows: rows.map((r) => (r.idx === 21 ? { ...r, action: "update", itemId: tape } : r)) })).rejects.toThrow(/22번째 줄.*21번째 줄과 같은 품목/);

    const r = await commitQuote(db, manager(), qid, { supplierId: pk, quotedOn: "2026-11-17", validUntil: "2026-12-17", vatMode: "excluded", rows }, at("2026-11-20"));
    expect(r).toEqual({ added: 39, updated: 1, skipped: 0, rises: 1 });
    // 있던 품목: 업체 단가·품목 단가가 바뀌고, 이력에 45,000 → 50,500(+12.2%) 견적서 번호가 남는다
    expect((await getItem(db, tape)).i.unitWon).toBe(50_500);
    const h = await itemPriceHistory(db, tape);
    expect(h[0].h).toMatchObject({ beforeWon: 45_000, afterWon: 50_500, source: "quote", ref: q.docNo, quoteId: qid });
    const pr = await itemPrices(db, tape, "2026-11-20");
    expect(pr).toHaveLength(1);
    expect(pr[0]).toMatchObject({ unitWon: 50_500, supName: "마스킹테이프 24MM", supUnit: "BOX", quotedOn: "2026-11-17", validUntil: "2026-12-17", main: true });
    const notes = await db.select().from(schema.notification).where(eq(schema.notification.userId, ids.owner));
    expect(notes.some((n) => n.title.includes("마스킹테이프") && n.title.includes("+12.2%"))).toBe(true);
    // 새 품목: 도료는 유효기간 관리, 업체는 페인트코리아, 처음 단가 이력
    const items = await db.select().from(schema.stockItem);
    expect(items).toHaveLength(40);
    const thinner = items.find((i) => i.name === "TH0035신나")!;
    expect(thinner).toMatchObject({ kind: "paint", unit: "통", packAmount: 18, packUnit: "L", expiryTracked: true, supplierId: pk, unitWon: 42_000, qty: 0 });
    expect((await itemPriceHistory(db, thinner.id))[0].h).toMatchObject({ beforeWon: null, afterWon: 42_000, source: "quote" });
    // 끝난 견적서는 다시 등록·버리기 못 함
    await expect(commitQuote(db, manager(), qid, { supplierId: pk, quotedOn: "2026-11-17", validUntil: "", vatMode: "excluded", rows })).rejects.toThrow(/이미 등록/);
    await expect(discardQuote(db, manager(), qid)).rejects.toThrow(/버리지 않습니다/);

    // 다음 견적서(붙여넣기): 업체 품명 기억으로 같은 품목, 같은 줄 두 번은 중복
    const q2 = await readQuote(db, manager(), { supplierId: pk, quotedOn: "2026-12-20", validDays: 30, text: "품명\t단위\t수량\t단가\nTH0035신나\t말\t1\t44,100\nTH0035 신나\t말\t1\t44,100\n" }, at("2026-12-20"));
    const g2 = await getQuote(db, q2);
    expect(g2.q.lines.map((l) => [l.match, l.itemId])).toEqual([
      ["same", thinner.id],
      ["dup", null],
    ]);
    expect(g2.nowPrice[thinner.id]).toBe(42_000);
    const r2 = await commitQuote(db, manager(), q2, { supplierId: pk, quotedOn: "2026-12-20", validUntil: "2027-01-19", vatMode: "excluded", rows: await defaults(q2) }, at("2026-12-20"));
    expect(r2).toEqual({ added: 0, updated: 1, skipped: 1, rises: 0 });
    expect((await itemPriceHistory(db, thinner.id))[0].h).toMatchObject({ beforeWon: 42_000, afterWon: 44_100 });
  });

  it("업체를 못 찾으면 비워 두고, 업체를 고르면 다시 판정한다. 다른 업체 단가는 업체 단가표에만 들어가고 가장 싼 곳을 알려 준다", async () => {
    const main = await sup("한빛도료");
    const tape = await saveItem(db, manager(), null, { name: "마스킹테이프 24MM", kind: "consumable", spec: "", unit: "박스", location: "", safetyQty: 0, unitWon: 52_000, expiryTracked: false, supplierId: main }, at("2026-11-02"));
    // 사업자번호가 없는 표(붙여넣기)는 후보 등록도 하지 않고 업체를 비워 둔다
    const paste = "품명\t단위\t수량\t단가\n" + PK_LINES.slice(20, 22).map(([n, u, q, p]) => `${n}\t${u}\t${q}\t${p}`).join("\n");
    const qid = await readQuote(db, manager(), { text: paste }, at("2026-11-20"));
    expect((await getQuote(db, qid)).q.supplierId).toBeNull();
    await expect(commitQuote(db, manager(), qid, { supplierId: "", quotedOn: "2026-11-17", validUntil: "", vatMode: "excluded", rows: await defaults(qid) })).rejects.toThrow(/견적 업체를 골라/);
    const pk = await sup("㈜페인트코리아", "131-86-58023");
    await setQuoteSupplier(db, manager(), qid, pk);
    const rows = await defaults(qid);
    expect(rows[0]).toMatchObject({ action: "update", itemId: tape });
    await commitQuote(db, manager(), qid, { supplierId: pk, quotedOn: "2026-11-17", validUntil: "", vatMode: "excluded", rows: [rows[0], { ...rows[1], action: "skip" }] }, at("2026-11-20"));
    // 주 거래 업체(한빛도료)가 따로 있으니 품목 단가는 그대로, 업체 단가표에 두 곳
    expect((await getItem(db, tape)).i).toMatchObject({ unitWon: 52_000, supplierId: main });
    const pr = await itemPrices(db, tape, "2026-11-20");
    expect(pr.map((p) => [p.supplierName, p.unitWon, p.main, p.cheapest])).toEqual([
      ["㈜페인트코리아", 50_500, false, true],
      ["한빛도료", 52_000, true, false],
    ]);
    expect((await priceBook(db)).get(tape)).toHaveLength(2);
  });

  it("부가세 포함 견적은 공급가로 바꿔 저장하고, 입고 검수 단가도 업체 단가표·이력에 남는다", async () => {
    const pk = await sup("㈜페인트코리아", "131-86-58023");
    await evaluateInitial(db, manager(), pk, { scores: { quality: 25, delivery: 20, price: 15, docs: 15, safety: 8 }, note: "" }, at("2026-11-01"));
    await decideSupplier(db, owner(), pk, true, "", at("2026-11-01"));
    const qid = await readQuote(db, manager(), { supplierId: pk, vatMode: "included", text: "방진복(망사)\t\t벌\t1\t22,000" }, at("2026-11-20"));
    await commitQuote(db, manager(), qid, { supplierId: pk, quotedOn: "2026-11-20", validUntil: "", vatMode: "included", rows: await defaults(qid) }, at("2026-11-20"));
    const [suit] = await db.select().from(schema.stockItem).where(eq(schema.stockItem.name, "방진복(망사)"));
    expect(suit).toMatchObject({ unitWon: 20_000, vatMode: "included", unit: "벌", kind: "consumable", expiryTracked: false });
    // 입고: 발주 단가 21,000 → 업체 단가 갱신 + 이력(입고 검수)
    const po = await createOrder(db, manager(), { kind: "stock", supplierId: pk, lines: [{ name: suit.name, qty: 2, unitWon: 21_000, stockItemId: suit.id }] }, at("2026-11-21"));
    await saveOrderHeader(db, manager(), po, { supplierId: pk, dueOn: "2026-11-25", note: "" }, at("2026-11-21"));
    await submitOrder(db, manager(), po, false, at("2026-11-21"));
    await approveOrder(db, owner(), po, true, "", at("2026-11-21"));
    await sendOrder(db, manager(), po, { via: "message", replyDueOn: "2026-11-22" }, at("2026-11-21"));
    const lineId = (await getOrder(db, po)).lines[0].id;
    await receiveOrder(db, tech(), po, { lines: [{ lineId, ok: 2, bad: 0 }], checks: ["match", "look", "pack"], badNote: "", needNc: false }, at("2026-11-24"));
    const [sp] = await db.select().from(schema.supplierPrice).where(and(eq(schema.supplierPrice.itemId, suit.id), eq(schema.supplierPrice.supplierId, pk)));
    expect(sp).toMatchObject({ unitWon: 21_000, source: "receive", supName: "방진복(망사)", supUnit: "벌" });
    const h = await itemPriceHistory(db, suit.id);
    expect(h.map((x) => [x.h.beforeWon, x.h.afterWon, x.h.source])).toEqual([
      [20_000, 21_000, "receive"],
      [null, 20_000, "quote"],
    ]);
  });

  it("품목을 고쳐 단가를 바꾸면 이력이 남고, 그대로면 남지 않는다", async () => {
    const pk = await sup("㈜페인트코리아");
    const base = { name: "니트릴장갑", kind: "consumable", spec: "", unit: "박스", location: "", safetyQty: 0, unitWon: 20_000, expiryTracked: false, supplierId: pk };
    const id = await saveItem(db, manager(), null, base, at("2026-11-02"));
    await saveItem(db, manager(), id, { ...base, location: "B-1" }, at("2026-11-03"));
    await saveItem(db, manager(), id, { ...base, unitWon: 19_000 }, at("2026-11-04"));
    expect((await itemPriceHistory(db, id)).map((x) => [x.h.beforeWon, x.h.afterWon, x.h.source])).toEqual([
      [20_000, 19_000, "manual"],
      [null, 20_000, "manual"],
    ]);
  });
});

describe("관리 방식·묶음 입수", () => {
  async function poReceive(supplierId: string, itemId: string, name: string, qty: number, unitWon: number, d: string) {
    const po = await createOrder(db, manager(), { kind: "stock", supplierId, lines: [{ name, qty, unitWon, stockItemId: itemId }] }, at(d));
    await saveOrderHeader(db, manager(), po, { supplierId, dueOn: d, note: "" }, at(d));
    await submitOrder(db, manager(), po, false, at(d));
    await approveOrder(db, owner(), po, true, "", at(d));
    await sendOrder(db, manager(), po, { via: "message", replyDueOn: d }, at(d));
    const lineId = (await getOrder(db, po)).lines[0].id;
    await receiveOrder(db, tech(), po, { lines: [{ lineId, ok: qty, bad: 0 }], checks: ["match", "look", "pack"], badNote: "", needNc: false }, at(d));
  }
  async function okSupplier() {
    const pk = await sup("㈜페인트코리아", "131-86-58023");
    await evaluateInitial(db, manager(), pk, { scores: { quality: 25, delivery: 20, price: 15, docs: 15, safety: 8 }, note: "" }, at("2026-11-01"));
    await decideSupplier(db, owner(), pk, true, "", at("2026-11-01"));
    return pk;
  }

  it("박스로 사서 롤로 쓰기: 입고는 박스 × 입수, 낱개 원가 = 박스 단가 ÷ 입수, 미달 발주는 박스로 올림", async () => {
    const pk = await okSupplier();
    const tape = await saveItem(db, manager(), null, { name: "마스킹테이프", kind: "consumable", spec: "24MM", unit: "롤", buyUnit: "박스", buyQty: 40, location: "", safetyQty: 30, unitWon: 50_000, expiryTracked: false, supplierId: pk, trackMode: "count" }, at("2026-11-02"));
    await expect(saveItem(db, manager(), null, { name: "X", kind: "consumable", spec: "", unit: "박스", buyUnit: "박스", buyQty: 10, location: "", safetyQty: 0, unitWon: 1, expiryTracked: false, supplierId: "" })).rejects.toThrow(/같습니다/);
    await poReceive(pk, tape, "마스킹테이프", 2, 50_000, "2026-11-05");
    let it = (await getItem(db, tape)).i;
    expect(it).toMatchObject({ qty: 80, valueWon: 100_000, unitWon: 50_000 });
    expect((await getItem(db, tape)).moves[0].m).toMatchObject({ qty: 80, unitWon: 1_250, amountWon: 100_000, note: "2박스 × 40" });
    // 실사로 관리: 월말에 남은 25롤 → 55롤은 사용량(실사 차이·부적합 아님)
    const c = await recordCount(db, manager(), { kind: "monthly", lines: [{ itemId: tape, actual: 25 }], note: "" }, at("2026-11-30"));
    expect(c.over).toBe(false);
    it = (await getItem(db, tape)).i;
    expect(it).toMatchObject({ qty: 25, valueWon: 31_250 });
    expect((await getItem(db, tape)).moves[0].m).toMatchObject({ reason: "use", qty: -55, amountWon: -68_750 });
    expect((await getItem(db, tape)).moves[0].m.note).toContain("실사로 계산한 사용량");
    // 안전 재고 30롤 미달 → 60-25=35롤 → 1박스
    const [po] = await orderLowStock(db, manager(), [tape], at("2026-12-01"));
    expect((await getOrder(db, po)).lines[0]).toMatchObject({ qty: 1, unitWon: 50_000 });
  });

  it("관리 안 함: 입고해도 수량을 세지 않고 사용 기록·실사에서 빠지며, 단가는 남는다. 등록할 때 비워 두면 추천대로", async () => {
    const pk = await okSupplier();
    await expect(saveItem(db, manager(), null, { name: "신나", kind: "paint", spec: "", unit: "통", location: "", safetyQty: 0, unitWon: 42_000, expiryTracked: true, supplierId: pk, trackMode: "none" })).rejects.toThrow(/관리 안 함/);
    const cup = await saveItem(db, manager(), null, { name: "비닐용기 1000cc", kind: "consumable", spec: "", unit: "개", location: "", safetyQty: 0, unitWon: 150, expiryTracked: false, supplierId: pk }, at("2026-11-02"));
    expect((await getItem(db, cup)).i).toMatchObject({ trackMode: "none", safetyQty: 0 });
    const tape = await saveItem(db, manager(), null, { name: "커버링테이프", kind: "consumable", spec: "", unit: "박스", location: "", safetyQty: 0, unitWon: 37_000, expiryTracked: false, supplierId: pk }, at("2026-11-02"));
    expect((await getItem(db, tape)).i.trackMode).toBe("count");
    await poReceive(pk, cup, "비닐용기 1000cc", 100, 160, "2026-11-05");
    expect((await getItem(db, cup)).i).toMatchObject({ qty: 0, valueWon: 0, unitWon: 160 });
    expect((await getItem(db, cup)).moves).toHaveLength(0);
    expect((await itemPriceHistory(db, cup))[0].h).toMatchObject({ beforeWon: 150, afterWon: 160, source: "receive" });
    await expect(useStock(db, tech(), { itemId: cup, qty: 1 })).rejects.toThrow(/관리 안 함/);
    await expect(setTrackMode(db, manager(), tape, "none")).resolves.toBeUndefined();
  });

  it("견적서에서 입수·낱개 단위·관리 방식을 받아 새 품목을 묶음으로 등록하고, 있는 품목은 업체 입수를 남긴다", async () => {
    const pk = await sup("㈜페인트코리아", "131-86-58023");
    const old = await saveItem(db, manager(), null, { name: "니트릴장갑(KCC)", kind: "consumable", spec: "", unit: "켤레", location: "", safetyQty: 0, unitWon: 20_000, expiryTracked: false, supplierId: pk }, at("2026-11-02"));
    const qid = await readQuote(db, manager(), { supplierId: pk, text: "품명\t단위\t수량\t단가\n마스킹테이프 24MM\tBOX\t1\t50,500\n니트릴장갑(KCC)\tBOX\t1\t20,000\n6\"중간패드\tEA\t1\t8,000\n" }, at("2026-11-20"));
    const { q } = await getQuote(db, qid);
    expect(q.lines.map((l) => [l.match, l.track])).toEqual([
      ["new", "qty"],
      ["same", "count"],
      ["new", "none"],
    ]);
    const rows = await defaults(qid);
    rows[0] = { ...rows[0], buyQty: 40, baseUnit: "롤", trackMode: "count" };
    rows[1] = { ...rows[1], buyQty: 50 };
    rows[2] = { ...rows[2], trackMode: "none" };
    await commitQuote(db, manager(), qid, { supplierId: pk, quotedOn: "2026-11-20", validUntil: "", vatMode: "excluded", rows }, at("2026-11-20"));
    const [tape] = await db.select().from(schema.stockItem).where(eq(schema.stockItem.name, "마스킹테이프 24MM"));
    expect(tape).toMatchObject({ unit: "롤", buyUnit: "박스", buyQty: 40, trackMode: "count", unitWon: 50_500 });
    const [pad] = await db.select().from(schema.stockItem).where(eq(schema.stockItem.name, '6"중간패드'));
    expect(pad).toMatchObject({ unit: "개", trackMode: "none" });
    const [sp] = await db.select().from(schema.supplierPrice).where(eq(schema.supplierPrice.itemId, old));
    expect(sp.packQty).toBe(50);
  });

  it("분기마다 매입 금액 순(ABC)으로 관리 방식을 다시 추천한다", async () => {
    const pk = await okSupplier();
    const mk = async (name: string, trackMode: string) => saveItem(db, manager(), null, { name, kind: "consumable", spec: "", unit: "개", location: "", safetyQty: 0, unitWon: 1, expiryTracked: false, supplierId: pk, trackMode }, at("2026-11-02"));
    const a = await mk("큰돈", "none");
    const b = await mk("중간", "qty");
    const c1 = await mk("작은1", "qty");
    const c2 = await mk("작은2", "none");
    const c3 = await mk("작은3", "none");
    const paint = await saveItem(db, manager(), null, { name: "클리어", kind: "paint", spec: "", unit: "캔", location: "", safetyQty: 0, unitWon: 1, expiryTracked: false, supplierId: pk, trackMode: "count" }, at("2026-11-02"));
    await poReceive(pk, a, "큰돈", 1, 800_000, "2026-11-10");
    await poReceive(pk, b, "중간", 1, 150_000, "2026-11-10");
    await poReceive(pk, c1, "작은1", 1, 20_000, "2026-11-10");
    await poReceive(pk, c2, "작은2", 1, 20_000, "2026-11-10");
    await poReceive(pk, c3, "작은3", 1, 10_000, "2026-11-10");
    const r = await trackReview(db, at("2027-01-05"));
    const by = new Map(r.map((x) => [x.name, x.suggest]));
    expect(by.get("클리어")).toBe("qty");
    expect(by.get("큰돈")).toBe("qty");
    expect(by.get("중간")).toBe("count");
    expect(by.get("작은1")).toBe("none");
    expect(by.has("작은2")).toBe(false);
    expect(r.find((x) => x.id === paint)?.reason).toContain("수량 관리");
  });

  it("앱 양식 위쪽 업체 정보: 대장에 없는 사업자번호면 후보 업체로 등록하고, 다음엔 그 업체로 찾는다. 부가세·견적일·유효기간도 읽음", async () => {
    const info = { name: "진성", bizNo: "130-24-56494", ceo: "배인수외 1명", contactName: "배진성", phone: "010-3680-9687", address: "인천시 계양구 박촌로 54", quotedOn: "2026-11-18", validDays: 30, vat: "포함" as const };
    const xlsx = new Uint8Array(quoteTemplate([["3M 수세미", "적색", "BOX", 1, 33_000, 33_000, "소모품", "", "", "", "", "", ""]], info));
    // 기술자 권한 없는 사람은 업체 등록도 못 하므로 읽기부터 막힘(기존 규칙). 공장장이 올림
    const qid = await readQuote(db, manager(), { file: { name: "진성.xlsx", bytes: xlsx } }, at("2026-11-20"));
    const { q, supplier: s } = await getQuote(db, qid);
    expect(s).toMatchObject({ name: "진성", bizNo: "130-24-56494", status: "candidate" });
    expect(q).toMatchObject({ quotedOn: "2026-11-18", validUntil: "2026-12-18", vatMode: "included", readBizNo: "130-24-56494", readName: "진성" });
    const [row] = await db.select().from(schema.supplier).where(eq(schema.supplier.id, s!.id));
    expect(row).toMatchObject({ contactName: "배진성", phone: "010-3680-9687", kinds: ["consumable"] });
    expect(row.note).toContain("배인수외 1명");
    expect(row.note).toContain(q.docNo);
    // 두 번째 견적서: 새로 만들지 않고 같은 업체로 찾는다
    const q2 = await readQuote(db, manager(), { file: { name: "진성2.xlsx", bytes: xlsx } }, at("2026-11-21"));
    expect((await getQuote(db, q2)).q.supplierId).toBe(s!.id);
    expect(await db.select().from(schema.supplier).where(eq(schema.supplier.bizNo, "130-24-56494"))).toHaveLength(1);
    // 후보 업체로도 등록할 수 있다(평가·서류는 협력업체 화면에서)
    const r = await commitQuote(db, manager(), qid, { supplierId: s!.id, quotedOn: q.quotedOn, validUntil: q.validUntil ?? "", vatMode: q.vatMode, rows: await defaults(qid) }, at("2026-11-20"));
    expect(r.added).toBe(1);
    // 올릴 때 고른 부가세가 견적서 값보다 앞선다
    const q3 = await readQuote(db, manager(), { vatMode: "excluded", file: { name: "진성3.xlsx", bytes: xlsx } }, at("2026-11-21"));
    expect((await getQuote(db, q3)).q.vatMode).toBe("excluded");
  });
});
