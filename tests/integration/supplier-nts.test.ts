// 협력업체 휴·폐업 자동 확인(2026-11-23 대표 지시): 국세청 상태조회, 매달 1일 자동, 알림·할 일, 키 승인 전 조용히 넘어가기
import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { notification, supplier } from "@/db/schema";
import { myTodos } from "@/modules/dashboard/todo";
import { saveHolidayKey } from "@/modules/platform/holidays";
import { createSupplier, updateSupplier } from "@/modules/purchase/supplier";
import { ackSupplierNts, checkSuppliersNts, freshenSupplierNts, ntsBad, ntsLabel, ntsWarning, parseNtsStatus, supplierNtsDaily, supplierNtsTodos } from "@/modules/purchase/supplier-nts";
import { seedShop, testDb } from "./db";

let db: Db;
let ids: Awaited<ReturnType<typeof seedShop>>;
beforeEach(async () => {
  db = await testDb();
  ids = await seedShop(db);
});
const owner = () => ({ id: ids.owner, roles: ["owner" as const] });
const manager = () => ({ id: ids.manager, roles: ["plant_manager" as const] });
const acct = () => ({ id: ids.account, roles: ["accounting" as const] });
const tech = () => ({ id: ids.tech1, roles: ["technician" as const] });

const item = (b_no: string, cd: string, end = "") => ({
  b_no,
  b_stt: cd === "01" ? "계속사업자" : cd === "02" ? "휴업자" : cd === "03" ? "폐업자" : "",
  b_stt_cd: cd,
  tax_type: cd ? "부가가치세 일반과세자" : "국세청에 등록되지 않은 사업자등록번호입니다.",
  tax_type_cd: cd ? "01" : "",
  end_dt: end,
});
const fakeFetch = (data: unknown[] | null, status = 200, seen: { url: string; body: string }[] = []) =>
  (async (url: string, init?: RequestInit) => {
    seen.push({ url, body: String(init?.body ?? "") });
    return new Response(JSON.stringify(data ? { status_code: "OK", request_cnt: data.length, match_cnt: data.length, data } : { code: -4, msg: "등록되지 않은 인증키 입니다." }), { status });
  }) as unknown as typeof fetch;

async function addSup(name: string, bizNo: string) {
  const id = await createSupplier(db, manager(), { name, bizNo, kinds: ["paint"], items: "", contactName: "", phone: "", email: "", leadDays: 2, returnTerms: "", docs: ["biz", "price", "tds", "msds"], note: "" });
  return id;
}

