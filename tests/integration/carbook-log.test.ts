// 내 차 수첩 2단계: 이용 동의, 내 기록(주유 셈·주행거리 짐작·연비·소모품 주기), 다가오는 일, 알림(한 번만), 철회·그만 쓰기·3년 미접속 정리, 정비소는 주행거리만
import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import * as schema from "@/db/schema";
import { requestCode, sessionOf, verifyCode } from "@/modules/carbook/service";
import { addEntry, carbookAlertsJob, carbookIdleJob, carbookMileage, consentState, entryDefaults, leaveCarbook, myLog, myUpcoming, saveInsurance, savePrefs, setConsent, type EntryInput } from "@/modules/carbook/records";
import { addMonths, fuelEconomy, fuelFill, itemDue, mileageGuess, nextInspection, nextYearly } from "@/modules/carbook/rules";
import { seedShop, testDb } from "./db";
import { approvedRepair } from "./flow";

let db: Db;
let ids: Awaited<ReturnType<typeof seedShop>>;
beforeEach(async () => {
  db = await testDb();
  ids = await seedShop(db);
});
const PHONE = "010-1234-5678";
const at = (d: string) => new Date(`${d}T03:00:00Z`);

async function login(now: Date) {
  const r = await requestCode(db, PHONE, {}, now);
  const { token } = await verifyCode(db, PHONE, r.demoCode!, {}, now);
  return (await sessionOf(db, token, now))!;
}
const base = (vehicleId: string, x: Partial<EntryInput>): EntryInput => ({ vehicleId, kind: "fuel", sub: "gasoline", on: "2026-11-21", mileage: null, amount: null, qty: null, unitPrice: null, place: "", memo: "", intervalKm: null, intervalMonths: null, insuranceUntil: null, ...x });

describe("2단계 규칙", () => {
  it("정기검사: 처음 4년, 그 뒤 2년, 앞뒤 31일. 승합·화물은 계산 안 함", () => {
    expect(nextInspection("2021-03-15", "sedan", "2026-11-21")).toEqual({ from: "2027-02-11", until: "2027-04-14", end: "2027-03-14" });
    expect(nextInspection("2023-01-10", null, "2026-11-21")?.end).toBe("2027-01-09");
    expect(nextInspection("2021-03-15", "truck", "2026-11-21")).toBeNull();
    expect(nextInspection(null, "sedan", "2026-11-21")).toBeNull();
  });
  it("달 더하기·해마다·주유 셈·주행거리 짐작·소모품 때·연비", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(nextYearly("2024-12-01", "2026-11-21")).toBe("2026-12-01");
    expect(fuelFill({ amount: 70000, qty: null, unit: 1650 })).toEqual({ amount: 70000, qty: 42.42, unit: 1650 });
    expect(fuelFill({ amount: null, qty: 40, unit: 1700 })).toEqual({ amount: 68000, qty: 40, unit: 1700 });
    expect(fuelFill({ amount: 50000, qty: 30, unit: null }).unit).toBe(1667);
    expect(mileageGuess([{ on: "2026-11-01", km: 45000 }], "2026-11-21")).toMatchObject({ km: 45800, perDay: 40, measured: false });
    expect(mileageGuess([{ on: "2026-01-01", km: 30000 }, { on: "2026-11-01", km: 45000 }], "2026-11-21")?.measured).toBe(true);
    expect(itemDue({ on: "2026-01-01", mileage: 30000, intervalKm: 10000, intervalMonths: 12 }, 100)).toEqual({ date: "2026-04-11", km: 40000, why: "km" });
    expect(itemDue({ on: "2026-01-01", mileage: null, intervalKm: 10000, intervalMonths: 12 }, 100)).toEqual({ date: "2027-01-01", km: null, why: "date" });
    expect(fuelEconomy([{ on: "a", mileage: 1000, qtyX100: 4000, sub: "gasoline" }, { on: "b", mileage: 1500, qtyX100: 4000, sub: "gasoline" }])).toMatchObject({ value: 12.5, unit: "km/L" });
  });
});

