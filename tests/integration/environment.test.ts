// 환경(STD-10): 방지시설 운영 일지 F-10-01, 폐기물 관리대장 F-10-02, 환경측면
import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { notification, supplier } from "@/db/schema";
import { myTodos } from "@/modules/dashboard/todo";
import {
  addRunLog,
  equipmentDefaults,
  saveEquipment,
} from "@/modules/equipment/service";
import {
  envDailyAlerts,
  envMonth,
  filterStatus,
  importEnvAspects,
  recordEnvEvent,
  recordWasteGen,
  recordWasteOut,
  signEnvMonth,
  wasteLedger,
  wasteStock,
} from "@/modules/safety/environment";
import { storageOf } from "@/modules/safety/env-rules";
import { seedShop, testDb } from "./db";

let db: Db;
let ids: Awaited<ReturnType<typeof seedShop>>;
beforeEach(async () => {
  db = await testDb();
  ids = await seedShop(db);
});
const now = new Date("2026-11-10T03:00:00Z");
const safety = () => ({ id: ids.safety, roles: ["safety" as const] });
const manager = () => ({ id: ids.manager, roles: ["plant_manager" as const] });
const tech = () => ({ id: ids.tech1, roles: ["technician" as const] });

async function booth() {
  const d = await equipmentDefaults(db, "booth");
  return (
    await saveEquipment(
      db,
      manager(),
      {
        name: "도장 부스",
        kind: "booth",
        grade: d.grade,
        checkDaily: true,
        checkMonthly: true,
        dailyItems: d.dailyItems,
        monthlyItems: d.monthlyItems,
        processes: d.processes,
        ownerId: ids.tech1,
        trialOn: "2026-10-02",
      },
      undefined,
      now,
    )
  ).id;
}

describe("보관 계산", () => {
  it("먼저 낸 것 먼저 처리", () => {
    expect(
      storageOf(
        [
          { on: "2026-10-01", qty: 10 },
          { on: "2026-10-20", qty: 5 },
        ],
        [],
      ),
    ).toEqual({ stock: 15, since: "2026-10-01" });
    expect(
      storageOf(
        [
          { on: "2026-10-20", qty: 5 },
          { on: "2026-10-01", qty: 10 },
        ],
        [{ qty: 10 }],
      ),
    ).toEqual({ stock: 5, since: "2026-10-20" });
    expect(storageOf([{ on: "2026-10-01", qty: 10 }], [{ qty: 10 }])).toEqual({
      stock: 0,
      since: null,
    });
  });
});

describe("방지시설 운영 일지", () => {
  it("교체 기록·다음 교체일·폐필터 발생·월 서명", async () => {
    const b = await booth();
    await addRunLog(
      db,
      tech(),
      b,
      {
        date: "2026-10-15",
        data: { start: "09:00", end: "17:00", filterPa: "120", paintL: "3.5" },
      },
      now,
    );
    await expect(
      recordEnvEvent(
        db,
        tech(),
        {
          kind: "filter",
          equipmentId: "",
          on: "2026-10-16",
          detail: "",
          result: "",
          wasteKg: "",
        },
        now,
      ),
    ).rejects.toThrow(/부스/);
    await expect(
      recordEnvEvent(
        db,
        tech(),
        {
          kind: "measure",
          equipmentId: "",
          on: "2026-10-16",
          detail: "",
          result: "적합",
          wasteKg: "",
        },
        now,
      ),
    ).rejects.toThrow(/안전환경/);
    const r = await recordEnvEvent(
      db,
      tech(),
      {
        kind: "filter",
        equipmentId: b,
        on: "2026-10-16",
        detail: "필터 교체",
        result: "",
        wasteKg: "4.2",
      },
      now,
    );
    expect(r.nextDue).toBe("2026-11-15");
    expect(r.wasteLogId).toBeTruthy();
    expect((await filterStatus(db))[0].nextDue).toBe("2026-11-15");
    const m = await envMonth(db, "2026-10");
    expect(m.days).toBe(1);
    expect(m.paintL).toBe(3.5);
    expect(m.events.length).toBe(1);
    // 필터 교체일 3일 전 할 일
    expect(
      (await myTodos(db, tech(), new Date("2026-11-13T03:00:00Z"))).some(
        (t) => t.key === `env-filter-${b}`,
      ),
    ).toBe(true);
    // 지난달 서명 할 일(5일 지나면 늦음)
    expect(
      (await myTodos(db, safety(), now)).find(
        (t) => t.key === "env-sign-2026-10",
      )?.when,
    ).toBe("late");
    await expect(
      signEnvMonth(db, safety(), "2026-11", "", now),
    ).rejects.toThrow(/지난달/);
    expect(
      await signEnvMonth(db, safety(), "2026-10", "이상 없음", now),
    ).toContain("가동 1일");
    expect(
      (await myTodos(db, safety(), now)).some(
        (t) => t.key === "env-sign-2026-10",
      ),
    ).toBe(false);
  });
});

