// 근로계약서(F-11-01)·정보보호 서약서(F-13-02)·퇴직 확인서(F-13-03): 법 검사, 대표 확인, 서명 고정, 교부, 권한
import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { staffDocument, staffProfile } from "@/db/schema";
import { checkContract, contractNumbers, monthlyStdHours, type ContractTerms } from "@/modules/staff/contract-rules";
import { ackRules, approveContract, contractDefaults, rulesAckStatus, createPledge, getDocument, listDocuments, markDelivered, saveContract, signDocument, updateLeaveChecks } from "@/modules/staff/documents";
import { saveProfile, type ProfileView } from "@/modules/staff/service";
import { seedShop, testDb } from "./db";

let db: Db;
let ids: Awaited<ReturnType<typeof seedShop>>;
beforeEach(async () => {
  db = await testDb();
  ids = await seedShop(db);
});
const now = new Date("2026-11-09T01:00:00Z");
const owner = () => ({ id: ids.owner, roles: ["owner" as const] });
const acct = () => ({ id: ids.account, roles: ["accounting" as const] });
const tech = () => ({ id: ids.tech1, roles: ["technician" as const] });
const tech2 = () => ({ id: ids.tech2, roles: ["technician" as const] });
const profile: ProfileView = { job: "판금 기술자", gender: "", birth: "1990-01-02", phone: "01012345678", emName: "", emRelation: "", emPhone: "", zip: "12345", address: "서울 중구 세종대로 1", addressDetail: "101호", career: "", hiredOn: "2026-11-02", contractKind: "regular", contractEnd: "", licenses: [], leftOn: "", leftReason: "" };
const PNG = new Uint8Array(400).fill(7);
const terms = (o: Partial<ContractTerms> = {}): ContractTerms => ({
  contractType: "regular",
  startOn: "2026-11-02",
  endOn: "",
  place: "본 사업장",
  duties: "판금",
  workDays: [1, 2, 3, 4, 5],
  workStart: "09:00",
  workEnd: "18:00",
  breakStart: "12:00",
  breakEnd: "13:00",
  holiday: 0,
  payType: "monthly",
  basePay: 2_500_000,
  allowances: [],
  bonus: "",
  payDay: 10,
  payMethod: "account",
  insurances: ["employment", "accident", "pension", "health"],
  extra: "",
  ...o,
});
const law = { minWage: 10_320, legal5: true };

describe("근로계약 규칙", () => {
  it("주 40시간 월 209시간, 최저임금·휴게·40시간·단시간·기간제 검사", () => {
    expect(monthlyStdHours(40)).toBe(209);
    expect(monthlyStdHours(10)).toBe(43); // 주휴 없음
    expect(contractNumbers(terms())).toMatchObject({ daily: 8, weekly: 40, monthHours: 209 });
    expect(checkContract(terms(), law).errors).toEqual([]);
    expect(checkContract(terms({ basePay: 2_000_000 }), law).errors.join()).toMatch(/최저임금/);
    expect(checkContract(terms({ breakStart: "", breakEnd: "" }), law).errors.join()).toMatch(/휴게/);
    expect(checkContract(terms({ workDays: [1, 2, 3, 4, 5, 6] }), law).errors.join()).toMatch(/제50조/);
    expect(checkContract(terms({ workDays: [1, 2, 3, 4, 5, 6], basePay: 3_000_000 }), { ...law, legal5: false }).errors).toEqual([]);
    expect(checkContract(terms({ contractType: "part" }), law).errors.join()).toMatch(/단시간/);
    expect(checkContract(terms({ contractType: "fixed" }), law).errors.join()).toMatch(/끝나는 날/);
    expect(checkContract(terms({ contractType: "fixed", endOn: "2029-01-01" }), law).warnings.join()).toMatch(/2년/);
    expect(checkContract(terms({ contractType: "part", payType: "hourly", basePay: 10_320, workDays: [1, 3], workEnd: "13:00", breakStart: "", breakEnd: "" }), law).warnings.join()).toMatch(/15시간 미만/);
  });
});