describe("협력업체 국세청 상태", () => {
  it("응답 읽기·문구", () => {
    const m = parseNtsStatus({ status_code: "OK", data: [item("1234567891", "03", "20261031"), item("2234567891", "")] })!;
    expect(m.get("1234567891")).toMatchObject({ cd: "03", status: "폐업자", endDt: "2026-10-31" });
    expect(m.get("2234567891")?.cd).toBe("none");
    expect(parseNtsStatus({ status_code: "BAD" })).toBeNull();
    const closed = { ...m.get("1234567891")!, at: "", since: "" };
    expect(ntsBad(closed)).toBe(true);
    expect(ntsLabel(closed)).toBe("폐업(2026-10-31)");
    expect(ntsWarning("한빛", closed)).toMatch(/폐업일 2026-10-31.*공제를 받을 수 없습니다/);
    expect(ntsWarning("한빛", closed, "2026-10-20")).toMatch(/폐업일 전 거래/);
    expect(ntsWarning("한빛", { ...closed, cd: "01" })).toBeNull();
  });

  it("키 없음·승인 전(401)은 오류 없이 '못 받음'만 남긴다", async () => {
    const id = await addSup("한빛도료", "123-45-67891");
    const r1 = await checkSuppliersNts(db, { ids: [id] });
    expect(r1.ok).toBe(false);
    expect(r1.message).toMatch(/인증키가 없습니다/);
    await saveHolidayKey(db, ids.owner, "abcdefghijklmnopqrstuvwxyz0123456789");
    const r2 = await checkSuppliersNts(db, { ids: [id], f: fakeFetch(null, 401) });
    expect(r2.ok).toBe(false);
    expect(r2.message).toMatch(/승인 전/);
    const [row] = await db.select().from(supplier).where(eq(supplier.id, id));
    expect(row.nts).toMatchObject({ cd: "", tryMsg: expect.stringMatching(/401/) });
    // 오늘 이미 못 받았으면 매일 작업·지급 화면에서 다시 묻지 않는다
    let called = 0;
    const counting = (async () => {
      called++;
      return new Response("{}", { status: 401 });
    }) as unknown as typeof fetch;
    await freshenSupplierNts(db, id, new Date(), counting);
    expect(called).toBe(0);
    // 접속 실패도 조용히
    const boom = (async () => {
      throw new Error("timeout");
    }) as unknown as typeof fetch;
    expect((await checkSuppliersNts(db, { ids: [id], f: boom })).message).toMatch(/접속하지 못함/);
  });

  it("휴·폐업이 나오면 대표·회계에게 알림, 할 일, 확인하면 빠지고 상태가 바뀌면 다시", async () => {
    await saveHolidayKey(db, ids.owner, "abcdefghijklmnopqrstuvwxyz0123456789");
    const a = await addSup("한빛도료", "1234567891");
    const b = await addSup("대한부품", "2234567891");
    await addSup("번호없음", "");
    const seen: { url: string; body: string }[] = [];
    const r = await checkSuppliersNts(db, { f: fakeFetch([item("1234567891", "01"), item("2234567891", "03", "20261031")], 200, seen) });
    expect(r.ok).toBe(true);
    expect(r.checked).toBe(2);
    expect(JSON.parse(seen[0].body)).toEqual({ b_no: ["1234567891", "2234567891"] });
    expect(seen[0].url).toContain("/status?serviceKey=");
    expect(r.bad.map((x) => x.name)).toEqual(["대한부품"]);

    for (const u of [ids.owner, ids.account]) {
      const notes = await db.select().from(notification).where(eq(notification.userId, u));
      expect(notes.some((n) => n.title.includes("폐업(2026-10-31): 대한부품"))).toBe(true);
    }
    expect((await db.select().from(notification).where(eq(notification.userId, ids.manager))).some((n) => n.title.includes("대한부품"))).toBe(false);

    expect((await supplierNtsTodos(db, acct())).map((t) => t.what)).toEqual(["협력업체 폐업(2026-10-31): 대한부품"]);
    expect(await supplierNtsTodos(db, tech())).toEqual([]);
    expect((await myTodos(db, owner())).some((t) => t.what.includes("대한부품"))).toBe(true);

    await expect(ackSupplierNts(db, manager(), b, "통화함")).rejects.toThrow(/회계/);
    await expect(ackSupplierNts(db, acct(), b, " ")).rejects.toThrow(/적어/);
    await expect(ackSupplierNts(db, acct(), a, "x")).rejects.toThrow(/휴·폐업/);
    await ackSupplierNts(db, acct(), b, "업체와 통화, 새 법인으로 바뀜");
    expect(await supplierNtsTodos(db, owner())).toEqual([]);

    // 같은 상태로 다시 확인: 확인 기록 유지, 알림 다시 안 감
    const before = (await db.select().from(notification)).length;
    await checkSuppliersNts(db, { f: fakeFetch([item("1234567891", "01"), item("2234567891", "03", "20261031")]) });
    expect((await db.select().from(notification)).length).toBe(before);
    expect(await supplierNtsTodos(db, owner())).toEqual([]);
    // 계속 → 휴업으로 바뀌면 다시 할 일
    await checkSuppliersNts(db, { f: fakeFetch([item("1234567891", "02", "20261101"), item("2234567891", "03", "20261031")]) });
    expect((await supplierNtsTodos(db, owner())).map((t) => t.what)).toEqual(["협력업체 휴업(2026-11-01부터): 한빛도료"]);

    // 번호를 바꾸면 예전 결과는 지운다
    await updateSupplier(db, manager(), a, { name: "한빛도료", bizNo: "3234567891", kinds: ["paint"], items: "", contactName: "", phone: "", email: "", leadDays: 2, returnTerms: "", docs: ["biz", "price", "tds", "msds"], note: "" });
    const [row] = await db.select().from(supplier).where(eq(supplier.id, a));
    expect(row.nts).toBeNull();
  });

  it("매일 작업: 1일은 거래 중인 업체 전부, 다른 날은 아직 못 받은 업체만", async () => {
    await saveHolidayKey(db, ids.owner, "abcdefghijklmnopqrstuvwxyz0123456789");
    const a = await addSup("한빛도료", "1234567891");
    const seen: { url: string; body: string }[] = [];
    const f = fakeFetch([item("1234567891", "01")], 200, seen);
    expect(await supplierNtsDaily(db, new Date("2026-12-10T01:00:00Z"), f)).toMatch(/1곳 · 모두 계속사업자/);
    expect(await supplierNtsDaily(db, new Date("2026-12-11T01:00:00Z"), f)).toMatch(/시기 아님/);
    expect(seen.length).toBe(1);
    expect(await supplierNtsDaily(db, new Date("2027-01-01T01:00:00Z"), f)).toMatch(/1곳/);
    expect(seen.length).toBe(2);
    // 지급 화면: 7일 안이면 다시 묻지 않고, 지나면 묻는다
    await freshenSupplierNts(db, a, new Date("2027-01-05T01:00:00Z"), f);
    expect(seen.length).toBe(2);
    await freshenSupplierNts(db, a, new Date("2027-01-12T01:00:00Z"), f);
    expect(seen.length).toBe(3);
  });
});
