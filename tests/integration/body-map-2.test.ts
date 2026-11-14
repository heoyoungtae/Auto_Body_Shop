// 차 그림 2묶음: 상담 부위 → 입고 도면 → 진단 줄, 진단 줄 사진, 세부 부위 더하기, 차형 저장
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { consultation, roPhoto, vehicle } from "@/db/schema";
import { createConsultation, saveVehicle, type ConsultInput } from "@/modules/customer/service";
import { DIRECTION_SLOTS } from "@/modules/repair/rules";
import { addDamagePhoto, addPhoto, getRepair, listDamagePhotos, removeDamage, removeDamagePhoto, signIntake, startRepair, type IntakeInput } from "@/modules/repair/service";
import { loadSubParts, saveSubParts } from "@/modules/repair/sub-parts";
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
  newVehicle: { plateNo: "12가3456", model: "싼타페", year: 2021, mileage: 40000 },
  channel: "phone",
  damageTypes: ["찌그러짐", "긁힘"],
  damageParts: "왼쪽 앞도어 찌그러짐",
  methods: ["덴트"],
  insurance: "self",
  result: "open",
  ...o,
});
const intake = (o: Partial<IntakeInput> = {}): IntakeInput => ({
  mileage: 45210,
  fuelPct: 50,
  bodyNotes: [],
  warningLights: "",
  marks: [],
  valuables: "",
  valuablesNone: true,
  devices: [],
  keyCount: 1,
  keyTag: "",
  coversOn: true,
  parkSpot: "",
  delivered: false,
  driverName: "",
  intakeNote: "",
  agreeChecked: true,
  agreeMove: true,
  signerName: "홍길동",
  ...o,
});

describe("상담에서 찍은 손상 부위", () => {
  it("상담에 저장하고(O·엉뚱한 값은 버림), 입고하면 차체 도면 O로, 진단 줄의 손상 종류로 이어진다", async () => {
    const zones = [
      { part: "l_f_door", view: "left", cell: 7, kind: "D" },
      { part: "l_f_door", view: "left", cell: 7, kind: "D" },
      { part: "l_f_door", view: "left", cell: 8, kind: "D" },
      { part: "r_f_wheel", view: "right", cell: 4, kind: "W" },
      { part: "hood", view: "left", cell: 1, kind: "S" }, // 옆모습에 후드 없음 → 대표 면으로
      { part: "nope", view: "top", cell: 1, kind: "D" },
      { part: "roof", view: "top", cell: 4, kind: "O" },
    ];
    const c = await createConsultation(db, ids.advisor, consult({ damageZones: zones }), now);
    const [row] = await db.select().from(consultation).where(eq(consultation.id, c.id));
    expect((row.damageZones as { part: string }[]).map((z) => z.part)).toEqual(["l_f_door", "l_f_door", "l_f_door", "r_f_wheel", "hood"]);

    const { id } = await startRepair(db, ids.advisor, c.id, now);
    let r = await getRepair(db, id);
    // 같은 부위·면·칸은 한 번, 모두 수리 대상(O)
    expect(r.marks.map((m) => `${m.part}/${m.view}/${m.cell}/${m.kind}`)).toEqual(["l_f_door/left/7/O", "l_f_door/left/8/O", "r_f_wheel/right/4/O", "hood/top/4/O"]);

    for (const s of [...DIRECTION_SLOTS, "dash"]) await addPhoto(db, ids.advisor, id, s, WEBP);
    await signIntake(db, ids.advisor, id, { ...intake({ marks: r.marks }), signaturePng: PNG, consentNow: false }, now);
    r = await getRepair(db, id);
    expect(r.damages.map((d) => [d.part, d.view, d.cells, d.kind])).toEqual([
      ["l_f_door", "left", [7, 8], "D"],
      ["r_f_wheel", "right", [4], "S"],
      ["hood", "top", [4], "S"],
    ]);
  });
});

