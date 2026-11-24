// 간소화(설정 › 간소화, 대표 2026-11-24): 켜면 줄어들고, 끄면 표준 절차 그대로
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { and, eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { notification, policySetting, staffPush, workOrder, workStep } from "@/db/schema";
import { applySimplifyMode, setSimple, simplifyOverview, SIMPLIFY_ITEMS } from "@/modules/platform/simplify";
import { loadPolicy, type PolicyKey } from "@/modules/platform/policy";
import { notifyRole, notifyUser } from "@/modules/platform/notify";
import { digestNotices, isUrgentNotice, pushPending, subscribeStaffPush } from "@/modules/platform/staff-push";
import { createWorkOrder, setManualWorkOrder } from "@/modules/repair/work";
import { closeEntry } from "@/modules/journal/entry";
import { bulkPlan } from "@/app/repairs/photo-slots";
import { approvedRepair } from "./flow";
import { seedShop, testDb } from "./db";

beforeAll(() => {
  process.env.STORAGE_DIR = mkdtempSync(join(tmpdir(), "abs-files-"));
});
let db: Db;
let ids: Awaited<ReturnType<typeof seedShop>>;
beforeEach(async () => {
  db = await testDb();
  ids = await seedShop(db);
});
const now = new Date("2026-11-09T01:00:00Z");
/** 시험용: 시행일을 과거로 두고 켠다(seedShop 은 모두 끔) */
const turnOn = (key: PolicyKey) => db.insert(policySetting).values({ key, value: 1, effectiveFrom: "2000-01-02", reason: "시험: 간소화 켬", changedBy: ids.owner });

describe("간소화 설정", () => {
  it("처음 값은 간편 모드이고, 표준으로 모두 끄고 간편 모드로 다시 켠다. 같은 값이면 바꾸지 않는다", async () => {
    // seedShop 이 시험용으로 끈 것 말고 처음 값(기본)은 모두 1
    for (const i of SIMPLIFY_ITEMS) expect(i.simple).toBe(1);
    expect((await simplifyOverview(db)).mode).toBe("custom"); // 시험 seed: simple.* 0, 입고 서명 생략 1
    expect(await applySimplifyMode(db, ids.owner, "standard")).toBe(1); // 입고 서명 생략만 남아 있었음
    expect((await simplifyOverview(db)).mode).toBe("standard");
    expect(await applySimplifyMode(db, ids.owner, "simple")).toBe(SIMPLIFY_ITEMS.length);
    expect((await simplifyOverview(db)).mode).toBe("simple");
    expect(await setSimple(db, ids.owner, "simple.check_all", true)).toBe(false);
    expect(await setSimple(db, ids.owner, "simple.check_all", false)).toBe(true);
    expect((await loadPolicy(db))["simple.check_all"]).toBe(0);
    expect((await simplifyOverview(db)).mode).toBe("custom");
    await expect(setSimple(db, ids.owner, "estimate.valid_days", true)).rejects.toThrow(/간소화 항목/);
  });
});

describe("고객 승인 때 작업 지시서 자동", () => {
  it("켜면 승인하는 순간 지시서가 생기고 역량 기준을 넘는 기술자가 일이 적은 순으로 담당이 된다", async () => {
    await turnOn("simple.work_order_auto");
    const { roId } = await approvedRepair(db, ids, now);
    const [w] = await db.select().from(workOrder).where(eq(workOrder.repairOrderId, roId));
    expect(w).toBeTruthy();
    expect(w.createdBy).toBeNull();
    const steps = await db.select().from(workStep).where(eq(workStep.workOrderId, w.id));
    expect(steps.length).toBeGreaterThan(0);
    const assigned = steps.filter((s) => s.assignee);
    expect(assigned.length).toBeGreaterThan(0);
    for (const s of assigned) expect([ids.tech1, ids.tech2]).toContain(s.assignee);
    // 공장장에게 알림, 공장장이 다시 눌러도 같은 지시서
    const n = await db.select().from(notification).where(and(eq(notification.userId, ids.manager), eq(notification.dedupeKey, `work-auto-${w.id}`)));
    expect(n).toHaveLength(1);
    expect((await createWorkOrder(db, { id: ids.manager, roles: ["plant_manager"] }, roId, now)).id).toBe(w.id);
  });

  it("끄면(표준) 만들지 않는다", async () => {
    const off = await approvedRepair(db, ids, now);
    expect(await db.select().from(workOrder).where(eq(workOrder.repairOrderId, off.roId))).toHaveLength(0);
  });

  it("건별 끄기(공장장이 직접 배정)는 공장장만 한다", async () => {
    await turnOn("simple.work_order_auto");
    // 승인 전에 공장장이 끈다: approvedRepair 안에서 승인하므로 flow 를 둘로 나누지 않고, 끄는 권한만 확인
    await expect(setManualWorkOrder(db, { id: ids.tech1, roles: ["technician"] }, "00000000-0000-0000-0000-000000000000", true)).rejects.toThrow(/공장장/);
  });
});

describe("업무일지 확인 생략", () => {
  it("적은 것이 없고 안전 '없음'이면 바로 확인 끝, 무엇이든 적으면 공장장 확인", async () => {
    await turnOn("simple.journal_quiet");
    const tech = { id: ids.tech1, roles: ["technician" as const] };
    const blank = { notes: "", tomorrow: "", offApp: [], suggestionText: "", safety: "yes", safetyNote: "" };
    expect((await closeEntry(db, tech, "2026-11-09", blank, now)).status).toBe("confirmed");
    const tech2 = { id: ids.tech2, roles: ["technician" as const] };
    expect((await closeEntry(db, tech2, "2026-11-09", { ...blank, notes: "부품 늦음" }, now)).status).toBe("closed");
  });
});

describe("알림 묶기", () => {
  it("급한 알림만 바로 깨우고, 나머지는 묶음 한 건으로 깨운다", async () => {
    await turnOn("simple.notice_digest");
    expect(isUrgentNotice("est-answer-ES-1-advisor")).toBe(true);
    expect(isUrgentNotice("stock-low-1")).toBe(false);
    expect(isUrgentNotice(null)).toBe(false);
    await subscribeStaffPush(db, ids.tech1, "https://push.example.com/abc", "phone");
    const t = new Date();
    await notifyUser(db, ids.tech1, "작업 배정: 앞범퍼", "work-assign-1-x", "/work");
    await notifyUser(db, ids.tech1, "재고 부족: 클립", "stock-low-1", "/stock");
    await notifyRole(db, "technician", "교육 기한", "tr-remind-1", "/training");
    let sent = 0;
    const f = (async () => {
      sent++;
      return new Response(null, { status: 201 });
    }) as unknown as typeof fetch;
    await pushPending(db, t, f);
    expect(sent).toBe(1); // tech1 기기 한 번(작업 배정)
    const mine = async () => await db.select().from(notification).where(eq(notification.userId, ids.tech1));
    let list = await mine();
    expect(list.find((n) => n.dedupeKey === "work-assign-1-x")?.pushedAt).toBeTruthy();
    expect(list.find((n) => n.dedupeKey === "stock-low-1")?.pushedAt).toBeNull();
    expect(list.find((n) => n.dedupeKey === "tr-remind-1")?.pushedAt).toBeNull();
    expect(await digestNotices(db, "noon", t)).toMatch(/알림 묶음/);
    list = await mine();
    const digests = list.filter((n) => n.dedupeKey?.startsWith("digest-"));
    expect(digests).toHaveLength(1);
    expect(digests[0].title).toMatch(/알림 \d+건\(오전 묶음\)/);
    expect(list.find((n) => n.dedupeKey === "stock-low-1")?.pushedAt).toBeTruthy();
    await pushPending(db, t, f);
    expect(sent).toBe(2); // 묶음 한 번
    expect(await digestNotices(db, "eve", t)).toBe("묶을 알림 없음");
    expect(await db.select().from(staffPush)).toHaveLength(1);
  });
});

describe("입고 사진 한 번에", () => {
  it("찍은 순서대로 빈 8방향·계기판 자리에, 남으면 근접 사진으로", () => {
    const f = (n: number) => Array.from({ length: n }, (_, i) => ({ lastModified: i }));
    expect(bulkPlan(f(9), [])).toEqual(["front", "front_left", "left", "rear_left", "rear", "rear_right", "right", "front_right", "dash"]);
    expect(bulkPlan(f(3), ["front", "left"])).toEqual(["front_left", "rear_left", "rear"]);
    expect(bulkPlan(f(2), ["front", "front_left", "left", "rear_left", "rear", "rear_right", "right", "front_right", "dash"])).toEqual(["close", "close"]);
  });
});
