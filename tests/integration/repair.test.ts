// 접수·입고(STD-02, F-02-01): 상담에서 수리 건 열기, 점검 저장, 사진, 서명, 다시 점검
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { consultation, roPhoto, vehicle } from "@/db/schema";
import { createConsultation, consentState, type ConsultInput } from "@/modules/customer/service";
import { myTodos } from "@/modules/dashboard/todo";
import { DIRECTION_SLOTS } from "@/modules/repair/rules";
import { addPhoto, confirmDiagnosis, getRepair, reopenDiagnosis, reopenIntake, saveDamage, saveIntake, signIntake, startRepair, type IntakeInput } from "@/modules/repair/service";
import { needsCalibration, suggestMethod } from "@/modules/repair/rules";
import { readStored, resolveStored } from "@/modules/platform/storage";
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

const now = new Date("2026-11-09T01:00:00Z");
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 1, 2, 3]);
const WEBP = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 1, 2, 3, 4]);

const consult = (o: Partial<ConsultInput> = {}): ConsultInput => ({
  newCustomer: { name: "홍길동", phone: "010-1234-5678" },
  consent: { required: true, photo: false, marketing: false, method: "phone" },
  newVehicle: { plateNo: "12가3456", model: "아반떼", year: 2021, mileage: 40000 },
  channel: "phone",
  damageTypes: ["찌그러짐"],
  damageParts: "앞 범퍼",
  methods: ["덴트"],
  insurance: "own",
  insurer: "삼성화재",
  claimNo: "2611-12345",
  result: "open",
  ...o,
});

const intake = (o: Partial<IntakeInput> = {}): IntakeInput => ({
  mileage: 45210,
  fuelPct: 50,
  bodyNotes: ["알루미늄 패널", "모르는 값"],
  warningLights: "없음",
  marks: [{ x: 100, y: 20, kind: "O", part: "?" }, { x: 30, y: 150, kind: "S" }, { x: 1, y: 1, kind: "Z" }],
  valuables: "",
  valuablesNone: true,
  devices: ["블랙박스"],
  keyCount: 1,
  keyTag: "",
  coversOn: true,
  parkSpot: "대기 1",
  delivered: false,
  driverName: "",
  intakeNote: "",
  agreeChecked: true,
  agreeMove: true,
  signerName: "홍길동",
  ...o,
});

async function opened() {
  const c = await createConsultation(db, ids.advisor, consult(), now);
  const { id } = await startRepair(db, ids.advisor, c.id, now);
  return { c, id };
}

