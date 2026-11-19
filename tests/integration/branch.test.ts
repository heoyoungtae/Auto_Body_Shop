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

describe("작업장 연결", () => {
  it("작업 지시서를 만들면 공정에 작업장이 자동으로 들어가고, 공장장이 바꿀 수 있다", async () => {
    const { approvedRepair } = await import("./flow");
    const { createWorkOrder, getWorkOrder, assignStep, startStep } = await import("@/modules/repair/work");
    const now = new Date("2026-11-10T01:00:00Z");
    const panel = await createWorkplace(db, manager(), { name: "판금동", kind: "panel", bays: 2, managerId: null, note: "", sortOrder: 10 });
    const b1 = await createWorkplace(db, manager(), { name: "도장 부스 1", kind: "paint", bays: 1, managerId: null, note: "", sortOrder: 20 });
    const b2 = await createWorkplace(db, manager(), { name: "도장 부스 2", kind: "paint", bays: 1, managerId: null, note: "", sortOrder: 30 });
    const { roId } = await approvedRepair(db, ids, now);
    const { id } = await createWorkOrder(db, manager(), roId, now);
    const w = await getWorkOrder(db, id);
    const by = (p: string) => w.steps.find((s) => s.process === p);
    expect(by("detach")?.workplaceId).toBe(panel);
    expect(by("detach")?.wpChoices).toHaveLength(1); // 판금 작업장이 하나면 칸이 없음
    expect(by("paint")?.workplaceId).toBe(b1);
    expect(by("paint")?.workplaceName).toBe("도장 부스 1");
    expect(by("paint")?.wpChoices.map((x) => x.id)).toEqual([b1, b2]);
    // 공장장이 다른 부스로 바꿈
    const paint = by("paint")!;
    await assignStep(db, manager(), paint.id, { assignee: ids.tech1, planDate: "2026-11-11", stdMinutes: null, workplaceId: b2 }, now);
    expect((await getWorkOrder(db, id)).steps.find((s) => s.id === paint.id)?.workplaceId).toBe(b2);
    await expect(assignStep(db, manager(), paint.id, { assignee: ids.tech1, planDate: "", stdMinutes: null, workplaceId: "00000000-0000-4000-8000-0000000000ff" }, now)).rejects.toThrow(/작업장/);
    // 작업장이 비어 있던 공정은 시작할 때 채운다
    const first = w.steps[0];
    await db.update((await import("@/db/schema")).workStep).set({ workplaceId: null }).where(eq((await import("@/db/schema")).workStep.id, first.id));
    await assignStep(db, manager(), first.id, { assignee: ids.tech1, planDate: "", stdMinutes: null }, now);
    await startStep(db, { id: ids.tech1, roles: ["technician"] }, first.id, now);
    expect((await getWorkOrder(db, id)).steps[0].workplaceId).toBeTruthy();
    // 작업장 TV: 그 작업장에 안 끝난 공정이 있는 차만
    const { tvBoard, tvScope } = await import("@/modules/dashboard/tv");
    const polish = await createWorkplace(db, manager(), { name: "광택장", kind: "polish", bays: 1, managerId: null, note: "" });
    expect((await tvBoard(db, now, await tvScope(db, { w: b2 }))).cars).toHaveLength(1);
    const empty = await tvBoard(db, now, await tvScope(db, { w: polish }));
    expect(empty.cars).toHaveLength(0);
    expect(empty.scope).toBe("광택장");
    expect((await tvBoard(db, now, await tvScope(db, { w: "nope" }))).scope).toBeNull();
  });
});

