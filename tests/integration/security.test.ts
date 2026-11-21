// 공격 대책·앱 주소 자동 고치기 알림(대표 2026-11-21)
import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { notification } from "@/db/schema";
import { errorGroups } from "@/modules/platform/error-log";
import { agentReport, serverOpsView } from "@/modules/platform/server-ops";
import { blockIpManually, noteLoginFail, resetLoginFails, saveKrRanges, securityView, setGeoBlock, unblockIp } from "@/modules/platform/security";
import { blockReason, getSecState, inKr, ipv4ToInt, isPrivateIp } from "@/modules/platform/security-state";
import { seedShop, testDb } from "./db";

let db: Db;
let ids: Awaited<ReturnType<typeof seedShop>>;
beforeEach(async () => {
  db = await testDb();
  ids = await seedShop(db);
  resetLoginFails();
});
const t = (min: number) => new Date(Date.parse("2026-11-21T10:00:00+09:00") + min * 60_000);
const owner = () => ({ id: ids.owner, roles: ["owner" as const] });
const notes = async () => (await db.select().from(notification).where(eq(notification.userId, ids.owner))).map((n) => n.title);
// 국내 범위 흉내: 1.11.0.0/16 과 아무 범위 100개 넘게(목록이 너무 짧으면 받지 않는다)
const kr = [["1.11.0.0", 65536], ...Array.from({ length: 120 }, (_, i) => [`58.${i}.0.0`, 256])];

describe("공격 대책", () => {
  it("주소 판정: 공유기 안·Tailscale 은 막지 않고, 국내 범위는 이진 탐색", () => {
    expect(isPrivateIp("192.168.0.5")).toBe(true);
    expect(isPrivateIp("172.30.1.23")).toBe(true);
    expect(isPrivateIp("100.101.1.2")).toBe(true);
    expect(isPrivateIp("203.0.113.5")).toBe(false);
    const k = { start: Uint32Array.from([ipv4ToInt("1.11.0.0")!, ipv4ToInt("58.0.0.0")!]), end: Uint32Array.from([ipv4ToInt("1.11.255.255")!, ipv4ToInt("58.0.0.255")!]) };
    expect(inKr(k, "1.11.3.4")).toBe(true);
    expect(inKr(k, "1.12.0.0")).toBe(false);
    expect(inKr(k, "58.0.0.255")).toBe(true);
    expect(inKr(k, "8.8.8.8")).toBe(false);
  });

  it("한 주소에서 로그인 실패 10번이면 1시간 막고 대표에게 알린다. 공유기 안 주소는 세지 않는다", async () => {
    for (let i = 0; i < 9; i++) await noteLoginFail(db, "203.0.113.5", t(i * 0.5));
    for (let i = 0; i < 20; i++) await noteLoginFail(db, "192.168.0.9", t(1));
    expect((await securityView(db, t(5).getTime())).blocks).toHaveLength(0);
    await noteLoginFail(db, "203.0.113.5", t(5));
    const v = await securityView(db, t(6).getTime());
    expect(v.blocks).toMatchObject([{ ip: "203.0.113.5", reason: "로그인 실패 10번" }]);
    expect(blockReason(getSecState(), "203.0.113.5", t(6).getTime())).toBe("blocked");
    expect(blockReason(getSecState(), "203.0.113.5", t(70).getTime())).toBeNull(); // 1시간 뒤 풀림
    expect((await notes()).some((n) => n.includes("203.0.113.5"))).toBe(true);
    await unblockIp(db, owner(), "203.0.113.5", t(7));
    expect(blockReason(getSecState(), "203.0.113.5", t(7).getTime())).toBeNull();
  });

  it("미니 PC 가 센 폭주·취약점 찾기 주소를 막고, 응답으로 방화벽 목록을 준다. 서버 자신의 주소는 막지 않는다", async () => {
    await agentReport(db, { status: { host: "abs-server", version: "a", publicIp: "198.51.100.7" } }, t(0));
    const r = await agentReport(db, { hot: [{ ip: "203.0.113.9", reqs: 30, scan: 25 }, { ip: "198.18.0.1", reqs: 700, scan: 0 }, { ip: "198.51.100.7", reqs: 5000, scan: 0 }, { ip: "10.0.0.1", reqs: 9999 }] }, t(1));
    expect((r as { blocked?: string[] }).blocked?.sort()).toEqual(["198.18.0.1", "203.0.113.9"]);
    const v = await securityView(db, t(2).getTime());
    expect(v.blocks.find((b) => b.ip === "203.0.113.9")?.reason).toMatch(/취약점/);
    expect(Date.parse(v.blocks.find((b) => b.ip === "203.0.113.9")!.until)).toBe(t(1).getTime() + 24 * 3600_000);
    await expect(blockIpManually(db, owner(), "198.51.100.7", 1, t(3))).rejects.toThrow(/서버 자신/);
    await expect(blockIpManually(db, owner(), "192.168.0.2", 1, t(3))).rejects.toThrow(/IPv4/);
    await expect(blockIpManually(db, { id: ids.manager, roles: ["plant_manager"] }, "203.0.113.77", 1, t(3))).rejects.toThrow(/대표/);
  });

  it("외국 접속 막기: 국내 목록을 받아야 켤 수 있고, 켜면 국내가 아닌 주소를 막는다", async () => {
    expect(await agentReport(db, {}, t(0))).toMatchObject({ needKr: true });
    await expect(setGeoBlock(db, owner(), true)).rejects.toThrow(/목록/);
    expect(await saveKrRanges(db, [["1.11.0.0", 65536]], t(0))).toBe(false); // 너무 짧은 목록은 버림
    await agentReport(db, { krRanges: kr }, t(1));
    expect(await agentReport(db, {}, t(2))).not.toHaveProperty("needKr");
    await setGeoBlock(db, owner(), true);
    const s = getSecState();
    expect(blockReason(s, "1.11.9.9")).toBeNull();
    expect(blockReason(s, "8.8.8.8")).toBe("foreign");
    expect(blockReason(s, "172.30.1.5")).toBeNull();
    await setGeoBlock(db, owner(), false);
    expect(blockReason(getSecState(), "8.8.8.8")).toBeNull();
  });
});