describe("근로계약서 흐름", () => {
  it("명부에서 불러오고, 회계가 쓰면 대표 확인 뒤 본인이 서명하고, 서명 값은 고정된다", async () => {
    await saveProfile(db, acct(), ids.tech1, profile, now);
    const def = await contractDefaults(db, acct(), ids.tech1);
    expect(def.source).toBe("명부·설정");
    expect(def.terms).toMatchObject({ startOn: "2026-11-02", duties: "판금 기술자", payDay: 10 });
    await expect(saveContract(db, tech(), ids.tech1, terms())).rejects.toThrow(/대표·회계/);
    await expect(saveContract(db, acct(), ids.tech1, terms({ basePay: 1_000_000 }), undefined, now)).rejects.toThrow(/최저임금/);
    const { doc } = await saveContract(db, acct(), ids.tech1, terms(), undefined, now);
    expect(doc.status).toBe("draft");
    expect(doc.docNo).toMatch(/^LC-/);
    await expect(signDocument(db, tech(), doc.id, PNG, now)).rejects.toThrow(/대표가/);
    await expect(approveContract(db, acct(), doc.id)).rejects.toThrow(/대표/);
    await approveContract(db, owner(), doc.id, now);
    await expect(signDocument(db, tech2(), doc.id, PNG, now)).rejects.toThrow(/본인/);
    await expect(signDocument(db, tech(), doc.id, null, now)).rejects.toThrow(/서명란/);
    await signDocument(db, tech(), doc.id, PNG, now);
    await expect(saveContract(db, owner(), ids.tech1, terms({ basePay: 2_600_000 }), doc.id)).rejects.toThrow(/새 계약서/);

    // 서명 뒤 명부 주소가 바뀌어도 계약서 값은 그대로
    await saveProfile(db, acct(), ids.tech1, { ...profile, address: "부산 해운대구 1" }, now);
    const v = await getDocument(db, tech(), doc.id);
    expect(v.party).toMatchObject({ name: "최기술", address: "서울 중구 세종대로 1, 101호", phone: "010-1234-5678" });
    const [raw] = await db.select().from(staffDocument).where(eq(staffDocument.id, doc.id));
    expect(raw.partyEnc).not.toMatch(/세종대로/);
    await expect(getDocument(db, tech2(), doc.id)).rejects.toThrow(/본인/);

    // 교부: 본인이 받으면 전자 교부
    await markDelivered(db, tech(), doc.id, "print", now);
    const [after] = await db.select().from(staffDocument).where(eq(staffDocument.id, doc.id));
    expect(after.deliveredHow).toBe("app");
    await expect(markDelivered(db, acct(), doc.id, "print")).rejects.toThrow(/이미/);

    // 다음 계약서는 이 계약서에서 불러온다, 기간제 서명하면 명부 계약 형태가 따라온다
    expect((await contractDefaults(db, owner(), ids.tech1)).source).toMatch(/이전 계약서/);
    const r2 = await saveContract(db, owner(), ids.tech1, terms({ contractType: "fixed", endOn: "2027-11-01" }), undefined, now);
    expect(r2.doc.status).toBe("ready");
    await signDocument(db, acct(), r2.doc.id, PNG, now);
    const [p] = await db.select().from(staffProfile).where(eq(staffProfile.userId, ids.tech1));
    expect(p).toMatchObject({ contractKind: "fixed", contractEnd: "2027-11-01" });
    expect((await listDocuments(db, tech())).length).toBe(2);
    expect((await listDocuments(db, tech2())).length).toBe(0);
  });

  it("서약서는 하나씩, 퇴직 확인서는 반납 항목을 다 확인해야 서명한다", async () => {
    await saveProfile(db, acct(), ids.tech1, { ...profile, leftOn: "2026-12-31", leftReason: "개인 사정" }, now);
    const j = await createPledge(db, acct(), ids.tech1, "pledge_join", {}, now);
    expect(j.doc.docNo).toMatch(/^PL-/);
    await expect(createPledge(db, acct(), ids.tech1, "pledge_join", {}, now)).rejects.toThrow(/이미/);
    await signDocument(db, tech(), j.doc.id, PNG, now);
    const l = await createPledge(db, acct(), ids.tech1, "pledge_leave", { checks: ["return_docs"] }, now);
    expect((l.doc.terms as { leftOn: string }).leftOn).toBe("2026-12-31");
    await expect(signDocument(db, tech(), l.doc.id, PNG, now)).rejects.toThrow(/반납/);
    await updateLeaveChecks(db, acct(), l.doc.id, ["return_docs", "delete_device", "leave_chat", "no_copy", "account"], "", now);
    await signDocument(db, acct(), l.doc.id, PNG, now);
    const [row] = await db.select().from(staffDocument).where(eq(staffDocument.id, l.doc.id));
    expect(row).toMatchObject({ status: "signed", signedVia: "in_person" });
  });

  it("취업규칙은 직원이 읽고 확인 서명하며, 같은 판을 두 번 확인할 수 없다", async () => {
    await expect(ackRules(db, tech(), null, now)).rejects.toThrow(/서명란/);
    await ackRules(db, tech(), PNG, now);
    expect((await rulesAckStatus(db)).has(ids.tech1)).toBe(true);
    expect((await rulesAckStatus(db)).has(ids.tech2)).toBe(false);
    await expect(ackRules(db, tech(), PNG, now)).rejects.toThrow(/이미/);
  });
});
