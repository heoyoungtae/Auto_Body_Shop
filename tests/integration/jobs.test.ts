// 직무기술서 확인(F-11-08)·신입 오리엔테이션 점검표(F-11-09)
import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { notification, staffProfile, userRole } from "@/db/schema";
import { ackJobDesc, jdAckStatus, myJobTitles } from "@/modules/staff/documents";
import { onboardingList, onboardingOf, onboardingTodos } from "@/modules/staff/onboarding";
import { saveProfile, type ProfileView } from "@/modules/staff/service";
import { seedShop, testDb } from "./db";

let db: Db;
let ids: Awaited<ReturnType<typeof seedShop>>;
beforeEach(async () => {
  db = await testDb();
  ids = await seedShop(db);
});
const now = new Date("2026-11-14T01:00:00Z");
const owner = () => ({ id: ids.owner, roles: ["owner" as const] });
const tech = () => ({ id: ids.tech1, roles: ["technician" as const] });
const PNG = new Uint8Array(400).fill(7);
const profile = (o: Partial<ProfileView> = {}): ProfileView => ({ job: "기술자(판금·덴트)", gender: "", birth: "1990-01-02", phone: "01012345678", emName: "", emRelation: "", emPhone: "", zip: "", address: "", addressDetail: "", career: "", hiredOn: "2026-11-02", contractKind: "regular", contractEnd: "", licenses: [], leftOn: "", leftReason: "", ...o });

describe("직무기술서 확인", () => {
  it("명부에 직무가 없으면 서명할 수 없고, 정하면 본인에게 확인 요청이 간다", async () => {
    await db.delete(staffProfile).where(eq(staffProfile.userId, ids.tech1));
    await expect(ackJobDesc(db, tech(), PNG, now)).rejects.toThrow("직무가 정해지지");
    await saveProfile(db, owner(), ids.tech1, profile(), now);
    const n = await db.select().from(notification).where(eq(notification.userId, ids.tech1));
    expect(n.some((x) => x.title.includes("직무기술서 확인 요청"))).toBe(true);
    await ackJobDesc(db, tech(), PNG, now);
    expect((await jdAckStatus(db)).get(ids.tech1)?.job).toEqual(["기술자(판금·덴트)"]);
    await expect(ackJobDesc(db, tech(), PNG, now)).rejects.toThrow("이미 확인");
  });

  it("직무가 바뀌면 다시 확인하고, 겸직 역할도 함께 확인한다", async () => {
    await saveProfile(db, owner(), ids.tech1, profile(), now);
    await ackJobDesc(db, tech(), PNG, now);
    await db.insert(userRole).values({ userId: ids.tech1, role: "quality" });
    expect(await myJobTitles(db, ids.tech1)).toEqual(["기술자(판금·덴트)", "품질 담당"]);
    const o = await onboardingOf(db, ids.tech1);
    expect(o?.items.find((i) => i.key === "jd")?.done).toBe(false);
    await ackJobDesc(db, tech(), PNG, now);
    expect((await onboardingOf(db, ids.tech1))?.items.find((i) => i.key === "jd")?.done).toBe(true);
  });

  it("계정 역할에 없는 직무를 고르면 대표에게 알린다", async () => {
    await saveProfile(db, owner(), ids.tech1, profile({ job: "상담원" }), now);
    const n = await db.select().from(notification).where(eq(notification.userId, ids.owner));
    expect(n.some((x) => x.title.includes("역할을 더해야"))).toBe(true);
    expect((await onboardingOf(db, ids.tech1))?.items.find((i) => i.key === "role")?.done).toBe(false);
  });
});

describe("신입 오리엔테이션", () => {
  it("입사일로 기한을 잡고, 기록으로 저절로 채운다", async () => {
    await saveProfile(db, owner(), ids.tech1, profile(), now);
    const o = (await onboardingOf(db, ids.tech1))!;
    expect(o.items.map((i) => i.key)).toEqual(["job", "role", "contract", "pledge", "rules", "jd", "hire_training", "first_level", "solo"]);
    expect(o.items.find((i) => i.key === "job")?.done).toBe(true);
    expect(o.items.find((i) => i.key === "role")?.done).toBe(true);
    expect(o.items.find((i) => i.key === "hire_training")?.due).toBe("2026-11-16");
    expect(o.items.find((i) => i.key === "solo")?.due).toBe("2027-01-31");
  });

  it("기한 지난 항목은 대표·공장장 할 일로, 기술자에게는 안 보인다", async () => {
    await saveProfile(db, owner(), ids.tech1, profile({ hiredOn: "2026-10-01" }), now);
    const list = await onboardingList(db, "2026-11-14");
    const me = list.find((o) => o.userId === ids.tech1)!;
    expect(me.late.map((i) => i.key)).toContain("contract");
    const todos = await onboardingTodos(db, owner(), "2026-11-14");
    expect(todos.some((t) => t.key === `onboard-${ids.tech1}`)).toBe(true);
    expect(await onboardingTodos(db, tech(), "2026-11-14")).toEqual([]);
  });
});
