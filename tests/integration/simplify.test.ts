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
import { addStepPhoto, assignGroup, createWorkOrder, finishGroup, getWorkOrder, setManualWorkOrder, startStep, workTodos } from "@/modules/repair/work";
import { checkValue, groupSteps, PROCESSES, splitMinutes, type Process } from "@/modules/repair/work-rules";
import { repairOrder } from "@/db/schema";
import { closeEntry } from "@/modules/journal/entry";
import { bulkPlan } from "@/app/repairs/photo-slots";
import { approvedRepair, estimating, WEBP } from "./flow";
import { itemsFor, judge } from "@/modules/repair/inspect-rules";
import { needDeliverSign } from "@/modules/repair/inspect";
import { createEstimate, getEstimate, saveEstimateHeader, saveLine, submitEstimate } from "@/modules/repair/estimate";
import { FEATURES, hiddenHrefs, setFeature } from "@/modules/platform/features";
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

describe("공정 3묶음·사진 묶음당 1장", () => {
  const boss = () => ({ id: ids.manager, roles: ["plant_manager" as const] });
  const tech = () => ({ id: ids.tech1, roles: ["technician" as const] });
  const tech2 = () => ({ id: ids.tech2, roles: ["technician" as const] });
  const allChecks = (ps: string[]) => ps.flatMap((p) => PROCESSES[p as Process].checks.map((c) => checkValue(p, c)));

  it("시간 나누기는 표준 시간 비율, 합은 그대로", () => {
    expect(splitMinutes(100, [30, 10, 0])).toEqual([75, 25, 0]);
    expect(splitMinutes(10, [0, 0, 0])).toEqual([4, 3, 3]);
  });

  it("묶음 단위로 첫 사진이 시작, '묶음 끝' 한 번으로 공정이 모두 끝나고 마지막 묶음이면 검사 대기", async () => {
    await turnOn("simple.step_groups");
    await turnOn("simple.photo_per_group");
    const { roId } = await approvedRepair(db, ids, now, (names) => names.some((n) => n.includes("범퍼")));
    const { id } = await createWorkOrder(db, boss(), roId, now);
    let w = await getWorkOrder(db, id);
    const groups = groupSteps(w.steps);
    expect(groups.map((g) => g.key)).toEqual(["prep", "paint", "finish"]);
    await expect(assignGroup(db, tech(), id, "prep", { assignee: ids.tech1, planDate: "" }, now)).rejects.toThrow(/공장장/);
    for (const g of groups) await assignGroup(db, boss(), id, g.key, { assignee: g.key === "paint" ? ids.tech2 : ids.tech1, planDate: "2026-11-10" }, now);
    expect((await workTodos(db, tech(), now)).filter((x) => x.kind === "mine").map((x) => x.label)).toEqual([expect.stringContaining("판금 준비")]);
    expect((await workTodos(db, tech2(), now)).filter((x) => x.kind === "mine")).toHaveLength(0);
    // 앞 묶음이 안 끝나면 사진(시작)도 끝도 안 됨
    const paintStep = groups[1].steps.find((s) => s.process === "paint")!;
    await expect(addStepPhoto(db, tech2(), paintStep.id, WEBP)).rejects.toThrow(/앞 묶음/);
    await expect(finishGroup(db, tech2(), id, "paint", { checks: [], detail: {}, note: "" }, now)).rejects.toThrow(/앞 묶음/);
    // 판금 준비: 사진 없이는 못 끝냄 → 사진 1장(시작) → 다른 기술자는 못 끝냄 → 끝
    const prep = groups[0];
    const prepPs = prep.steps.map((s) => s.process);
    await expect(finishGroup(db, tech(), id, "prep", { checks: allChecks(prepPs), detail: {}, note: "" }, now)).rejects.toThrow(/묶음 사진/);
    await addStepPhoto(db, tech(), prep.steps[0].id, WEBP, now);
    w = await getWorkOrder(db, id);
    expect(w.status).toBe("working");
    expect(w.steps.filter((s) => prepPs.includes(s.process)).every((s) => s.startedAt)).toBe(true);
    await expect(finishGroup(db, tech2(), id, "prep", { checks: allChecks(prepPs), detail: {}, note: "" }, now)).rejects.toThrow(/담당/);
    await expect(finishGroup(db, tech(), id, "prep", { checks: allChecks(prepPs).slice(1), detail: {}, note: "" }, now)).rejects.toThrow(/자주 검사/);
    expect((await finishGroup(db, tech(), id, "prep", { checks: allChecks(prepPs), detail: {}, note: "" }, new Date(now.getTime() + 60 * 60000))).done).toBe(false);
    // 도장: 배합·건조 조건을 함께 적어야 끝남, 기록은 공정별로 나뉘어 남는다
    const paint = groupSteps((await getWorkOrder(db, id)).steps)[1];
    const paintPs = paint.steps.map((s) => s.process);
    await addStepPhoto(db, tech2(), paintStep.id, WEBP, now);
    await expect(finishGroup(db, tech2(), id, "paint", { checks: allChecks(paintPs), detail: { colorCode: "NKA" }, note: "" }, now)).rejects.toThrow(/배합 번호/);
    await finishGroup(db, tech2(), id, "paint", { checks: allChecks(paintPs), detail: { colorCode: "NKA", mixNo: "M-1", tempC: "60", minutes: "30" }, note: "블렌딩" }, now);
    w = await getWorkOrder(db, id);
    expect(w.steps.find((s) => s.process === "color")!.detail).toEqual({ colorCode: "NKA", mixNo: "M-1" });
    expect(w.steps.find((s) => s.process === "dry")!.detail).toEqual({ tempC: "60", minutes: "30" });
    expect(w.steps.find((s) => s.process === "mask")!.checks).toEqual([...PROCESSES.mask.checks]);
    // 마무리
    const fin = groupSteps(w.steps)[2];
    await addStepPhoto(db, tech(), fin.steps[0].id, WEBP, now);
    expect((await finishGroup(db, tech(), id, "finish", { checks: allChecks(fin.steps.map((s) => s.process)), detail: {}, note: "" }, now)).done).toBe(true);
    const [r] = await db.select({ status: repairOrder.status }).from(repairOrder).where(eq(repairOrder.id, roId));
    expect(r.status).toBe("inspecting");
  });

  it("보험 수리 건은 사진이 필요한 공정마다 1장", async () => {
    await turnOn("simple.step_groups");
    await turnOn("simple.photo_per_group");
    const { roId } = await approvedRepair(db, ids, now, (names) => names.some((n) => n.includes("범퍼")));
    await db.update(repairOrder).set({ insurance: "own" }).where(eq(repairOrder.id, roId));
    const { id } = await createWorkOrder(db, boss(), roId, now);
    const prep = groupSteps((await getWorkOrder(db, id)).steps)[0];
    await assignGroup(db, boss(), id, "prep", { assignee: ids.tech1, planDate: "" }, now);
    const need = prep.steps.filter((s) => PROCESSES[s.process as Process].photo);
    await addStepPhoto(db, tech(), prep.steps[0].id, WEBP, now);
    if (need.length > 1) await expect(finishGroup(db, tech(), id, "prep", { checks: allChecks(prep.steps.map((s) => s.process)), detail: {}, note: "" }, now)).rejects.toThrow(/사진/);
    for (const s of need.slice(1)) await addStepPhoto(db, tech(), s.id, WEBP, now);
    await finishGroup(db, tech(), id, "prep", { checks: allChecks(prep.steps.map((s) => s.process)), detail: {}, note: "" }, now);
  });

  it("끄면 묶음 끝은 막히고 공정마다 시작한다", async () => {
    const { roId } = await approvedRepair(db, ids, now, (names) => names.some((n) => n.includes("범퍼")));
    const { id } = await createWorkOrder(db, boss(), roId, now);
    const w = await getWorkOrder(db, id);
    await expect(finishGroup(db, tech(), id, "prep", { checks: [], detail: {}, note: "" }, now)).rejects.toThrow(/꺼져/);
    await assignGroup(db, boss(), id, "prep", { assignee: ids.tech1, planDate: "" }, now);
    await expect(addStepPhoto(db, tech(), w.steps[0].id, WEBP, now)).rejects.toThrow(/시작한 공정/);
    await startStep(db, tech(), w.steps[0].id, now);
  });
});

