// 설정 › 서버(대표 요청 2026-11-19): 미니 PC 상태 보기와 '지금 새 버전 올리기'
import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { notification } from "@/db/schema";
import { agentReport, requestUpdate, serverOpsView } from "@/modules/platform/server-ops";
import { seedShop, testDb } from "./db";

let db: Db;
let ids: Awaited<ReturnType<typeof seedShop>>;
beforeEach(async () => {
  db = await testDb();
  ids = await seedShop(db);
});
const t = (min: number) => new Date(Date.parse("2026-11-19T10:00:00+09:00") + min * 60_000);

describe("서버 상태·지금 새 버전 올리기", () => {
  it("상태를 받아 보여 주고, 대표 요청을 미니 PC 가 한 번만 가져가며, 실패하면 대표에게 알린다", async () => {
    let v = await serverOpsView(db, t(0).getTime());
    expect(v).toMatchObject({ status: null, silent: true, pending: false });

    await agentReport(db, { status: { host: "abs-server", place: "home", mode: "direct", version: "abc1234", latest: "def5678", behind: 2, disk: "1.6T 남음", services: "app running\u0007" } }, t(0));
    v = await serverOpsView(db, t(1).getTime());
    expect(v.silent).toBe(false);
    expect(v.status).toMatchObject({ host: "abs-server", place: "home", behind: 2, services: "app running " });
    expect((await serverOpsView(db, t(40).getTime())).silent).toBe(true);

    await expect(requestUpdate(db, { id: ids.manager, roles: ["plant_manager"] }, t(1))).rejects.toThrow(/대표/);
    await requestUpdate(db, { id: ids.owner, roles: ["owner"] }, t(1));
    await expect(requestUpdate(db, { id: ids.owner, roles: ["owner"] }, t(1))).rejects.toThrow(/이미/);
    expect((await serverOpsView(db, t(1).getTime())).pending).toBe(true);

    expect(await agentReport(db, {}, t(2))).toEqual({ update: true });
    expect(await agentReport(db, {}, t(3))).toEqual({ update: false }); // 한 번만
    v = await serverOpsView(db, t(3).getTime());
    expect(v).toMatchObject({ pending: false, running: true });
    await expect(requestUpdate(db, { id: ids.owner, roles: ["owner"] }, t(3))).rejects.toThrow(/올리는 중/);

    await agentReport(db, { result: { ok: false, message: "새 버전 만들기 실패" } }, t(9));
    v = await serverOpsView(db, t(9).getTime());
    expect(v).toMatchObject({ running: false, result: { ok: false, message: "새 버전 만들기 실패" } });
    const notes = await db.select().from(notification).where(eq(notification.userId, ids.owner));
    expect(notes.some((n) => n.title.includes("새 버전 올리기 실패"))).toBe(true);
    // 끝났으니 다시 요청할 수 있다
    await requestUpdate(db, { id: ids.owner, roles: ["owner"] }, t(10));
  });
});
