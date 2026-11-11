// 개인별 일일 업무일지: 앱 기록에서 저절로 모임(공정·업무지시·감사 로그), 하루 경계(한국 시각), 넘어가는 일, 열람 권한
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { buildJournal, teamJournal } from "@/modules/journal/service";
import { writeAudit } from "@/modules/platform/audit";
import { seoulDate } from "@/modules/platform/time";
import { addStepPhoto, assignRest, createWorkOrder, finishStep, getWorkOrder, startStep } from "@/modules/repair/work";
import { PROCESSES } from "@/modules/repair/work-rules";
import { issueInstruction, getInstruction, reportTask } from "@/modules/task/service";
import { approvedRepair, WEBP } from "./flow";
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
// 2026-11-10 10:00 KST
const now = new Date("2026-11-10T01:00:00Z");
const at = (min: number) => new Date(now.getTime() + min * 60000);
const owner = () => ({ id: ids.owner, roles: ["owner" as const] });
const mgr = () => ({ id: ids.manager, roles: ["plant_manager" as const] });
const tech = () => ({ id: ids.tech1, roles: ["technician" as const] });

describe("업무일지", () => {
  it("공정 시작·끝, 받은 지시·결과보고가 시간 순서로 모이고, 못 끝낸 공정은 넘어가는 일", async () => {
    const { roId } = await approvedRepair(db, ids, now, (names) => names.some((n) => n.includes("범퍼")));
    const { id: woId } = await createWorkOrder(db, mgr(), roId, now);
    await assignRest(db, mgr(), woId, { assignee: ids.tech1, planDate: "2026-11-10" }, now);
    const w = await getWorkOrder(db, woId);
    const detach = w.steps[0];
    await startStep(db, tech(), detach.id, at(10));
    await addStepPhoto(db, tech(), detach.id, WEBP);
    await finishStep(db, tech(), detach.id, { checks: [...PROCESSES.detach.checks], detail: {}, note: "" }, at(55));

    const { id: insId } = await issueInstruction(db, owner(), { title: "부스 필터 교체", assigneeIds: [ids.tech1], dueOn: "2026-11-10", needPhoto: false }, at(60));
    const task = (await getInstruction(db, tech(), insId)).tasks[0];
    await reportTask(db, tech(), task.id, { result: "done", report: "교체함" }, at(90));
    // 감사 로그는 저장 시각(DB 현재 시각)으로 남으므로 이 기록은 11-10 일지에 들어가지 않는다(한국 시각 하루 경계)
    await writeAudit(db, { actorId: ids.tech1, action: "suggestion.submit", entityType: "suggestion", entityId: "SG-2611-0001" });

    const j = await buildJournal(db, tech(), ids.tech1, "2026-11-10");
    const texts = j.entries.map((e) => e.text);
    expect(texts).toEqual(expect.arrayContaining(["공정 시작: 탈부착", "공정 끝: 탈부착", "업무지시 받음", "결과보고(완료)"]));
    expect(texts.indexOf("공정 시작: 탈부착")).toBeLessThan(texts.indexOf("결과보고(완료)"));
    expect(texts).not.toContain("개선 제안 제출");
    expect(j.steps).toHaveLength(1);
    expect(j.workMinutes).toBe(45);
    expect(j.carry.some((c) => c.text.includes("못 끝냄"))).toBe(true);
    expect(j.areas.find((a) => a.area === "수리")?.count).toBe(2);

    // 감사 로그 쪽(오늘 날짜): 문구·문서 번호·화면 연결, 공정 시작·끝은 감사 로그와 겹치지 않음
    const today = seoulDate();
    const t = await buildJournal(db, tech(), ids.tech1, today);
    expect(t.entries.map((e) => e.text)).toContain("개선 제안 제출");
    expect(t.entries.find((e) => e.text === "개선 제안 제출")).toMatchObject({ ref: "SG-2611-0001", href: "/suggestions", area: "설비·현장" });
    expect(t.entries.some((e) => e.text.startsWith("작업 지시서 기록"))).toBe(false);
    const m = await buildJournal(db, mgr(), ids.manager, today);
    expect(m.entries.map((e) => e.text)).toEqual(expect.arrayContaining(["작업 지시서 만듦", "공정 배정"]));
    expect((await buildJournal(db, owner(), ids.owner, today)).entries.map((e) => e.text)).toContain("업무지시 내림");
  });

  it("다른 사람 일지는 직원 업무일지 보기 권한(대표·공장장)만", async () => {
    await expect(buildJournal(db, tech(), ids.tech2, "2026-11-10")).rejects.toThrow(/대표·공장장/);
    await expect(teamJournal(db, tech(), "2026-11-10")).rejects.toThrow(/대표·공장장/);
    expect((await buildJournal(db, mgr(), ids.tech2, "2026-11-10")).user.name).toBe("정기술");
    const rows = await teamJournal(db, owner(), "2026-11-10");
    expect(rows.length).toBe(8);
    await expect(buildJournal(db, tech(), ids.tech1, "11/10")).rejects.toThrow(/YYYY-MM-DD/);
  });
});

