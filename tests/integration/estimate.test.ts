// 견적(STD-03, 법정 서식 별지 제89호의3): 진단에서 항목 만들기, 공임 계산, 검토(전결), 발급
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "@/db/client";
import { createConsultation } from "@/modules/customer/service";
import { DIRECTION_SLOTS } from "@/modules/repair/rules";
import { addPhoto, confirmDiagnosis, saveDamage, signIntake, startRepair } from "@/modules/repair/service";
import { createEstimate, getEstimate, issueEstimate, reviewEstimate, saveEstimateHeader, saveLine, submitEstimate } from "@/modules/repair/estimate";
import { buildLines, totals } from "@/modules/repair/estimate-rules";
import { defaultLaborTable } from "@/modules/repair/labor";
import { changeLabor, loadLabor } from "@/modules/repair/labor-store";
import { saveShopInfo, validBizNo } from "@/modules/platform/shop";
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
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 1]);
const WEBP = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 1, 2]);
const advisor = () => ({ id: ids.advisor, roles: ["advisor" as const] });
const boss = () => ({ id: ids.manager, roles: ["plant_manager" as const] });

async function estimating() {
  const c = await createConsultation(db, ids.advisor, { newCustomer: { name: "홍길동", phone: "010-1234-5678" }, consent: { required: true, photo: false, marketing: false, method: "phone" }, newVehicle: { plateNo: "12가3456", model: "아반떼", year: 2021, options: ["radar_front"] }, channel: "phone", damageTypes: ["찌그러짐"], damageParts: "앞범퍼", methods: [], insurance: "self", result: "open", partsPref: "품질인증 대체부품" }, now);
  const { id } = await startRepair(db, ids.advisor, c.id, now);
  for (const s of [...DIRECTION_SLOTS, "dash"]) await addPhoto(db, ids.advisor, id, s, WEBP);
  await signIntake(db, ids.advisor, id, { mileage: 45000, fuelPct: 50, bodyNotes: [], warningLights: "", marks: [], valuables: "", valuablesNone: true, devices: [], keyCount: 1, keyTag: "", coversOn: true, parkSpot: "", delivered: false, driverName: "", intakeNote: "", agreeChecked: true, agreeMove: true, signerName: "홍길동", signaturePng: PNG, consentNow: false }, now);
  const tech = { id: ids.tech1, roles: ["technician" as const] };
  const film = { filmPanel: [100, 110, 105], filmAdjacent: [100, 100, 100] };
  await saveDamage(db, tech, id, { part: "f_bumper", kind: "D", sizeCm: 30, depthMm: 5, paintLayer: "base", crease: false, broken: true, structural: false, ...film });
  await saveDamage(db, tech, id, { part: "l_f_door", kind: "D", sizeCm: 8, depthMm: 2, paintLayer: "none", crease: false, broken: false, structural: false, ...film });
  await confirmDiagnosis(db, boss(), id, "", now);
  return id;
}

describe("견적(STD-03)", () => {
  it("공임 기준표로 항목을 만들고 합계·부가세를 계산한다", () => {
    const t = defaultLaborTable();
    const lines = buildLines([{ id: "a", part: "f_bumper", sizeCm: 30, method: "replace", calibrate: true }, { id: "b", part: "l_f_door", sizeCm: 8, method: "pdr", calibrate: false }], t, "pearl", "general", "품질인증 대체부품");
    expect(lines.map((l) => [l.category, l.laborCode])).toEqual([
      ["detach", "RR-bumper"],
      ["part", null],
      ["paint", "PNT-bumper"],
      ["paint", "BLEND"],
      ["etc", "CAL"],
      ["dent", "PDR-10"],
    ]);
    expect(lines[1].partCode).toBe("D");
    expect(lines[0].laborWon).toBe(38_000); // 60분 × 38,000
    expect(lines[2].laborWon).toBe(264_000); // 220,000 × 120%
    expect(totals([{ qty: 2, unitWon: 10_000, laborWon: 5_005 }])).toEqual({ parts: 20_000, labor: 5_005, sum: 25_005, vat: 2_501, total: 27_506 });
  });

  it("진단 → 견적 → 검토(전결) → 발급. 사업장 정보·등록년월일·부품 단가가 없으면 막는다", async () => {
    const roId = await estimating();
    const { id } = await createEstimate(db, advisor(), roId, now);
    expect((await createEstimate(db, advisor(), roId, now)).id).toBe(id);
    let e = await getEstimate(db, id);
    expect(e.docNo).toBe("ES-2611-0001");
    expect(e.kind).toBe("general");
    expect(e.lines.some((l) => l.category === "etc" && l.laborCode === "CAL")).toBe(true); // 전방 레이더 → 보정
    await expect(submitEstimate(db, advisor(), id, now)).rejects.toThrow(/부품 단가.*등록년월일/);
    const part = e.lines.find((l) => l.category === "part")!;
    await saveLine(db, advisor(), id, { id: part.id, payer: "general", category: "part", name: part.name, partCode: "D", partNo: "86511-AA000", qty: 1, unitWon: 180_000, laborMinutes: null, laborWon: null, note: "" }, now);
    const paintBefore = e.lines.find((l) => l.laborCode === "PNT-bumper")!.laborWon;
    await saveEstimateHeader(db, advisor(), id, { kind: "general", paintGrade: "tricoat", dueDate: "2026-11-13", note: "", registeredOn: "2021-03-15" }, now);
    e = await getEstimate(db, id);
    expect(e.lines.find((l) => l.laborCode === "PNT-bumper")!.laborWon).toBe(308_000);
    expect(paintBefore).toBe(242_000);
    expect(e.vehicle.registeredOn).toBe("2021-03-15");
    expect(e.totalWon).toBe(totals(e.lines).total);
    await submitEstimate(db, advisor(), id, now);
    await expect(reviewEstimate(db, advisor(), id, true, "", now)).rejects.toThrow(/공장장/);
    await reviewEstimate(db, boss(), id, true, "", now);
    await expect(issueEstimate(db, advisor(), id, now)).rejects.toThrow(/사업장 정보/);
    await expect(saveShopInfo(db, ids.owner, { name: "외관수리", ceo: "김대표", bizNo: "123-45-67890", repairRegNo: "제1호", address: "경기", phone: "031" })).rejects.toThrow(/사업자등록번호/);
    await saveShopInfo(db, ids.owner, { name: "외관수리", ceo: "김대표", bizNo: "220-81-62517", repairRegNo: "제2026-1호", address: "경기도", phone: "031-000-0000" });
    await issueEstimate(db, advisor(), id, now);
    e = await getEstimate(db, id);
    expect([e.status, e.issuedOn, e.validUntil]).toEqual(["sent", "2026-11-09", "2026-12-09"]);
    expect((e.snapshot as { plateNo: string }).plateNo).toBe("12가3456");
  });

  it("공임 기준표는 시행일부터 바뀌고 사유가 필요하다", async () => {
    await expect(changeLabor(db, ids.owner, { code: "RATE", value: 40_000, effectiveFrom: "2026-11-09", reason: "" }, "2026-11-09")).rejects.toThrow(/사유/);
    await changeLabor(db, ids.owner, { code: "RATE", value: 40_000, effectiveFrom: "2026-12-01", reason: "실측" }, "2026-11-09");
    expect((await loadLabor(db, "2026-11-30")).RATE).toBe(38_000);
    expect((await loadLabor(db, "2026-12-01")).RATE).toBe(40_000);
    expect(validBizNo("220-81-62517")).toBe(true);
  });
});
