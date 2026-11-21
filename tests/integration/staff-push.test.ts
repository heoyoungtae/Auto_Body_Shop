// 직원 앱 푸시(2026-11-21): 새 알림이 생기면 그 직원의 기기만 깨우고, 서비스 워커는 띄울 글을 한 번만 가져간다
import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { notification, staffPush } from "@/db/schema";
import { notifyUser } from "@/modules/platform/notify";
import { pushPending, subscribeStaffPush, takeStaffInbox, unsubscribeStaffPush } from "@/modules/platform/staff-push";
import { seedShop, testDb } from "./db";

let db: Db;
let ids: Awaited<ReturnType<typeof seedShop>>;
beforeEach(async () => {
  db = await testDb();
  ids = await seedShop(db);
});

describe("직원 앱 푸시", () => {
  it("켠 사람의 기기만 깨우고, 깨운 알림은 다시 깨우지 않으며, 글은 한 번만 가져간다", async () => {
    await expect(subscribeStaffPush(db, ids.tech1, "http://bad", null)).rejects.toThrow(/받을 수 없습니다/);
    await subscribeStaffPush(db, ids.tech1, "https://push.example.com/abc", "phone");
    const now = new Date();
    await notifyUser(db, ids.tech1, "작업 배정: 앞범퍼", "t1", "/work");
    await notifyUser(db, ids.advisor, "결재 차례", "a1", "/approvals");
    const calls: string[] = [];
    const f = (async (url: string, init: RequestInit) => {
      calls.push(url);
      expect(String((init.headers as Record<string, string>).Authorization)).toMatch(/^vapid t=/);
      return new Response(null, { status: 201 });
    }) as unknown as typeof fetch;
    expect(await pushPending(db, now, f)).toEqual({ users: 2, sent: 1 });
    expect(calls).toEqual(["https://push.example.com/abc"]);
    expect(await pushPending(db, now, f)).toEqual({ users: 0, sent: 0 });

    const got = await takeStaffInbox(db, ids.tech1, now);
    expect(got).toEqual([expect.objectContaining({ title: "작업 배정: 앞범퍼", url: "/work" })]);
    expect(await takeStaffInbox(db, ids.tech1, now)).toEqual([]);
    // 남의 알림은 가져가지 않는다
    expect(await takeStaffInbox(db, ids.tech1, now)).not.toContainEqual(expect.objectContaining({ title: "결재 차례" }));
  });

  it("30분 넘은 알림은 깨우지 않고, 없어진 기기(410)는 지운다", async () => {
    await subscribeStaffPush(db, ids.tech1, "https://push.example.com/gone", null);
    await db.insert(notification).values({ userId: ids.tech1, title: "옛 알림", createdAt: new Date(Date.now() - 3600_000) });
    const f = (async () => new Response(null, { status: 410 })) as unknown as typeof fetch;
    expect(await pushPending(db, new Date(), f)).toEqual({ users: 0, sent: 0 });
    await notifyUser(db, ids.tech1, "새 알림");
    expect(await pushPending(db, new Date(), f)).toEqual({ users: 1, sent: 0 });
    expect(await db.select().from(staffPush).where(eq(staffPush.userId, ids.tech1))).toEqual([]);
  });

  it("끄면 그 기기는 지워진다(남의 기기는 못 지움)", async () => {
    await subscribeStaffPush(db, ids.tech1, "https://push.example.com/x", null);
    await unsubscribeStaffPush(db, ids.tech2, "https://push.example.com/x");
    expect((await db.select().from(staffPush)).length).toBe(1);
    await unsubscribeStaffPush(db, ids.tech1, "https://push.example.com/x");
    expect((await db.select().from(staffPush)).length).toBe(0);
  });
});
