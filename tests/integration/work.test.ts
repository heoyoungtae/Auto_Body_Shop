// 작업(STD-04): 승인한 줄만으로 작업 지시서, 배정, 앞 공정이 끝나야 다음 공정, 자주 검사·사진, 끝나면 검사 대기
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { repairOrder } from "@/db/schema";
import { addStepPhoto, assignRest, assignStep, createWorkOrder, finishStep, getWorkOrder, startStep, workTodos } from "@/modules/repair/work";
import { PROCESSES, type Process } from "@/modules/repair/work-rules";
import { approvedRepair, PNG, WEBP } from "./flow";
import { addInspectionPhoto, deliver, inspectionContext, inspectionsOf, issueStatement, judgeInspection, startInspection, statementOf } from "@/modules/repair/inspect";
import { itemsFor } from "@/modules/repair/inspect-rules";
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
const boss = () => ({ id: ids.manager, roles: ["plant_manager" as const] });
const tech = () => ({ id: ids.tech1, roles: ["technician" as const] });
const tech2 = () => ({ id: ids.tech2, roles: ["technician" as const] });
const detail: Partial<Record<Process, Record<string, string>>> = { color: { colorCode: "NKA", mixNo: "M-1" }, dry: { tempC: "60", minutes: "30" }, sheet: { weld: "없음" } };

describe("작업(STD-04)", () => {
  it("승인한 줄만으로 공정을 만들고, 순서·자주 검사·사진을 지키면 검사 대기로 넘어간다", async () => {
    // 앞문 덴트는 빼고 앞범퍼 묶음만 승인
    const { roId } = await approvedRepair(db, ids, now, (names) => names.some((n) => n.includes("범퍼")));
    await expect(createWorkOrder(db, tech(), roId, now)).rejects.toThrow(/공장장/);
    const { id } = await createWorkOrder(db, boss(), roId, now);
    expect((await createWorkOrder(db, boss(), roId, now)).id).toBe(id);
    let w = await getWorkOrder(db, id);
    expect(w.docNo).toBe("WO-2611-0001");
    expect(w.dueDate).toBe("2026-11-13");
    expect(w.steps.map((s) => s.process)).toEqual(["detach", "color", "mask", "paint", "dry", "polish", "calibrate", "assemble"]); // 덴트 없음
    expect((await workTodos(db, boss(), now)).map((t) => t.kind)).toEqual(["assign"]);

    const [detach, color, mask, paint] = w.steps;
    await expect(startStep(db, tech(), detach.id, now)).rejects.toThrow(/담당/);
    await expect(assignStep(db, boss(), detach.id, { assignee: ids.advisor, planDate: "", stdMinutes: null }, now)).rejects.toThrow(/기술자/);
    await assignStep(db, boss(), color.id, { assignee: ids.tech2, planDate: "2026-11-10", stdMinutes: null }, now);
    expect(await assignRest(db, boss(), id, { assignee: ids.tech1, planDate: "2026-11-10" }, now)).toBe(w.steps.length - 1);
    expect((await workTodos(db, tech(), now)).map((t) => t.label)).toEqual([expect.stringContaining("탈부착")]);
    await expect(startStep(db, tech2(), detach.id, now)).rejects.toThrow(/담당/);
    await expect(startStep(db, tech(), mask.id, now)).rejects.toThrow(/탈부착/);
    await startStep(db, tech(), detach.id, now);
    const all = PROCESSES.detach.checks as readonly string[];
    await expect(finishStep(db, tech(), detach.id, { checks: [...all], detail: {}, note: "" }, now)).rejects.toThrow(/사진/);
    await addStepPhoto(db, tech(), detach.id, WEBP);
    await expect(finishStep(db, tech(), detach.id, { checks: [all[0]], detail: {}, note: "" }, now)).rejects.toThrow(/자주 검사 2개/);
    await finishStep(db, tech(), detach.id, { checks: [...all], detail: {}, note: "" }, new Date(now.getTime() + 45 * 60000));
    // 조색은 마스킹과 함께 할 수 있지만, 도장은 조색이 끝나야
    await startStep(db, tech2(), color.id, now);
    await startStep(db, tech(), mask.id, now);
    await finishStep(db, tech(), mask.id, { checks: [...PROCESSES.mask.checks], detail: {}, note: "" }, now);
    await expect(startStep(db, tech(), paint.id, now)).rejects.toThrow(/조색/);
    await addStepPhoto(db, tech2(), color.id, WEBP);
    await expect(finishStep(db, tech2(), color.id, { checks: [...PROCESSES.color.checks], detail: {}, note: "" }, now)).rejects.toThrow(/배합 번호/);

    w = await getWorkOrder(db, id);
    for (const s of w.steps.filter((x) => !x.endedAt)) {
      const actor = s.process === "color" ? tech2() : tech();
      if (!s.startedAt) await startStep(db, actor, s.id, now);
      if (PROCESSES[s.process as Process].photo) await addStepPhoto(db, actor, s.id, WEBP);
      await finishStep(db, actor, s.id, { checks: [...PROCESSES[s.process as Process].checks], detail: detail[s.process as Process] ?? {}, note: "" }, now);
    }
    w = await getWorkOrder(db, id);
    expect(w.status).toBe("done");
    expect(w.steps[0].actualMinutes).toBe(45);
    expect(w.steps[1].detail).toEqual({ colorCode: "NKA", mixNo: "M-1" });
    const [ro] = await db.select().from(repairOrder).where(eq(repairOrder.id, roId));
    expect(ro.status).toBe("inspecting");
  });
});