describe("본점·지점 2단계", () => {
  const base = { bizNo: "", subBizNo: "", repairRegNo: "", zip: "", address: "", addressDetail: "", phone: "", openedOn: "", closedOn: "" };
  const addWest = async () => {
    const { createBranch } = await import("@/modules/platform/branch");
    return createBranch(db, owner(), { ...base, name: "서구점", code: "s", subBizNo: "0001", repairRegNo: "제2027-9호", address: "인천 서구", phone: "032-000-0000" });
  };

  it("지점은 대표만 더하고, 코드는 영문 1~2자, 이름은 겹치지 않는다", async () => {
    const { createBranch } = await import("@/modules/platform/branch");
    await expect(createBranch(db, manager(), { ...base, name: "서구점", code: "S" })).rejects.toThrow();
    await expect(createBranch(db, owner(), { ...base, name: "서구점", code: "S1" })).rejects.toThrow(/영문/);
    const id = await addWest();
    await expect(createBranch(db, owner(), { ...base, name: "서구점", code: "W" })).rejects.toThrow();
    const list = await listBranches(db);
    expect(list.find((b) => b.id === id)).toMatchObject({ code: "S", subBizNo: "0001", isMain: false });
    expect(await hasManyBranches(db)).toBe(true);
  });

  it("지점이 하나면 아무것도 바뀌지 않고, 여럿이면 소속·고른 지점·지점별 역할을 따른다", async () => {
    const { branchContext, setUserBranches, setViewBranch } = await import("@/modules/platform/branch");
    let c = await branchContext(db, ids.tech1, ["technician"]);
    expect(c).toMatchObject({ branchId: MAIN_BRANCH_ID, viewBranchId: MAIN_BRANCH_ID, roles: ["technician"] });

    const west = await addWest();
    // 소속은 본점, 서구점에서는 공장장
    await setUserBranches(db, owner(), ids.tech1, { homeBranchId: MAIN_BRANCH_ID, access: { [west]: ["plant_manager"] } });
    c = await branchContext(db, ids.tech1, ["technician"]);
    expect(c.branches.map((b) => b.name)).toEqual(["본점", "서구점"]);
    expect(c).toMatchObject({ branchId: MAIN_BRANCH_ID, roles: ["technician"], allBranches: false });
    await setViewBranch(db, tech(), west);
    c = await branchContext(db, ids.tech1, ["technician"]);
    expect(c).toMatchObject({ branchId: west, viewBranchId: west, roles: ["plant_manager"] });
    // 전체 보기는 대표·회계만, 권한 없는 지점은 못 고름
    await expect(setViewBranch(db, tech(), "")).rejects.toThrow(/대표·회계/);
    await expect(setViewBranch(db, { id: ids.tech2, roles: ["technician"] }, west)).rejects.toThrow(/권한/);
    // 대표는 처음에 전체, 새 기록은 본점
    c = await branchContext(db, ids.owner, ["owner"]);
    expect(c).toMatchObject({ viewBranchId: null, branchId: MAIN_BRANCH_ID, allBranches: true });
  });

  it("지점 서류는 번호에 지점 코드가 붙고, 수리 건·입금은 상담의 지점을 따른다", async () => {
    const west = await addWest();
    const { createConsultation } = await import("@/modules/customer/service");
    const { startRepair } = await import("@/modules/repair/service");
    const now = new Date("2026-11-10T01:00:00Z");
    const mk = (branchId?: string, plate = "12가3456") => createConsultation(db, ids.advisor, { branchId, newCustomer: { name: "홍길동", phone: "010-1234-5678" }, consent: { required: true, photo: false, marketing: false, method: "phone" }, newVehicle: { plateNo: plate, model: "아반떼" }, channel: "phone", damageTypes: [], damageParts: "앞범퍼", methods: [], insurance: "self", result: "open" }, now);
    const main = await mk();
    const w = await mk(west, "34나5678");
    const { consultation, repairOrder } = await import("@/db/schema");
    const [cm] = await db.select().from(consultation).where(eq(consultation.id, main.id));
    const [cw] = await db.select().from(consultation).where(eq(consultation.id, w.id));
    expect(cm.docNo).toMatch(/^CS-2611-\d{4}$/);
    expect(cw.docNo).toBe("CS-S2611-0001");
    expect(cw.branchId).toBe(west);
    const { id } = await startRepair(db, ids.advisor, w.id, now);
    const [ro] = await db.select().from(repairOrder).where(eq(repairOrder.id, id));
    expect(ro).toMatchObject({ branchId: west, docNo: "RO-S2611-0001" });
  });

  it("일일 마감은 지점마다 따로 하고, 목록은 고른 지점 것만 보인다", async () => {
    const west = await addWest();
    const { closeDay, dayClose, unclosedDays } = await import("@/modules/money/close");
    const { payment } = await import("@/db/schema");
    const { runList } = await import("@/modules/listq/core");
    const { paymentsList } = await import("@/modules/listq/defs/money");
    const { approvedRepair } = await import("./flow");
    const now = new Date("2026-11-10T01:00:00Z");
    const { roId } = await approvedRepair(db, ids, now);
    await db.insert(payment).values([
      { docNo: "PM-T-1", repairOrderId: roId, method: "cash", amountWon: 10_000, receivedOn: "2026-11-09", receiptKind: "none", note: "시험", createdBy: ids.advisor },
      { docNo: "PM-T-2", branchId: west, repairOrderId: roId, method: "cash", amountWon: 20_000, receivedOn: "2026-11-09", receiptKind: "none", note: "시험", createdBy: ids.advisor },
    ]);
    const acct = { id: ids.account, roles: ["accounting" as const] };
    await closeDay(db, { ...acct, branchId: MAIN_BRANCH_ID }, "2026-11-09", { cardTerminalWon: 0, cashCountedWon: 10_000, note: "" }, now);
    expect(await dayClose(db, "2026-11-09", west)).toBeNull();
    expect(await unclosedDays(db, "2026-11-01", "2026-11-09")).toEqual(["2026-11-09"]);
    expect(await unclosedDays(db, "2026-11-01", "2026-11-09", MAIN_BRANCH_ID)).toEqual([]);
    await closeDay(db, { ...acct, branchId: west }, "2026-11-09", { cardTerminalWon: 0, cashCountedWon: 20_000, note: "" }, now);
    expect(await unclosedDays(db, "2026-11-01", "2026-11-09")).toEqual([]);

    const q = { p: "all" };
    const all = await runList(db, paymentsList, { ...acct, viewBranchId: null }, q);
    const onlyWest = await runList(db, paymentsList, { ...acct, viewBranchId: west }, q);
    expect(all.count).toBe(2);
    expect(onlyWest.all.map((r) => r.p.docNo)).toEqual(["PM-T-2"]);
  });

  it("출퇴근은 지점마다 와이파이 주소를 따로 두고, 누른 곳의 지점으로 남는다", async () => {
    const west = await addWest();
    const { punchIn, savePunchConfig } = await import("@/modules/staff/punch");
    const { workDay } = await import("@/db/schema");
    await savePunchConfig(db, owner(), "211.0.0.1");
    await savePunchConfig(db, owner(), "211.0.0.2", false, false, west);
    await expect(savePunchConfig(db, owner(), "211.0.0.3", false, false, "00000000-0000-4000-8000-0000000000ff")).rejects.toThrow(/없는 지점/);
    const now = new Date("2026-11-10T00:00:00Z");
    await expect(punchIn(db, tech(), "8.8.8.8", now)).rejects.toThrow(/와이파이/);
    await punchIn(db, tech(), "211.0.0.2", now);
    const [d] = await db.select().from(workDay).where(eq(workDay.userId, ids.tech1));
    expect(d.branchId).toBe(west);
  });
});

