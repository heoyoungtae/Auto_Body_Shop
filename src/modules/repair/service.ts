// 수리 건(RO)·입고 점검(F-02-01) — 사내 표준서 STD-02 4절.
// 수리 건은 상담 일지에서만 만든다: 고객·차량·보험·손상은 상담에서 그대로 불러오고 다시 묻지 않는다.
// 점검 내용은 몇 번이고 나눠 저장할 수 있고, 고객 서명으로 마치면 잠긴다('다시 점검'으로만 풀림).
import { and, asc, desc, eq, inArray, ne, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { appUser, consultation, customer, repairOrder, roDamage, roPhoto, vehicle } from "@/db/schema";
import type { Role } from "@/modules/auth/roles";
import { notifyRole } from "@/modules/platform/notify";
import { changeConsent, consentState, saveVehicle } from "@/modules/customer/service";
import { writeAudit } from "@/modules/platform/audit";
import { nextDocNo } from "@/modules/platform/docno";
import { UserError } from "@/modules/platform/errors";
import { loadPolicy } from "@/modules/platform/policy";
import { IMAGE_TYPES, MAX_IMAGE_BYTES, removeStored, sniffImage, storeFile } from "@/modules/platform/storage";
import { seoulDate } from "@/modules/platform/time";
import {
  BODY_NOTES,
  BODY_PARTS,
  cleanMarks,
  DAMAGE_KINDS,
  DEVICES,
  diagnosisIssues,
  intakeHardIssues,
  intakeIssues,
  isMethod,
  isPaintLayer,
  isPhotoSlot,
  METHODS,
  MULTI_SLOTS,
  needsCalibration,
  partLabel,
  suggestMethod,
  type BodyMark,
  type Method,
  type PaintLayer,
  type PhotoSlot,
} from "./rules";

export class RepairError extends UserError {}

const clean = (s: string | null | undefined) => (s ?? "").trim() || null;

/** 상담에서 수리 건을 연다. 이미 열렸으면 그 수리 건을 돌려준다(한 상담에 한 건) */
export async function startRepair(db: Db, actorId: string, consultationId: string, now = new Date()) {
  const [c] = await db.select().from(consultation).where(eq(consultation.id, consultationId));
  if (!c) throw new RepairError("없는 상담입니다");
  const [had] = await db.select({ id: repairOrder.id }).from(repairOrder).where(eq(repairOrder.consultationId, consultationId));
  if (had) return { id: had.id, created: false };
  if (!c.vehicleId) throw new RepairError("상담에 차량이 없습니다. 상담의 '고치기'에서 차량번호를 넣고 다시 눌러 주세요");
  if (c.result === "declined") throw new RepairError("거절·보류된 상담입니다. 다시 온 것이면 '이 값으로 새 상담'으로 상담을 새로 쓰고 입고하세요");
  return db.transaction(async (tx) => {
    const docNo = await nextDocNo(tx, "RO", now);
    const [ro] = await tx
      .insert(repairOrder)
      .values({ docNo, consultationId, customerId: c.customerId, vehicleId: c.vehicleId!, insurance: c.insurance, insurer: c.insurer, claimNo: c.claimNo, inAt: now, keyTag: docNo, advisorId: actorId })
      .returning({ id: repairOrder.id });
    await tx.update(consultation).set({ result: "converted", updatedAt: now }).where(eq(consultation.id, consultationId));
    await writeAudit(tx, { actorId, action: "repair.create", entityType: "repair_order", entityId: docNo, after: { consult: c.docNo } });
    return { id: ro.id, created: true };
  });
}

async function roRow(db: Db, id: string) {
  const [r] = await db.select().from(repairOrder).where(eq(repairOrder.id, id));
  if (!r) throw new RepairError("없는 수리 건입니다");
  return r;
}

function mustBeOpen(r: { status: string; docNo: string }) {
  if (r.status !== "intake") throw new RepairError(`${r.docNo}는 서명을 받아 입고 점검이 끝났습니다. 고치려면 '다시 점검'을 누르세요`);
}

export type IntakeInput = {
  mileage: number | null;
  fuelPct: number | null;
  vin?: string;
  colorCode?: string;
  bodyNotes: string[];
  warningLights: string;
  marks: unknown;
  valuables: string;
  valuablesNone: boolean;
  devices: string[];
  keyCount: number | null;
  keyTag: string;
  coversOn: boolean;
  parkSpot: string;
  delivered: boolean;
  driverName: string;
  intakeNote: string;
  agreeChecked: boolean;
  agreeMove: boolean;
  signerName: string;
};

/** 점검 내용 저장(서명 전 중간 저장). 주행거리·차대번호·색상 코드는 차량 기록에도 넣어 다음에 다시 묻지 않는다 */
export async function saveIntake(db: Db, actorId: string, id: string, input: IntakeInput, now = new Date()) {
  const r = await roRow(db, id);
  mustBeOpen(r);
  const [v] = await db.select().from(vehicle).where(eq(vehicle.id, r.vehicleId));
  // 차량의 주행거리가 이 수리 건에서 넣은 값이면, 이번 입력은 고치는 것이라 지난 기록과 비교하지 않는다
  const ownMileage = r.mileage != null && v.mileage === r.mileage;
  const hard = intakeHardIssues({ mileage: input.mileage, lastMileage: ownMileage ? null : v.mileage, keyCount: input.keyCount });
  if (hard.length) throw new RepairError(hard[0].msg);
  if (input.fuelPct != null && (input.fuelPct < 0 || input.fuelPct > 100)) throw new RepairError("연료량을 다시 골라 주세요");
  const vin = clean(input.vin);
  const color = clean(input.colorCode);
  const mileageChanged = input.mileage != null && input.mileage !== v.mileage;
  if ((mileageChanged && !ownMileage) || (vin && vin !== v.vin) || (color && color.toUpperCase() !== v.colorCode)) {
    await saveVehicle(db, actorId, v.customerId, { id: v.id, plateNo: v.plateNo, vin: vin ?? undefined, colorCode: color ?? undefined, mileage: ownMileage ? null : input.mileage }, seoulDate(now));
  }
  if (mileageChanged && ownMileage) await db.update(vehicle).set({ mileage: input.mileage, mileageOn: seoulDate(now), updatedAt: now }).where(eq(vehicle.id, v.id));
  const values = {
    mileage: input.mileage,
    fuelPct: input.fuelPct,
    bodyNotes: input.bodyNotes.filter((b) => BODY_NOTES.includes(b)),
    warningLights: clean(input.warningLights),
    marks: cleanMarks(input.marks),
    valuables: input.valuablesNone ? null : clean(input.valuables),
    valuablesNone: input.valuablesNone,
    devices: input.devices.filter((d) => DEVICES.includes(d)),
    keyCount: input.keyCount,
    keyTag: clean(input.keyTag) ?? r.docNo,
    coversOn: input.coversOn,
    parkSpot: clean(input.parkSpot),
    delivered: input.delivered,
    driverName: input.delivered ? clean(input.driverName) : null,
    intakeNote: clean(input.intakeNote),
    agreeChecked: input.agreeChecked,
    agreeMove: input.agreeMove,
    signerName: clean(input.signerName),
    updatedAt: now,
  };
  await db.update(repairOrder).set(values).where(eq(repairOrder.id, id));
  await writeAudit(db, { actorId, action: "repair.intake_save", entityType: "repair_order", entityId: r.docNo, after: { mileage: values.mileage, marks: values.marks.length } });
}

/** 서명 받고 점검 마치기. 서버에서 다시 모두 확인한다 */
export async function signIntake(db: Db, actorId: string, id: string, input: IntakeInput & { signaturePng: Uint8Array | null; consentNow: boolean }, now = new Date()) {
  await saveIntake(db, actorId, id, input, now);
  const r = await roRow(db, id);
  const [v] = await db.select({ mileage: vehicle.mileage }).from(vehicle).where(eq(vehicle.id, r.vehicleId));
  const photos = await db.select({ slot: roPhoto.slot }).from(roPhoto).where(eq(roPhoto.repairOrderId, id));
  let consent = await consentState(db, r.customerId);
  const policy = await loadPolicy(db, seoulDate(now));
  const issues = intakeIssues(
    {
      mileage: r.mileage,
      fuelPct: r.fuelPct,
      photoSlots: photos.map((p) => p.slot),
      valuables: r.valuables ?? "",
      valuablesNone: r.valuablesNone,
      keyCount: r.keyCount,
      coversOn: r.coversOn,
      agreeChecked: r.agreeChecked,
      agreeMove: r.agreeMove,
      consentOk: consent.required || input.consentNow,
      signerName: r.signerName ?? "",
      signature: !!input.signaturePng?.length,
      delivered: r.delivered,
      driverName: r.driverName ?? "",
      lastMileage: null, // 저장하면서 이미 확인함(차량 기록이 지금 값으로 바뀜)
    },
    policy["intake.min_photos"],
  );
  if (issues.length) throw new RepairError(`점검 내용은 저장했지만 아직 서명할 수 없습니다: ${issues.map((i) => i.msg).join(" / ")}`);
  const png = input.signaturePng!;
  if (sniffImage(png) !== "image/png" || png.length > 400_000) throw new RepairError("서명 그림을 읽지 못했습니다. 서명란을 지우고 다시 받아 주세요");
  if (!consent.required && input.consentNow) {
    await changeConsent(db, actorId, r.customerId, { required: true, photo: consent.photo, marketing: consent.marketing, method: "visit", note: `입고 점검 ${r.docNo}에서 서명` });
    consent = await consentState(db, r.customerId);
  }
  const path = await storeFile(`ro/${r.docNo}`, png, "png");
  await db.update(repairOrder).set({ status: "checked", signaturePath: path, signedAt: now, updatedAt: now }).where(eq(repairOrder.id, id));
  await seedDiagnosis(db, actorId, id);
  await notifyRole(db, "technician", `손상 진단 대기: ${r.docNo}`, `diag-${r.docNo}`, `/repairs/${id}#diagnosis`);
  await writeAudit(db, { actorId, action: "repair.intake_signed", entityType: "repair_order", entityId: r.docNo, after: { signer: r.signerName, mileage: r.mileage, photos: photos.length, mileageNow: v?.mileage } });
}

/** 서명 뒤에 고칠 것이 생겼을 때: 서명을 지우고 점검 중으로 되돌린다(견적 시작 전까지만) */
export async function reopenIntake(db: Db, actorId: string, id: string, reason: string, now = new Date()) {
  const r = await roRow(db, id);
  if (r.status !== "checked") throw new RepairError("입고 점검을 마친 뒤, 견적을 시작하기 전에만 다시 점검할 수 있습니다");
  if (!reason.trim()) throw new RepairError("다시 점검하는 이유를 적어 주세요");
  await db.update(repairOrder).set({ status: "intake", signaturePath: null, signedAt: null, agreeChecked: false, agreeMove: false, updatedAt: now }).where(eq(repairOrder.id, id));
  await writeAudit(db, { actorId, action: "repair.intake_reopen", entityType: "repair_order", entityId: r.docNo, before: { signedAt: r.signedAt, signaturePath: r.signaturePath }, after: { reason: reason.trim() } });
}

/** 사진 올리기. 방향 사진은 한 자리에 한 장(다시 올리면 바뀜), 근접·기타는 여러 장 */
export async function addPhoto(db: Db, actorId: string, id: string, slot: string, bytes: Uint8Array, meta: { width?: number; height?: number; note?: string } = {}) {
  const r = await roRow(db, id);
  mustBeOpen(r);
  if (!isPhotoSlot(slot)) throw new RepairError("사진 자리를 다시 골라 주세요");
  if (!bytes.length) throw new RepairError("사진이 비어 있습니다");
  if (bytes.length > MAX_IMAGE_BYTES) throw new RepairError("사진이 너무 큽니다(6MB까지). 화면에서 다시 올리면 줄여서 보냅니다");
  const type = sniffImage(bytes);
  if (!type) throw new RepairError("사진 파일만 올릴 수 있습니다(JPG·PNG·WEBP)");
  const path = await storeFile(`ro/${r.docNo}`, bytes, IMAGE_TYPES[type]);
  const old = MULTI_SLOTS.includes(slot) ? [] : await db.select().from(roPhoto).where(and(eq(roPhoto.repairOrderId, id), eq(roPhoto.slot, slot)));
  await db.insert(roPhoto).values({ repairOrderId: id, slot, path, width: meta.width ?? null, height: meta.height ?? null, bytes: bytes.length, note: clean(meta.note), takenBy: actorId });
  for (const o of old) {
    await db.delete(roPhoto).where(eq(roPhoto.id, o.id));
    await removeStored(o.path);
  }
  await db.update(repairOrder).set({ updatedAt: new Date() }).where(eq(repairOrder.id, id));
  await writeAudit(db, { actorId, action: "repair.photo_add", entityType: "repair_order", entityId: r.docNo, after: { slot, bytes: bytes.length, replaced: old.length } });
}

export async function removePhoto(db: Db, actorId: string, photoId: string) {
  const [p] = await db.select().from(roPhoto).where(eq(roPhoto.id, photoId));
  if (!p) return;
  const r = await roRow(db, p.repairOrderId);
  mustBeOpen(r);
  await db.delete(roPhoto).where(eq(roPhoto.id, photoId));
  await removeStored(p.path);
  await writeAudit(db, { actorId, action: "repair.photo_remove", entityType: "repair_order", entityId: r.docNo, after: { slot: p.slot } });
}

/** 수리 건 한 건: 상담(불러온 값)·고객·차량·사진·담당 */
export async function getRepair(db: Db, id: string) {
  const r = await roRow(db, id);
  const [[c], [cu], [v], photos, [adv]] = await Promise.all([
    db.select().from(consultation).where(eq(consultation.id, r.consultationId)),
    db.select().from(customer).where(eq(customer.id, r.customerId)),
    db.select().from(vehicle).where(eq(vehicle.id, r.vehicleId)),
    db.select().from(roPhoto).where(eq(roPhoto.repairOrderId, id)).orderBy(asc(roPhoto.createdAt)),
    r.advisorId ? db.select({ name: appUser.name }).from(appUser).where(eq(appUser.id, r.advisorId)) : Promise.resolve([]),
  ]);
  return {
    ...r,
    marks: r.marks as BodyMark[],
    consult: c,
    customer: { id: cu.id, name: cu.name, phone: cu.phoneMasked },
    vehicle: v,
    photos: photos.map((p) => ({ ...p, slot: p.slot as PhotoSlot })),
    advisor: adv?.name ?? null,
    consent: await consentState(db, r.customerId),
    damages: await listDamage(db, id),
  };
}

/** 수리 건 목록. open=아직 출고 안 함 */
export async function listRepairs(db: Db, filter: "open" | "intake" | "checked" | "qc" | "all" = "open", limit = 100) {
  const where = filter === "intake" || filter === "checked" ? eq(repairOrder.status, filter) : filter === "qc" ? inArray(repairOrder.status, ["inspecting", "ready"]) : filter === "open" ? and(ne(repairOrder.status, "delivered"), ne(repairOrder.status, "cancelled")) : undefined;
  const rows = await db
    .select({
      id: repairOrder.id,
      docNo: repairOrder.docNo,
      status: repairOrder.status,
      inAt: repairOrder.inAt,
      signedAt: repairOrder.signedAt,
      insurance: repairOrder.insurance,
      customerName: customer.name,
      plateNo: vehicle.plateNo,
      model: vehicle.model,
      consultId: repairOrder.consultationId,
      photos: sql<number>`(select count(*)::int from ${roPhoto} where ${roPhoto.repairOrderId} = ${repairOrder.id})`,
      damages: sql<number>`(select count(*)::int from ${roDamage} where ${roDamage.repairOrderId} = ${repairOrder.id})`,
    })
    .from(repairOrder)
    .innerJoin(customer, eq(customer.id, repairOrder.customerId))
    .innerJoin(vehicle, eq(vehicle.id, repairOrder.vehicleId))
    .where(where)
    .orderBy(desc(repairOrder.inAt))
    .limit(limit);
  return rows;
}

/** 상담 → 수리 건(상담 화면의 링크용) */
export async function repairsOfConsults(db: Db, consultIds: string[]) {
  if (!consultIds.length) return new Map<string, { id: string; docNo: string; status: string }>();
  const rows = await db.select({ id: repairOrder.id, docNo: repairOrder.docNo, status: repairOrder.status, consultId: repairOrder.consultationId }).from(repairOrder).where(inArray(repairOrder.consultationId, consultIds));
  return new Map(rows.map((r) => [r.consultId, r]));
}

// ── 손상 진단(STD-02 5절) ──
const DIAG_ROLES: Role[] = ["technician", "plant_manager", "owner"];
const CONFIRM_ROLES: Role[] = ["plant_manager", "owner"];

export type DamageInput = {
  id?: string;
  part: string;
  kind: string;
  sizeCm: number | null;
  depthMm: number | null;
  paintLayer: string;
  crease: boolean;
  broken: boolean;
  structural: boolean;
  filmPanel: number[];
  filmAdjacent: number[];
  /** 비우면 기준표 제안을 쓴다 */
  method?: string;
  methodReason?: string;
  /** 안 주면 차량 수리 사양으로 판단 */
  calibrate?: boolean;
  note?: string;
};

function mustDiagnose(r: { status: string; docNo: string }) {
  if (r.status !== "checked") throw new RepairError(r.status === "intake" ? "입고 점검(고객 서명)을 마친 뒤에 진단합니다" : `${r.docNo}는 진단을 확인해 견적으로 넘겼습니다. 고치려면 공장장이 '진단 다시 열기'를 누릅니다`);
}

/** 입고 도면의 수리 대상(O) 표시를 진단 줄로 옮긴다(다시 적지 않게). 이미 줄이 있으면 하지 않는다 */
export async function seedDiagnosis(db: Db, actorId: string, id: string) {
  const r = await roRow(db, id);
  const [has] = await db.select({ id: roDamage.id }).from(roDamage).where(eq(roDamage.repairOrderId, id)).limit(1);
  if (has) return 0;
  const [c] = await db.select({ damageTypes: consultation.damageTypes }).from(consultation).where(eq(consultation.id, r.consultationId));
  const [v] = await db.select({ options: vehicle.options }).from(vehicle).where(eq(vehicle.id, r.vehicleId));
  const kind = c?.damageTypes.includes("찌그러짐") || !c?.damageTypes.includes("긁힘") ? "D" : "S";
  const parts = [...new Set((r.marks as BodyMark[]).filter((m) => m.kind === "O").map((m) => m.part))].filter((p) => BODY_PARTS.some((b) => b.id === p));
  let seq = 0;
  for (const part of parts) {
    const s = suggestMethod({ kind, paintLayer: "none", crease: false, broken: false, structural: false, sizeCm: null });
    await db.insert(roDamage).values({ repairOrderId: id, seq: ++seq, part, kind, method: s.method, suggested: s.method, calibrate: !!needsCalibration(part, v?.options ?? []), note: "입고 도면에서 불러옴 — 크기·도장 손상·도막 두께를 재어 고치세요", createdBy: actorId });
  }
  return parts.length;
}

export async function saveDamage(db: Db, actor: { id: string; roles: Role[] }, roId: string, input: DamageInput, now = new Date()) {
  if (!actor.roles.some((x) => DIAG_ROLES.includes(x))) throw new RepairError("손상 진단은 기술자·공장장·대표가 합니다");
  const r = await roRow(db, roId);
  mustDiagnose(r);
  if (!BODY_PARTS.some((b) => b.id === input.part)) throw new RepairError("부위를 골라 주세요");
  if (!(input.kind in DAMAGE_KINDS)) throw new RepairError("손상 종류를 골라 주세요");
  if (!isPaintLayer(input.paintLayer)) throw new RepairError("도장 손상 범위를 골라 주세요");
  if (input.sizeCm != null && (input.sizeCm < 0 || input.sizeCm > 500)) throw new RepairError("크기는 0~500cm로 적어 주세요");
  const s = suggestMethod({ kind: input.kind, paintLayer: input.paintLayer as PaintLayer, crease: input.crease, broken: input.broken, structural: input.structural, sizeCm: input.sizeCm });
  const method: Method = input.method && isMethod(input.method) ? input.method : s.method;
  const reason = clean(input.methodReason);
  if (method !== s.method && !reason) throw new RepairError(`기준표 제안(${METHODS[s.method]})과 다른 방법을 골랐습니다. 사유를 적어 주세요`);
  const [v] = await db.select({ options: vehicle.options }).from(vehicle).where(eq(vehicle.id, r.vehicleId));
  const values = {
    part: input.part,
    kind: input.kind,
    sizeCm: input.sizeCm,
    depthMm: input.depthMm,
    paintLayer: input.paintLayer,
    crease: input.crease,
    broken: input.broken,
    structural: input.structural,
    filmPanel: input.filmPanel.slice(0, 12),
    filmAdjacent: input.filmAdjacent.slice(0, 12),
    method,
    suggested: s.method,
    methodReason: method === s.method ? null : reason,
    calibrate: input.calibrate ?? !!needsCalibration(input.part, v?.options ?? []),
    note: clean(input.note),
    updatedAt: now,
  };
  if (input.id) {
    const [old] = await db.select().from(roDamage).where(and(eq(roDamage.id, input.id), eq(roDamage.repairOrderId, roId)));
    if (!old) throw new RepairError("없는 진단 줄입니다");
    await db.update(roDamage).set(values).where(eq(roDamage.id, input.id));
  } else {
    const [{ n }] = await db.select({ n: sql<number>`coalesce(max(${roDamage.seq}), 0)::int` }).from(roDamage).where(eq(roDamage.repairOrderId, roId));
    await db.insert(roDamage).values({ ...values, repairOrderId: roId, seq: n + 1, createdBy: actor.id });
  }
  await db.update(repairOrder).set({ diagnosedBy: actor.id, diagnosedAt: now, updatedAt: now }).where(eq(repairOrder.id, roId));
  await writeAudit(db, { actorId: actor.id, action: "repair.damage_save", entityType: "repair_order", entityId: r.docNo, after: { part: input.part, method, suggested: s.method } });
}

export async function removeDamage(db: Db, actor: { id: string; roles: Role[] }, roId: string, damageId: string) {
  if (!actor.roles.some((x) => DIAG_ROLES.includes(x))) throw new RepairError("손상 진단은 기술자·공장장·대표가 합니다");
  const r = await roRow(db, roId);
  mustDiagnose(r);
  const [d] = await db.select().from(roDamage).where(and(eq(roDamage.id, damageId), eq(roDamage.repairOrderId, roId)));
  if (!d) return;
  await db.delete(roDamage).where(eq(roDamage.id, damageId));
  await writeAudit(db, { actorId: actor.id, action: "repair.damage_remove", entityType: "repair_order", entityId: r.docNo, after: { part: d.part } });
}

export const listDamage = (db: Db, roId: string) => db.select().from(roDamage).where(eq(roDamage.repairOrderId, roId)).orderBy(asc(roDamage.seq));

/** 공장장 확인 → 견적 대기. 빠진 것이 있으면 막는다 */
export async function confirmDiagnosis(db: Db, actor: { id: string; roles: Role[] }, roId: string, note: string, now = new Date()) {
  if (!actor.roles.some((x) => CONFIRM_ROLES.includes(x))) throw new RepairError("진단 확인은 공장장(또는 대표)이 합니다");
  const r = await roRow(db, roId);
  mustDiagnose(r);
  const lines = await listDamage(db, roId);
  const issues = diagnosisIssues(lines);
  if (issues.length) throw new RepairError(issues.map((i) => i.msg).join(" / "));
  await db.update(repairOrder).set({ status: "estimating", diagConfirmedBy: actor.id, diagConfirmedAt: now, diagNote: clean(note), updatedAt: now }).where(eq(repairOrder.id, roId));
  await writeAudit(db, { actorId: actor.id, action: "repair.diagnosis_confirm", entityType: "repair_order", entityId: r.docNo, after: { lines: lines.map((l) => `${partLabel(l.part)}:${l.method}`) } });
  await notifyRole(db, "advisor", `견적 작성: ${r.docNo} 진단 확인됨`, `est-${r.docNo}`, `/repairs/${roId}`);
}

/** 견적을 쓰기 전이면 진단을 다시 연다 */
export async function reopenDiagnosis(db: Db, actor: { id: string; roles: Role[] }, roId: string, now = new Date()) {
  if (!actor.roles.some((x) => CONFIRM_ROLES.includes(x))) throw new RepairError("진단 다시 열기는 공장장(또는 대표)이 합니다");
  const r = await roRow(db, roId);
  if (r.status !== "estimating") throw new RepairError("견적 대기 상태에서만 진단을 다시 열 수 있습니다");
  await db.update(repairOrder).set({ status: "checked", diagConfirmedBy: null, diagConfirmedAt: null, updatedAt: now }).where(eq(repairOrder.id, roId));
  await writeAudit(db, { actorId: actor.id, action: "repair.diagnosis_reopen", entityType: "repair_order", entityId: r.docNo });
}
