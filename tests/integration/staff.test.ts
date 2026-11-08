// 직원 명부(F-11-01)·역량 표(F-11-02), STD-11: 명부 권한·암호화, 평가 → 대표 확인, 배정·지도자 점검
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { staffProfile } from "@/db/schema";
import { assignStep, createWorkOrder, getWorkOrder } from "@/modules/repair/work";
import { tenureText } from "@/modules/staff/rules";
import { assessCompetency, confirmAssessment, getProfile, levelsOf, listStaff, pendingAssessments, saveProfile, type ProfileView } from "@/modules/staff/service";
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
const owner = () => ({ id: ids.owner, roles: ["owner" as const] });
const boss = () => ({ id: ids.manager, roles: ["plant_manager" as const] });
const acct = () => ({ id: ids.account, roles: ["accounting" as const] });
const tech = () => ({ id: ids.tech1, roles: ["technician" as const] });

const profile = (o: Partial<ProfileView> = {}): ProfileView => ({
  job: "판금·도장 기술자",
  gender: "m",
  birth: "1990-05-01",
  zip: "12345",
  address: "경기도 가나시 다라로 1",
  addressDetail: "101호",
  career: "",
  hiredOn: "2024-03-02",
  contractKind: "regular",
  contractEnd: "",
  licenses: [{ name: "자동차보수도장기능사", no: "A1", on: "2020-01-01" }, { name: "", no: "", on: "" }],
  leftOn: "",
  leftReason: "",
  ...o,
});

describe("근로자 명부", () => {
  it("대표·회계만 적고, 생년월일·주소는 암호화하고, 다른 직원에게는 일부만 보인다", async () => {
    await expect(saveProfile(db, tech(), ids.tech1, profile(), now)).rejects.toThrow(/대표·회계/);
    await expect(saveProfile(db, acct(), ids.tech1, profile({ contractKind: "fixed" }), now)).rejects.toThrow(/기간제/);
    await expect(saveProfile(db, acct(), ids.tech1, profile({ leftOn: "2026-10-01" }), now)).rejects.toThrow(/퇴직 사유/);
    await saveProfile(db, acct(), ids.tech1, profile(), now);
    const [raw] = await db.select().from(staffProfile).where(eq(staffProfile.userId, ids.tech1));
    expect(raw.birthEnc).not.toContain("1990");
    expect(raw.addressEnc).not.toContain("가나시");
    expect(raw.licenses).toHaveLength(1);
    const mine = await getProfile(db, tech(), ids.tech1);
    expect(mine).toMatchObject({ birth: "1990-05-01", zip: "12345", address: "경기도 가나시 다라로 1", addressDetail: "101호" });
    await expect(getProfile(db, tech(), ids.tech2)).rejects.toThrow(/대표·회계/);
    const seen = (await listStaff(db, tech())).find((r) => r.id === ids.tech1)!;
    expect(seen).toMatchObject({ job: "판금·도장 기술자", hiredOn: "2024-03-02", contractKind: null });
    expect((await listStaff(db, owner())).find((r) => r.id === ids.tech1)!.contractKind).toBe("regular");
    expect(tenureText("2024-03-02", "2026-11-08")).toBe("2년 8개월");
  });
});

describe("역량 표", () => {
  it("공장장 평가는 대표가 확인해야 반영되고, 대표 평가는 바로 반영된다", async () => {
    await expect(assessCompetency(db, tech(), { userId: ids.tech2, skill: "weld", level: 2, note: "x", assessedOn: "2026-11-09" }, now)).rejects.toThrow(/공장장·대표/);
    await expect(assessCompetency(db, boss(), { userId: ids.tech2, skill: "weld", level: 2, note: " ", assessedOn: "2026-11-09" }, now)).rejects.toThrow(/근거/);
    await expect(assessCompetency(db, boss(), { userId: ids.tech2, skill: "weld", level: 2, note: "x", assessedOn: "2026-11-10" }, now)).rejects.toThrow(/평가일/);
    expect(await assessCompetency(db, boss(), { userId: ids.tech2, skill: "weld", level: 2, note: "시편 용접 확인", assessedOn: "2026-11-09" }, now)).toEqual({ confirmed: false });
    expect((await levelsOf(db, ids.tech2)).weld).toBe(1);
    const [p] = await pendingAssessments(db);
    await expect(confirmAssessment(db, boss(), p.c.id, true, now)).rejects.toThrow(/대표/);
    await confirmAssessment(db, owner(), p.c.id, true, now);
    expect((await levelsOf(db, ids.tech2)).weld).toBe(2);
    await expect(confirmAssessment(db, owner(), p.c.id, true, now)).rejects.toThrow(/이미/);
    expect(await assessCompetency(db, owner(), { userId: ids.tech2, skill: "sheet", level: 1, note: "재교육", assessedOn: "2026-11-09" }, new Date(now.getTime() + 1000))).toEqual({ confirmed: true });
    expect((await levelsOf(db, ids.tech2)).sheet).toBe(1);
  });

  it("단독 기준 미만이면 3단계 이상 지도자가 있어야 배정된다", async () => {
    await assessCompetency(db, owner(), { userId: ids.tech2, skill: "sheet", level: 1, note: "재교육", assessedOn: "2026-11-09" }, new Date(now.getTime() + 1000));
    const { roId } = await approvedRepair(db, ids, now, (names) => names.some((n) => n.includes("범퍼")));
    const { id } = await createWorkOrder(db, boss(), roId, now);
    const w = await getWorkOrder(db, id);
    const detach = w.steps.find((s) => s.process === "detach")!;
    expect(w.workers.find((u) => u.id === ids.tech2)!.levels.sheet).toBe(1);
    await expect(assignStep(db, boss(), detach.id, { assignee: ids.tech2, planDate: "", stdMinutes: null }, now)).rejects.toThrow(/지도자/);
    await expect(assignStep(db, boss(), detach.id, { assignee: ids.tech2, mentor: ids.tech2, planDate: "", stdMinutes: null }, now)).rejects.toThrow();
    await assignStep(db, boss(), detach.id, { assignee: ids.tech2, mentor: ids.tech1, planDate: "", stdMinutes: null }, now);
    const after = (await getWorkOrder(db, id)).steps.find((s) => s.id === detach.id)!;
    expect(after.mentorName).toBeTruthy();
  });
});
