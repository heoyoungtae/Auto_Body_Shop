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
    expect((await loadPolicy(db, "2026-11-30"))["estimate.valid_days"]).toBe(14);
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