describe("본점·지점 3단계: 지점별 재고·이동", () => {
  it("본점에서 보내고 지점이 받으면 지점 재고로 옮겨지고, 회사 전체 재고·장부는 그대로다", async () => {
    const { createBranch } = await import("@/modules/platform/branch");
    const { saveItem, useStock, recordCount } = await import("@/modules/purchase/stock");
    const { branchStock, sendTransfer, receiveTransfer, cancelTransfer, getTransfer } = await import("@/modules/purchase/transfer");
    const { stockItem } = await import("@/db/schema");
    const west = await createBranch(db, owner(), { name: "서구점", code: "S", bizNo: "", subBizNo: "", repairRegNo: "", zip: "", address: "", addressDetail: "", phone: "", openedOn: "", closedOn: "" });
    const now = new Date("2026-11-10T01:00:00Z");
    const item = (await saveItem(db, manager(), null, { name: "베이스", kind: "paint", spec: "", unit: "캔", location: "", safetyQty: 0, unitWon: 50_000, expiryTracked: false, supplierId: "", openingQty: 10 }, now)) as string;
    const mgrMain = { ...manager(), branchId: MAIN_BRANCH_ID };
    const mgrWest = { ...manager(), branchId: west };
    const at = async (b: string) => (await branchStock(db, [item])).by.get(item)?.get(b)?.qty ?? 0;
    expect(await at(MAIN_BRANCH_ID)).toBe(10);
    await expect(sendTransfer(db, mgrMain, { toBranchId: west, lines: [{ itemId: item, qty: 11 }], note: "" }, now)).rejects.toThrow(/재고/);
    await expect(sendTransfer(db, mgrMain, { toBranchId: MAIN_BRANCH_ID, lines: [{ itemId: item, qty: 1 }], note: "" }, now)).rejects.toThrow(/다른 지점/);
    const t = await sendTransfer(db, mgrMain, { toBranchId: west, lines: [{ itemId: item, qty: 4 }], note: "개업 준비" }, now);
    expect(t.docNo).toBe("ST-2611-0001");
    expect(await at(MAIN_BRANCH_ID)).toBe(6);
    expect(await at(west)).toBe(0); // 이동 중
    await expect(receiveTransfer(db, { ...mgrMain }, t.id, { got: {}, note: "" }, now)).rejects.toThrow(/받는 지점/);
    await expect(receiveTransfer(db, mgrWest, t.id, { got: { [item]: 3 }, note: "" }, now)).rejects.toThrow(/사유/);
    await receiveTransfer(db, mgrWest, t.id, { got: { [item]: 3 }, note: "한 캔 찌그러짐" }, now);
    expect(await at(west)).toBe(3);
    expect(await at(MAIN_BRANCH_ID)).toBe(6);
    let [i] = await db.select().from(stockItem).where(eq(stockItem.id, item));
    expect(i).toMatchObject({ qty: 9, valueWon: 450_000 }); // 모자란 1캔만 회사 전체에서 빠짐
    expect((await getTransfer(db, t.id)).status).toBe("received");

    // 지점에서 쓰기: 그 지점에 있는 만큼만
    await expect(useStock(db, { id: ids.tech1, roles: ["technician"], branchId: west } as never, { itemId: item, qty: 4 }, now)).rejects.toThrow(/이 지점 재고/);
    await useStock(db, { id: ids.tech1, roles: ["technician"], branchId: west } as never, { itemId: item, qty: 1 }, now);
    expect(await at(west)).toBe(2);
    expect(await at(MAIN_BRANCH_ID)).toBe(6);

    // 지점 실사: 지점 장부(2)와 맞추고, 회사 전체는 차이만큼
    await recordCount(db, mgrWest, { kind: "monthly", lines: [{ itemId: item, actual: 3 }], note: "선반 뒤에서 한 캔 찾음" }, now);
    expect(await at(west)).toBe(3);
    [i] = await db.select().from(stockItem).where(eq(stockItem.id, item));
    expect(i.qty).toBe(9);

    // 지점에서 본점으로 보냈다가 취소
    const back = await sendTransfer(db, mgrWest, { toBranchId: MAIN_BRANCH_ID, lines: [{ itemId: item, qty: 2 }], note: "" }, now);
    expect(back.docNo).toBe("ST-S2611-0001");
    expect(await at(west)).toBe(1);
    await cancelTransfer(db, mgrWest, back.id, "잘못 보냄", now);
    expect(await at(west)).toBe(3);
    expect(await at(MAIN_BRANCH_ID)).toBe(6);
  });
});

