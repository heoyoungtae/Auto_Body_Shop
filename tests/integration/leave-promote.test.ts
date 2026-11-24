// 연차 사용 촉진(근로기준법 제61조)과 남은 연차 보상(대표 결정 2026-11-25)
import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { policySetting } from "@/db/schema";
import { answerNotice, assignDates, leavePayFor, leavePromoteDaily, promoteState, promoteTodos } from "@/modules/staff/leave-promote";
import { promoteDone, promoteWindows } from "@/modules/staff/leave-rules";
import { saveProfile, type ProfileView } from "@/modules/staff/service";
import { seedShop, testDb } from "./db";

let db: Db;
let ids: Awaited<ReturnType<typeof seedShop>>;
beforeEach(async () => {
  db = await testDb();
  ids = await seedShop(db);
  await db.insert(policySetting).values({ key: "hr.headcount_5plus", value: 1, effectiveFrom: "2025-01-01", reason: "시험", changedBy: ids.owner });
});
const acct = () => ({ id: ids.account, roles: ["accounting" as const] });
const profile = (hiredOn: string): ProfileView => ({ job: "판금 기술자", gender: "", birth: "1990-01-02", phone: "01012345678", emName: "", emRelation: "", emPhone: "", zip: "", address: "", addressDetail: "", career: "", hiredOn, contractKind: "regular", contractEnd: "", licenses: [], leftOn: "", leftReason: "" });

describe("촉진 일정", () => {
  it("1년 이상은 끝 6개월 전부터 10일·2차는 2개월 전, 1년 미만은 3개월·1개월 전", () => {
    expect(promoteWindows({ from: "2026-06-01", to: "2027-05-31", firstYear: false })).toEqual({ r1From: "2026-12-01", r1To: "2026-12-10", r2Due: "2027-04-01", end: "2027-06-01" });
    expect(promoteWindows({ from: "2026-06-01", to: "2027-05-31", firstYear: true })).toMatchObject({ r1From: "2027-03-01", r2Due: "2027-05-01" });
    const w = promoteWindows({ from: "2026-06-01", to: "2027-05-31", firstYear: false });
    expect(promoteDone(w, { r1On: "2026-12-01", planOn: "2026-12-05" })).toBe(true);
    expect(promoteDone(w, { r1On: "2026-12-01" })).toBe(false);
    expect(promoteDone(w, { r1On: "2026-12-01", r2On: "2027-03-02" })).toBe(true);
    expect(promoteDone(w, { r1On: "2026-12-20", r2On: "2027-03-02" })).toBe(false);
  });
});

describe("촉진 흐름과 연말 정산", () => {
  it("앱이 1차를 보내고, 직원이 내지 않으면 2차 할 일, 지정하면 촉진 완료로 보상 없음. 촉진 안 한 직원은 보상", async () => {
    const t0 = new Date("2026-01-05T01:00:00Z");
    await saveProfile(db, acct(), ids.tech1, profile("2025-06-01"), t0);
    await saveProfile(db, acct(), ids.tech2, profile("2025-06-01"), t0);
    expect(await leavePromoteDaily(db, new Date("2026-11-30T01:00:00Z"))).toContain("1차 0명");
    expect(await leavePromoteDaily(db, new Date("2026-12-01T01:00:00Z"))).toContain("1차 2명");
    // tech2 는 쓸 날을 냄 → 완료
    const s2 = await promoteState(db, ids.tech2, "2026-12-01");
    await answerNotice(db, { id: ids.tech2, roles: ["technician"] }, s2!.r1!.id, "12월 24일, 12월 26일", new Date("2026-12-03T01:00:00Z"));
    expect((await promoteState(db, ids.tech2, "2026-12-03"))?.done).toBe(true);
    // tech1 은 10일이 지나도 내지 않음 → 할 일
    const todos = await promoteTodos(db, acct(), "2026-12-12");
    expect(todos.map((x) => x.what).join()).toMatch(/연차 쓸 날 지정/);
    expect((await promoteState(db, ids.tech1, "2026-12-12"))?.needR2).toBe(true);
    await assignDates(db, acct(), ids.tech1, "2027년 3월 2일~6일", new Date("2026-12-12T01:00:00Z"));
    expect((await promoteState(db, ids.tech1, "2026-12-12"))?.done).toBe(true);
    // 연차 연도가 끝난 달(2027-06) 급여: 둘 다 촉진 완료 → 보상 없음
    const m = { from: "2027-06-01", to: "2027-06-30" };
    expect(await leavePayFor(db, ids.tech1, m, null)).toMatchObject({ days: 15, paid: false });
    // 다른 달에는 없음
    expect(await leavePayFor(db, ids.tech1, { from: "2027-05-01", to: "2027-05-31" }, null)).toBeNull();
  });

  it("촉진하지 않았으면 남은 연차를 보상하고, 퇴직하는 달에는 촉진과 관계없이 보상", async () => {
    await saveProfile(db, acct(), ids.tech1, profile("2025-06-01"), new Date("2026-01-05T01:00:00Z"));
    expect(await leavePayFor(db, ids.tech1, { from: "2026-06-01", to: "2026-06-30" }, null)).toMatchObject({ days: 11, paid: true });
    expect(await leavePayFor(db, ids.tech1, { from: "2026-09-01", to: "2026-09-30" }, "2026-09-15")).toMatchObject({ days: 15, paid: true });
  });
});
