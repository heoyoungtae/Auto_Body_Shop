// 출퇴근 기록과 연장근무 인정(사용자 결정 2026-11-11): 정비소 인터넷에서만 버튼, 승인 ∩ 실제만 인정,
// 승인 없는 초과는 사후 신청, 공장장 지시 + 직원 동의, 출퇴근 정정, 급여 반영
import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { notification } from "@/db/schema";
import { act, getDoc } from "@/modules/approval/service";
import { DEFAULT_CALENDAR } from "@/modules/platform/business-days";
import { answerOrder, orderOvertime, pendingOrders, requestLeave } from "@/modules/staff/attendance";
import { actualDays, dayStatus, missingDays, punchIn, punchOut, punchTodos, savePunchConfig } from "@/modules/staff/punch";
import { ipAllowed, recognizedMinutes, unapprovedMinutes, validIpRule } from "@/modules/staff/punch-rules";
import { summarizeAttendance } from "@/modules/staff/payroll-rules";
import { seedShop, testDb } from "./db";

let db: Db;
let ids: Awaited<ReturnType<typeof seedShop>>;
beforeEach(async () => {
  db = await testDb();
  ids = await seedShop(db);
});
const owner = () => ({ id: ids.owner, roles: ["owner" as const] });
const pm = () => ({ id: ids.manager, roles: ["plant_manager" as const] });
const tech = () => ({ id: ids.tech1, roles: ["technician" as const] });
/** 2026-11-10(화) 서울 시각 */
const at = (hm: string, day = "2026-11-10") => new Date(`${day}T${hm}:00+09:00`);
const SHOP = "211.234.10.5";

describe("출퇴근 규칙", () => {
  it("인터넷 주소: 하나·대역·IPv6, 형식 검사", () => {
    expect(ipAllowed("211.234.10.5", ["211.234.10.5"])).toBe(true);
    expect(ipAllowed("::ffff:211.234.10.77", ["211.234.10.0/24"])).toBe(true);
    expect(ipAllowed("211.234.11.1", ["211.234.10.0/24"])).toBe(false);
    expect(ipAllowed(null, ["211.234.10.5"])).toBe(false);
    expect(validIpRule("211.234.10.0/24")).toBe(true);
    expect(validIpRule("2001:db8::1")).toBe(true);
    expect(validIpRule("집")).toBe(false);
  });
  it("인정 시간은 승인 ∩ 실제(분 단위), 승인 없는 시간은 정해진 퇴근 뒤 승인 밖", () => {
    expect(recognizedMinutes({ fromTime: "18:00", toTime: "20:00" }, { from: 540, to: 1150 })).toBe(70); // 19:10 퇴근
    expect(recognizedMinutes({ fromTime: "18:00", toTime: "20:00" }, null)).toBe(0);
    expect(unapprovedMinutes({ from: 540, to: 1260 }, 1080, true, [{ from: 1080, to: 1200 }])).toBe(60); // 21:00 퇴근, 승인 20:00까지
    expect(unapprovedMinutes({ from: 600, to: 840 }, 1080, false, [])).toBe(240); // 쉬는 날 10~14시
    const a = summarizeAttendance([{ leaveKind: "overtime", fromDate: "2026-11-10", toDate: "2026-11-10", fromTime: "18:00", toTime: "23:00", days: 0, hours: 5 }], "2026-11", DEFAULT_CALENDAR, () => ({ from: 540, to: 1350 }));
    expect(a).toMatchObject({ overtime: 4.5, night: 0.5, otApproved: 5 }); // 22:30 퇴근
  });
});