describe("앱 주소 자동 고치기·도메인", () => {
  it("주소가 바뀌면 알리고, 실패하면 알리고 오류 기록에 남긴다(같은 줄은 한 번)", async () => {
    const lines = [{ line: "2026-11-21 10:05 정비소 주소 바뀜: 1.1.1.1 → 2.2.2.2 (DNS 고침)" }, { line: "2026-11-21 10:10 DNS 고치기 실패" }, { line: "그냥 줄" }];
    await agentReport(db, { ddns: lines }, t(10));
    await agentReport(db, { ddns: lines }, t(11));
    const n = await notes();
    expect(n.filter((x) => x.startsWith("서버 인터넷 주소가 바뀌었습니다"))).toHaveLength(1);
    expect(n.filter((x) => x.startsWith("앱 주소 자동 고치기 실패"))).toHaveLength(1);
    expect((await serverOpsView(db, t(12).getTime())).ddns).toHaveLength(2);
    expect((await errorGroups(db, { days: 1 }, t(12)))[0]).toMatchObject({ kind: "system", n: 1 });
  });

  it("앱 주소가 옛 IP 를 가리키거나 인증서가 곧 끝나면 주의·알림", async () => {
    const st = { host: "abs-server", mode: "direct", version: "a", publicIp: "2.2.2.2", siteHost: "app.jmotors.co.kr", dnsIp: "1.1.1.1", certUntil: "2026-11-30T00:00Z" };
    await agentReport(db, { status: st }, t(0));
    const v = await serverOpsView(db, t(0).getTime());
    expect(v.health.reasons.join()).toMatch(/옛 인터넷 주소/);
    expect(v.health.reasons.join()).toMatch(/인증서 8일 남음/);
    expect((await notes()).some((x) => x.includes("인증서가 8일 뒤"))).toBe(true);
  });
});