describe("내가 적는 칸·마감·확인", () => {
  const blank = { notes: "", tomorrow: "", offApp: [], suggestionText: "", safety: "", safetyNote: "" };
  const day = "2026-11-10";
  const later = new Date("2026-11-10T09:00:00Z"); // 18:00 KST

  it("저장 → 안전 확인 없이는 마감 못 함 → 마감하면 공장장이 확인, 마감 뒤엔 덧붙이기만", async () => {
    const { closeEntry, saveEntry, addAddendum, reviewEntry, getEntry, journalTodos } = await import("@/modules/journal/entry");
    await expect(saveEntry(db, tech(), "2026-11-12", blank, later)).rejects.toThrow(/미리/);
    await expect(saveEntry(db, tech(), day, { ...blank, offApp: [{ from: "10:00", to: "09:00", kind: "전화 응대", detail: "" }] }, later)).rejects.toThrow(/끝 시각/);
    await expect(saveEntry(db, tech(), day, { ...blank, offApp: [{ from: "", to: "", kind: "기타", detail: "" }] }, later)).rejects.toThrow(/기타/);
    await saveEntry(db, tech(), day, { ...blank, notes: "부품 입고 늦음", offApp: [{ from: "09:00", to: "09:20", kind: "부품 받으러 감", detail: "범퍼" }, { from: "", to: "", kind: "", detail: "" }] }, later);
    expect((await getEntry(db, ids.tech1, day))?.offApp).toHaveLength(1);
    await expect(closeEntry(db, tech(), day, { ...blank, notes: "부품 입고 늦음" }, later)).rejects.toThrow(/안전 확인/);
    await expect(closeEntry(db, tech(), day, { ...blank, safety: "no" }, later)).rejects.toThrow(/무슨 일/);
    expect(await closeEntry(db, tech(), day, { ...blank, notes: "부품 입고 늦음", safety: "yes" }, later)).toMatchObject({ status: "closed" });
    await expect(saveEntry(db, tech(), day, blank, later)).rejects.toThrow(/덧붙이기/);
    await addAddendum(db, tech(), day, "고객이 출고를 금요일로 미룸", later);
    const e = (await getEntry(db, ids.tech1, day))!;
    expect(e).toMatchObject({ status: "closed", confirmRole: "plant_manager", notes: "부품 입고 늦음", safetyOk: true });
    expect(e.addenda).toHaveLength(1);

    // 확인: 공장장 내 할 일 → 보완 요청 → 본인 내 할 일 → 다시 마감 → 확인
    expect((await journalTodos(db, mgr(), later)).some((t) => t.what.includes("최기술"))).toBe(true);
    await expect(reviewEntry(db, tech(), ids.tech1, day, true, "", later)).rejects.toThrow(/자기 일지/);
    await expect(reviewEntry(db, mgr(), ids.tech1, day, false, "", later)).rejects.toThrow(/사유/);
    await reviewEntry(db, mgr(), ids.tech1, day, false, "앱 밖 일 시간 적기", later);
    expect((await journalTodos(db, tech(), later)).some((t) => t.what.startsWith("업무일지 보완 요청"))).toBe(true);
    await closeEntry(db, tech(), day, { ...blank, notes: "부품 입고 늦음", safety: "yes" }, later);
    await reviewEntry(db, mgr(), ids.tech1, day, true, "", later);
    expect((await getEntry(db, ids.tech1, day))?.status).toBe("confirmed");
  });

  it("공장장 일지는 대표가 확인, 대표 본인 일지는 마감하면 끝. 안전 '있음'이면 안전 담당 알림", async () => {
    const { closeEntry, reviewEntry, getEntry } = await import("@/modules/journal/entry");
    await closeEntry(db, mgr(), day, { ...blank, safety: "no", safetyNote: "B 구역 바닥 미끄러질 뻔" }, later);
    await expect(reviewEntry(db, { id: ids.manager, roles: ["plant_manager"] }, ids.manager, day, true, "", later)).rejects.toThrow();
    await reviewEntry(db, owner(), ids.manager, day, true, "", later);
    expect((await getEntry(db, ids.manager, day))?.status).toBe("confirmed");
    expect(await closeEntry(db, owner(), day, { ...blank, safety: "yes" }, later)).toMatchObject({ status: "confirmed" });
    const { listNotifications } = await import("@/modules/platform/notify");
    expect((await listNotifications(db, ids.safety)).some((n) => n.title.includes("안전 확인"))).toBe(true);
  });
});
