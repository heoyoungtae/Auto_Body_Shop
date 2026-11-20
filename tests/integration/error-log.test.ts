// 오류 기록(대표 2026-11-20)
import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { errorLog, notification } from "@/db/schema";
import { errorCountToday, errorGroups, errorRecent, fingerprintOf, recordError } from "@/modules/platform/error-log";
import { agentReport } from "@/modules/platform/server-ops";
import { seedShop, testDb } from "./db";

let db: Db;
let ids: Awaited<ReturnType<typeof seedShop>>;
beforeEach(async () => {
  db = await testDb();
  ids = await seedShop(db);
});
const t = (min: number) => new Date(Date.parse("2026-11-20T10:00:00+09:00") + min * 60_000);

describe("오류 기록", () => {
  it("숫자·번호만 다른 오류는 한 묶음", () => {
    expect(fingerprintOf("db", 'ERROR: duplicate key "a" id 123')).toBe(fingerprintOf("db", 'ERROR: duplicate key "b" id 456'));
    expect(fingerprintOf("app", "x 0b9c1d2e-aaaa-4bbb-8ccc-123456789abc")).toBe(fingerprintOf("app", "x 11111111-2222-4333-8444-555555555555"));
    expect(fingerprintOf("app", "a")).not.toBe(fingerprintOf("db", "a"));
  });

  it("묶어 세고, 처음 보는 오류만 대표에게 알리며, 오류 번호로 찾는다", async () => {
    await recordError(db, { kind: "app", message: "Cannot read properties of undefined (reading 'id') at 12", path: "GET /estimates/1", userId: ids.manager, code: "1111" }, t(0));
    await recordError(db, { kind: "app", message: "Cannot read properties of undefined (reading 'id') at 34", path: "GET /estimates/2", userId: ids.owner, code: "2222" }, t(5));
    await recordError(db, { kind: "db", message: "FATAL: too many connections" }, t(6));
    const g = await errorGroups(db, { days: 7 }, t(10));
    expect(g).toHaveLength(2);
    expect(g[1]).toMatchObject({ kind: "app", n: 2, code: "2222", path: "GET /estimates/2", userId: ids.owner });
    const notes = await db.select().from(notification).where(eq(notification.userId, ids.owner));
    expect(notes.filter((n) => n.title.startsWith("새 오류"))).toHaveLength(2);
    expect((await errorGroups(db, { days: 7, q: "1111" }, t(10)))[0]).toMatchObject({ n: 2 });
    expect(await errorGroups(db, { days: 7, kind: "db" }, t(10))).toHaveLength(1);
    expect(await errorGroups(db, { days: 7, q: "/estimates" }, t(10))).toHaveLength(1);
    expect(await errorRecent(db, g[1].fingerprint)).toHaveLength(2);
    expect(await errorCountToday(db, t(10))).toBe(3);
  });

  it("같은 오류가 한 시간에 200번 넘으면 더 쌓지 않고, 90일 지난 기록은 지운다", async () => {
    for (let i = 0; i < 205; i++) await recordError(db, { kind: "caddy", message: `dial tcp ${i}: connection refused` }, t(0));
    expect((await errorGroups(db, { days: 1 }, t(1)))[0].n).toBe(200);
    await recordError(db, { kind: "system", message: "Out of memory: Killed process 1" }, t(60 * 24 * 91));
    expect((await db.select().from(errorLog)).length).toBe(1);
  });

  it("미니 PC 가 보낸 서버 오류를 받는다", async () => {
    await agentReport(db, { serverErrors: [{ kind: "db", at: t(0).toISOString(), message: "ERROR:  relation \"x\" does not exist" }, { kind: "evil", message: "kernel: I/O error" }, { kind: "caddy", message: "" }] }, t(1));
    const g = await errorGroups(db, { days: 1 }, t(2));
    expect(g.map((x) => x.kind).sort()).toEqual(["caddy", "db", "system"]);
  });
});