describe("검사·출고(STD-05)", () => {
  async function workedRepair() {
    const { roId } = await approvedRepair(db, ids, now, (names) => names.some((n) => n.includes("덴트")));
    const { id } = await createWorkOrder(db, boss(), roId, now);
    await assignRest(db, boss(), id, { assignee: ids.tech1, planDate: "" }, now);
    await finishAll(id);
    return { roId, woId: id };
  }
  async function finishAll(woId: string) {
    const w = await getWorkOrder(db, woId);
    for (const s of w.steps.filter((x) => !x.endedAt)) {
      if (!s.assignee) await assignStep(db, boss(), s.id, { assignee: ids.tech1, planDate: "", stdMinutes: null }, now);
      if (!s.startedAt) await startStep(db, tech(), s.id, now);
      if (PROCESSES[s.process as Process].photo) await addStepPhoto(db, tech(), s.id, WEBP);
      await finishStep(db, tech(), s.id, { checks: [...PROCESSES[s.process as Process].checks], detail: detail[s.process as Process] ?? {}, note: "" }, now);
    }
  }
  const quality = () => ({ id: ids.quality, roles: ["quality" as const] });

  it("작업자는 검사 못 하고, 불합격이면 재작업 뒤 다시 검사, 합격하면 정비명세서·인수 서명으로 출고", async () => {
    const { roId, woId } = await workedRepair();
    await expect(startInspection(db, tech(), roId, "", now)).rejects.toThrow(/품질/);
    await expect(startInspection(db, { id: ids.tech1, roles: ["plant_manager"] }, roId, "", now)).rejects.toThrow(/사유/);
    const { id } = await startInspection(db, quality(), roId, "", now);
    const ctx = await inspectionContext(db, roId, now);
    const all = itemsFor(ctx.processes).map((i) => i.key);
    expect(all).toContain("surface");
    expect(all).not.toContain("film"); // 덴트만 — 도장 항목 없음
    // 사진 부족 + 메모 없이 불합격 → 막음
    await expect(judgeInspection(db, quality(), id, { passed: all, gapMm: null, filmUm: [], failNote: "" }, now)).rejects.toThrow(/사진/);
    const res = await judgeInspection(db, quality(), id, { passed: all.filter((k) => k !== "surface"), gapMm: null, filmUm: [], failNote: "앞문 아래 굴곡 남음" }, now);
    expect(res.pass).toBe(false);
    let [ro] = await db.select().from(repairOrder).where(eq(repairOrder.id, roId));
    expect(ro.status).toBe("working");
    expect((await getWorkOrder(db, woId)).steps.at(-1)!.process).toBe("rework");
    await finishAll(woId);
    const second = await startInspection(db, quality(), roId, "", now);
    for (let k = 0; k < 4; k++) await addInspectionPhoto(db, quality(), second.id, WEBP);
    expect((await judgeInspection(db, quality(), second.id, { passed: all, gapMm: null, filmUm: [], failNote: "" }, now)).pass).toBe(true);
    [ro] = await db.select().from(repairOrder).where(eq(repairOrder.id, roId));
    expect(ro.status).toBe("ready");
    expect((await inspectionsOf(db, roId)).map((i) => i.result)).toEqual(["fail", "pass"]);

    const advisor = { id: ids.advisor, roles: ["advisor" as const] };
    await expect(issueStatement(db, advisor, roId, { mileageOut: 40000 }, now)).rejects.toThrow(/입고 때/);
    const st = await issueStatement(db, advisor, roId, { mileageOut: 45012 }, now);
    const s = (await statementOf(db, roId))!;
    expect(s.docNo).toBe("IV-2611-0001");
    expect(s.totalWon).toBe(41_800); // 덴트 38,000 + 부가세
    expect((s.snapshot as { legalFreeDays: number }).legalFreeDays).toBe(60); // 2021년 등록·4.5만km
    expect(st.created).toBe(true);
    const deliverIn = { payMethod: "card", notices: ["photos", "care", "warranty"], receiverName: "홍길동", proxy: false, proxyNote: "", signaturePng: PNG };
    await expect(deliver(db, advisor, roId, deliverIn, now)).rejects.toThrow(/안내 확인 1개/);
    await deliver(db, advisor, roId, { ...deliverIn, notices: ["photos", "care", "warranty", "returned"] }, now);
    [ro] = await db.select().from(repairOrder).where(eq(repairOrder.id, roId));
    expect(ro.status).toBe("delivered");
  });
});
