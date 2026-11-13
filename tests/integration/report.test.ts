// 통계·보고서: 기간(일·주·월·분기·반기·연·직접 지정) 계산, 보고서별 권한, 앞 기간·작년 비교, CSV, 대시보드 경영 현황
import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { fiveSMonthly, wasteLog } from "@/db/schema";
import { moneyPanel, safetyPanel } from "@/modules/dashboard/service";
import type { Role } from "@/modules/auth/roles";
import { PANEL_HELP } from "@/modules/help/panels";
import { canAnyReport, canReport, REPORTS } from "@/modules/report/catalog";
import { customPeriod, periodOf, prevPeriod, recentPeriods, yoyPeriod } from "@/modules/report/period";
import { BUILDERS, runCsv, runReport } from "@/modules/report/run";
import { delta, kpiPanel } from "@/modules/report/service";
import { seedShop, testDb } from "./db";

let db: Db;
let ids: Awaited<ReturnType<typeof seedShop>>;
beforeEach(async () => {
  db = await testDb();
  ids = await seedShop(db);
});

describe("기간", () => {
  it("일·주·월·분기·연 범위와 앞·뒤", () => {
    expect(periodOf("day", "2026-11-11")).toMatchObject({
      from: "2026-11-11",
      to: "2026-11-11",
      prev: "2026-11-10",
    });
    // 2026-11-11 은 수요일 → 월요일 11-09 ~ 일요일 11-15
    expect(periodOf("week", "2026-11-11")).toMatchObject({
      from: "2026-11-09",
      to: "2026-11-15",
      days: 7,
    });
    expect(periodOf("month", "2026-02-10")).toMatchObject({
      from: "2026-02-01",
      to: "2026-02-28",
    });
    expect(periodOf("quarter", "2026-08-15")).toMatchObject({
      from: "2026-07-01",
      to: "2026-09-30",
      label: "2026년 3분기",
    });
    expect(periodOf("year", "2026-08-15")).toMatchObject({
      from: "2026-01-01",
      to: "2026-12-31",
      next: "2027-01-01",
    });
    expect(periodOf("half", "2026-08-15")).toMatchObject({ from: "2026-07-01", to: "2026-12-31", label: "2026년 하반기" });
    const c = customPeriod("2026-03-10", "2026-03-01");
    expect(c).toMatchObject({ kind: "custom", from: "2026-03-01", to: "2026-03-10", days: 10 });
    expect(prevPeriod(c)).toMatchObject({ from: "2026-02-19", to: "2026-02-28" });
    expect(yoyPeriod(periodOf("month", "2024-02-10"))).toMatchObject({ from: "2023-02-01", to: "2023-02-28" });
    expect(yoyPeriod(customPeriod("2024-02-29", "2024-03-05"))).toMatchObject({ from: "2023-02-28", to: "2023-03-05" });
    const r = recentPeriods(periodOf("month", "2026-02-10"), 3);
    expect(r.map((p) => p.from)).toEqual([
      "2025-12-01",
      "2026-01-01",
      "2026-02-01",
    ]);
  });
});

