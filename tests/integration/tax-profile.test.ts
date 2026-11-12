// 세금·사업 형태 설정(2026-11-12 대표 결정): 개인/법인, 감면 추천, 사업용 계좌 암호화, 신고 일정 할 일
import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { appConfig } from "@/db/schema";
import { myTodos } from "@/modules/dashboard/todo";
import { loadTaxProfile, saveTaxProfile, taxCalendar, taxOverview, type TaxInput } from "@/modules/money/tax-profile";
import { checkLaws, lawTodos, saveLawKey, WATCHED_LAWS, ackLawChanges } from "@/modules/money/law-watch";
import { saveShopInfo } from "@/modules/platform/shop";
import { seedShop, testDb } from "./db";

let db: Db;
let ids: Awaited<ReturnType<typeof seedShop>>;
beforeEach(async () => {
  db = await testDb();
  ids = await seedShop(db);
});
const owner = () => ({ id: ids.owner, roles: ["owner" as const] });
const acct = () => ({ id: ids.account, roles: ["accounting" as const] });
const tech = () => ({ id: ids.tech1, roles: ["technician" as const] });
const base: TaxInput = {
  form: "individual",
  formSince: "",
  corpRegNo: "",
  fiscalStartMonth: 1,
  openedOn: "2027-03-02",
  region: "",
  ceoYouth: "0",
  relief: "",
  halfYearWithholding: false,
  bankReported: false,
  bankName: "IBK기업",
  accountNo: "010-1234-5678-90",
  bankHolder: "허영태",
  agentName: "한빛세무회계",
  agentPhone: "032-123-4567",
};

describe("세금·사업 형태", () => {
  it("저장·짐작·추천·계좌 암호화", async () => {
    await saveShopInfo(db, ids.owner, { name: "미래정비", ceo: "허영태", bizNo: "", repairRegNo: "", address: "인천광역시 부평구 부평대로 1", phone: "" });
    const today = "2027-03-10";
    const before = await taxOverview(db, owner(), today);
    expect(before.form).toBeNull();
    expect(before.guessRegion.region).toBe("overcrowded");
    expect((await myTodos(db, owner(), new Date("2027-03-10T00:00:00Z"))).some((t) => t.key === "set-tax")).toBe(true);

    await expect(saveTaxProfile(db, acct(), base)).rejects.toThrow(/대표/);
    await expect(saveTaxProfile(db, owner(), { ...base, accountNo: "12-3" })).rejects.toThrow(/10~16/);
    await saveTaxProfile(db, owner(), base);
    const [row] = await db.select().from(appConfig).where(eq(appConfig.key, "tax"));
    expect(JSON.stringify(row.data)).not.toContain("0101234567890");
    const p = await loadTaxProfile(db);
    expect(p.bankAccountMasked).toBe("010******7890");
    expect(p.formSince).toBe("2027-03-02");

    const o = await taxOverview(db, owner(), today);
    expect(o.form).toBe("individual");
    expect(o.rec).toMatchObject({ kind: "sme", rate: 20 });
    expect(o.bankFull).toBe("0101234567890");
    expect((await taxOverview(db, tech(), today)).bankFull).toBeNull();

    // 번호 칸을 비우면 그대로
    await saveTaxProfile(db, owner(), { ...base, accountNo: "", region: "capital" });
    const o2 = await taxOverview(db, owner(), today);
    expect(o2.bankFull).toBe("0101234567890");
    expect(o2.rec).toMatchObject({ kind: "startup", rate: 25 });
  });

  it("신고 일정과 할 일(14일 전부터, 개인은 사업용 계좌 신고 확인)", async () => {
    await saveTaxProfile(db, owner(), base);
    const cal = await taxCalendar(db, "2027-05-20");
    expect(cal[0]).toMatchObject({ key: "inc-2027", due: "2027-05-31", days: 11 });
    const todos = await myTodos(db, acct(), new Date("2027-05-20T00:00:00Z"));
    expect(todos.some((t) => t.key === "tax-inc-2027")).toBe(true);
    expect((await myTodos(db, tech(), new Date("2027-05-20T00:00:00Z"))).some((t) => t.key.startsWith("tax-"))).toBe(false);
    expect((await myTodos(db, owner(), new Date("2027-05-20T00:00:00Z"))).some((t) => t.key === "tax-bank-report")).toBe(true);
    await saveTaxProfile(db, owner(), { ...base, form: "corporate", fiscalStartMonth: 1, corpRegNo: "1201111234567", bankReported: false });
    const corp = await taxCalendar(db, "2027-08-20");
    expect(corp.some((d) => d.key === "corp-mid-2027" && d.due === "2027-08-31")).toBe(true);
    expect((await myTodos(db, owner(), new Date("2027-05-20T00:00:00Z"))).some((t) => t.key === "tax-bank-report")).toBe(false);
  });
});

describe("법령 개정 알림", () => {
  const fakeFetch = (stamp: (name: string) => string) =>
    (async (url: string | URL | Request) => {
      const name = new URL(String(url)).searchParams.get("query")!;
      return new Response(JSON.stringify({ LawSearch: { law: [{ 법령명한글: name, 공포일자: stamp(name), 시행일자: "20260101" }] } }), { status: 200 });
    }) as typeof fetch;
  it("처음은 기준만, 바뀌면 할 일·확인하면 사라짐", async () => {
    const d1 = new Date("2026-12-01T00:00:00Z");
    expect((await checkLaws(db, d1, { f: fakeFetch(() => "20251223") })).status).toBe("nokey");
    await expect(saveLawKey(db, acct(), "myshop")).rejects.toThrow(/대표/);
    await saveLawKey(db, owner(), "myshop");
    expect((await checkLaws(db, new Date("2026-12-02T03:00:00Z"), { f: fakeFetch(() => "20251223") })).status).toBe("skipped");
    const first = await checkLaws(db, d1, { f: fakeFetch(() => "20251223") });
    expect(first).toMatchObject({ status: "done", changed: [] });
    expect(await lawTodos(db, acct())).toEqual([]);
    const next = await checkLaws(db, new Date("2027-01-01T00:00:00Z"), {
      f: fakeFetch((n) => (n === "소득세법 시행령" ? "20261231" : "20251223")),
    });
    expect(next.changed).toEqual(["소득세법 시행령"]);
    const todos = await lawTodos(db, acct());
    expect(todos.map((t) => t.key)).toEqual(["law-changed"]);
    expect((await myTodos(db, acct(), new Date("2027-01-02T00:00:00Z"))).some((t) => t.key === "law-changed")).toBe(true);
    await ackLawChanges(db, acct());
    expect(await lawTodos(db, acct())).toEqual([]);
    // 접속 실패면 대표 할 일
    const fail = await checkLaws(db, new Date("2027-02-01T00:00:00Z"), {
      f: (async () => new Response("no", { status: 500 })) as typeof fetch,
    });
    expect(fail.status).toBe("failed");
    expect((await lawTodos(db, owner())).map((t) => t.key)).toEqual(["law-failed"]);
    expect(WATCHED_LAWS.length).toBeGreaterThan(5);
  });
});
