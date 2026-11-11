// 근태 신청서(F-11-04)·재직증명서: 연차 계산, 검사, 결재 흐름, 인쇄 권한
import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { act, getDoc } from "@/modules/approval/service";
import { certificateView, leaveBalance, listLeaves, requestCertificate, requestLeave } from "@/modules/staff/attendance";
import { annualEntitlement, businessDaysBetween, hoursBetween } from "@/modules/staff/leave-rules";
import { DEFAULT_CALENDAR } from "@/modules/platform/business-days";
import { saveProfile, type ProfileView } from "@/modules/staff/service";
import { policySetting } from "@/db/schema";
import { seedShop, testDb } from "./db";

let db: Db;
let ids: Awaited<ReturnType<typeof seedShop>>;
beforeEach(async () => {
  db = await testDb();
  ids = await seedShop(db);
});
const now = new Date("2026-11-09T01:00:00Z"); // 월요일
const tech = () => ({ id: ids.tech1, roles: ["technician" as const] });
const acct = () => ({ id: ids.account, roles: ["accounting" as const] });
const profile = (hiredOn: string): ProfileView => ({ job: "판금 기술자", gender: "", birth: "1990-01-02", phone: "01012345678", emName: "", emRelation: "", emPhone: "", zip: "", address: "", addressDetail: "", career: "", hiredOn, contractKind: "regular", contractEnd: "", licenses: [], leftOn: "", leftReason: "" });
const base = { toDate: "", fromTime: "", toTime: "", reason: "개인 용무" };

describe("근태 규칙", () => {
  it("연차 일수: 1년 미만 월 1일, 1년 15일, 3년차부터 2년마다 1일, 최대 25일", () => {
    expect(annualEntitlement("2026-05-10", "2026-11-09")).toMatchObject({ days: 5, firstYear: true, to: "2027-05-09" });
    expect(annualEntitlement("2025-11-09", "2026-11-09")).toMatchObject({ days: 15, from: "2026-11-09", to: "2027-11-08" });
    expect(annualEntitlement("2023-11-01", "2026-11-09").days).toBe(16);
    expect(annualEntitlement("1990-01-01", "2026-11-09").days).toBe(25);
    expect(businessDaysBetween("2026-11-13", "2026-11-16", DEFAULT_CALENDAR)).toBe(2); // 금·월
    expect(hoursBetween("18:00", "20:30")).toBe(2.5);
    expect(hoursBetween("18:00", "17:00")).toBeNull();
  });
});

describe("근태 신청", () => {
  it("명부 입사일로 연차를 세고, 넘치거나 겹치거나 지난 날짜면 막고, 공장장이 승인한다", async () => {
    await expect(requestLeave(db, tech(), { ...base, leaveKind: "annual", fromDate: "2026-11-12" }, now)).rejects.toThrow(/명부/);
    await saveProfile(db, acct(), ids.tech1, profile("2026-08-03"), now); // 3개월 → 3일
    expect(await leaveBalance(db, ids.tech1, "2026-11-09")).toMatchObject({ days: 3, used: 0, remain: 3 });
    await expect(requestLeave(db, tech(), { ...base, leaveKind: "annual", fromDate: "2026-11-06" }, now)).rejects.toThrow(/미리/);
    await expect(requestLeave(db, tech(), { ...base, leaveKind: "annual", fromDate: "2026-11-14", toDate: "2026-11-15" }, now)).rejects.toThrow(/쉬는 날/);
    await expect(requestLeave(db, tech(), { ...base, leaveKind: "annual", fromDate: "2026-11-10", toDate: "2026-11-13" }, now)).rejects.toThrow(/남은 연차가 3일/);
    const d = await requestLeave(db, tech(), { ...base, leaveKind: "annual", fromDate: "2026-11-12", toDate: "2026-11-13" }, now);
    expect((d.data as { days: number }).days).toBe(2);
    expect(await leaveBalance(db, ids.tech1, "2026-11-09")).toMatchObject({ pending: 2, remain: 1 });
    await expect(requestLeave(db, tech(), { ...base, leaveKind: "half_am", fromDate: "2026-11-13" }, now)).rejects.toThrow(/겹칩니다/);
    await requestLeave(db, tech(), { ...base, leaveKind: "half_am", fromDate: "2026-11-16" }, now);
    await requestLeave(db, tech(), { ...base, leaveKind: "half_pm", fromDate: "2026-11-16" }, now);
    await expect(requestLeave(db, tech(), { ...base, leaveKind: "half_am", fromDate: "2026-11-17" }, now)).rejects.toThrow(/남은 연차가 0일/);
    // 공장장 승인
    const sent = await getDoc(db, d.id);
    expect(sent.status).toBe("in_progress");
    await act(db, d.id, ids.manager, "approve", null, now);
    expect((await getDoc(db, d.id)).status).toBe("confirmed");
    expect(await leaveBalance(db, ids.tech1, "2026-11-09")).toMatchObject({ used: 2, pending: 1, remain: 0 });
    // 병가·지각은 연차와 무관, 사후 신고
    await expect(requestLeave(db, tech(), { ...base, leaveKind: "late", fromDate: "2026-11-10", fromTime: "08:00", toTime: "08:30" }, now)).rejects.toThrow(/뒤에/);
    await requestLeave(db, tech(), { ...base, leaveKind: "late", fromDate: "2026-11-09", fromTime: "08:00", toTime: "08:30" }, now);
    await expect(requestLeave(db, tech(), { ...base, leaveKind: "sick", fromDate: "2026-11-02", toDate: "2026-11-04" }, now)).rejects.toThrow(/진단서/);
    await requestLeave(db, tech(), { ...base, leaveKind: "sick", fromDate: "2026-11-02", toDate: "2026-11-04", reason: "독감(진단서 제출 예정)" }, now);
    // 연장근무 주 12시간
    await requestLeave(db, tech(), { ...base, leaveKind: "overtime", fromDate: "2026-11-10", fromTime: "18:00", toTime: "22:00" }, now);
    await requestLeave(db, tech(), { ...base, leaveKind: "overtime", fromDate: "2026-11-11", fromTime: "18:00", toTime: "22:00" }, now);
    await expect(requestLeave(db, tech(), { ...base, leaveKind: "overtime", fromDate: "2026-11-12", fromTime: "17:00", toTime: "22:00" }, now)).rejects.toThrow(/12시간/);
    expect((await listLeaves(db, tech(), { all: true })).every((r) => r.doc.drafterId === ids.tech1)).toBe(true);
    expect((await listLeaves(db, { id: ids.manager, roles: ["plant_manager"] }, { all: true, from: "2026-11-01", to: "2026-11-30" })).length).toBe(7);
  });

  it("공장장 본인 근태는 대표에게 올라간다", async () => {
    await saveProfile(db, acct(), ids.manager, profile("2020-01-01"), now);
    const d = await requestLeave(db, { id: ids.manager, roles: ["plant_manager"] }, { ...base, leaveKind: "annual", fromDate: "2026-11-20" }, now);
    const steps = (await getDoc(db, d.id)).steps as { candidates: string[] }[];
    expect(steps[1].candidates).toEqual([ids.owner]);
  });
});

