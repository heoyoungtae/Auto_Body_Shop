// 설정 › 서버(대표 요청 2026-11-19): 미니 PC 상태 보기와 '지금 새 버전 올리기'
import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { notification } from "@/db/schema";
import { agentReport, progressPct, requestUpdate, serverHealth, serverOpsView, setAutoUpdate } from "@/modules/platform/server-ops";
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

    expect(await agentReport(db, {}, t(2))).toMatchObject({ update: true, auto: { on: true, time: "21:30" } });
    expect(await agentReport(db, {}, t(3))).toMatchObject({ update: false }); // 한 번만
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

  it("응답 속도·접속량·데이터 양을 5분 칸으로 모으고, 느리거나 오류가 잦으면 주의", async () => {
    const base = { host: "abs-server", mode: "direct", version: "abc1234", services: "app running, db running(healthy)", cpuPct: 10, memPct: 40, appMs: 120, netSec: 60 };
    await agentReport(db, { status: { ...base, reqs: 30, errors: 0, avgMs: 200, p95Ms: 800, rxBytes: 1_000_000, txBytes: 6_000_000 } }, t(0));
    await agentReport(db, { status: { ...base, reqs: 10, errors: 0, avgMs: 400, p95Ms: 1200, rxBytes: 500_000, txBytes: 1_500_000 } }, t(1));
    await agentReport(db, { status: { ...base, reqs: 20, errors: 6, avgMs: 900, p95Ms: 4000, rxBytes: -1, txBytes: -1 } }, t(6));
    const v = await serverOpsView(db, t(6).getTime());
    expect(v.series).toHaveLength(2);
    expect(v.series[0]).toMatchObject({ reqs: 40, errors: 0, msSum: 30 * 200 + 10 * 400, msN: 40, p95: 1200, rx: 1_500_000, tx: 7_500_000, sec: 120 });
    expect(v.series[1]).toMatchObject({ reqs: 20, errors: 6, p95: 4000, rx: -1 });
    expect(v.traffic).toMatchObject({ todayReqs: 60, todayErrors: 6, todayTx: 7_500_000, rxBps: -1 });
    expect(v.health.level).toBe("warn");
    expect(v.health.reasons.join()).toMatch(/화면 열기 느림.*4\.0초/);
    expect(v.health.reasons.join()).toMatch(/서버 오류 잦음/);
    // 24시간 지난 칸은 버린다
    await agentReport(db, { status: { ...base, reqs: 1, errors: 0, avgMs: 100, p95Ms: 100, rxBytes: 8_000, txBytes: 16_000 } }, t(60 * 24 + 10));
    const v2 = await serverOpsView(db, t(60 * 24 + 10).getTime());
    expect(v2.series).toHaveLength(1);
    expect(v2.traffic.txBps).toBe(Math.round((16_000 * 8) / 60));
  });

  it("짧은 확인(poll): 요청이 없으면 아무것도 바꾸지 않고, 요청이 있으면 바로 가져간다", async () => {
    await agentReport(db, { status: { host: "abs-server", version: "abc1234" } }, t(0));
    const before = await serverOpsView(db, t(0).getTime());
    expect(await agentReport(db, { poll: true }, t(0.5))).toMatchObject({ update: false });
    expect((await serverOpsView(db, t(0.5).getTime())).status?.at).toBe(before.status?.at);
    await requestUpdate(db, { id: ids.owner, roles: ["owner"] }, t(1));
    expect(await agentReport(db, { poll: true }, t(1.1))).toMatchObject({ update: true });
    expect(await agentReport(db, { poll: true }, t(1.2))).toMatchObject({ update: false }); // 한 번만
    expect(await serverOpsView(db, t(1.2).getTime())).toMatchObject({ pending: false, running: true, progress: { stage: 0 } });
  });

  it("업데이트 이력: 기록을 받아 같은 줄은 한 번만, 최신 순으로 남기고 형식이 틀린 줄은 버린다", async () => {
    const ok = { at: "2026-11-18 21:35", how: "nightly", ok: true, from: "aaa1111", to: "bbb2222", message: "", changes: [{ pr: 44, title: "협력업체 옮기기" }, { pr: "x", title: "" }] };
    const bad = { at: "2026-11-19 10:07", how: "button", ok: false, from: "bbb2222", to: "", message: "새 버전 만들기 실패", changes: [] };
    await agentReport(db, { events: [ok, { at: "어제", how: "button", ok: true }] }, t(0));
    await agentReport(db, { events: [ok, bad] }, t(1));
    const v = await serverOpsView(db, t(1).getTime());
    expect(v.history.map((e) => e.at)).toEqual(["2026-11-19 10:07", "2026-11-18 21:35"]);
    expect(v.history[1].changes).toEqual([{ pr: 44, title: "협력업체 옮기기", label: "" }]);
    expect(v.history[0]).toMatchObject({ how: "button", ok: false, message: "새 버전 만들기 실패" });
  });

  it("새 버전이 생기면 대표에게 한 번만 알린다", async () => {
    const base = { host: "abs-server", version: "aaa1111", behind: 0, latest: "aaa1111" };
    await agentReport(db, { status: base }, t(0));
    await agentReport(db, { status: { ...base, latest: "bbb2222", behind: 2, pending: [{ pr: 50, title: "업체 견적서로 품목 일괄 등록" }, { pr: 49, title: "계좌 확인 옮기기" }] } }, t(1));
    await agentReport(db, { status: { ...base, latest: "bbb2222", behind: 2 } }, t(2));
    const notes = (await db.select().from(notification).where(eq(notification.userId, ids.owner))).filter((n) => n.title.startsWith("새 버전 있음"));
    expect(notes.map((n) => n.title)).toEqual([expect.stringContaining("업체 견적서로 품목 일괄 등록 (#50) 외 1개")]);
  });

  it("결과가 안 와도 버전이 바뀌거나 단추 이력이 오면 끝난 것으로 본다", async () => {
    const st = { host: "abs-server", version: "aaa1111", latest: "bbb2222", behind: 1 };
    await agentReport(db, { status: st }, t(0));
    await requestUpdate(db, { id: ids.owner, roles: ["owner"] }, t(0));
    expect(await agentReport(db, { status: st }, t(1))).toMatchObject({ update: true });
    expect((await serverOpsView(db, t(5).getTime())).running).toBe(true);
    await agentReport(db, { status: { ...st, version: "bbb2222", behind: 0 } }, t(9));
    let v = await serverOpsView(db, t(9).getTime());
    expect(v).toMatchObject({ running: false, result: { ok: true, message: "새 버전 올림 aaa1111 → bbb2222" } });
    expect(v.status).toMatchObject({ version: "bbb2222", behind: 0 });

    // 두 번째: 단추로 올린 실패 줄이 이력으로 오면 실패로 끝낸다
    await requestUpdate(db, { id: ids.owner, roles: ["owner"] }, t(20));
    await agentReport(db, {}, t(21));
    await agentReport(db, { events: [{ at: "2026-11-19 10:27", how: "button", ok: false, from: "", to: "", message: "새 버전 만들기 실패", changes: [] }] }, t(28));
    v = await serverOpsView(db, t(28).getTime());
    expect(v).toMatchObject({ running: false, result: { ok: false, message: "새 버전 만들기 실패" } });
  });

  it("자동 올리기 시각·켜기는 대표만 바꾸고 미니 PC 에 알려 준다. 예약 자동이 실패하면 대표에게 알린다", async () => {
    await expect(setAutoUpdate(db, { id: ids.manager, roles: ["plant_manager"] }, { on: false, time: "21:30" })).rejects.toThrow(/대표/);
    await expect(setAutoUpdate(db, { id: ids.owner, roles: ["owner"] }, { on: true, time: "25:00" })).rejects.toThrow(/시각/);
    await setAutoUpdate(db, { id: ids.owner, roles: ["owner"] }, { on: true, time: "23:10" });
    expect(await agentReport(db, {}, t(0))).toMatchObject({ auto: { on: true, time: "23:10" } });
    expect((await serverOpsView(db, t(0).getTime())).auto).toEqual({ on: true, time: "23:10" });
    await agentReport(db, { events: [{ at: "2026-11-19 09:40", how: "nightly", ok: false, message: "새 버전 만들기 실패: 이전 버전(aaa1111)을 그대로 씀" }] }, t(0));
    const notes = await db.select().from(notification).where(eq(notification.userId, ids.owner));
    expect(notes.some((n) => n.title.startsWith("예약 자동 새 버전 올리기 실패"))).toBe(true);
  });

  it("한눈 상태: 온도·SSD·프로그램으로 정상·주의·위험을 가리고, 위험이 되면 대표에게 알린다", async () => {
    const good = { host: "abs-server", version: "aaa1111", services: "app running(healthy), db running(healthy), caddy running", cpuPct: 12, cpuTemp: 55, memPct: 40, diskPct: 20, ssdLife: 98, ssdTemp: 40, ssdOk: true, rebootNeeded: false, bootAt: "2026-11-19 09:00:00" };
    await agentReport(db, { status: good }, t(0));
    let v = await serverOpsView(db, t(0).getTime());
    expect(v.health).toEqual({ level: "ok", reasons: [] });
    expect(v.status).toMatchObject({ cpuTemp: 55, ssdLife: 98 });
    expect(serverHealth({ ...v.status!, cpuTemp: 82, rebootNeeded: true }, 0)).toMatchObject({ level: "warn", reasons: [expect.stringContaining("82℃"), expect.stringContaining("다시 켜야")] });
    await agentReport(db, { status: { ...good, cpuTemp: 93, services: "app exited, db running(healthy)" } }, t(1));
    await agentReport(db, { status: { ...good, cpuTemp: 94, services: "app exited, db running(healthy)" } }, t(2));
    v = await serverOpsView(db, t(2).getTime());
    expect(v.health.level).toBe("danger");
    expect(v.health.reasons).toEqual(expect.arrayContaining(["앱 프로그램이 멈췄습니다", "CPU 온도 94℃(너무 뜨거움)"]));
    const notes = (await db.select().from(notification).where(eq(notification.userId, ids.owner))).filter((n) => n.title.startsWith("서버 위험"));
    expect(notes).toHaveLength(1);
    // 모르는 값(-1·이상한 값)은 판단에 쓰지 않는다
    await agentReport(db, { status: { ...good, cpuTemp: -1, ssdLife: "x" } }, t(3));
    expect((await serverOpsView(db, t(3).getTime())).health.level).toBe("ok");
  });

  it("진행 바: 단계는 앞으로만 가고, 만들기에 걸린 시간을 다음 어림에 쓴다", async () => {
    const st = { host: "abs-server", version: "aaa1111", latest: "bbb2222", behind: 1 };
    await agentReport(db, { status: st }, t(0));
    await requestUpdate(db, { id: ids.owner, roles: ["owner"] }, t(0));
    await agentReport(db, {}, t(1));
    let v = await serverOpsView(db, t(1).getTime());
    expect(v.progress).toMatchObject({ stage: 0, label: "새 버전 받기", pct: 0 });
    await agentReport(db, { progress: { stage: 1 } }, t(1.5));
    await agentReport(db, { progress: { stage: 2 } }, t(2));
    v = await serverOpsView(db, t(4.5).getTime()); // 만들기 2분 30초째, 보통 5분 → 15 + 70×0.5
    expect(v.progress).toMatchObject({ stage: 2, label: "새 버전 만들기", pct: 50 });
    await agentReport(db, { progress: { stage: 1 } }, t(5)); // 뒤로 가지 않는다
    expect((await serverOpsView(db, t(5).getTime())).progress?.stage).toBe(2);
    await agentReport(db, { progress: { stage: 3 } }, t(8)); // 만들기 6분
    expect(progressPct(2, 180, 360)).toBe(50);
    await agentReport(db, { result: { ok: true, message: "새 버전 올림" } }, t(9));
    v = await serverOpsView(db, t(9).getTime());
    expect(v.progress).toBeNull();
    // 다음 요청은 0단계부터
    await requestUpdate(db, { id: ids.owner, roles: ["owner"] }, t(20));
    await agentReport(db, {}, t(21));
    expect((await serverOpsView(db, t(21).getTime())).progress?.stage).toBe(0);
  });

  it("올리기 결과가 오면 서버 정보의 버전도 바로 바뀐다", async () => {
    const st = { host: "abs-server", version: "aaa1111", latest: "bbb2222", behind: 4, pending: [{ pr: 58, title: "변경" }] };
    await agentReport(db, { status: st }, t(0));
    await requestUpdate(db, { id: ids.owner, roles: ["owner"] }, t(0));
    await agentReport(db, {}, t(1));
    await agentReport(db, { result: { ok: true, message: "2026-11-19 10:08 새 버전 올림 aaa1111 → bbb2222" } }, t(8));
    const v = await serverOpsView(db, t(8).getTime());
    expect(v.status).toMatchObject({ version: "bbb2222", latest: "bbb2222", behind: 0, pending: [] });
  });

  it("날짜 버전(26.11.20-7)을 받아 보여 주고, 틀린 모양은 버린다", async () => {
    await agentReport(db, { status: { host: "abs-server", version: "aaa1111", versionLabel: "26.11.20-7", latest: "bbb2222", latestLabel: "x; rm", behind: 1 }, events: [{ at: "2026-11-20 13:08", how: "button", ok: true, from: "c", to: "aaa1111", fromLabel: "26.11.20-3", toLabel: "26.11.20-7" }] }, t(0));
    const v = await serverOpsView(db, t(0).getTime());
    expect(v.status).toMatchObject({ versionLabel: "26.11.20-7", latestLabel: "" });
    expect(v.history[0]).toMatchObject({ fromLabel: "26.11.20-3", toLabel: "26.11.20-7" });
  });

  it("예전 이력도 미니 PC 가 계산해 보낸 날짜 버전으로 채운다", async () => {
    await agentReport(db, { events: [{ at: "2026-11-19 21:35", how: "nightly", ok: true, from: "aaa1111", to: "bbb2222" }] }, t(0));
    const r = await agentReport(db, {}, t(1));
    expect(r).toMatchObject({ labelsFor: ["aaa1111", "bbb2222"] });
    await agentReport(db, { labels: { aaa1111: "26.11.18-3", bbb2222: "" } }, t(2));
    const v = await serverOpsView(db, t(2).getTime());
    expect(v.history[0]).toMatchObject({ fromLabel: "26.11.18-3", toLabel: "bbb2222" });
    expect(await agentReport(db, {}, t(3))).not.toHaveProperty("labelsFor");
  });
});
