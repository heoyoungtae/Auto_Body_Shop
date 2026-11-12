// 앱 개별 교육(대표 결정 2026-11-12): 자료·확인 문제·시한 → 학습 → 이수 기록, 수료증, 사내 교재 승인·개정 필요, 링크 점검
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { docRegister, notification, training, trainingAttendee } from "@/db/schema";
import {
  addMaterial,
  addQuestion,
  approveManual,
  assignLearners,
  checkLinks,
  learnTodos,
  learnView,
  manualsNeedingRevision,
  markViewed,
  saveLearnSettings,
  saveManual,
  submitQuiz,
  trainingDailyAlerts,
  uploadCert,
} from "@/modules/staff/elearning";
import { createTraining } from "@/modules/staff/training";
import { creditSec, monthEnd, quizScore } from "@/modules/staff/training-rules";
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
const owner = () => ({ id: ids.owner, roles: ["owner" as const] });
const pm = () => ({ id: ids.manager, roles: ["plant_manager" as const] });
const tech = () => ({ id: ids.tech1, roles: ["technician" as const] });
const now = new Date("2026-11-12T01:00:00Z");
const pdf = new TextEncoder().encode("%PDF-1.4 test");

describe("앱 개별 교육 규칙", () => {
  it("말일·점수·학습 시간 상한", () => {
    expect(monthEnd("2026-02")).toBe("2026-02-28");
    expect(quizScore([1, 0, 2], [1, 0, 1])).toBe(67);
    expect(quizScore([], [])).toBe(100);
    expect(creditSec(3600, 10, 2)).toBe(900);
    expect(creditSec(100, 0, 2)).toBe(100);
  });
});

