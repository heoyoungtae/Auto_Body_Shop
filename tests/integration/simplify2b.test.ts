// 간소화 2차 2묶음(대표 2026-11-24 "1~3묶음 전부"): 켜면 줄어들고, 끄면 표준 절차 그대로
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { dailyClose, equipmentCheck, equipmentRunLog, policySetting, repairOrder, repairStatement } from "@/db/schema";
import type { PolicyKey } from "@/modules/platform/policy";
import { checkAllOk, equipmentDefaults, runLogDraft, saveEquipment } from "@/modules/equipment/service";
import { getEntry, quickClose, saveEntry } from "@/modules/journal/entry";
import { myZonesToday, recordDaily, setZone } from "@/modules/quality/five-s";
import { autoCloseDays } from "@/modules/money/close";
import { deliver } from "@/modules/repair/inspect";
import { DELIVERY_NOTICES } from "@/modules/repair/inspect-rules";
import { approvedRepair, PNG } from "./flow";
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
const now = new Date("2026-11-09T01:00:00Z"); // 서울 2026-11-09(월) 10시
const turnOn = (key: PolicyKey) => db.insert(policySetting).values({ key, value: 1, effectiveFrom: "2000-01-02", reason: "시험: 간소화 켬", changedBy: ids.owner });
const mgr = () => ({ id: ids.manager, roles: ["plant_manager" as const] });
const tech = () => ({ id: ids.tech1, roles: ["technician" as const] });
const advisor = () => ({ id: ids.advisor, roles: ["advisor" as const] });

async function machine(kind: "booth" | "compressor", name: string) {
  const d = await equipmentDefaults(db, kind);
  return saveEquipment(db, mgr(), { name, kind, grade: d.grade, checkDaily: true, checkMonthly: false, dailyItems: d.dailyItems, monthlyItems: [], processes: d.processes, ownerId: ids.tech1, trialOn: "2026-11-02" }, undefined, now);
}

describe("2-1 설비 일상 점검 한 번에", () => {
  it("켜면 고른 설비를 모두 ○로 적고(이미 한 설비는 건너뜀), 끄면 막는다", async () => {
    const a = await machine("booth", "도장 부스");
    const b = await machine("compressor", "컴프레서");
    await expect(checkAllOk(db, tech(), [a.id, b.id], now)).rejects.toThrow(/꺼져/);
    await turnOn("simple.check_all");
    expect(await checkAllOk(db, tech(), [a.id, b.id], now)).toBe(2);
    const rows = await db.select().from(equipmentCheck);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.ok && r.results.every((x) => x.mark === "o"))).toBe(true);
    expect(await checkAllOk(db, tech(), [a.id], now)).toBe(0);
  });
});

describe("2-2 부스 운전 일지 초안", () => {
  it("지난 일지의 온도·필터 상태를 불러오고, 차압은 비워 둔다", async () => {
    const a = await machine("booth", "도장 부스");
    await db.insert(equipmentRunLog).values({ equipmentId: a.id, logDate: "2026-11-06", data: { boothTemp: "23", dryTemp: "60", dryMin: "40", filterPa: "120", filterState: "양호" }, operatorId: ids.tech1, createdAt: now });
    const d = await runLogDraft(db, a.id, "2026-11-09");
    expect(d).toMatchObject({ boothTemp: "23", dryTemp: "60", dryMin: "40", filterState: "양호" });
    expect(d.filterPa).toBeUndefined();
    const c = await machine("compressor", "컴프레서");
    expect(await runLogDraft(db, c.id, "2026-11-09")).toEqual({});
  });
});