describe("본점·지점 3단계: 지점별 손익·부가세", () => {
  it("지점별 손익은 지점 전표를 나누고 공통비를 매출 비율로 배분하며, 합계는 회사 손익과 같다", async () => {
    const { createBranch } = await import("@/modules/platform/branch");
    const { repairOrder, repairStatement } = await import("@/db/schema");
    const { runReport } = await import("@/modules/report/run");
    const { customPeriod } = await import("@/modules/report/period");
    const { approvedRepair } = await import("./flow");
    const { createFundSlip } = await import("@/modules/acct/service");
    const west = await createBranch(db, owner(), { name: "서구점", code: "S", bizNo: "", subBizNo: "0001", repairRegNo: "", zip: "", address: "", addressDetail: "", phone: "", openedOn: "", closedOn: "" });
    const at = (d: string) => new Date(`${d}T03:00:00Z`);
    const r1 = await approvedRepair(db, ids, at("2026-11-05"));
    await db.insert(repairStatement).values({ docNo: "IV-T-1", repairOrderId: r1.roId, estimateId: r1.estimateId, partsWon: 100_000, laborWon: 200_000, vatWon: 30_000, totalWon: 330_000, issuedOn: "2026-11-10", payMethod: "card" });
    const r2 = await approvedRepair(db, ids, at("2026-11-05"));
    await db.update(repairOrder).set({ branchId: west }).where(eq(repairOrder.id, r2.roId));
    await db.insert(repairStatement).values({ docNo: "IV-T-2", repairOrderId: r2.roId, estimateId: r2.estimateId, partsWon: 0, laborWon: 100_000, vatWon: 10_000, totalWon: 110_000, issuedOn: "2026-11-11", payMethod: "card" });
    await createFundSlip(db, { id: ids.account, roles: ["accounting"] }, { on: "2026-11-12", kind: "other", drCode: "831", crCode: "103", amountWon: 40_000, memo: "공통 수수료" } as never, at("2026-11-12")).catch(() => undefined);
    const nov = customPeriod("2026-11-01", "2026-11-30");
    const pl = await runReport(db, owner(), "pl", nov, "prev", at("2026-11-30"));
    const t = pl.body.tables.find((x) => x.key === "branchPl")!;
    expect(t).toBeTruthy();
    const main = t.rows.find((r) => r.cells[0] === "본점")!.cells;
    const w = t.rows.find((r) => r.cells[0] === "서구점")!.cells;
    expect(main[1]).toBe(300_000);
    expect(w[1]).toBe(100_000);
    // 배분한 공통비 합계 = 표의 공통비, 배분 후 이익 합계 = 회사 세전 이익
    const net = pl.body.kpis.find((k) => k.key === "net")!.value as number;
    expect((main[7] as number) + (w[7] as number)).toBe(net);

    const vat = await runReport(db, owner(), "vat", nov, "prev", at("2026-11-30"));
    const vb = vat.body.tables.find((x) => x.key === "vatBranch")!;
    expect(vb.rows.map((r) => r.cells[1])).toEqual([30_000, 10_000]);
    expect(vb.note).toMatch(/신고 방식을 아직/);
  });
});