describe("3묶음: 검사·출고·소액 견적·기능 끄기", () => {
  it("최종 검사: 켜면 자비 건은 도막 두께를 묻지 않는다", async () => {
    expect(itemsFor(["paint"]).map((i) => i.key)).toContain("film");
    expect(itemsFor(["paint"], true).map((i) => i.key)).not.toContain("film");
    const lim = { gapMm: 2, filmMin: 80, filmMax: 250, photos: 0 };
    const passed = itemsFor(["paint"], true).map((i) => i.key);
    expect(judge(["paint"], { passed, gapMm: null, filmUm: [], failNote: "" }, 0, { ...lim, skipFilm: true }).pass).toBe(true);
    expect(judge(["paint"], { passed, gapMm: null, filmUm: [], failNote: "" }, 0, lim).pass).toBe(false);
  });

  it("출고 인수 서명: 켜도 대리인·보험 건은 서명", async () => {
    const p = await loadPolicy(db);
    expect(needDeliverSign(p, { insurance: "self" }, false)).toBe(true); // 시험 seed 는 끔
    await turnOn("simple.deliver_sign_skip");
    const on = await loadPolicy(db);
    expect(needDeliverSign(on, { insurance: "self" }, false)).toBe(false);
    expect(needDeliverSign(on, { insurance: "self" }, true)).toBe(true);
    expect(needDeliverSign(on, { insurance: "own" }, false)).toBe(true);
  });

  it("소액 견적: 기준 이하면 검토 요청 없이 검토 끝, 넘으면 전결 규정대로", async () => {
    const advisor = { id: ids.advisor, roles: ["advisor" as const] };
    await turnOn("simple.estimate_small");
    const roId = await estimating(db, ids, now);
    const { id } = await createEstimate(db, advisor, roId, now);
    const e = await getEstimate(db, id);
    for (const l of e.lines.filter((x) => x.category === "part")) await saveLine(db, advisor, id, { id: l.id, payer: l.payer, category: "part", name: l.name, partCode: "D", partNo: "", qty: 1, unitWon: 180_000, laborMinutes: null, laborWon: null, note: "" }, now);
    await saveEstimateHeader(db, advisor, id, { kind: e.kind, paintGrade: "metallic", dueDate: "2026-11-13", note: "", registeredOn: "2021-03-15" }, now);
    const total = (await getEstimate(db, id)).totalWon;
    // 기준(50만 원)보다 크면 검토 요청
    if (total > 500_000) {
      await db.insert(policySetting).values({ key: "estimate.small_won", value: total, effectiveFrom: "2000-01-02", reason: "시험", changedBy: ids.owner });
    }
    expect(await submitEstimate(db, advisor, id, now)).toBeNull();
    expect((await getEstimate(db, id)).status).toBe("approved");
  });

  it("기능 끄기: 숨긴 메뉴 주소, 다시 켜면 돌아옴, 목록 밖은 못 끔", async () => {
    expect(await hiddenHrefs(db)).toEqual([]);
    expect(await setFeature(db, ids.owner, "gifts", false)).toBe(true);
    expect(await setFeature(db, ids.owner, "gifts", false)).toBe(false);
    expect(await hiddenHrefs(db)).toEqual(["/gifts/send", "/gifts", "/settings/gift"]);
    await setFeature(db, ids.owner, "gifts", true);
    expect(await hiddenHrefs(db)).toEqual([]);
    await expect(setFeature(db, ids.owner, "estimates", false)).rejects.toThrow(/끌 수 없는/);
    expect(FEATURES.flatMap((f) => f.hrefs)).not.toContain("/estimates");
  });
});
