// 교육 기록(F-11-03): 연간 계획 불러오기, 실시·이수 서명, 효과 확인·재교육, 채용 시 교육, 할 일
import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { staffProfile } from "@/db/schema";
import { myTodos } from "@/modules/dashboard/todo";
import {
  cancelTraining,
  checkEffect,
  createTraining,
  getTraining,
  hiresWithoutTraining,
  importYearPlan,
  listTrainings,
  recordHeld,
  signTraining,
  trainingMatrix,
  trainingTodos,
  updateTraining,
} from "@/modules/staff/training";
import { DEFAULT_PLAN } from "@/modules/staff/training-rules";
import { seedShop, testDb } from "./db";

let db: Db;
let ids: Awaited<ReturnType<typeof seedShop>>;
beforeEach(async () => {
  db = await testDb();
  ids = await seedShop(db);
});
const owner = () => ({ id: ids.owner, roles: ["owner" as const] });
const pm = () => ({ id: ids.manager, roles: ["plant_manager" as const] });
const tech = () => ({ id: ids.tech1, roles: ["technician" as const] });
const jan = new Date("2027-01-05T03:00:00Z");

describe("교육 훈련", () => {
  it("연간 계획: 대표만, 기본 계획 → 다음 해는 작년 계획, 중복 건너뜀", async () => {
    await expect(importYearPlan(db, pm(), 2027, jan)).rejects.toThrow(/대표/);
    expect(
      (await trainingTodos(db, owner(), "2027-01-05")).map((t) => t.key),
    ).toContain("tr-plan-2027");
    const r = await importYearPlan(db, owner(), 2027, jan);
    expect(r).toEqual({ n: DEFAULT_PLAN.length, from: "default" });
    expect((await importYearPlan(db, owner(), 2027, jan)).n).toBe(0);
    const list = await listTrainings(db, 2027);
    await cancelTraining(db, owner(), list[0].t.id, "외부 교육으로 대체", jan);
    const next = await importYearPlan(db, owner(), 2028, jan);
    expect(next).toEqual({ n: DEFAULT_PLAN.length - 1, from: "last" });
    expect(
      (await listTrainings(db, 2028))[0].t.plannedMonth?.startsWith("2028-"),
    ).toBe(true);
  });

  it("실시 → 이수 서명 → 효과 없음이면 재교육", async () => {
    const id = await createTraining(
      db,
      pm(),
      {
        year: 2027,
        kind: "job",
        title: "신규 도료 교육",
        plannedMonth: "2027-01",
        plannedHours: 4,
        target: "도장",
        organizerId: ids.tech2,
      },
      jan,
    );
    await expect(
      createTraining(
        db,
        tech(),
        {
          year: 2027,
          kind: "job",
          title: "x",
          plannedMonth: "",
          plannedHours: null,
          target: "",
          organizerId: "",
        },
        jan,
      ),
    ).rejects.toThrow(/대표·공장장/);
    await expect(
      updateTraining(
        db,
        pm(),
        id,
        {
          year: 2027,
          kind: "job",
          title: "신규 도료 교육",
          plannedMonth: "2028-02",
          plannedHours: 4,
          target: "",
          organizerId: "",
        },
        jan,
      ),
    ).rejects.toThrow(/같은 해/);
    expect(
      (await trainingTodos(db, pm(), "2027-01-05")).some(
        (t) => t.key === `tr-due-${id}`,
      ),
    ).toBe(true);
    // 주관자(tech2)는 관리 권한이 없어도 기록할 수 있다. tech1 은 못 함
    await expect(
      recordHeld(
        db,
        tech(),
        id,
        {
          heldOn: "2027-01-05",
          hours: 4,
          instructor: "도료사",
          content: "",
          attendeeIds: [ids.tech1],
        },
        jan,
      ),
    ).rejects.toThrow(/주관자/);
    const org = { id: ids.tech2, roles: ["technician" as const] };
    await expect(
      recordHeld(
        db,
        org,
        id,
        {
          heldOn: "2027-01-09",
          hours: 4,
          instructor: "도료사",
          content: "",
          attendeeIds: [ids.tech1],
        },
        jan,
      ),
    ).rejects.toThrow(/오지 않은/);
    await expect(
      recordHeld(
        db,
        org,
        id,
        {
          heldOn: "2027-01-05",
          hours: 4,
          instructor: "도료사",
          content: "",
          attendeeIds: [],
        },
        jan,
      ),
    ).rejects.toThrow(/이수자/);
    await recordHeld(
      db,
      org,
      id,
      {
        heldOn: "2027-01-05",
        hours: 4,
        instructor: "도료사",
        content: "수성 도료",
        attendeeIds: [ids.tech1, ids.tech2],
      },
      jan,
    );
    expect(
      (await trainingTodos(db, tech(), "2027-01-05")).map((t) => t.key),
    ).toContain(`tr-sign-${id}`);
    await signTraining(db, tech(), id, jan);
    await expect(signTraining(db, pm(), id, jan)).rejects.toThrow(
      /이수자가 아닙니다/,
    );
    // 서명한 사람은 뺄 수 없다
    await expect(
      recordHeld(
        db,
        org,
        id,
        {
          heldOn: "2027-01-05",
          hours: 4,
          instructor: "도료사",
          content: "",
          attendeeIds: [ids.tech2],
        },
        jan,
      ),
    ).rejects.toThrow(/서명한/);
    const m = await trainingMatrix(db, 2027);
    expect(m.find((u) => u.id === ids.tech1)!.by.job).toEqual({
      hours: 4,
      unsigned: 0,
    });
    expect(m.find((u) => u.id === ids.tech2)!.by.job).toEqual({
      hours: 0,
      unsigned: 1,
    });
    const { t } = await getTraining(db, id);
    expect(t.effectDue).toBe("2027-02-04");
    const feb = new Date("2027-02-01T03:00:00Z");
    expect(
      (await trainingTodos(db, pm(), "2027-02-01")).some(
        (x) => x.key === `tr-eff-${id}`,
      ),
    ).toBe(true);
    await expect(
      checkEffect(
        db,
        tech(),
        id,
        { method: "practice", result: "none", note: "x" },
        feb,
      ),
    ).rejects.toThrow(/공장장/);
    await expect(
      checkEffect(
        db,
        pm(),
        id,
        { method: "practice", result: "none", note: " " },
        feb,
      ),
    ).rejects.toThrow(/근거/);
    const r = await checkEffect(
      db,
      pm(),
      id,
      { method: "practice", result: "none", note: "실습 기준 미달 2명" },
      feb,
    );
    expect(r.retrain).toBeTruthy();
    const re = await getTraining(db, r.retrain!);
    expect(re.t).toMatchObject({
      title: "신규 도료 교육 (재교육)",
      plannedMonth: "2027-03",
      status: "planned",
    });
    await expect(
      checkEffect(
        db,
        pm(),
        id,
        { method: "practice", result: "effective", note: "x" },
        feb,
      ),
    ).rejects.toThrow(/이미/);
  });

  it("채용 시 교육: 신규 입사자 할 일 → 이수하면 사라짐", async () => {
    await db
      .insert(staffProfile)
      .values({ userId: ids.tech2, hiredOn: "2026-12-20" });
    await db
      .insert(staffProfile)
      .values({ userId: ids.tech1, hiredOn: "2020-03-01" });
    const hires = await hiresWithoutTraining(db, "2027-01-05");
    expect(hires.map((h) => h.id)).toEqual([ids.tech2]);
    const todos = await myTodos(db, { id: ids.safety, roles: ["safety"] }, jan);
    expect(todos.some((t) => t.key === `tr-hire-${ids.tech2}`)).toBe(true);
    const id = await createTraining(
      db,
      owner(),
      {
        year: 2027,
        kind: "safety_hire",
        title: "채용 시 교육",
        plannedMonth: "",
        plannedHours: 8,
        target: "신규 입사자",
        organizerId: "",
      },
      jan,
    );
    await recordHeld(
      db,
      owner(),
      id,
      {
        heldOn: "2027-01-05",
        hours: 8,
        instructor: "안전환경 담당",
        content: "",
        attendeeIds: [ids.tech2],
      },
      jan,
    );
    expect(await hiresWithoutTraining(db, "2027-01-05")).toHaveLength(0);
    expect((await getTraining(db, id)).t.effectDue).toBeNull();
  });
});
