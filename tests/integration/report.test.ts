// 통계·보고서: 기간(일·주·월·분기·연) 계산, 권한별 영역, 앞 기간 비교, CSV, 대시보드 경영 현황
import { beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { fiveSMonthly, wasteLog } from "@/db/schema";
import { moneyPanel, safetyPanel } from "@/modules/dashboard/service";
import { periodOf, recentPeriods } from "@/modules/report/period";
import {
  buildReport,
  buildTrend,
  delta,
  kpiPanel,
  reportCsv,
} from "@/modules/report/service";
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
    const a = await buildReport(db, owner, p, now);
    expect(a.map((s) => s.id)).toEqual([
      "ops",
      "money",
      "quality",
      "customer",
      "field",
      "safety",
    ]);
    const q = await buildReport(db, quality, p, now);
    expect(q.map((s) => s.id)).not.toContain("money");
    const fiveS = a
      .find((s) => s.id === "quality")!
      .metrics.find((m) => m.key === "fiveS")!;
    expect(fiveS).toMatchObject({ value: 90, prev: 80, ok: true });
    expect(delta(fiveS)).toEqual({ text: "▲ 10점", tone: "ok" });
    const waste = a
      .find((s) => s.id === "safety")!
      .metrics.find((m) => m.key === "wasteGen")!;
    expect(waste).toMatchObject({ value: 12.5, prev: 0 });
    expect(delta(waste)?.tone).toBe("danger");
    // 분기로 보면 두 달 평균
    const qq = await buildReport(
      db,
      owner,
      periodOf("quarter", "2026-10-15"),
      now,
    );
    expect(
      qq
        .find((s) => s.id === "quality")!
        .metrics.find((m) => m.key === "fiveS")!.value,
    ).toBe(90);
    const csv = reportCsv(p, a);
    expect(csv.startsWith("﻿기간,영역,항목")).toBe(true);
    expect(csv).toContain("3정5S 점수");
    const t = await buildTrend(db, owner, p);
    expect(t.labels).toHaveLength(12);
    expect(t.series.map((s) => s.key)).toEqual([
      "sales",
      "consults",
      "intake",
      "delivered",
    ]);
    expect(
      (await buildTrend(db, quality, p)).series.map((s) => s.key),
    ).not.toContain("sales");
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