describe("재직증명서", () => {
  it("명부가 있어야 신청하고, 대표 승인 뒤에만 본인·대표·회계가 인쇄한다", async () => {
    await expect(requestCertificate(db, tech(), { purpose: "은행", submitTo: "", copies: 1 }, now)).rejects.toThrow(/명부/);
    await saveProfile(db, acct(), ids.tech1, profile("2024-03-02"), now);
    await expect(requestCertificate(db, tech(), { purpose: "은행", submitTo: "", copies: 9 }, now)).rejects.toThrow(/부수/);
    const d = await requestCertificate(db, tech(), { purpose: "금융기관 제출", submitTo: "가나은행", copies: 2 }, now);
    await expect(certificateView(db, tech(), d.id)).rejects.toThrow(/승인 뒤/);
    await expect(act(db, d.id, ids.manager, "approve", null, now)).rejects.toThrow(/담당자/);
    await act(db, d.id, ids.owner, "approve", null, now);
    expect((await certificateView(db, tech(), d.id)).issuedOn).toBe("2026-11-09");
    expect((await certificateView(db, acct(), d.id)).data.copies).toBe(2);
    await expect(certificateView(db, { id: ids.tech2, roles: ["technician"] }, d.id)).rejects.toThrow(/본인/);
  });
});

describe("상시 5명 미만", () => {
  it("정책값을 0으로 두면 사내 연차 일수를 쓰고, 주 12시간 한도는 취업규칙 제15조로 그대로 지킨다", async () => {
    await db.insert(policySetting).values([
      { key: "hr.headcount_5plus", value: 0, effectiveFrom: "2026-01-01", reason: "시험", changedBy: ids.owner },
      { key: "leave.small_annual_days", value: 6, effectiveFrom: "2026-01-01", reason: "시험", changedBy: ids.owner },
    ]);
    await saveProfile(db, acct(), ids.tech1, profile("2026-08-03"), now);
    expect(await leaveBalance(db, ids.tech1, "2026-11-09")).toMatchObject({ days: 6, legal: false, from: "2026-08-03", to: "2027-08-02" });
    await requestLeave(db, tech(), { ...base, leaveKind: "overtime", fromDate: "2026-11-10", fromTime: "17:00", toTime: "23:30" }, now);
    await expect(requestLeave(db, tech(), { ...base, leaveKind: "overtime", fromDate: "2026-11-11", fromTime: "17:00", toTime: "23:30" }, now)).rejects.toThrow(/12시간/);
  });
});
