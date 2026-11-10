// 치공구(STD-08 8.7, F-08-08): 등록·반출/반납·분기 점검·분실
import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { notification } from "@/db/schema";
import { myTodos } from "@/modules/dashboard/todo";
import { nextToolNo, quarterOf } from "@/modules/equipment/rules";
import { checkedInQuarter, checkoutTool, getTool, inspectTool, registerTool, reportLost, restoreTool, returnTool, type ToolInput } from "@/modules/equipment/tools";
import { seedShop, testDb } from "./db";

let db: Db;
let ids: Awaited<ReturnType<typeof seedShop>>;
beforeEach(async () => {
  db = await testDb();
  ids = await seedShop(db);
});
const now = new Date("2026-12-10T00:00:00Z");
const manager = () => ({ id: ids.manager, roles: ["plant_manager" as const] });
const tech = () => ({ id: ids.tech1, roles: ["technician" as const] });
const tech2 = () => ({ id: ids.tech2, roles: ["technician" as const] });
const base: ToolInput = { name: "덴트 풀러 세트", spec: "", purchasedOn: "", location: "F 보드 1번", keep: "board", holderId: "", managerId: "", special: true, note: "" };

describe("치공구", () => {
  it("규칙", () => {
    expect(nextToolNo(["TL-001", "TL-009"])).toBe("TL-010");
    expect(quarterOf("2026-12-10")).toBe("2026-Q4");
    expect(quarterOf("2026-04-01")).toBe("2026-Q2");
  });

  it("등록·반출·반납·점검·분실", async () => {
    await expect(registerTool(db, tech(), base, now)).rejects.toThrow(/공장장/);
    await expect(registerTool(db, manager(), { ...base, location: "" }, now)).rejects.toThrow(/보관 위치/);
    const { id, no } = await registerTool(db, manager(), base, now);
    expect(no).toBe("TL-001");

    await expect(checkoutTool(db, tech(), id, "", now)).rejects.toThrow(/어디에/);
    await checkoutTool(db, tech(), id, "RO-1 덴트", now);
    await expect(checkoutTool(db, tech2(), id, "다른 차", now)).rejects.toThrow(/이미 반출/);
    await expect(returnTool(db, tech2(), id, { broken: false, note: "" }, now)).rejects.toThrow(/반출한 사람/);
    // 날을 넘기면 내 할 일에 '늦음'
    const next = new Date("2026-12-11T01:00:00Z");
    expect((await myTodos(db, tech(), next)).find((t) => t.key === `tool-ret-${id}`)?.when).toBe("late");
    await returnTool(db, tech(), id, { broken: true, note: "탭 갈라짐" }, next);
    expect((await getTool(db, id)).t.status).toBe("repair");
    await restoreTool(db, manager(), id, "탭 교체", next);

    // 12월: 분기 점검 할 일, 점검하면 사라짐
    expect((await myTodos(db, manager(), next)).some((t) => t.key === "tool-check-2026-Q4")).toBe(true);
    await expect(inspectTool(db, manager(), id, { result: "worn", decision: "", note: "닳음" }, next)).rejects.toThrow(/어떻게/);
    await inspectTool(db, manager(), id, { result: "worn", decision: "keep", note: "손잡이 닳음" }, next);
    expect((await checkedInQuarter(db, "2026-Q4")).has(id)).toBe(true);
    expect((await myTodos(db, manager(), next)).some((t) => t.key === "tool-check-2026-Q4")).toBe(false);

    // 분실: 경위 필수, 대표 알림
    await expect(reportLost(db, tech2(), id, "모름", next)).rejects.toThrow(/분실 신고는/);
    await reportLost(db, manager(), id, "보드에 없음", next);
    const n = await db.select().from(notification).where(eq(notification.userId, ids.owner));
    expect(n.some((x) => x.title.includes("치공구 분실"))).toBe(true);
    await expect(checkoutTool(db, tech(), id, "x", next)).rejects.toThrow(/분실/);
  });
});
