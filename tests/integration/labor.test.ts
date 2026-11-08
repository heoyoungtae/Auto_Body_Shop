// 공임 기준표: 항목 더하기·숨기기, 더한 항목도 값 바꾸기 이력, 견적 줄에 기준표 코드 남기기
import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { addLaborItem, changeLabor, laborCatalog, loadLabor, setLaborHidden } from "@/modules/repair/labor-store";
import { LABOR_DEFAULTS, lineNameOf } from "@/modules/repair/labor";
import { seedShop, testDb } from "./db";

let db: Db;
let ids: Awaited<ReturnType<typeof seedShop>>;
beforeEach(async () => {
  db = await testDb();
  ids = await seedShop(db);
});

describe("공임 기준표 항목", () => {
  it("기본 항목은 계수 말고 모두 견적 줄 구분이 있고, 줄 이름이 자연스럽다", () => {
    for (const d of LABOR_DEFAULTS) {
      if (d.kind === "pct" || d.code === "RATE") expect(d.cat, d.code).toBeUndefined();
      else expect(d.cat, d.code).toBeTruthy();
    }
    expect(new Set(LABOR_DEFAULTS.map((d) => d.code)).size).toBe(LABOR_DEFAULTS.length);
    expect(lineNameOf({ name: "범퍼", section: "탈부착(도장할 때)" })).toBe("범퍼 탈부착");
    expect(lineNameOf({ name: "도어", section: "도장 재료비(패널당, 솔리드 기준)" })).toBe("도어 도장 재료비");
    expect(lineNameOf({ name: "전체 광택", section: "광택" })).toBe("전체 광택");
    expect(lineNameOf({ name: "탁송(편도)", section: "기타" })).toBe("탁송(편도)");
  });

  it("대표가 더한 항목은 목록·기준표 값에 들어가고, 값 바꾸기 이력도 남는다. 숨기기는 계수·시간당 공임은 안 된다", async () => {
    await expect(addLaborItem(db, ids.owner, { section: "작은 수리", name: "", kind: "price", cat: "etc", value: 1 })).rejects.toThrow(/이름/);
    await expect(addLaborItem(db, ids.owner, { section: "광택", name: "전체 광택", kind: "price", cat: "polish", value: 1 })).rejects.toThrow(/이미/);
    const code = await addLaborItem(db, ids.owner, { section: "작은 수리", name: "헤드램프 복원(1개)", kind: "price", cat: "etc", value: 70_000 });
    expect(code).toBe("U-001");
    expect(await addLaborItem(db, ids.owner, { section: "작은 수리", name: "실내 클리닝", kind: "hours", cat: "etc", value: 90 })).toBe("U-002");
    expect((await loadLabor(db))[code]).toBe(70_000);
    await changeLabor(db, ids.owner, { code, value: 80_000, effectiveFrom: "2026-11-08", reason: "실측" }, "2026-11-08");
    expect((await loadLabor(db, "2026-11-08"))[code]).toBe(80_000);

    await expect(setLaborHidden(db, ids.owner, "RATE", true)).rejects.toThrow(/숨길 수 없/);
    await setLaborHidden(db, ids.owner, "COAT", true);
    let cat = await laborCatalog(db);
    expect(cat.find((d) => d.code === "COAT")!.hidden).toBe(true);
    expect(cat.find((d) => d.code === code)!.custom).toBe(true);
    await setLaborHidden(db, ids.owner, "COAT", false);
    cat = await laborCatalog(db);
    expect(cat.find((d) => d.code === "COAT")!.hidden).toBe(false);
  });
});