describe("앱 개별 교육", () => {
  it("자료·문제 → 배정(시한) → 다 봄 → 문제 → 이수·기록부, 모두 이수하면 실시", async () => {
    const id = await createTraining(db, pm(), { year: 2026, kind: "job", title: "도장 부스 사용법", plannedMonth: "2026-11", plannedHours: 1, target: "기술자", organizerId: "" }, now);
    await expect(assignLearners(db, pm(), id, { userIds: [ids.tech1], dueOn: "" }, now)).rejects.toThrow(/진행 방식/);
    await saveLearnSettings(db, pm(), id, { mode: "online", passScore: 80, allowCert: false }, now);
    await expect(assignLearners(db, pm(), id, { userIds: [ids.tech1], dueOn: "" }, now)).rejects.toThrow(/자료/);
    await expect(addMaterial(db, pm(), id, { kind: "video", title: "", url: "http://x", manualId: "", docId: "", minutes: 10 }, now)).rejects.toThrow(/https/);
    await addMaterial(db, pm(), id, { kind: "video", title: "부스 시연", url: "https://youtu.be/abc", manualId: "", docId: "", minutes: 10 }, now);
    await addMaterial(db, pm(), id, { kind: "file", title: "", url: "", manualId: "", docId: "", minutes: 5, file: { name: "부스 점검표.pdf", bytes: pdf } }, now);
    await addQuestion(db, pm(), id, { question: "부스 온도는?", choices: ["20도", "60도"], answer: 1 });
    await expect(addQuestion(db, pm(), id, { question: "x", choices: ["a"], answer: 0 })).rejects.toThrow(/2~5/);

    const r = await assignLearners(db, pm(), id, { userIds: [ids.tech1, ids.tech2], dueOn: "" }, now);
    expect(r.due).toBe("2026-11-30");
    const todo = (await learnTodos(db, tech(), "2026-11-28")).find((t) => t.key === `tr-learn-${id}`)!;
    expect([todo.when, todo.what]).toEqual(["today", "교육: 도장 부스 사용법 (D-2)"]);

    const v = await learnView(db, tech(), id);
    expect(v.questions[0]).not.toHaveProperty("answer");
    await expect(submitQuiz(db, tech(), id, [1], now)).rejects.toThrow(/안 본 자료/);
    for (const m of v.materials) await markViewed(db, tech(), id, m.id, 3600);
    // 틀리면 다시 보기
    expect((await submitQuiz(db, tech(), id, [0], now)).passed).toBe(false);
    await expect(submitQuiz(db, tech(), id, [1], now)).rejects.toThrow(/안 본 자료/);
    for (const m of v.materials) await markViewed(db, tech(), id, m.id, 60);
    expect((await submitQuiz(db, tech(), id, [1], now)).passed).toBe(true);
    const [a] = await db.select().from(trainingAttendee).where(eq(trainingAttendee.userId, ids.tech1));
    expect([a.how, a.score, a.attempts, !!a.signedAt, a.hours]).toEqual(["online", 100, 2, true, 0.5]);
    // 한 사람 남음 → 아직 계획
    expect((await db.select().from(training).where(eq(training.id, id)))[0].status).toBe("planned");

    // 시한 지나면 공장장 알림
    await trainingDailyAlerts(db, new Date("2026-12-02T01:00:00Z"), (async () => new Response("", { status: 200 })) as typeof fetch);
    const notes = await db.select().from(notification).where(eq(notification.userId, ids.manager));
    expect(notes.some((n) => n.title.includes("교육 시한 지남"))).toBe(true);

    const v2 = await learnView(db, { id: ids.tech2, roles: ["technician"] }, id);
    for (const m of v2.materials) await markViewed(db, { id: ids.tech2, roles: ["technician"] }, id, m.id, 600);
    await submitQuiz(db, { id: ids.tech2, roles: ["technician"] }, id, [1], now);
    const [t] = await db.select().from(training).where(eq(training.id, id));
    expect([t.status, t.instructor, t.hours, !!t.effectDue]).toEqual(["done", "앱 개별 학습", 1, true]);
  });

  it("수료증 이수, 링크 점검", async () => {
    const id = await createTraining(db, pm(), { year: 2026, kind: "safety_regular", title: "하반기 정기 안전보건교육", plannedMonth: "2026-12", plannedHours: 12, target: "전 직원", organizerId: "" }, now);
    await saveLearnSettings(db, pm(), id, { mode: "both", passScore: 80, allowCert: true }, now);
    await addMaterial(db, pm(), id, { kind: "link", title: "", url: "https://www.kosha.or.kr", manualId: "", docId: "", minutes: null }, now);
    await assignLearners(db, pm(), id, { userIds: [ids.tech1], dueOn: "2026-12-20" }, now);
    await uploadCert(db, tech(), id, { name: "수료증.pdf", bytes: pdf }, now);
    const [a] = await db.select().from(trainingAttendee).where(eq(trainingAttendee.trainingId, id));
    expect([a.how, a.hours]).toEqual(["cert", 12]);
    const res = await checkLinks(db, now, (async () => new Response("", { status: 404 })) as typeof fetch);
    expect(res.broken).toBe(1);
    expect((await learnTodos(db, pm(), "2026-11-12")).some((t) => t.key.startsWith("tr-link-"))).toBe(true);
  });

  it("사내 교재: 승인해야 자료로, 표준서 판이 바뀌면 개정 필요", async () => {
    const [d] = await db.insert(docRegister).values({ no: "STD-05", name: "도장 작업 표준", kind: "std", rev: "R0", history: [] }).returning();
    const id = await createTraining(db, pm(), { year: 2026, kind: "job", title: "탈지", plannedMonth: "2026-12", plannedHours: 1, target: "", organizerId: "" }, now);
    const m = await saveManual(db, pm(), null, { title: "도장 전 탈지", body: "1. 목적", videoUrl: "", docIds: [d.id], changeNote: "" }, [], now);
    expect(m.no).toBe("TM-001");
    await expect(addMaterial(db, pm(), id, { kind: "manual", title: "", url: "", manualId: m.id, docId: "", minutes: 5 }, now)).rejects.toThrow(/승인/);
    await expect(approveManual(db, pm(), m.id, now)).rejects.toThrow(/대표/);
    expect(await approveManual(db, owner(), m.id, now)).toBe(1);
    await addMaterial(db, pm(), id, { kind: "manual", title: "", url: "", manualId: m.id, docId: "", minutes: 5 }, now);
    {
      await db.update(docRegister).set({ rev: "R1" }).where(eq(docRegister.id, d.id));
      expect((await manualsNeedingRevision(db)).map((x) => x.no)).toEqual(["TM-001"]);
      await expect(saveManual(db, pm(), m.id, { title: "도장 전 탈지", body: "1. 목적(개정)", videoUrl: "", docIds: [d.id], changeNote: "" }, [], now)).rejects.toThrow(/개정 내용/);
      await saveManual(db, pm(), m.id, { title: "도장 전 탈지", body: "1. 목적(개정)", videoUrl: "", docIds: [d.id], changeNote: "표준서 개정 반영" }, [], now);
      expect(await approveManual(db, owner(), m.id, now)).toBe(2);
      expect(await manualsNeedingRevision(db)).toEqual([]);
    }
  });
});
