// 설비 관리(STD-08): 대장·점검(× → 사용 금지·고장 기록)·윤활 기한·교정·운전 일지·예방정비·공정 시작 경고
import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { equipment, equipmentFailure, notification, pmTask } from "@/db/schema";
import { addMonthsIso, checkIssues, dueState, monthsForCycle, nextEqNo, pmDueDates, pmKpi } from "@/modules/equipment/rules";
import {
  addLubePoint,
  addPmItem,
  addRunLog,
  approvePlan,
  closeFailure,
  createPlan,
  equipmentDailyAlerts,
  equipmentDefaults,
  getEquipment,
  getPlan,
  monthKpi,
  processEquipmentWarnings,
  recordCalibration,
  recordCheck,
  recordLube,
  recordPmTask,
  resumeEquipment,
  saveEquipment,
  todayBoard,
  updateFailure,
  type EquipmentInput,
} from "@/modules/equipment/service";
import { seedShop, testDb } from "./db";

let db: Db;
let ids: Awaited<ReturnType<typeof seedShop>>;
beforeEach(async () => {
  db = await testDb();
  ids = await seedShop(db);
});
const now = new Date("2026-11-09T01:00:00Z"); // 서울 11-09 10:00
const owner = () => ({ id: ids.owner, roles: ["owner" as const] });
const mgr = () => ({ id: ids.manager, roles: ["plant_manager" as const] });
const tech = () => ({ id: ids.tech1, roles: ["technician" as const] });
const quality = () => ({ id: ids.quality, roles: ["quality" as const] });
const acct = () => ({ id: ids.account, roles: ["accounting" as const] });

async function booth(o: Partial<EquipmentInput> = {}) {
  const d = await equipmentDefaults(db, "booth");
  return saveEquipment(db, mgr(), { name: "도장 부스", kind: "booth", grade: d.grade, checkDaily: true, checkMonthly: true, dailyItems: d.dailyItems, monthlyItems: d.monthlyItems, processes: d.processes, ownerId: ids.tech1, trialOn: "2026-11-02", ...o }, undefined, now);
}