describe("보고서", () => {
  it("권한에 맞는 영역만, 앞 기간 비교, CSV", async () => {
    for (const ym of ["2026-09", "2026-10"])
      await db
        .insert(fiveSMonthly)
        .values({
          ym,
          zone: "A",
          scores: [18, 18, 18, 18, 18],
          total: ym === "2026-10" ? 90 : 80,
          ratedBy: ids.manager,
        });
    await db
      .insert(wasteLog)
      .values({
        kind: "gen",
        item: "paint",
        qty: 12.5,
        on: "2026-10-03",
        by: ids.safety,
      });
    const owner = { id: ids.owner, roles: ["owner" as const] };
    const quality = { id: ids.quality, roles: ["quality" as const] };
    const p = periodOf("month", "2026-10-15");
    const now = new Date("2026-11-11T03:00:00Z");
    const qr = await runReport(db, owner, "quality", p, "prev", now);
    const fiveS = qr.body.kpis.find((m) => m.key === "fiveS")!;
    expect(fiveS).toMatchObject({ value: 90, prev: 80, ok: true });
    expect(delta(fiveS)).toEqual({ text: "▲ 10점", tone: "ok" });
    const sf = await runReport(db, owner, "safety", p, "prev", now);
    const waste = sf.body.kpis.find((m) => m.key === "wasteGen")!;
    expect(waste).toMatchObject({ value: 12.5, prev: 0 });
    expect(delta(waste)?.tone).toBe("danger");
    expect(sf.body.tables.find((t) => t.key === "waste")!.rows[0].cells).toEqual(["폐도료·폐시너·세척 용제", 12.5, 0]);
    // 분기로 보면 두 달 평균
    const qq = await runReport(db, owner, "quality", periodOf("quarter", "2026-10-15"), "prev", now);
    expect(qq.body.kpis.find((m) => m.key === "fiveS")!.value).toBe(90);
    // 작년 같은 기간과 비교
    const yoy = await runReport(db, owner, "quality", p, "yoy", now);
    expect(yoy.q).toMatchObject({ from: "2025-10-01", to: "2025-10-31" });
    // 권한: 품질 담당은 회계·경영 보고서를 못 본다
    await expect(runReport(db, quality, "ar", p, "prev", now)).rejects.toThrow("권한");
    await expect(runReport(db, quality, "summary", p, "prev", now)).rejects.toThrow("권한");
    await expect(runReport(db, owner, "pl", p, "prev", now)).rejects.toThrow("아직");
    expect((await runReport(db, quality, "rework", p, "prev", now)).body.kpis.length).toBeGreaterThan(0);
    const csv = runCsv(qr);
    expect(csv.startsWith("\uFEFF14. 품질 월보")).toBe(true);
    expect(csv).toContain("3정5S 점수");
    const sm = await runReport(db, owner, "summary", p, "prev", now);
    expect(sm.trend!.labels).toHaveLength(12);
    expect(sm.trend!.series.map((s) => s.key)).toEqual(["sales", "intake", "delivered"]);
  });

  it("만든 보고서는 모두 계산되고, 표 칸 수가 머리줄과 같다", async () => {
    const owner = { id: ids.owner, roles: ["owner" as const] };
    const now = new Date("2026-11-11T03:00:00Z");
    for (const r of REPORTS.filter((x) => !x.phase)) {
      expect(BUILDERS[r.id], r.id).toBeTruthy();
      expect(PANEL_HELP[`rep.r.${r.id}` as keyof typeof PANEL_HELP], `rep.r.${r.id} 도움말`).toBeTruthy();
      for (const p of [periodOf("month", "2026-11-11"), customPeriod("2026-01-01", "2026-11-11")]) {
        const out = await runReport(db, owner, r.id, p, "yoy", now);
        for (const t of out.body.tables) for (const row of t.rows) expect(row.cells.length, `${r.id}/${t.key}`).toBe(t.cols.length);
      }
    }
  });

  it("보고서별 열람 권한(사용자 결정 2026-11-13)", () => {
    const see = (roles: Role[]) => REPORTS.filter((r) => canReport({ roles }, r)).map((r) => r.id);
    expect(see(["technician"])).toEqual([]);
    expect(canAnyReport({ roles: ["advisor"] })).toBe(false);
    expect(see(["accounting"])).toEqual(expect.arrayContaining(["ar", "ap", "vat", "pl", "stock", "purchase"]));
    expect(see(["accounting"])).not.toContain("summary");
    expect(see(["quality"])).toEqual(["quality", "rework", "customer", "review"]);
    expect(see(["safety"])).toEqual(["safety", "equipment"]);
    expect(see(["plant_manager"])).not.toContain("ar");
    expect(see(["plant_manager"])).toContain("people");
    expect(see(["owner"])).toHaveLength(REPORTS.length);
  });

  it("대시보드 경영 현황·매출·안전 패널", async () => {
    const owner = { id: ids.owner, roles: ["owner" as const] };
    const k = await kpiPanel(db, owner);
    expect(k.sales).toBe(0);
    expect(typeof k.goalMiss).toBe("number");
    const tech = await kpiPanel(db, { id: ids.tech1, roles: ["technician"] });
    expect(tech.sales).toBeNull();
    const m = await moneyPanel(db);
    expect(m).toMatchObject({ sales: 0, unrecorded: 0 });
    const s = await safetyPanel(db);
    expect(Array.isArray(s.legal)).toBe(true);
  });
});
