// 사업자등록증(대표 결정 2026-11-20): 파일 암호화·열람 권한, 등록증 칸 → 세금 설정, 국세청 확인으로 과세 유형 채우기, 청년 짐작, 간이·면세 신고 일정
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { appConfig, notification } from "@/db/schema";
import { addRegFile, ageOn, checkNts, kindFromNts, loadBizReg, ntsMonthly, openRegFile, parseNtsValidate, saveBizReg, youthGuess, type BizRegInput } from "@/modules/platform/biz-reg";
import { loadTaxProfile, saveTaxProfile, taxCalendar, taxOverview } from "@/modules/money/tax-profile";
import { taxDeadlines } from "@/modules/money/tax-rules";
import { saveHolidayKey } from "@/modules/platform/holidays";
import { saveShopInfo } from "@/modules/platform/shop";
import { resolveStored } from "@/modules/platform/storage";
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
const owner = () => ({ id: ids.owner, roles: ["owner" as const] });
const acct = () => ({ id: ids.account, roles: ["accounting" as const] });
const tech = () => ({ id: ids.tech1, roles: ["technician" as const] });
const base: BizRegInput = { kind: "general", openedOn: "2027-03-02", birth: "1995-05-17", corpRegNo: "", bizType: "서비스업", bizItem: "자동차 전문 수리업", hqAddress: "", coOwners: "", unitTax: false, invoiceEmail: "tax@myshop.kr", issuedOn: "2027-02-20", taxOffice: "부평세무서" };

const ntsBody = (valid: string, taxCd: string, taxType: string, stt = "계속사업자", sttCd = "01") => ({
  status_code: "OK",
  request_cnt: 1,
  valid_cnt: valid === "01" ? 1 : 0,
  data: [{ b_no: "1234567891", valid, valid_msg: valid === "01" ? "" : "확인할 수 없습니다.", status: { b_no: "1234567891", b_stt: stt, b_stt_cd: sttCd, tax_type: taxType, tax_type_cd: taxCd, end_dt: "" } }],
});
const fakeFetch = (body: unknown, status = 200, seen: { url?: string; body?: string }[] = []) =>
  (async (url: string, init?: RequestInit) => {
    seen.push({ url, body: String(init?.body ?? "") });
    return new Response(JSON.stringify(body), { status });
  }) as unknown as typeof fetch;