describe("접수·입고(STD-02)", () => {
  it("상담에서 수리 건을 열면 고객·차량·보험을 불러오고 상담은 '입고됨'이 된다. 두 번 눌러도 한 건", async () => {
    const { c, id } = await opened();
    const r = await getRepair(db, id);
    expect(r.docNo).toBe("RO-2611-0001");
    expect(r.keyTag).toBe("RO-2611-0001");
    expect([r.insurance, r.insurer, r.claimNo]).toEqual(["own", "삼성화재", "2611-12345"]);
    expect(r.vehicle.plateNo).toBe("12가3456");
    const [cs] = await db.select().from(consultation).where(eq(consultation.id, c.id));
    expect(cs.result).toBe("converted");
    expect((await startRepair(db, ids.advisor, c.id, now)).id).toBe(id);
  });

  it("차량 없는 상담·거절된 상담은 입고할 수 없다", async () => {
    const a = await createConsultation(db, ids.advisor, consult({ newVehicle: undefined }), now);
    await expect(startRepair(db, ids.advisor, a.id, now)).rejects.toThrow(/차량이 없습니다/);
    const b = await createConsultation(db, ids.advisor, consult({ newCustomer: { name: "김", phone: "010-2222-3333" }, newVehicle: { plateNo: "34나5678" }, result: "declined", closeReason: "가격" }), now);
    await expect(startRepair(db, ids.advisor, b.id, now)).rejects.toThrow(/거절/);
  });

  it("점검 저장: 도면·목록 값을 거르고, 주행거리는 차량 기록에 넣는다. 지난 값보다 작으면 막지만 이 건에서 넣은 값은 고칠 수 있다", async () => {
    const { id } = await opened();
    await expect(saveIntake(db, ids.advisor, id, intake({ mileage: 39000 }), now)).rejects.toThrow(/지난 기록/);
    await saveIntake(db, ids.advisor, id, intake({ colorCode: "swp" }), now);
    let r = await getRepair(db, id);
    expect(r.bodyNotes).toEqual(["알루미늄 패널"]);
    expect(r.marks.map((m) => [m.kind, m.part])).toEqual([
      ["O", "f_bumper"],
      ["S", "l_f_door"],
    ]);
    expect(r.vehicle.mileage).toBe(45210);
    expect(r.vehicle.colorCode).toBe("SWP");
    await saveIntake(db, ids.advisor, id, intake({ mileage: 45120 }), now); // 오기 고침
    r = await getRepair(db, id);
    expect(r.vehicle.mileage).toBe(45120);
  });

  it("서명: 사진·서명이 모자라면 막고, 갖추면 잠근다. 동의가 없으면 그 자리에서 받는다. 다시 점검하면 풀린다", async () => {
    const c = await createConsultation(db, ids.advisor, consult({ consent: undefined, requestConsent: true }), now);
    const { id } = await startRepair(db, ids.advisor, c.id, now);
    await expect(signIntake(db, ids.advisor, id, { ...intake(), signaturePng: PNG, consentNow: true }, now)).rejects.toThrow(/외관 사진이 0\/8장/);
    for (const s of [...DIRECTION_SLOTS, "dash"]) await addPhoto(db, ids.advisor, id, s, WEBP);
    await addPhoto(db, ids.advisor, id, "front", WEBP); // 다시 찍으면 바뀜
    await addPhoto(db, ids.advisor, id, "close", WEBP);
    await addPhoto(db, ids.advisor, id, "close", WEBP); // 근접은 여러 장
    expect(await db.select().from(roPhoto).where(eq(roPhoto.repairOrderId, id))).toHaveLength(11);
    await expect(addPhoto(db, ids.advisor, id, "front", new Uint8Array([1, 2, 3, 4]))).rejects.toThrow(/사진 파일만/);
    await expect(signIntake(db, ids.advisor, id, { ...intake(), signaturePng: null, consentNow: true }, now)).rejects.toThrow(/서명을 받아야/);
    await expect(signIntake(db, ids.advisor, id, { ...intake(), signaturePng: PNG, consentNow: false }, now)).rejects.toThrow(/필수 동의/);
    const cust = (await getRepair(db, id)).customer.id;
    await signIntake(db, ids.advisor, id, { ...intake(), signaturePng: PNG, consentNow: true }, now);
    const r = await getRepair(db, id);
    expect(r.status).toBe("checked");
    expect(r.signedAt).toBeTruthy();
    expect(Array.from(await readStored(r.signaturePath!))).toEqual(Array.from(PNG));
    expect((await consentState(db, cust)).required).toBe(true);
    await expect(saveIntake(db, ids.advisor, id, intake(), now)).rejects.toThrow(/다시 점검/);
    await expect(reopenIntake(db, ids.advisor, id, " ", now)).rejects.toThrow(/이유/);
    await reopenIntake(db, ids.advisor, id, "주행거리 오기", now);
    const back = await getRepair(db, id);
    expect([back.status, back.signedAt, back.agreeChecked]).toEqual(["intake", null, false]);
  });

  it("파일 경로는 보관 폴더 밖으로 나가지 못한다", () => {
    expect(() => resolveStored("../etc/passwd")).toThrow();
    expect(() => resolveStored("ro/../../x.png")).toThrow();
    expect(resolveStored("ro/ro-2611-0001/a.png")).toContain("ro-2611-0001");
  });

  it("내 할 일: 서명 전 수리 건을 상담원에게 띄운다", async () => {
    const { id } = await opened();
    const todos = await myTodos(db, { id: ids.advisor, roles: ["advisor"] }, now);
    expect(todos.find((t) => t.key === `ro-${id}`)?.when).toBe("today");
    const [v] = await db.select().from(vehicle);
    expect(v.plateNo).toBe("12가3456");
  });

  it("진단: 입고 도면의 O 표시가 진단 줄로 들어오고, 기준표 제안·보정·도막 측정을 확인한 뒤 공장장이 확인한다", async () => {
    const { id } = await opened();
    for (const s of [...DIRECTION_SLOTS, "dash"]) await addPhoto(db, ids.advisor, id, s, WEBP);
    const tech = { id: ids.tech1, roles: ["technician" as const] };
    const boss = { id: ids.manager, roles: ["plant_manager" as const] };
    await expect(saveDamage(db, tech, id, { part: "hood", kind: "D", sizeCm: 5, depthMm: 2, paintLayer: "none", crease: false, broken: false, structural: false, filmPanel: [], filmAdjacent: [] })).rejects.toThrow(/입고 점검/);
    await signIntake(db, ids.advisor, id, { ...intake(), signaturePng: PNG, consentNow: false }, now);
    let r = await getRepair(db, id);
    expect(r.damages.map((d) => [d.part, d.method])).toEqual([["f_bumper", "pdr"]]);
    const line = r.damages[0];
    await expect(confirmDiagnosis(db, boss, id, "", now)).rejects.toThrow(/도막 두께/);
    await expect(confirmDiagnosis(db, tech, id, "", now)).rejects.toThrow(/공장장/);
    // 베이스까지 긁힘 + 꺾임 → 부분 판금. 교환을 고르면 사유 필요
    const base = { id: line.id, part: "f_bumper", kind: "D", sizeCm: 15, depthMm: 4, paintLayer: "base", crease: true, broken: false, structural: false, filmPanel: [110, 250, 120], filmAdjacent: [100, 105, 98] };
    await expect(saveDamage(db, tech, id, { ...base, method: "replace" })).rejects.toThrow(/사유/);
    await saveDamage(db, tech, id, { ...base, method: "replace", methodReason: "고객이 교환 원함" });
    await saveDamage(db, tech, id, { part: "l_f_door", kind: "S", sizeCm: 20, depthMm: null, paintLayer: "clear", crease: false, broken: false, structural: false, filmPanel: [], filmAdjacent: [] });
    r = await getRepair(db, id);
    expect(r.damages.map((d) => [d.part, d.method, d.suggested])).toEqual([
      ["f_bumper", "replace", "partial"],
      ["l_f_door", "polish", "polish"],
    ]);
    await expect(saveDamage(db, { id: ids.advisor, roles: ["advisor"] }, id, { ...base })).rejects.toThrow(/기술자/);
    const todo = await myTodos(db, { id: ids.manager, roles: ["plant_manager"] }, now);
    expect(todo.some((t) => t.key === `dc-${id}`)).toBe(true);
    await confirmDiagnosis(db, boss, id, "외주 진단 필요 없음", now);
    expect((await getRepair(db, id)).status).toBe("estimating");
    await expect(saveDamage(db, tech, id, base)).rejects.toThrow(/다시 열기/);
    await reopenDiagnosis(db, boss, id, now);
    expect((await getRepair(db, id)).status).toBe("checked");
  });

  it("판단 기준표와 센서 보정", () => {
    const f = { kind: "D", paintLayer: "none" as const, crease: false, broken: false, structural: false, sizeCm: 10 };
    expect(suggestMethod(f).method).toBe("pdr");
    expect(suggestMethod({ ...f, crease: true }).method).toBe("partial");
    expect(suggestMethod({ ...f, sizeCm: 50 }).method).toBe("replace");
    expect(suggestMethod({ ...f, broken: true }).method).toBe("replace");
    expect(suggestMethod({ ...f, structural: true, broken: true }).method).toBe("outsource");
    expect(suggestMethod({ ...f, kind: "S", paintLayer: "clear" }).method).toBe("polish");
    expect(suggestMethod({ ...f, kind: "S", paintLayer: "primer" }).method).toBe("partial");
    expect(needsCalibration("f_bumper", ["radar_front"])).toBeTruthy();
    expect(needsCalibration("f_bumper", ["pdc_rear"])).toBeNull();
    expect(needsCalibration("r_bumper", ["bsd"])).toBeTruthy();
  });
});
