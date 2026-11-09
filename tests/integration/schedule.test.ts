// 일정표(사용자 지시 2026-11-09): 사내 공용 일정·개인 일정 구분, 반복, 알림, 자동 일정
import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { notification } from "@/db/schema";
import { myTodos } from "@/modules/dashboard/todo";
import { eventIssues, monthGrid, occurrences, type EventInput } from "@/modules/schedule/rules";
import { cancelEvent, createEvent, getEvent, listRange, scheduleDailyAlerts, updateEvent } from "@/modules/schedule/service";
import { seedShop, testDb } from "./db";

let db: Db;
let ids: Awaited<ReturnType<typeof seedShop>>;
beforeEach(async () => {
  db = await testDb();
  ids = await seedShop(db);
});
const now = new Date("2026-11-10T00:00:00Z"); // 서울 11/10 09:00
const owner = () => ({ id: ids.owner, roles: ["owner" as const] });
const manager = () => ({ id: ids.manager, roles: ["plant_manager" as const] });
const tech = () => ({ id: ids.tech1, roles: ["technician" as const] });
const tech2 = () => ({ id: ids.tech2, roles: ["technician" as const] });
const base: EventInput = { scope: "shop", kind: "meeting", title: "주간 회의", startOn: "2026-11-10", endOn: "", startTime: "08:30", endTime: "09:00", place: "사무실", note: "", attendeeIds: [], repeat: "none", repeatUntil: "", remindDays: "" };

describe("일정 규칙", () => {
  it("입력 검사", () => {
    expect(eventIssues(base)).toEqual([]);
    expect(eventIssues({ ...base, scope: "personal", kind: "off" })[0]).toMatch(/개인 일정/);
    expect(eventIssues({ ...base, endOn: "2026-11-09" })[0]).toMatch(/앞섭니다/);
    expect(eventIssues({ ...base, endTime: "08:00" })[0]).toMatch(/끝 시각/);
    expect(eventIssues({ ...base, endOn: "2026-11-12", repeat: "weekly" })[0]).toMatch(/여러 날/);
  });

  it("반복 펼치기", () => {
    const w = { startOn: "2026-11-02", endOn: "2026-11-02", repeat: "weekly", repeatUntil: "2026-11-20" };
    expect(occurrences(w, "2026-11-01", "2026-11-30")).toEqual(["2026-11-02", "2026-11-09", "2026-11-16"]);
    const m = { startOn: "2026-01-31", endOn: "2026-01-31", repeat: "monthly", repeatUntil: null };
    expect(occurrences(m, "2026-02-01", "2026-04-30")).toEqual(["2026-02-28", "2026-03-31", "2026-04-30"]);
    const span = { startOn: "2026-10-30", endOn: "2026-11-02", repeat: "none", repeatUntil: null };
    expect(occurrences(span, "2026-11-01", "2026-11-30")).toEqual(["2026-10-30"]);
    expect(monthGrid("2026-11")[0][0]).toBe("2026-11-01");
    expect(monthGrid("2026-11").length).toBe(5);
  });
});

describe("일정표", () => {
  it("공용 일정은 모두 보고, 개인 일정은 본인만", async () => {
    await expect(createEvent(db, tech(), base, now)).rejects.toThrow(/공용 일정/);
    const shopId = await createEvent(db, manager(), { ...base, attendeeIds: [ids.tech1], repeat: "weekly", repeatUntil: "2026-12-31", remindDays: "0" }, now);
    const mineId = await createEvent(db, tech(), { ...base, scope: "personal", kind: "etc", title: "치과", startTime: "", endTime: "", startOn: "2026-11-11" }, now);
    // 참석자에게 새 일정 알림
    const n = await db.select().from(notification).where(eq(notification.userId, ids.tech1));
    expect(n.some((x) => x.title.includes("주간 회의"))).toBe(true);

    const t1 = await listRange(db, tech(), "2026-11-01", "2026-11-30", ["shop", "mine"], now);
    expect(t1.filter((i) => i.title === "주간 회의").map((i) => i.date)).toEqual(["2026-11-10", "2026-11-17", "2026-11-24"]);
    expect(t1.find((i) => i.title === "주간 회의")?.forMe).toBe(true);
    expect(t1.some((i) => i.title === "치과" && i.layer === "mine")).toBe(true);

    const t2 = await listRange(db, tech2(), "2026-11-01", "2026-11-30", ["shop", "mine"], now);
    expect(t2.some((i) => i.title === "치과")).toBe(false);
    expect(t2.find((i) => i.title === "주간 회의")?.forMe).toBe(false);
    const own = await listRange(db, owner(), "2026-11-01", "2026-11-30", ["shop", "mine"], now);
    expect(own.some((i) => i.title === "치과")).toBe(false);
    await expect(getEvent(db, owner(), mineId)).rejects.toThrow(/개인 일정/);

    // 고치기: 공용은 올린 사람·대표, 개인은 본인
    await expect(updateEvent(db, tech(), shopId, { ...base, title: "바꿈" }, now)).rejects.toThrow(/올린 사람/);
    await expect(updateEvent(db, owner(), mineId, { ...base, kind: "etc" }, now)).rejects.toThrow(/남의/);
    await updateEvent(db, owner(), shopId, { ...base, startTime: "09:00", endTime: "09:30", attendeeIds: [ids.tech1], repeat: "weekly", repeatUntil: "2026-12-31", remindDays: "0" }, now);
    const n2 = await db.select().from(notification).where(eq(notification.userId, ids.tech1));
    expect(n2.some((x) => x.title.includes("바뀜"))).toBe(true);

    // 내 할 일: 오늘 회의, 내일 개인 일정
    const todos = await myTodos(db, tech(), now);
    expect(todos.some((t) => t.key.startsWith("sch-") && t.what.includes("오늘") && t.what.includes("주간 회의"))).toBe(true);
    expect(todos.some((t) => t.what.includes("내일") && t.what.includes("치과"))).toBe(true);

    // 당일 아침 알림(참석자만)
    expect(await scheduleDailyAlerts(db, now)).toMatch(/1건/);
    const alerts = await db.select().from(notification).where(eq(notification.dedupeKey, `sch-remind-${shopId}-2026-11-10-${ids.tech1}`));
    expect(alerts.length).toBe(1);

    // 취소: 공용은 이유 필수
    await expect(cancelEvent(db, manager(), shopId, "", now)).rejects.toThrow(/이유/);
    await cancelEvent(db, manager(), shopId, "다음 주로 미룸", now);
    const after = await listRange(db, tech(), "2026-11-01", "2026-11-30", ["shop"], now);
    expect(after.some((i) => i.title === "주간 회의")).toBe(false);
    await cancelEvent(db, tech(), mineId, "", now);
  });

  it("자동 일정: 공휴일·설비 기한은 볼 권한이 있는 사람에게", async () => {
    const items = await listRange(db, tech(), "2026-12-01", "2026-12-31", ["auto"], now);
    expect(items.some((i) => i.kind === "holiday" && i.date === "2026-12-25")).toBe(true);
    const acct = await listRange(db, { id: ids.account, roles: ["accounting"] }, "2026-12-01", "2026-12-31", ["auto"], now);
    expect(acct.every((i) => !["lube", "pm", "legal", "calib"].includes(i.kind))).toBe(true);
  });
});