describe("2-3 퇴근 때 업무일지 마감", () => {
  it("적어 둔 칸은 두고 안전 '없음'으로 마감, 안전 '있음'이면 막는다, 끄면 막는다", async () => {
    const blank = { notes: "", tomorrow: "", offApp: [], suggestionText: "", safety: "", safetyNote: "" };
    const later = new Date("2026-11-09T09:00:00Z");
    await expect(quickClose(db, tech(), "2026-11-09", later)).rejects.toThrow(/꺼져/);
    await turnOn("simple.punch_close");
    await saveEntry(db, tech(), "2026-11-09", { ...blank, tomorrow: "범퍼 도장" }, later);
    await quickClose(db, tech(), "2026-11-09", later);
    const e = await getEntry(db, ids.tech1, "2026-11-09");
    expect(e).toMatchObject({ safetyOk: true, tomorrow: "범퍼 도장" });
    expect(["closed", "confirmed"]).toContain(e?.status);
    await saveEntry(db, mgr(), "2026-11-09", { ...blank, safety: "no", safetyNote: "손 베임" }, later);
    await expect(quickClose(db, mgr(), "2026-11-09", later)).rejects.toThrow(/있음/);
  });
});

describe("2-4 3정5S 점검 주 1회", () => {
  it("켜면 금요일부터 할 일, 그 주에 한 번 했으면 없음", async () => {
    await setZone(db, mgr(), "A", { ownerId: ids.tech1, deputyId: "" }, now);
    expect((await myZonesToday(db, ids.tech1, "2026-11-09")).map((z) => z.code)).toEqual(["A"]);
    await turnOn("simple.five_s_weekly");
    expect(await myZonesToday(db, ids.tech1, "2026-11-09")).toEqual([]);
    expect((await myZonesToday(db, ids.tech1, "2026-11-13")).map((z) => z.code)).toEqual(["A"]);
    await recordDaily(db, tech(), "A", { date: "2026-11-10", results: Array(7).fill(true) }, new Date("2026-11-10T09:00:00Z"));
    expect(await myZonesToday(db, ids.tech1, "2026-11-13")).toEqual([]);
  });
});

describe("2-5 일일 마감 자동", () => {
  it("현금 없는 날만 다음 날 자동 마감, 현금 받은 날은 그대로 둔다, 끄면 아무것도 안 함", async () => {
    await turnOn("simple.deliver_payment");
    const ready = async (total: number) => {
      const { roId, estimateId } = await approvedRepair(db, ids, now);
      await db.insert(repairStatement).values({ docNo: `IV-${roId.slice(0, 6)}`, repairOrderId: roId, estimateId, partsWon: 0, laborWon: total - Math.floor(total / 11), vatWon: Math.floor(total / 11), totalWon: total, issuedOn: "2026-11-09" });
      await db.update(repairOrder).set({ status: "ready" }).where(eq(repairOrder.id, roId));
      return roId;
    };
    const handover = (payMethod: string, extra = {}) => ({ payMethod, notices: Object.keys(DELIVERY_NOTICES), receiverName: "홍길동", proxy: false, proxyNote: "", signaturePng: PNG, ...extra });
    await deliver(db, advisor(), await ready(330_000), handover("card"), now);
    const next = new Date("2026-11-10T00:00:00Z");
    expect(await autoCloseDays(db, next)).toMatch(/꺼짐/);
    await turnOn("simple.day_close_auto");
    expect(await autoCloseDays(db, now)).toBe("일일 마감 자동 0일"); // 오늘은 마감하지 않음
    expect(await autoCloseDays(db, next)).toBe("일일 마감 자동 1일");
    const [c] = await db.select().from(dailyClose);
    expect(c).toMatchObject({ day: "2026-11-09", cardWon: 330_000, cardTerminalWon: 330_000, diffWon: 0, closedBy: null });

    const later = new Date("2026-11-10T01:00:00Z");
    const { roId, estimateId } = await approvedRepair(db, ids, later);
    await db.insert(repairStatement).values({ docNo: "IV-cash", repairOrderId: roId, estimateId, partsWon: 0, laborWon: 50_000, vatWon: 5_000, totalWon: 55_000, issuedOn: "2026-11-10" });
    await db.update(repairOrder).set({ status: "ready" }).where(eq(repairOrder.id, roId));
    await deliver(db, advisor(), roId, handover("cash", { receiptKind: "cash_receipt", receiptNo: "123456789" }), later);
    expect(await autoCloseDays(db, new Date("2026-11-11T00:00:00Z"))).toBe("일일 마감 자동 0일");
  });
});