describe("설비 규칙", () => {
  it("번호·기한·주기·집계", () => {
    expect(nextEqNo(["EQ-001", "EQ-009"])).toBe("EQ-010");
    expect(dueState("2026-11-08", "2026-11-09", 3)).toBe("overdue");
    expect(dueState("2026-11-12", "2026-11-09", 3)).toBe("soon");
    expect(dueState("2026-11-20", "2026-11-09", 3)).toBe("ok");
    expect(monthsForCycle(3)).toEqual([1, 4, 7, 10]);
    expect(pmDueDates(2027, [2, 1], 31)).toEqual(["2027-01-31", "2027-02-28"]);
    expect(addMonthsIso("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonthsIso("2026-11-09", 12)).toBe("2027-11-09");
    expect(checkIssues([{ item: "팬", std: "", mark: "x" }]).join()).toMatch(/조치/);
    expect(pmKpi({ due: 4, done: 3, failures: 2, downMinutes: 90, periodDays: 30 })).toMatchObject({ rate: 75, mttr: 45, mtbfDays: 15 });
  });
});

describe("설비 관리 흐름", () => {
  it("등록은 공장장, 점검 ×면 사용 금지·고장 기록, 공장장 확인 뒤 다시 사용", async () => {
    await expect(saveEquipment(db, tech(), { name: "x", kind: "booth", grade: "A", checkDaily: false, checkMonthly: false, dailyItems: [], monthlyItems: [], processes: [] })).rejects.toThrow(/공장장/);
    const { id, no, warnings } = await booth({ ownerId: "" });
    expect(no).toBe("EQ-001");
    expect(warnings.join()).toMatch(/설비 담당/);
    expect((await booth()).no).toBe("EQ-002");

    // 공정 시작 경고: A등급 점검 안 함
    expect((await processEquipmentWarnings(db, "paint", "2026-11-09")).join()).toMatch(/일상 점검/);
    expect(await processEquipmentWarnings(db, "dent", "2026-11-09")).toEqual([]);

    const n = (await getEquipment(db, id)).e.dailyItems.length;
    const marks = Array(n).fill("o");
    await expect(recordCheck(db, acct(), id, { kind: "daily", marks, notes: [] }, now)).rejects.toThrow(/기술자/);
    await expect(recordCheck(db, tech(), id, { kind: "daily", marks: marks.slice(1), notes: [] }, now)).rejects.toThrow(/표기하지 않은/);
    const ok = await recordCheck(db, tech(), id, { kind: "daily", marks, notes: [] }, now);
    expect(ok.ok).toBe(true);

    const bad = [...marks];
    bad[1] = "x";
    await expect(recordCheck(db, tech(), id, { kind: "daily", marks: bad, notes: [] }, now)).rejects.toThrow(/조치/);
    const notes = [];
    notes[1] = "차압 250Pa, 필터 막힘";
    const r = await recordCheck(db, tech(), id, { kind: "daily", marks: bad, notes }, now);
    expect(r.ok).toBe(false);
    expect(r.failureId).toBeTruthy();
    const [e1] = await db.select().from(equipment).where(eq(equipment.id, id));
    expect(e1.status).toBe("stopped");
    expect((await processEquipmentWarnings(db, "paint", "2026-11-09")).join()).toMatch(/사용 금지/);
    expect((await db.select().from(notification).where(eq(notification.userId, ids.manager))).some((x) => /사용 금지/.test(x.title))).toBe(true);

    await expect(closeFailure(db, tech(), r.failureId!, now)).rejects.toThrow(/공장장/);
    await expect(closeFailure(db, mgr(), r.failureId!, now)).rejects.toThrow(/조치/);
    await expect(resumeEquipment(db, mgr(), id, now)).rejects.toThrow(/고장 기록/);
    // 부적합 보고를 고르면 F-Q-10이 발행되고 번호가 채워진다
    await updateFailure(db, tech(), r.failureId!, { action: "필터 교체", cause: "wear", downMinutes: 40, prevention: ["pm", "nc"] });
    const [fr] = await db.select().from(equipmentFailure).where(eq(equipmentFailure.id, r.failureId!));
    expect(fr.ncRef).toMatch(/^NC-/);
    const c = await closeFailure(db, mgr(), r.failureId!, now);
    expect(c).toMatchObject({ resumed: true, repeat: false });
    const [e2] = await db.select().from(equipment).where(eq(equipment.id, id));
    expect(e2.status).toBe("in_use");

    // 운전 일지: 숫자 칸, 이상이면 고장 기록
    await expect(addRunLog(db, tech(), id, { data: { boothTemp: "스물" } }, now)).rejects.toThrow(/숫자/);
    const run = await addRunLog(db, tech(), id, { data: { start: "09:00", boothTemp: "22", filterPa: "120" }, abnormal: "배기 팬 진동" }, now);
    expect(run.failureId).toBeTruthy();
    await updateFailure(db, mgr(), run.failureId!, { action: "베어링 교체", cause: "lube", downMinutes: 60, prevention: ["pm"] });
    expect((await closeFailure(db, mgr(), run.failureId!, now)).repeat).toBe(true); // 분기 2회째
  });

  it("윤활 기한·이상 알림, 교정 불합격은 사용 금지, 매일 알림", async () => {
    const { id } = await booth();
    await expect(addLubePoint(db, tech(), id, { spot: "팬 베어링", oil: "그리스", cycleDays: 30 })).rejects.toThrow(/공장장/);
    await addLubePoint(db, mgr(), id, { spot: "팬 베어링", oil: "리튬 그리스 2호", cycleDays: 30, firstDue: "2026-11-11" }, now);
    const pts = (await getEquipment(db, id)).points;
    expect(pts[0].code).toBe("L-01");
    expect((await todayBoard(db, "2026-11-09")).lubeDue.length).toBe(1); // 3일 안
    await expect(recordLube(db, tech(), pts[0].id, { state: "leak" }, now)).rejects.toThrow(/조치/);
    const l = await recordLube(db, tech(), pts[0].id, { state: "leak", action: "실 교체 요청" }, now);
    expect(l.nextDueOn).toBe("2026-12-09");

    const d = await equipmentDefaults(db, "gauge");
    expect(d.calibMonths).toBe(12);
    await expect(saveEquipment(db, mgr(), { name: "도막 측정기", kind: "gauge", grade: "B", checkDaily: true, checkMonthly: false, dailyItems: d.dailyItems, monthlyItems: [], processes: [], calibMonths: 12 })).rejects.toThrow(/다음 교정일/);
    const g = await saveEquipment(db, mgr(), { name: "도막 측정기", kind: "gauge", grade: "B", checkDaily: true, checkMonthly: false, dailyItems: d.dailyItems, monthlyItems: [], processes: [], calibMonths: 12, calibNextOn: "2026-11-20" }, undefined, now);
    await expect(recordCalibration(db, tech(), g.id, { calibratedOn: "2026-11-09", agency: "KTL", pass: true }, now)).rejects.toThrow(/품질/);
    await recordCalibration(db, quality(), g.id, { calibratedOn: "2026-11-09", agency: "KTL", pass: false }, now);
    expect((await getEquipment(db, g.id)).e).toMatchObject({ status: "stopped", stopReason: "교정 불합격" });
    const ok = await recordCalibration(db, quality(), g.id, { calibratedOn: "2026-11-09", agency: "KTL", pass: true }, now);
    expect(ok.nextOn).toBe("2027-11-09");
    expect((await getEquipment(db, g.id)).e.status).toBe("in_use");

    expect(await equipmentDailyAlerts(db, now)).toMatch(/설비 알림/);
  });

  it("예방정비: 공장장 계획, 대표 승인 때 일정 생성, 실적·집계, 다음 해는 불러오기", async () => {
    const { id } = await booth();
    const p = await createPlan(db, mgr(), 2026, now);
    await expect(addPmItem(db, mgr(), p.id, { equipmentId: id, task: "입기 필터 교체", cycleMonths: 3, months: [], external: false })).rejects.toThrow(/계획 월/);
    await addPmItem(db, mgr(), p.id, { equipmentId: id, task: "입기 필터 교체", cycleMonths: 3, months: monthsForCycle(3, 2), day: 5, external: false }, now);
    await addPmItem(db, mgr(), p.id, { equipmentId: id, task: "버너 점검", cycleMonths: 12, months: [11], external: true, cost: 300_000 }, now);
    await expect(approvePlan(db, mgr(), p.id, now)).rejects.toThrow(/대표/);
    expect(await approvePlan(db, owner(), p.id, now)).toBe(2); // 11월부터(지난달 일정은 만들지 않음)
    await expect(addPmItem(db, mgr(), p.id, { equipmentId: id, task: "x", cycleMonths: 1, months: [1], external: false })).rejects.toThrow(/승인/);
    const plan = await getPlan(db, 2026);
    const nov = plan!.tasks.filter((t) => t.dueOn.startsWith("2026-11"));
    expect(nov.length).toBe(2);
    const ext = nov.find((t) => plan!.items.find((i) => i.id === t.itemId)!.external)!;
    await expect(recordPmTask(db, tech(), ext.id, { work: "버너 노즐 청소" }, now)).rejects.toThrow(/업체/);
    await recordPmTask(db, tech(), ext.id, { work: "버너 노즐 청소", vendor: "OO부스", cost: 280_000 }, now);
    const k = await monthKpi(db, "2026-11", "2026-11-09");
    expect(k).toMatchObject({ rate: 50 });
    expect((await todayBoard(db, "2026-11-09")).pmDue.length).toBe(1);

    const p2 = await createPlan(db, mgr(), 2027, now);
    expect(p2.copied).toBe(2);
    expect((await db.select().from(pmTask)).length).toBe(2);
  });
});
