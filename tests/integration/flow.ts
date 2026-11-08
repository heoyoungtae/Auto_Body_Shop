// 통합 테스트 공용 흐름: 상담 → 입고 → 진단 → 견적 → 발급 → 고객 승인
import type { Db } from "@/db/client";
import { createConsultation } from "@/modules/customer/service";
import { DIRECTION_SLOTS } from "@/modules/repair/rules";
import { addPhoto, confirmDiagnosis, saveDamage, signIntake, startRepair } from "@/modules/repair/service";
import { createEstimate, getEstimate, issueEstimate, reviewEstimate, saveEstimateHeader, saveLine, submitEstimate } from "@/modules/repair/estimate";
import { approveInStore } from "@/modules/repair/estimate-approval";
import { approvalGroups } from "@/modules/repair/estimate-rules";
import { saveShopInfo } from "@/modules/platform/shop";
import type { seedShop } from "./db";

type Ids = Awaited<ReturnType<typeof seedShop>>;
export const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 1]);
export const WEBP = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 1, 2]);

export async function estimating(db: Db, ids: Ids, now: Date) {
  const c = await createConsultation(db, ids.advisor, { newCustomer: { name: "홍길동", phone: "010-1234-5678" }, consent: { required: true, photo: false, marketing: false, method: "phone" }, newVehicle: { plateNo: "12가3456", model: "아반떼", year: 2021, options: ["radar_front"] }, channel: "phone", damageTypes: ["찌그러짐"], damageParts: "앞범퍼", methods: [], insurance: "self", result: "open", partsPref: "품질인증 대체부품" }, now);
  const { id } = await startRepair(db, ids.advisor, c.id, now);
  for (const s of [...DIRECTION_SLOTS, "dash"]) await addPhoto(db, ids.advisor, id, s, WEBP);
  await signIntake(db, ids.advisor, id, { mileage: 45000, fuelPct: 50, bodyNotes: [], warningLights: "", marks: [], valuables: "", valuablesNone: true, devices: [], keyCount: 1, keyTag: "", coversOn: true, parkSpot: "", delivered: false, driverName: "", intakeNote: "", agreeChecked: true, agreeMove: true, signerName: "홍길동", signaturePng: PNG, consentNow: false }, now);
  const tech = { id: ids.tech1, roles: ["technician" as const] };
  const film = { filmPanel: [100, 110, 105], filmAdjacent: [100, 100, 100] };
  await saveDamage(db, tech, id, { part: "f_bumper", kind: "D", sizeCm: 30, depthMm: 5, paintLayer: "base", crease: false, broken: true, structural: false, ...film });
  await saveDamage(db, tech, id, { part: "l_f_door", kind: "D", sizeCm: 8, depthMm: 2, paintLayer: "none", crease: false, broken: false, structural: false, ...film });
  await confirmDiagnosis(db, { id: ids.manager, roles: ["plant_manager" as const] }, id, "", now);
  return id;
}


/** 고객이 견적을 승인(매장 서명)까지 한 수리 건. only 를 주면 그 묶음만 승인 */
export async function approvedRepair(db: Db, ids: Ids, now: Date, only?: (names: string[]) => boolean) {
  const advisor = { id: ids.advisor, roles: ["advisor" as const] };
  const roId = await estimating(db, ids, now);
  const { id } = await createEstimate(db, advisor, roId, now);
  let e = await getEstimate(db, id);
  for (const l of e.lines.filter((x) => x.category === "part")) await saveLine(db, advisor, id, { id: l.id, payer: l.payer, category: "part", name: l.name, partCode: "D", partNo: "", qty: 1, unitWon: 180_000, laborMinutes: null, laborWon: null, note: "" }, now);
  await saveEstimateHeader(db, advisor, id, { kind: e.kind, paintGrade: "metallic", dueDate: "2026-11-13", note: "", registeredOn: "2021-03-15" }, now);
  await submitEstimate(db, advisor, id, now);
  await reviewEstimate(db, { id: ids.manager, roles: ["plant_manager"] }, id, true, "", now);
  await saveShopInfo(db, ids.owner, { name: "외관수리", ceo: "김대표", bizNo: "220-81-62517", repairRegNo: "제2026-1호", address: "경기도", phone: "031-000-0000" });
  await issueEstimate(db, advisor, id, now);
  e = await getEstimate(db, id);
  const groups = approvalGroups(e.lines).filter((g) => (only ? only(g.names) : true));
  await approveInStore(db, advisor, id, { groups: groups.map((g) => g.key), name: "홍길동", signaturePng: PNG }, now);
  return { roId, estimateId: id };
}
