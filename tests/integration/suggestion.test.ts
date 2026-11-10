// 개선 제안(STD-08 8.12): 제출 → 14일 회신 → 실행·효과 확인 → 실적
import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { notification } from "@/db/schema";
import { myTodos } from "@/modules/dashboard/todo";
import { completeSuggestion, decideSuggestion, submitSuggestion, suggestionStats, updateSuggestion } from "@/modules/equipment/suggestion";
import { seedShop, testDb } from "./db";

let db: Db;
let ids: Awaited<ReturnType<typeof seedShop>>;
beforeEach(async () => {
  db = await testDb();
  ids = await seedShop(db);
});
const now = new Date("2026-11-10T00:00:00Z");
const manager = () => ({ id: ids.manager, roles: ["plant_manager" as const] });
const tech = () => ({ id: ids.tech1, roles: ["technician" as const] });
const tech2 = () => ({ id: ids.tech2, roles: ["technician" as const] });
const input = { title: "호스 릴 설치", area: "C 도장 부스", problem: "호스가 바닥에 늘어짐", proposal: "벽에 릴 설치", effect: "넘어짐 방지" };

describe("개선 제안", () => {
  it("제출·회신·실행·실적", async () => {
    await expect(submitSuggestion(db, tech(), { ...input, problem: "" }, now)).rejects.toThrow(/문제/);
    const { id, docNo } = await submitSuggestion(db, tech(), input, now);
    expect(docNo).toMatch(/^SG-2611-/);
    const n = await db.select().from(notification).where(eq(notification.userId, ids.manager));
    expect(n.some((x) => x.title.includes("호스 릴"))).toBe(true);
    // 14일 지나면 공장장 할 일 '늦음'
    const late = new Date("2026-11-26T00:00:00Z");
    expect((await myTodos(db, manager(), late)).find((t) => t.key === `sg-reply-${id}`)?.when).toBe("late");

    await expect(updateSuggestion(db, tech2(), id, input, now)).rejects.toThrow(/제안한 사람/);
    await expect(decideSuggestion(db, tech(), id, { decision: "adopted", reply: "좋음" }, now)).rejects.toThrow(/공장장/);
    await expect(decideSuggestion(db, manager(), id, { decision: "adopted", reply: "" }, now)).rejects.toThrow(/사유/);
    await decideSuggestion(db, manager(), id, { decision: "adopted", reply: "이번 주 설치" }, now);
    const t = await db.select().from(notification).where(eq(notification.userId, ids.tech1));
    expect(t.some((x) => x.title.includes("채택"))).toBe(true);
    await expect(updateSuggestion(db, tech(), id, input, now)).rejects.toThrow(/결정이 난/);

    await expect(completeSuggestion(db, manager(), id, { doneNote: "설치", effectNote: "", revisionRef: "" }, now)).rejects.toThrow(/효과/);
    await completeSuggestion(db, manager(), id, { doneNote: "릴 2개 설치", effectNote: "걸림 0건", revisionRef: "" }, now);

    await submitSuggestion(db, tech(), { ...input, title: "두 번째" }, now);
    const stats = await suggestionStats(db, 2026);
    expect(stats[0]).toMatchObject({ id: ids.tech1, total: 2, adopted: 1, done: 1 });
  });
});
