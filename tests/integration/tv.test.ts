// TV 현황판: 앞선 전표에서 상태·공정·약속일·지연·입고 예정이 모이고, 고객 이름은 나가지 않는다. TV 링크 열쇠
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { createConsultation } from "@/modules/customer/service";
import { issueTvToken, revokeTvToken, tvBoard, tvLinkView, tvTokenOk } from "@/modules/dashboard/tv";
import { assignRest, createWorkOrder, getWorkOrder, startStep } from "@/modules/repair/work";
import { approvedRepair } from "./flow";
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
// 2026-11-10(화) 10:00 KST
const now = new Date("2026-11-10T01:00:00Z");
const mgr = () => ({ id: ids.manager, roles: ["plant_manager" as const] });

describe("TV 현황판", () => {
  it("작업 중 차: 공정 이름·담당·공정 막대·출고 약속, 약속일이 지나면 지연이 맨 위", async () => {
    const { roId } = await approvedRepair(db, ids, now);
    const { id: woId } = await createWorkOrder(db, mgr(), roId, now);
    await assignRest(db, mgr(), woId, { assignee: ids.tech1, planDate: "2026-11-10" }, now);
    const w = await getWorkOrder(db, woId);
    await startStep(db, { id: ids.tech1, roles: ["technician"] }, w.steps[0].id, now);

    const d = await tvBoard(db, now);
    expect(d.cars).toHaveLength(1);
    const c = d.cars[0];
    expect(c).toMatchObject({ plate: "12가3456", model: "아반떼", state: "work", due: "2026-11-13", dueWord: "11/13 (금)", late: 0, current: 0, done: 0 });
    expect(c.total).toBe(w.steps.length);
    expect(c.sub).toContain("탈부착");
    expect(d.kpi).toMatchObject({ inShop: 1, work: 1, late: 0 });
    // 고객 이름·전화는 나가지 않는다
    expect(JSON.stringify(d)).not.toMatch(/홍길동|010-1234/);

    const later = await tvBoard(db, new Date("2026-11-15T01:00:00Z"));
    expect(later.cars[0]).toMatchObject({ late: 2 });
    expect(later.kpi.late).toBe(1);
    expect(later.outgoing[0]).toMatchObject({ plate: "12가3456", late: 2, when: "2일 지연" });
  });

  it("입고 예정: 오늘~모레 예약만, 시각과 함께", async () => {
    const mk = (plateNo: string, date: string) =>
      createConsultation(db, ids.advisor, { newCustomer: { name: `손님${plateNo}`, phone: `010-55${plateNo.slice(-2)}-0000` }, consent: { required: true, photo: false, marketing: false, method: "phone" }, newVehicle: { plateNo, model: "쏘나타" }, channel: "phone", damageTypes: ["긁힘"], damageParts: "뒤범퍼", methods: [], insurance: "own", insurer: "가나손보", claimNo: "2026-123456", result: "reserved", reservedDate: date, reservedTime: "14:00" }, now);
    await mk("33나1111", "2026-11-10");
    await mk("33나2222", "2026-11-12");
    await mk("33나3333", "2026-11-16");
    const d = await tvBoard(db, now);
    expect(d.incoming.map((i) => i.plate)).toEqual(["33나1111", "33나2222"]);
    expect(d.incoming[0]).toMatchObject({ when: "오늘 14:00", today: true, kind: "예약", tags: ["보험"] });
    expect(d.incoming[1].when).toBe("모레 14:00");
    expect(d.kpi.todayIn).toBe(1);
  });

  it("TV 링크: 대표만 만들고, 새로 만들면 예전 열쇠는 막힌다", async () => {
    const owner = { id: ids.owner, roles: ["owner" as const] };
    await expect(issueTvToken(db, mgr())).rejects.toThrow("대표");
    const a = await issueTvToken(db, owner, now);
    expect(await tvTokenOk(db, a)).toBe(true);
    expect((await tvLinkView(db, owner)).token).toBe(a);
    expect((await tvLinkView(db, mgr())).token).toBeNull();
    const b = await issueTvToken(db, owner, now);
    expect(await tvTokenOk(db, a)).toBe(false);
    expect(await tvTokenOk(db, b)).toBe(true);
    await revokeTvToken(db, owner, now);
    expect(await tvTokenOk(db, b)).toBe(false);
    expect(await tvTokenOk(db, "")).toBe(false);
  });
});
