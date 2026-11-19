// 본점·지점 1단계(대표 결정 2026-11-19): 본점 하나, 지점 칸은 모두 본점으로 자동, 작업장 목록
import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { auditLog, branch, fiveSZone, MAIN_BRANCH_ID, workplace } from "@/db/schema";
import { createWorkplace, hasManyBranches, listBranches, listWorkplaces, setWorkplaceActive, updateWorkplace } from "@/modules/platform/branch";
import { seedShop, testDb } from "./db";

let db: Db;
let ids: Awaited<ReturnType<typeof seedShop>>;
beforeEach(async () => {
  db = await testDb();
  ids = await seedShop(db);
});
const owner = () => ({ id: ids.owner, roles: ["owner" as const] });
const manager = () => ({ id: ids.manager, roles: ["plant_manager" as const] });
const tech = () => ({ id: ids.tech1, roles: ["technician" as const] });

describe("본점·지점 1단계", () => {
  it("본점 하나가 마이그레이션으로 만들어져 있다", async () => {
    const list = await listBranches(db);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: MAIN_BRANCH_ID, name: "본점", code: "", isMain: true });
    expect(await hasManyBranches(db)).toBe(false);
  });

  it("지점 칸을 넣지 않은 새 기록은 본점이 된다", async () => {
    const [w] = await db.insert(workplace).values({ name: "판금동", kind: "panel" }).returning();
    expect(w.branchId).toBe(MAIN_BRANCH_ID);
    const [z] = await db.insert(fiveSZone).values({ code: "Z", name: "시험 구역", workplaceId: w.id }).returning();
    expect(z).toMatchObject({ branchId: MAIN_BRANCH_ID, workplaceId: w.id });
  });

  it("작업장 등록·고치기·사용 중지", async () => {
    await expect(createWorkplace(db, tech(), { name: "도장 부스", kind: "paint", bays: 1, managerId: null, note: "" })).rejects.toThrow(/공장장·대표/);
    const id = await createWorkplace(db, manager(), { name: "  도장   부스 ", kind: "paint", bays: 1, managerId: ids.manager, note: "", sortOrder: 20 });
    await expect(createWorkplace(db, owner(), { name: "도장 부스", kind: "paint", bays: 1, managerId: null, note: "" })).rejects.toThrow(/이미 있습니다/);
    await expect(createWorkplace(db, owner(), { name: "덴트실", kind: "nope", bays: 1, managerId: null, note: "" })).rejects.toThrow(/종류/);
    const store = await createWorkplace(db, owner(), { name: "부품 창고", kind: "storage", bays: 4, managerId: null, note: "하치장 신고 2026-12-01", sortOrder: 90 });

    let list = await listWorkplaces(db);
    expect(list.map((w) => w.name)).toEqual(["도장 부스", "부품 창고"]);
    expect(list[0]).toMatchObject({ bays: 1, managerName: expect.any(String), branchId: MAIN_BRANCH_ID });
    expect(list[1].bays).toBe(0); // 보관 장소는 자리 0

    await updateWorkplace(db, owner(), id, { name: "도장 부스 1", kind: "paint", bays: 1, managerId: null, note: "", sortOrder: 20 });
    expect(await setWorkplaceActive(db, manager(), store, false)).toBe("부품 창고");
    list = await listWorkplaces(db, { activeOnly: true });
    expect(list.map((w) => w.name)).toEqual(["도장 부스 1"]);

    const logs = await db.select({ action: auditLog.action }).from(auditLog).where(eq(auditLog.entityType, "workplace"));
    expect(logs.map((l) => l.action).sort()).toEqual(["workplace.create", "workplace.create", "workplace.deactivate", "workplace.update"]);
  });

  it("본점은 지울 수 없게 다른 기록이 가리킨다(외래 키)", async () => {
    await db.insert(workplace).values({ name: "광택장", kind: "polish" });
    await expect(db.delete(branch).where(eq(branch.id, MAIN_BRANCH_ID))).rejects.toThrow();
  });
});