describe("폐기물 관리대장", () => {
  it("발생·보관 한도 알림·허가 업체 인계", async () => {
    await recordWasteGen(
      db,
      tech(),
      { item: "paint", qty: 12, on: "2026-09-30", note: "" },
      now,
    );
    await recordWasteGen(
      db,
      tech(),
      { item: "paint", qty: 8, on: "2026-10-20", note: "" },
      now,
    );
    await expect(
      recordWasteGen(
        db,
        tech(),
        { item: "x", qty: 1, on: "2026-10-20", note: "" },
        now,
      ),
    ).rejects.toThrow(/품목/);
    const st = (await wasteStock(db, now)).find((s) => s.item === "paint")!;
    expect(st).toMatchObject({ stock: 20, since: "2026-09-30", left: 4 });
    expect(
      (await myTodos(db, safety(), now)).find((t) => t.key === "waste-paint")
        ?.when,
    ).toBe("soon");
    expect(await envDailyAlerts(db, now)).toMatch(/1건/);
    expect(
      (
        await db
          .select()
          .from(notification)
          .where(eq(notification.userId, ids.safety))
      ).some((n) => n.title.includes("지정폐기물")),
    ).toBe(true);

    const [cand] = await db
      .insert(supplier)
      .values({ name: "후보환경", kinds: ["waste"], status: "candidate" })
      .returning({ id: supplier.id });
    const [nolic] = await db
      .insert(supplier)
      .values({
        name: "무허가환경",
        kinds: ["waste"],
        status: "registered",
        docs: ["biz"],
      })
      .returning({ id: supplier.id });
    const [ok] = await db
      .insert(supplier)
      .values({
        name: "푸른환경",
        kinds: ["waste"],
        status: "registered",
        docs: ["biz", "license"],
      })
      .returning({ id: supplier.id });
    const out = {
      item: "paint",
      qty: 12,
      on: "2026-11-10",
      supplierId: ok.id,
      slipNo: "2026-1110-1",
      note: "",
    };
    await expect(recordWasteOut(db, tech(), out, now)).rejects.toThrow(
      /안전환경/,
    );
    await expect(
      recordWasteOut(db, safety(), { ...out, supplierId: cand.id }, now),
    ).rejects.toThrow(/등록된 폐기물 위탁/);
    await expect(
      recordWasteOut(db, safety(), { ...out, supplierId: nolic.id }, now),
    ).rejects.toThrow(/허가증/);
    await expect(
      recordWasteOut(db, safety(), { ...out, slipNo: "" }, now),
    ).rejects.toThrow(/전자인계서/);
    await expect(
      recordWasteOut(db, safety(), { ...out, qty: 25 }, now),
    ).rejects.toThrow(/보관량/);
    await recordWasteOut(db, safety(), out, now);
    expect(
      (await wasteStock(db, now)).find((s) => s.item === "paint"),
    ).toMatchObject({ stock: 8, since: "2026-10-20" });
    const l = await wasteLedger(db, "2026-11");
    expect(l.out).toBe(12);
  });

  it("환경측면 초안 → 리스크 대장", async () => {
    expect(
      (await myTodos(db, safety(), now)).some((t) => t.key === "env-aspects"),
    ).toBe(true);
    expect(await importEnvAspects(db, safety(), now)).toBe(6);
    expect(await importEnvAspects(db, safety(), now)).toBe(0);
  });
});