describe("사업자등록증", () => {
  it("등록증 칸은 대표만 넣고, 사업 형태·개업일·법인등록번호는 세금 설정으로 간다", async () => {
    await expect(saveBizReg(db, acct(), base)).rejects.toThrow(/대표/);
    await expect(saveBizReg(db, owner(), { ...base, invoiceEmail: "tax@" })).rejects.toThrow(/메일/);
    await expect(saveBizReg(db, owner(), { ...base, birth: "2030-01-01" })).rejects.toThrow(/생년월일/);
    await saveBizReg(db, owner(), base);
    let p = await loadTaxProfile(db);
    expect(p).toMatchObject({ form: "individual", openedOn: "2027-03-02", formSince: "2027-03-02" });
    // 세금 카드는 이 칸을 보내지 않아도 그대로 둔다
    await saveTaxProfile(db, owner(), { formSince: "2027-03-02", fiscalStartMonth: 1, region: "capital", ceoYouth: "", relief: "", halfYearWithholding: false, bankReported: false, bankName: "", accountNo: "", bankHolder: "", agentName: "", agentPhone: "" });
    p = await loadTaxProfile(db);
    expect(p).toMatchObject({ form: "individual", openedOn: "2027-03-02", region: "capital" });

    // 법인 등록증: 생년월일은 지우고 법인등록번호를 넣는다
    await expect(saveBizReg(db, owner(), { ...base, kind: "corporate", corpRegNo: "12011112345" })).rejects.toThrow(/13자리/);
    await saveBizReg(db, owner(), { ...base, kind: "corporate", corpRegNo: "1201111234567", openedOn: "2028-01-02", unitTax: true });
    const r = await loadBizReg(db);
    expect(r.birth).toBe("");
    p = await loadTaxProfile(db);
    expect(p).toMatchObject({ form: "corporate", corpRegNo: "120111-1234567", formSince: "2028-01-02", vatUnit: "unit" });
  });

  it("생년월일과 개업일로 청년 짐작(35~40세는 병역 기간 때문에 답을 비움), 대표가 고르면 그 값", async () => {
    expect(ageOn("1995-05-17", "2027-03-02")).toBe(31);
    expect(ageOn("1992-03-02", "2027-03-02")).toBe(35);
    expect(youthGuess("1995-05-17", "2027-03-02")?.value).toBe(true);
    expect(youthGuess("1990-01-01", "2027-03-02")?.value).toBeNull();
    expect(youthGuess("1980-01-01", "2027-03-02")?.value).toBe(false);
    expect(youthGuess("", "2027-03-02")).toBeNull();

    await saveShopInfo(db, ids.owner, { name: "미래정비", ceo: "허영태", bizNo: "", repairRegNo: "", address: "인천광역시 부평구 부평대로 1", phone: "" });
    await saveBizReg(db, owner(), base);
    const o = await taxOverview(db, owner(), "2027-03-10");
    expect(o.ceoYouth).toBe(true);
    expect(o.rec).toMatchObject({ kind: "startup", rate: 50 });
    await saveTaxProfile(db, owner(), { formSince: "", fiscalStartMonth: 1, region: "", ceoYouth: "0", relief: "", halfYearWithholding: false, bankReported: false, bankName: "", accountNo: "", bankHolder: "", agentName: "", agentPhone: "" });
    expect((await taxOverview(db, owner(), "2027-03-10")).ceoYouth).toBe(false);
  });

  it("등록증 파일은 암호화해 두고 대표·회계만 연다. 새로 올리면 예전 것은 이력으로", async () => {
    const pdf = new TextEncoder().encode("%PDF-1.4 사업자등록증 1234567891");
    await expect(addRegFile(db, acct(), { fileName: "등록증.pdf", bytes: pdf })).rejects.toThrow(/대표/);
    await expect(addRegFile(db, owner(), { fileName: "a.txt", bytes: new TextEncoder().encode("hello") })).rejects.toThrow(/PDF/);
    await addRegFile(db, owner(), { fileName: "등록증.pdf", bytes: pdf });
    const r = await loadBizReg(db);
    expect(readFileSync(resolveStored(r.files[0].path)).toString("latin1")).not.toContain("%PDF");
    const f = await openRegFile(db, acct(), 0);
    expect(new TextDecoder().decode(f.bytes)).toContain("1234567891");
    expect(f.mime).toBe("application/pdf");
    await expect(openRegFile(db, tech(), 0)).rejects.toThrow(/대표·회계/);
    await addRegFile(db, owner(), { fileName: "정정.pdf", bytes: pdf });
    const r2 = await loadBizReg(db);
    expect(r2.files.map((x) => x.fileName)).toEqual(["정정.pdf", "등록증.pdf"]);
  });

  it("국세청 응답 읽기", () => {
    const ok = parseNtsValidate(ntsBody("01", "02", "부가가치세 간이과세자"));
    expect(ok).toMatchObject({ valid: true, taxTypeCd: "02", status: "계속사업자" });
    expect(parseNtsValidate(ntsBody("02", "", ""))?.valid).toBe(false);
    expect(parseNtsValidate({ status_code: "BAD_JSON_REQUEST" })).toBeNull();
    expect(kindFromNts("01", false)).toBe("general");
    expect(kindFromNts("07", false)).toBe("simple");
    expect(kindFromNts("04", false)).toBe("exempt");
    expect(kindFromNts("01", true)).toBe("corporate");
    expect(kindFromNts("", false)).toBeNull();
  });

  it("국세청에서 확인: 키·칸이 없으면 안내, 맞으면 과세 유형을 국세청 값으로 맞추고, 매달 바뀌면 대표에게 알림", async () => {
    expect((await checkNts(db)).message).toMatch(/먼저 넣고/);
    await saveShopInfo(db, ids.owner, { name: "미래정비", ceo: "허영태", bizNo: "1234567891", repairRegNo: "", address: "", phone: "" });
    await saveBizReg(db, owner(), base);
    expect((await checkNts(db)).message).toMatch(/인증키/);
    await saveHolidayKey(db, ids.owner, "abcdefghijklmnopqrstuvwxyz0123456789");

    const seen: { url?: string; body?: string }[] = [];
    const r = await checkNts(db, { actorId: ids.owner, f: fakeFetch(ntsBody("01", "02", "부가가치세 간이과세자"), 200, seen) });
    expect(r.ok).toBe(true);
    expect(r.changedKind).toEqual({ from: "general", to: "simple" });
    expect(JSON.parse(seen[0].body!)).toEqual({ businesses: [{ b_no: "1234567891", start_dt: "20270302", p_nm: "허영태" }] });
    expect(seen[0].url).toContain("serviceKey=abcdefghij");
    expect((await loadBizReg(db)).kind).toBe("simple");
    // 간이과세자 신고 일정
    const cal = await taxCalendar(db, "2027-07-01");
    expect(cal.find((d) => d.key === "vat-2027-07")?.what).toMatch(/간이과세자/);

    // 다름
    const bad = await checkNts(db, { f: fakeFetch(ntsBody("02", "", "")) });
    expect(bad.ok).toBe(false);
    expect(bad.message).toMatch(/다름/);
    // 키 미신청(401)
    const no = await checkNts(db, { f: fakeFetch({ code: -4, msg: "등록되지 않은 인증키 입니다." }, 401) });
    expect(no.message).toMatch(/활용신청/);

    // 매달 1일: 바뀌면 알림
    await checkNts(db, { f: fakeFetch(ntsBody("01", "02", "부가가치세 간이과세자")) });
    expect(await ntsMonthly(db, new Date("2027-07-10T01:00:00Z"))).toMatch(/시기 아님/);
    const orig = globalThis.fetch;
    globalThis.fetch = fakeFetch(ntsBody("01", "01", "부가가치세 일반과세자"));
    try {
      expect(await ntsMonthly(db, new Date("2027-07-01T01:00:00Z"))).toMatch(/맞음/);
    } finally {
      globalThis.fetch = orig;
    }
    expect((await loadBizReg(db)).kind).toBe("general");
    const notes = await db.select().from(notification).where(eq(notification.userId, ids.owner));
    expect(notes.some((n) => n.title.includes("간이과세자 → 부가가치세 일반과세자"))).toBe(true);
    const [row] = await db.select().from(appConfig).where(eq(appConfig.key, "bizreg"));
    expect(JSON.stringify(row.data)).not.toMatch(/\d{6}-\d{7}/);
  });

  it("면세·간이 신고 일정", () => {
    const ex = taxDeadlines(2027, { form: "individual", fiscalStartMonth: 1, withholding: false, halfYear: false, diligent: false, vat: "exempt" });
    expect(ex.filter((d) => d.key.startsWith("vat-")).map((d) => d.due)).toEqual(["2027-02-10"]);
    const si = taxDeadlines(2027, { form: "individual", fiscalStartMonth: 1, withholding: false, halfYear: false, diligent: false, vat: "simple" });
    expect(si.filter((d) => d.key.startsWith("vat-")).map((d) => d.due)).toEqual(["2027-01-25", "2027-07-25"]);
  });
});
