import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { AuthError, createUser, getCurrentUser, loginWithPassword, logout, setActive, setRoles } from "@/modules/auth/service";
import { seedShop, testDb } from "./db";

let db: Db;
let ids: Awaited<ReturnType<typeof seedShop>>;
beforeEach(async () => {
  db = await testDb();
  ids = await seedShop(db);
});

describe("직원 로그인", () => {
  it("아이디·비밀번호가 맞으면 세션이 생기고 역할이 보인다", async () => {
    const token = await loginWithPassword(db, "Manager", ids.password);
    const me = await getCurrentUser(db, token);
    expect(me?.roles).toEqual(["plant_manager"]);
    await logout(db, token);
    expect(await getCurrentUser(db, token)).toBeNull();
  });

  it("5번 틀리면 15분 잠기고, 잠긴 동안은 맞는 비밀번호도 거절한다", async () => {
    const now = new Date("2026-11-08T01:00:00Z");
    for (let i = 0; i < 5; i++) await expect(loginWithPassword(db, "advisor", "wrong-pass1", {}, now)).rejects.toThrow(AuthError);
    await expect(loginWithPassword(db, "advisor", ids.password, {}, now)).rejects.toThrow(/잠겼습니다/);
    const later = new Date(now.getTime() + 16 * 60_000);
    expect(await loginWithPassword(db, "advisor", ids.password, {}, later)).toBeTruthy();
  });

  it("비활성 계정은 로그인할 수 없고 기존 세션도 끊긴다", async () => {
    const token = await loginWithPassword(db, "tech1", ids.password);
    await setActive(db, ids.owner, ids.tech1, false);
    expect(await getCurrentUser(db, token)).toBeNull();
    await expect(loginWithPassword(db, "tech1", ids.password)).rejects.toThrow(AuthError);
  });

  it("계정 만들기: 아이디 중복·약한 비밀번호·역할 없음은 거절", async () => {
    await expect(createUser(db, ids.owner, { loginId: "owner", name: "x", password: "abcd1234", roles: ["advisor"] })).rejects.toThrow(/이미/);
    await expect(createUser(db, ids.owner, { loginId: "new1", name: "x", password: "short1", roles: ["advisor"] })).rejects.toThrow(/8자/);
    await expect(createUser(db, ids.owner, { loginId: "new1", name: "x", password: "abcd1234", roles: [] })).rejects.toThrow(/역할/);
    expect(await createUser(db, ids.owner, { loginId: "new1", name: "신입", password: "abcd1234", roles: ["technician", "safety"] })).toBeTruthy();
  });

  it("마지막 대표의 대표 역할은 뺄 수 없다", async () => {
    await expect(setRoles(db, ids.owner, ids.owner, ["plant_manager"])).rejects.toThrow(/대표/);
  });
});