describe("출근·퇴근", () => {
  it("정비소 인터넷에서만 누르고, 늦은 출근·승인 없는 연장을 잡아 사후 신청으로 이어 준다", async () => {
    await expect(savePunchConfig(db, tech(), SHOP)).rejects.toThrow(/대표/);
    await expect(savePunchConfig(db, owner(), "집 와이파이")).rejects.toThrow(/형식/);
    await savePunchConfig(db, owner(), SHOP);
    await expect(punchIn(db, tech(), "1.2.3.4", at("09:05"))).rejects.toThrow(/정비소 인터넷/);
    const st = await punchIn(db, tech(), SHOP, at("09:12"));
    expect(st).toMatchObject({ inText: "09:12", late: 12, open: true, schedule: { start: "09:00", end: "18:00", fromContract: false } });
    await expect(punchIn(db, tech(), SHOP, at("09:30"))).rejects.toThrow(/이미/);
    expect((await punchTodos(db, tech(), at("10:00"))).map((t) => t.key)).toContain("punch-late");
    // 지각 신고를 올리면 더 묻지 않는다
    await requestLeave(db, tech(), { leaveKind: "late", fromDate: "2026-11-10", toDate: "", fromTime: "09:00", toTime: "09:12", reason: "차 막힘" }, at("10:00"));
    expect((await dayStatus(db, ids.tech1, "2026-11-10", at("10:00"))).late).toBe(0);

    // 승인 18:00~19:00, 실제 퇴근 20:10 → 인정 60분, 승인 없음 70분(> 30분) → 공장장 알림, 사후 신청 칸
    const ot = await requestLeave(db, tech(), { leaveKind: "overtime", fromDate: "2026-11-10", toDate: "", fromTime: "18:00", toTime: "19:00", reason: "출고" }, at("11:00"));
    await act(db, ot.id, ids.manager, "approve", null, at("11:10"));
    const out = await punchOut(db, tech(), SHOP, at("20:10"));
    expect(out).toMatchObject({ outText: "20:10", recognized: 60, unapproved: 70, overstay: true, afterFrom: "19:00", afterTo: "20:10" });
    const notes = await db.select().from(notification).where(eq(notification.userId, ids.manager));
    expect(notes.some((n) => n.title.includes("승인 없이 늦게 남음"))).toBe(true);
    await expect(punchOut(db, tech(), SHOP, at("20:20"))).rejects.toThrow(/이미/);
    // 사후 신청: '사후' 표시. 공장장이 반려(불인정)하면 수당에 안 들어간다
    const after = await requestLeave(db, tech(), { leaveKind: "overtime", fromDate: "2026-11-10", toDate: "", fromTime: out.afterFrom, toTime: out.afterTo!, reason: "도장 마무리" }, at("20:15"));
    expect(after.data).toMatchObject({ after: true, hours: 1.17 });
    expect(after.title).toContain("사후");
    expect((await dayStatus(db, ids.tech1, "2026-11-10", at("20:20"))).overstay).toBe(false); // 결재 중이면 묻지 않음
    await act(db, after.id, ids.manager, "approve", null, at("20:30"));
    expect((await dayStatus(db, ids.tech1, "2026-11-10", at("20:40"))).recognized).toBe(130);
  });

  it("쉬는 날 출근은 휴일근로 승인이 없으면 표시하고, 빠진 날은 앱 기록 시각으로 정정을 권한다", async () => {
    await punchIn(db, tech(), null, at("09:00", "2026-11-09")); // 주소 미등록이면 어디서나
    const sat = await punchIn(db, tech(), null, at("10:00", "2026-11-14"));
    expect(sat).toMatchObject({ business: false, holidayWork: true });
    // 11-10(화) 출근 안 누름, 11-11(수)은 출근만
    await punchIn(db, tech(), null, at("08:55", "2026-11-11"));
    const miss = await missingDays(db, ids.tech1, at("09:00", "2026-11-16"));
    expect(miss.map((m) => [m.day, m.kind])).toEqual([
      ["2026-11-09", "noOut"],
      ["2026-11-10", "none"],
      ["2026-11-11", "noOut"],
      ["2026-11-12", "none"],
      ["2026-11-13", "none"],
      ["2026-11-14", "noOut"],
    ]);
    // 정정이 확정되면 그 값을 쓴다
    const fix = await requestLeave(db, tech(), { leaveKind: "punch_fix", fromDate: "2026-11-11", toDate: "", fromTime: "08:55", toTime: "19:30", reason: "퇴근 버튼을 못 누름" }, at("09:00", "2026-11-16"));
    await expect(requestLeave(db, tech(), { leaveKind: "punch_fix", fromDate: "2026-11-11", toDate: "", fromTime: "09:00", toTime: "19:00", reason: "다시" }, at("09:00", "2026-11-16"))).rejects.toThrow(/이미/);
    await act(db, fix.id, ids.manager, "approve", null, at("09:10", "2026-11-16"));
    const a = await actualDays(db, "2026-11-11", "2026-11-11", [ids.tech1]);
    expect(a.get(`${ids.tech1}|2026-11-11`)).toMatchObject({ span: { from: 535, to: 1170 }, fixed: true });
    expect((await missingDays(db, ids.tech1, at("09:00", "2026-11-16"))).map((m) => m.day)).not.toContain("2026-11-11");
  });
});

describe("연장근무 지시", () => {
  it("공장장이 지시 → 직원 동의하면 바로 승인, 거절하면 이유와 함께 알림", async () => {
    await expect(orderOvertime(db, tech(), { userId: ids.tech2, fromDate: "2026-11-10", fromTime: "18:00", toTime: "20:00", reason: "x" }, at("10:00"))).rejects.toThrow(/공장장/);
    const d = await orderOvertime(db, pm(), { userId: ids.tech1, fromDate: "2026-11-10", fromTime: "18:00", toTime: "20:00", reason: "보험 차량 출고" }, at("10:00"));
    expect((await pendingOrders(db, ids.tech1)).map((o) => o.doc.id)).toEqual([d.id]);
    await expect(answerOrder(db, { id: ids.tech2, roles: ["technician"] }, d.id, true, "", at("10:05"))).rejects.toThrow(/본인/);
    expect(await answerOrder(db, tech(), d.id, true, "", at("10:05"))).toBe("approved");
    expect((await getDoc(db, d.id)).status).toBe("confirmed");
    const d2 = await orderOvertime(db, pm(), { userId: ids.tech1, fromDate: "2026-11-11", fromTime: "18:00", toTime: "19:00", reason: "정리" }, at("10:00"));
    await expect(answerOrder(db, tech(), d2.id, false, "", at("10:05"))).rejects.toThrow(/이유/);
    expect(await answerOrder(db, tech(), d2.id, false, "병원 예약", at("10:05"))).toBe("declined");
    const notes = await db.select().from(notification).where(eq(notification.userId, ids.manager));
    expect(notes.some((n) => n.title.includes("병원 예약"))).toBe(true);
    // 지난 시각은 지시할 수 없다
    await expect(orderOvertime(db, pm(), { userId: ids.tech1, fromDate: "2026-11-10", fromTime: "08:00", toTime: "09:00", reason: "x" }, at("10:00"))).rejects.toThrow(/지난/);
  });
});