describe("내 기록", () => {
  it("동의 전엔 잠김, 동의하면 적기(주유 셈·미리 채우기·주행거리 거꾸로 막기), 정비소는 주행거리만", async () => {
    const { roId } = await approvedRepair(db, ids, at("2026-11-01"));
    const [ro] = await db.select().from(schema.repairOrder).where(eq(schema.repairOrder.id, roId));
    const car = ro.vehicleId;
    const now = at("2026-11-21");
    const s = await login(now);
    expect((await myLog(db, s, null, now)).consent.agreed).toBe(false);
    await expect(addEntry(db, s, base(car, { amount: 50000, unitPrice: 1700 }), now)).rejects.toThrow(/동의/);
    expect((await myUpcoming(db, s, now)).consent).toBe(false);

    await setConsent(db, s, true, { ip: "1.1.1.1" }, now);
    expect((await consentState(db, s.customerId)).agreed).toBe(true);
    // 처음 기록: 주행거리는 입고 때 45,000km(11-01)에서 하루 40km로 짐작
    const d0 = await entryDefaults(db, s, { kind: "fuel" }, now);
    expect(d0).toMatchObject({ car, sub: "gasoline", mileage: 45800, place: "" });
    await addEntry(db, s, base(car, { on: "2026-11-10", mileage: 45500, amount: 68000, unitPrice: 1700, place: "한빛주유소" }), now);
    await addEntry(db, s, base(car, { on: "2026-11-20", mileage: 46000, qty: 40, unitPrice: 1700 }), now);
    await expect(addEntry(db, s, base(car, { on: "2026-11-21", mileage: 40000, amount: 10000, unitPrice: 1700 }), now)).rejects.toThrow(/주행거리가/);
    await expect(addEntry(db, s, base(car, { on: "2026-11-21" }), now)).rejects.toThrow(/두 가지/);
    await expect(addEntry(db, s, base(car, { on: "2026-12-01", amount: 1, unitPrice: 1 }), now)).rejects.toThrow(/날짜/);
    // 다음 주유 칸: 지난 주유소·단가·연료가 미리
    const d1 = await entryDefaults(db, s, { kind: "fuel" }, now);
    expect(d1).toMatchObject({ unitPrice: 1700, sub: "gasoline" });
    // 엔진오일: 기본 주기 10,000km·12개월
    const d2 = await entryDefaults(db, s, { kind: "item", sub: "oil" }, now);
    expect(d2).toMatchObject({ intervalKm: 10000, intervalMonths: 12 });
    await addEntry(db, s, base(car, { kind: "item", sub: "oil", on: "2026-11-21", mileage: 46040, amount: 80000, intervalKm: 10000, intervalMonths: 12 }), now);
    // 보험: 만기일을 넣으면 차 정보에
    await addEntry(db, s, base(car, { kind: "fee", sub: "insurance", on: "2026-11-21", amount: 900000, insuranceUntil: "2026-12-10" }), now);

    const log = await myLog(db, s, car, now);
    expect(log.entries).toHaveLength(4);
    const second = log.entries.find((e) => e.on === "2026-11-20")!;
    expect(second).toMatchObject({ amountWon: 68000, qty: 40 });
    expect(log.economy).toMatchObject({ value: 12.5, unit: "km/L" });
    expect(log.months[0]).toMatchObject({ month: "2026-11", total: 68000 + 68000 + 80000 + 900000 });
    expect(log.insuranceUntil).toBe("2026-12-10");
    expect(log.items.find((i) => i.key === "oil")?.due?.date).toBeTruthy();

    // 정비소 쪽: 주행거리만
    const km = await carbookMileage(db, s.customerId);
    expect(km).toEqual([{ vehicleId: car, plateNo: expect.any(String), km: 46040, on: "2026-11-21" }]);
    expect(Object.keys(km[0])).not.toContain("amountWon");

    // 다가오는 일: 보험 만기(19일 뒤)
    const up = await myUpcoming(db, s, now);
    expect(up.list.map((u) => u.kind)).toContain("insurance");
  });

  it("알림: 손님마다 한 통, 같은 알림은 한 번, 끈 알림은 안 보냄. 링크 로그인은 내 기록 못 봄", async () => {
    const { roId, estimateId } = await approvedRepair(db, ids, at("2026-10-01"));
    await db.update(schema.repairOrder).set({ status: "delivered" }).where(eq(schema.repairOrder.id, roId));
    await db.insert(schema.repairStatement).values({ docNo: "IV-T-1", repairOrderId: roId, estimateId, issuedOn: "2026-10-25", deliveredAt: new Date("2026-10-25T05:00:00Z"), totalWon: 550_000, snapshot: { warranty: [{ kind: "광택", until: "2027-02-25" }] } });
    const [ro] = await db.select().from(schema.repairOrder).where(eq(schema.repairOrder.id, roId));
    const now = at("2027-02-15");
    const s = await login(now);
    await setConsent(db, s, true, {}, now);
    await saveInsurance(db, s, ro.vehicleId, "2025-03-01", now);

    // 정기검사(2027-02-11 시작)·보증(10일 뒤)·보험(2027-03-01, 14일 뒤)
    expect(await carbookAlertsJob(db, now)).toMatch(/1명/);
    const logs = await db.select().from(schema.messageLog).where(eq(schema.messageLog.purpose, "내 차 수첩 알림"));
    expect(logs).toHaveLength(1);
    expect(logs[0].body).toMatch(/정기검사 기간: 2027-02-11 ~ 2027-04-14/);
    expect(logs[0].body).toMatch(/광택 보증이 2027-02-25에 끝납니다/);
    expect(logs[0].body).toMatch(/보험 만기 2027-03-01/);
    expect(logs[0].body).toMatch(/\/my\/l\/●●●●/);
    // 다음 날: 새 것이 없으면 안 보냄
    expect(await carbookAlertsJob(db, at("2027-02-16"))).toMatch(/0명/);

    // 끈 알림: 소모품을 끄면 오일 교체 때가 와도 안 감
    await addEntry(db, s, base(ro.vehicleId, { kind: "item", sub: "wiper", on: "2026-03-01", amount: 20000, intervalMonths: 12 }), now);
    await savePrefs(db, s, ["inspection", "warranty", "insurance"], now);
    expect(await carbookAlertsJob(db, at("2027-02-20"))).toMatch(/0명/);
    await savePrefs(db, s, ["inspection", "warranty", "insurance", "items"], now);
    expect(await carbookAlertsJob(db, at("2027-02-21"))).toMatch(/1명/);

    // 링크 로그인은 내 기록 못 봄
    await expect(myLog(db, { ...s, scope: "link" }, null, now)).rejects.toThrow(/문자 인증/);
  });

  it("철회하면 기록을 바로 지우고, 그만 쓰면 로그인도 풀린다. 3년 미접속은 30일 전 안내 뒤 지움", async () => {
    const { roId } = await approvedRepair(db, ids, at("2026-11-01"));
    const [ro] = await db.select().from(schema.repairOrder).where(eq(schema.repairOrder.id, roId));
    const now = at("2026-11-21");
    let s = await login(now);
    await setConsent(db, s, true, {}, now);
    await addEntry(db, s, base(ro.vehicleId, { kind: "wash", sub: null, amount: 15000 }), now);
    expect(await setConsent(db, s, false, {}, now)).toEqual({ deleted: 1 });
    expect(await db.select().from(schema.carbookEntry)).toHaveLength(0);

    await setConsent(db, s, true, {}, now);
    await addEntry(db, s, base(ro.vehicleId, { kind: "wash", sub: null, amount: 15000 }), now);
    const r = await requestCode(db, PHONE, {}, new Date(now.getTime() + 60_000));
    const { token } = await verifyCode(db, PHONE, r.demoCode!, {}, new Date(now.getTime() + 60_000));
    expect(await leaveCarbook(db, s, {}, now)).toEqual({ deleted: 1 });
    expect(await sessionOf(db, token, now)).toBeNull();

    // 3년 미접속
    s = await login(at("2026-12-01"));
    await setConsent(db, s, true, {}, at("2026-12-01"));
    await addEntry(db, s, base(ro.vehicleId, { kind: "wash", sub: null, on: "2026-12-01", amount: 15000 }), at("2026-12-01"));
    expect(await carbookIdleJob(db, at("2029-10-01"))).toMatch(/정리 0명·안내 0명/);
    expect(await carbookIdleJob(db, at("2029-11-05"))).toMatch(/안내 1명/);
    expect(await carbookIdleJob(db, at("2029-11-06"))).toMatch(/안내 0명/);
    expect(await carbookIdleJob(db, at("2029-12-01"))).toMatch(/정리 1명/);
    expect(await db.select().from(schema.carbookEntry)).toHaveLength(0);
  });
});
