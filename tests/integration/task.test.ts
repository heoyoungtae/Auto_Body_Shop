// 업무지시: 지시 → 내 할 일 → 전달 → 보고 → 확인(보고가 위로 저절로) · 보완 요청 · 권한 · 사진 필수 · 기한 알림
import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { myTodos } from "@/modules/dashboard/todo";
import { addReportPhoto, canInstruct, confirmTask, forwardTask, getInstruction, instructionDailyAlerts, issueInstruction, listInstructions, reportTask, returnTask, saveAssignRoles } from "@/modules/task/service";
import { seedShop, testDb } from "./db";

let db: Db;
let ids: Awaited<ReturnType<typeof seedShop>>;
beforeEach(async () => {
  db = await testDb();
  ids = await seedShop(db);
});
const now = new Date("2026-11-09T01:00:00Z");
const owner = () => ({ id: ids.owner, roles: ["owner" as const] });
const mgr = () => ({ id: ids.manager, roles: ["plant_manager" as const] });
const tech = () => ({ id: ids.tech1, roles: ["technician" as const] });
const tech2 = () => ({ id: ids.tech2, roles: ["technician" as const] });
const advisor = () => ({ id: ids.advisor, roles: ["advisor" as const] });
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...new Array(300).fill(1)]);

describe("업무지시", () => {
  it("대표 → 공장장 → 기술자 2명 전달, 보고 확인하면 위로 저절로 보고, 대표 확인으로 끝", async () => {
    const { id } = await issueInstruction(db, owner(), { title: "부스 필터 교체", assigneeIds: [ids.manager], dueOn: "2026-11-12", needPhoto: true }, now);
    expect((await myTodos(db, mgr(), now)).some((t) => t.what === "업무지시: 부스 필터 교체")).toBe(true);
    let r = await getInstruction(db, mgr(), id);
    const top = r.tasks[0];
    await expect(forwardTask(db, mgr(), top.id, { assigneeIds: [ids.owner], note: "" }, now)).rejects.toThrow(/지시한 사람/);
    await forwardTask(db, mgr(), top.id, { assigneeIds: [ids.tech1, ids.tech2], note: "오전 중" }, now);
    r = await getInstruction(db, mgr(), id);
    const [k1, k2] = r.tasks.filter((t) => t.parentTaskId === top.id);
    await expect(reportTask(db, tech(), k1.id, { result: "done", report: "교체" }, now)).rejects.toThrow(/사진/);
    await addReportPhoto(db, tech(), k1.id, PNG);
    await reportTask(db, tech(), k1.id, { result: "done", report: "좌측 교체" }, now);
    await reportTask(db, tech2(), k2.id, { result: "notdone", report: "필터 재고 없음" }, now);
    expect((await myTodos(db, mgr(), now)).filter((t) => t.what.startsWith("결과 확인")).length).toBe(2);
    await expect(confirmTask(db, tech(), k1.id, now)).rejects.toThrow(/준 사람/);
    await returnTask(db, mgr(), k2.id, "재고 들어오면 교체", now);
    await addReportPhoto(db, tech2(), k2.id, PNG);
    await reportTask(db, tech2(), k2.id, { result: "done", report: "우측 교체" }, now);
    await confirmTask(db, mgr(), k1.id, now);
    expect((await getInstruction(db, owner(), id)).tasks.find((t) => t.id === top.id)?.status).toBe("forwarded");
    await confirmTask(db, mgr(), k2.id, now);
    const up = (await getInstruction(db, owner(), id)).tasks.find((t) => t.id === top.id)!;
    expect(up).toMatchObject({ status: "reported", result: "done" });
    expect(up.report).toMatch(/좌측 교체[\s\S]*우측 교체/);
    expect(up.reportPhotos.length).toBe(2);
    await confirmTask(db, owner(), top.id, now);
    expect((await listInstructions(db, owner(), "sent"))[0]).toMatchObject({ closed: true, total: 1, doneCount: 1 });
  });

  it("권한: 기본은 대표·공장장, 대표가 역할을 더하면 지시 가능. 관련 없는 사람은 못 봄. 기한 알림", async () => {
    await expect(issueInstruction(db, tech(), { title: "x", assigneeIds: [ids.tech2], dueOn: "2026-11-12" }, now)).rejects.toThrow(/권한/);
    await expect(saveAssignRoles(db, mgr(), ["advisor"])).rejects.toThrow(/대표/);
    await saveAssignRoles(db, owner(), ["plant_manager", "advisor"]);
    expect(await canInstruct(db, advisor())).toBe(true);
    const { id } = await issueInstruction(db, advisor(), { title: "고객 차 세차", assigneeIds: [ids.tech1], dueOn: "2026-11-10" }, now);
    await expect(getInstruction(db, tech2(), id)).rejects.toThrow(/관련된/);
    expect(await instructionDailyAlerts(db, new Date("2026-11-11T01:00:00Z"))).toMatch(/1건/);
    expect((await myTodos(db, advisor(), new Date("2026-11-11T01:00:00Z"))).some((t) => t.what.startsWith("기한 지난 지시"))).toBe(true);
  });
});
