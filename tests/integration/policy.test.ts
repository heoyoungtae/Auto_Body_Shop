import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { changeBands, resolveApprover } from "@/modules/platform/delegation";
import { nextDocNo } from "@/modules/platform/docno";
import { runJob } from "@/modules/platform/jobs";
import { changePolicy, loadPolicy, policyHistory } from "@/modules/platform/policy";
import { seedShop, testDb } from "./db";

let db: Db;
let ids: Awaited<ReturnType<typeof seedShop>>;
beforeEach(async () => {
  db = await testDb();
  ids = await seedShop(db);
});

describe("정책값 변경", () => {
  it("시행일부터 새 값이 쓰이고 이력이 남는다", async () => {
    await changePolicy(db, ids.owner, { key: "estimate.valid_days", value: 10, effectiveFrom: "2026-12-01", reason: "보험사 요청", revisionRequestNo: "R-2611-0001" }, "2026-11-08");
    expect((await loadPolicy(db, "2026-11-30"))["estimate.valid_days"]).toBe(30);
    expect((await loadPolicy(db, "2026-12-01"))["estimate.valid_days"]).toBe(10);
    const h = await policyHistory(db, "estimate.valid_days");
    expect(h[0]).toMatchObject({ value: 10, revisionRequestNo: "R-2611-0001", changedBy: "김대표" });
  });

  it("범위를 벗어나거나 과거 시행일·사유 없음은 거절", async () => {
    const base = { key: "five_s.nc_threshold", effectiveFrom: "2026-11-08", reason: "x" };
    await expect(changePolicy(db, ids.owner, { ...base, value: 120 }, "2026-11-08")).rejects.toThrow(/100 이하/);
    await expect(changePolicy(db, ids.owner, { ...base, value: 70, effectiveFrom: "2026-11-01" }, "2026-11-08")).rejects.toThrow(/시행일/);
    await expect(changePolicy(db, ids.owner, { ...base, value: 70, reason: " " }, "2026-11-08")).rejects.toThrow(/사유/);
  });
});

describe("전결표 변경", () => {
  it("업무별 구간을 바꾸면 시행일부터 승인자가 바뀐다", async () => {
    expect(await resolveApprover(db, "discount", 8, [], "2026-11-08")).toBe("plant_manager");
    await changeBands(db, ids.owner, "discount", [{ upTo: 3, role: "advisor" }, { upTo: null, role: "owner" }], "2026-11-09", null, "2026-11-08");
    expect(await resolveApprover(db, "discount", 8, [], "2026-11-08")).toBe("plant_manager");
    expect(await resolveApprover(db, "discount", 8, [], "2026-11-09")).toBe("owner");
  });
});

describe("문서 번호와 주기 작업", () => {
  it("접두어·연월별로 일련번호가 오른다", async () => {
    const t = new Date("2026-11-08T01:00:00Z");
    expect(await nextDocNo(db, "RO", t)).toBe("RO-2611-0001");
    expect(await nextDocNo(db, "RO", t)).toBe("RO-2611-0002");
    expect(await nextDocNo(db, "ES", t)).toBe("ES-2611-0001");
    expect(await nextDocNo(db, "RO", new Date("2026-12-01T01:00:00Z"))).toBe("RO-2612-0001");
  });

  it("같은 날 두 번 불려도 한 번만 돈다", async () => {
    const t = new Date("2026-11-08T01:00:00Z");
    expect((await runJob(db, "daily", t)).status).toBe("done");
    expect((await runJob(db, "daily", t)).status).toBe("skipped");
  });
});

describe("다음 해 최저임금 자동 반영", () => {
  it("8월 말일 전에는 쉬고, 고시된 값을 1월 1일 시행으로 넣고, 한 번만 넣는다. 이상한 값·실패는 대표에게 알린다", async () => {
    const { syncNextMinWage } = await import("@/modules/staff/min-wage");
    const { loadPolicy } = await import("@/modules/platform/policy");
    const page = (v: string, noticed = "26.08.05") => (async () => new Response(`<tr><td>'27.01.01~'27.12.31</td><td>${v}</td><td>x</td><td>26.07.14</td><td>${noticed}</td></tr>`)) as unknown as typeof fetch;
    const db2 = await (await import("./db")).testDb();
    await (await import("./db")).seedShop(db2);
    expect((await syncNextMinWage(db2, new Date("2026-08-20T00:00:00Z"), { f: page("10,700") })).status).toBe("skipped");
    const { myTodos } = await import("@/modules/dashboard/todo");
    const [o] = await db2.select({ id: (await import("@/db/schema")).appUser.id }).from((await import("@/db/schema")).appUser).where((await import("drizzle-orm")).eq((await import("@/db/schema")).appUser.loginId, "owner"));
    const boss = { id: o.id, roles: ["owner" as const] };
    expect((await myTodos(db2, boss, new Date("2026-08-10T00:00:00Z"))).some((t) => t.key === "set-minwage")).toBe(false);
    expect((await myTodos(db2, boss, new Date("2026-08-16T00:00:00Z"))).find((t) => t.key === "set-minwage")?.when).toBe("today");
    expect((await syncNextMinWage(db2, new Date("2026-08-31T00:00:00Z"), { f: page("99,999") })).status).toBe("failed");
    expect((await syncNextMinWage(db2, new Date("2026-08-31T00:00:00Z"), { f: (async () => { throw new Error("timeout"); }) as unknown as typeof fetch })).status).toBe("failed");
    const r = await syncNextMinWage(db2, new Date("2026-08-31T00:00:00Z"), { f: page("10,700") });
    expect(r).toMatchObject({ status: "applied", hourly: 10700 });
    expect((await syncNextMinWage(db2, new Date("2026-09-01T00:00:00Z"), { f: page("10,800") })).status).toBe("exists");
    expect((await loadPolicy(db2, "2026-12-31"))["wage.minimum_hourly"]).toBe(10320);
    expect((await myTodos(db2, boss, new Date("2026-09-01T00:00:00Z"))).some((t) => t.key === "set-minwage")).toBe(false);
    expect((await loadPolicy(db2, "2027-01-01"))["wage.minimum_hourly"]).toBe(10700);
  });
});