describe("진단 줄 사진", () => {
  it("진단 뒤에 줄마다 붙이고 지운다. 입고 사진 수에 섞이지 않고, 줄을 지우면 사진도 지운다", async () => {
    const c = await createConsultation(db, ids.advisor, consult({ damageZones: [{ part: "l_f_door", view: "left", cell: 7, kind: "D" }] }), now);
    const { id } = await startRepair(db, ids.advisor, c.id, now);
    for (const s of [...DIRECTION_SLOTS, "dash"]) await addPhoto(db, ids.advisor, id, s, WEBP);
    const tech = { id: ids.tech1, roles: ["technician" as const] };
    const first = (await getRepair(db, id)).marks;
    await signIntake(db, ids.advisor, id, { ...intake({ marks: first }), signaturePng: PNG, consentNow: false }, now);
    const r = await getRepair(db, id);
    const line = r.damages[0];
    await addDamagePhoto(db, tech, id, line.id, WEBP);
    await addDamagePhoto(db, { id: ids.advisor, roles: ["advisor"] }, id, line.id, PNG);
    await expect(addDamagePhoto(db, { id: ids.advisor, roles: ["accountant" as never] }, id, line.id, PNG)).rejects.toThrow(/기술자/);
    await expect(addDamagePhoto(db, tech, id, "00000000-0000-0000-0000-000000000000", PNG)).rejects.toThrow(/없는 진단 줄/);
    await expect(addDamagePhoto(db, tech, id, line.id, new Uint8Array([1, 2, 3]))).rejects.toThrow(/사진 파일만/);
    const back = await getRepair(db, id);
    expect(back.damagePhotos).toHaveLength(2);
    expect(back.photos).toHaveLength(9); // 입고 사진은 그대로
    expect(await listDamagePhotos(db, id)).toHaveLength(2);
    await removeDamagePhoto(db, tech, id, back.damagePhotos[0].path);
    expect((await getRepair(db, id)).damagePhotos).toHaveLength(1);
    await removeDamage(db, tech, id, line.id);
    expect(await db.select().from(roPhoto).where(eq(roPhoto.repairOrderId, id))).toHaveLength(9);
  });

  it("입고 점검 중에는 진단 줄 사진을 받지 않는다", async () => {
    const c = await createConsultation(db, ids.advisor, consult(), now);
    const { id } = await startRepair(db, ids.advisor, c.id, now);
    await expect(addDamagePhoto(db, { id: ids.tech1, roles: ["technician"] }, id, "00000000-0000-0000-0000-000000000000", PNG)).rejects.toThrow(/입고 점검 중/);
  });
});

describe("세부 부위 더하기", () => {
  it("공장장·대표만 바꾸고, 기본 목록·같은 이름은 빼고, 비우면 지운다", async () => {
    const tech = { id: ids.tech1, roles: ["technician" as const] };
    const boss = { id: ids.manager, roles: ["plant_manager" as const] };
    await expect(saveSubParts(db, tech, "f_bumper", "범퍼 레일")).rejects.toThrow(/공장장/);
    await expect(saveSubParts(db, boss, "nope", "x")).rejects.toThrow(/부위/);
    const r = await saveSubParts(db, boss, "f_bumper", "사이드 가니시\n범퍼 커버, 사이드  가니시\n토우 후크 커버");
    expect(r.list).toEqual(["사이드 가니시", "토우 후크 커버"]);
    await saveSubParts(db, boss, "hood", "후드 인슐레이터");
    expect(await loadSubParts(db)).toEqual({ f_bumper: ["사이드 가니시", "토우 후크 커버"], hood: ["후드 인슐레이터"] });
    await saveSubParts(db, boss, "f_bumper", " ");
    expect(await loadSubParts(db)).toEqual({ hood: ["후드 인슐레이터"] });
  });
});

describe("차형", () => {
  it("고른 차형을 저장하고, 빈 글자면 지우고(짐작으로), 안 주면 그대로 둔다", async () => {
    const c = await createConsultation(db, ids.advisor, consult(), now);
    const [v0] = await db.select().from(vehicle);
    expect(v0.bodyType).toBeNull();
    await saveVehicle(db, ids.advisor, c.customerId, { id: v0.id, plateNo: v0.plateNo, bodyType: "van", options: ["roof_rack", "nope"] });
    let [v] = await db.select().from(vehicle);
    expect([v.bodyType, v.options]).toEqual(["van", ["roof_rack"]]);
    await saveVehicle(db, ids.advisor, c.customerId, { id: v0.id, plateNo: v0.plateNo });
    [v] = await db.select().from(vehicle);
    expect(v.bodyType).toBe("van");
    await saveVehicle(db, ids.advisor, c.customerId, { id: v0.id, plateNo: v0.plateNo, bodyType: "" });
    [v] = await db.select().from(vehicle);
    expect(v.bodyType).toBeNull();
  });
});
