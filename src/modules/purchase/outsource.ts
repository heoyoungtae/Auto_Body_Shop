// 외주(STD-07 8절, F-07-03): 자체 처리 못 하는 작업(프레임 교정·ADAS 보정·유리·전장·휠)을 등록 외주 업체에 의뢰한다.
// 의뢰서 작성(공장장: 범위·요구 결과·납기·금액) → 승인(전결 '발주·외주') → 의뢰 → (차를 옮기면) 상담원이 고객에게 미리 알리고 반출(시각·주행거리)
// → 결과(사진·보정 성적서)와 반입 → 공장장이 수용 또는 재작업 요청. 외주 결과도 최종 검사(F-05-01) 대상이다.
import { and, asc, desc, eq, inArray, notInArray } from "drizzle-orm";
import type { Db } from "@/db/client";
import { appUser, customer, estimate, estimateLine, outsourceJob, repairOrder, roDamage, supplier, vehicle } from "@/db/schema";
import { rolesOf } from "@/modules/approval/line";
import { can } from "@/modules/auth/permissions";
import { ROLE_LABEL, type Role } from "@/modules/auth/roles";
import { writeAudit } from "@/modules/platform/audit";
import { resolveApprover } from "@/modules/platform/delegation";
import { nextDocNo } from "@/modules/platform/docno";
import { UserError } from "@/modules/platform/errors";
import { notifyRole } from "@/modules/platform/notify";
import { IMAGE_TYPES, MAX_IMAGE_BYTES, removeStored, sniffImage, storeFile } from "@/modules/platform/storage";
import { seoulDate } from "@/modules/platform/time";
import { roDueDate } from "./order";
import { isOutType, OUT_TYPES, type OsStatus } from "./rules";
import { markEmergency, usableSupplier } from "./supplier";

export class OutsourceError extends UserError {}
type Actor = { id: string; roles: Role[] };
const clean = (s: string | null | undefined) => (s ?? "").trim() || null;
const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

async function osRow(db: Db, id: string) {
  const [j] = await db.select().from(outsourceJob).where(eq(outsourceJob.id, id));
  if (!j) throw new OutsourceError("외주 의뢰서를 찾을 수 없습니다");
  return j;
}
function mustOrder(actor: Actor) {
  if (!can(actor, "purchase.order")) throw new OutsourceError("외주 의뢰는 공장장·대표가 합니다");
}
function mustStatus(j: { status: string; docNo: string }, ...ok: OsStatus[]) {
  if (!ok.includes(j.status as OsStatus)) throw new OutsourceError(`${j.docNo}는 지금 단계에서 할 수 없는 일입니다`);
}

export type OsInput = { supplierId: string; workType: string; scope: string; required: string; dueOn: string; amountWon: number; moveOut: boolean };

function check(i: OsInput) {
  if (!i.supplierId) throw new OutsourceError("외주 업체를 골라 주세요");
  if (!isOutType(i.workType)) throw new OutsourceError("외주 작업 종류를 골라 주세요");
  if (!i.scope.trim()) throw new OutsourceError("작업 범위를 적어 주세요");
  if (!i.required.trim()) throw new OutsourceError("요구 결과를 적어 주세요(예: 보정 성적서, 계측표)");
  if (!DATE.test(i.dueOn)) throw new OutsourceError("납기를 적어 주세요");
  if (!Number.isInteger(i.amountWon) || i.amountWon < 0) throw new OutsourceError("금액을 확인해 주세요");
  return { supplierId: i.supplierId, workType: i.workType, scope: i.scope.trim(), required: i.required.trim(), dueOn: i.dueOn, amountWon: i.amountWon, moveOut: i.moveOut };
}

/** 의뢰서 작성 화면에 불러올 값: 견적의 외주 줄(범위·금액), 진단의 외주·보정 표시 */
export async function outsourceSeed(db: Db, roId: string) {
  const [ro] = await db
    .select({ id: repairOrder.id, docNo: repairOrder.docNo, mileage: repairOrder.mileage, agreeMove: repairOrder.agreeMove, plateNo: vehicle.plateNo, model: vehicle.model, customerName: customer.name, customerId: customer.id })
    .from(repairOrder)
    .innerJoin(vehicle, eq(vehicle.id, repairOrder.vehicleId))
    .innerJoin(customer, eq(customer.id, repairOrder.customerId))
    .where(eq(repairOrder.id, roId));
  if (!ro) throw new OutsourceError("수리 건을 찾을 수 없습니다");
  const [e] = await db.select({ id: estimate.id, docNo: estimate.docNo }).from(estimate).where(and(eq(estimate.repairOrderId, roId), inArray(estimate.status, ["accepted", "partial", "sent", "approved"]))).orderBy(desc(estimate.createdAt)).limit(1);
  const lines = e ? await db.select({ name: estimateLine.name, laborWon: estimateLine.laborWon, approved: estimateLine.approved }).from(estimateLine).where(and(eq(estimateLine.estimateId, e.id), eq(estimateLine.category, "outsource"))).orderBy(asc(estimateLine.seq)) : [];
  const dmg = await db.select({ structural: roDamage.structural, calibrate: roDamage.calibrate, method: roDamage.method }).from(roDamage).where(eq(roDamage.repairOrderId, roId));
  const due = await roDueDate(db, roId);
  const use = lines.filter((l) => l.approved !== false);
  return {
    ro,
    due,
    estimate: e ?? null,
    scope: use.map((l) => l.name).join("\n"),
    amountWon: use.reduce((s, l) => s + l.laborWon, 0),
    workType: dmg.some((d) => d.calibrate) ? "adas" : dmg.some((d) => d.structural || d.method === "outsource") ? (use.some((l) => l.name.includes("진단")) ? "diag" : "frame") : "",
  };
}

/** 작성하고 바로 승인 요청 */
export async function createOutsource(db: Db, actor: Actor, roId: string, input: OsInput, emergency: boolean, now = new Date()) {
  mustOrder(actor);
  const v = check(input);
  const s = await usableSupplier(db, v.supplierId, emergency, seoulDate(now));
  if (!s.kinds.includes("outsource")) throw new OutsourceError(`${s.name}은(는) 외주 가공 업체로 등록되지 않았습니다`);
  const [ro] = await db.select({ status: repairOrder.status, docNo: repairOrder.docNo }).from(repairOrder).where(eq(repairOrder.id, roId));
  if (!ro) throw new OutsourceError("수리 건을 찾을 수 없습니다");
  if (ro.status === "delivered" || ro.status === "cancelled") throw new OutsourceError("출고했거나 취소한 수리 건입니다");
  const role = await resolveApprover(db, "purchase", v.amountWon, actor.roles, seoulDate(now));
  const j = await db.transaction(async (tx) => {
    const docNo = await nextDocNo(tx, "OS", now);
    const [r] = await tx.insert(outsourceJob).values({ docNo, repairOrderId: roId, ...v, status: "review", approverRole: role, createdBy: actor.id, createdAt: now, updatedAt: now }).returning({ id: outsourceJob.id, docNo: outsourceJob.docNo });
    return r;
  });
  await writeAudit(db, { actorId: actor.id, action: "outsource.create", entityType: "outsource", entityId: j.docNo, after: { ro: ro.docNo, supplier: s.name, amount: v.amountWon, approver: role, emergency: s.status !== "registered" } });
  await notifyRole(db, role, `외주 승인 요청: ${j.docNo}(${ro.docNo}) ${s.name} ${OUT_TYPES[v.workType as keyof typeof OUT_TYPES]} ${won(v.amountWon)}`, `os-review-${j.id}`, `/outsource/${j.id}`);
  return j;
}

/** 되돌려진 의뢰서를 고쳐 다시 승인 요청 */
export async function resubmitOutsource(db: Db, actor: Actor, id: string, input: OsInput, emergency: boolean, now = new Date()) {
  mustOrder(actor);
  const j = await osRow(db, id);
  mustStatus(j, "draft");
  const v = check(input);
  const s = await usableSupplier(db, v.supplierId, emergency, seoulDate(now));
  const role = await resolveApprover(db, "purchase", v.amountWon, actor.roles, seoulDate(now));
  await db.update(outsourceJob).set({ ...v, status: "review", approverRole: role, updatedAt: now }).where(eq(outsourceJob.id, id));
  await writeAudit(db, { actorId: actor.id, action: "outsource.resubmit", entityType: "outsource", entityId: j.docNo, after: { supplier: s.name, amount: v.amountWon } });
  await notifyRole(db, role, `외주 승인 요청(고침): ${j.docNo} ${s.name} ${won(v.amountWon)}`, `os-review-${id}-${now.getTime()}`, `/outsource/${id}`);
}

export async function approveOutsource(db: Db, actor: Actor, id: string, ok: boolean, note: string, now = new Date()) {
  const j = await osRow(db, id);
  mustStatus(j, "review");
  const role = (j.approverRole as Role) ?? (await resolveApprover(db, "purchase", j.amountWon, j.createdBy ? await rolesOf(db, j.createdBy) : [], seoulDate(now)));
  if (!actor.roles.includes(role) && !actor.roles.includes("owner")) throw new OutsourceError(`이 외주(${won(j.amountWon)})는 ${ROLE_LABEL[role]}이(가) 승인합니다(전결 규정)`);
  if (j.createdBy === actor.id && !actor.roles.includes("owner")) throw new OutsourceError("본인이 요청한 외주는 대표가 승인합니다");
  if (!ok && !note.trim()) throw new OutsourceError("되돌리는 이유를 적어 주세요");
  await db.update(outsourceJob).set(ok ? { status: "approved", approvedBy: actor.id, approvedAt: now, returnNote: null, updatedAt: now } : { status: "draft", returnNote: note.trim(), updatedAt: now }).where(eq(outsourceJob.id, id));
  await writeAudit(db, { actorId: actor.id, action: ok ? "outsource.approve" : "outsource.return", entityType: "outsource", entityId: j.docNo, after: { note: clean(note) } });
  await notifyRole(db, "plant_manager", ok ? `외주 승인: ${j.docNo} — 업체에 의뢰하세요` : `외주 되돌림: ${j.docNo} — ${note.trim()}`, `os-decide-${id}-${now.getTime()}`, `/outsource/${id}`);
}

/** 업체에 의뢰함. 차를 옮기는 일이면 상담원에게 고객 사전 알림을 요청한다 */
export async function requestOutsource(db: Db, actor: Actor, id: string, now = new Date()) {
  mustOrder(actor);
  const j = await osRow(db, id);
  if (j.status === "draft" || j.status === "review") throw new OutsourceError("승인 전에는 의뢰할 수 없습니다");
  mustStatus(j, "approved");
  const [s] = await db.select().from(supplier).where(eq(supplier.id, j.supplierId));
  if (s && s.status !== "registered" && !s.emergencyOn) await markEmergency(db, s.id, seoulDate(now));
  await db.update(outsourceJob).set({ status: "requested", requestedAt: now, updatedAt: now }).where(eq(outsourceJob.id, id));
  await writeAudit(db, { actorId: actor.id, action: "outsource.request", entityType: "outsource", entityId: j.docNo });
  if (j.moveOut) await notifyRole(db, "advisor", `외주 반출 예정: ${j.docNo} — 차를 옮기기 전에 고객에게 알리세요`, `os-notice-${id}`, `/outsource/${id}`);
}

/** 8.2 반출 전 고객 알림 기록(상담원) */
export async function noticeCustomer(db: Db, actor: Actor, id: string, note: string, now = new Date()) {
  if (!can(actor, "outsource.notice")) throw new OutsourceError("고객 알림은 상담원이 합니다");
  const j = await osRow(db, id);
  mustStatus(j, "approved", "requested");
  if (!note.trim()) throw new OutsourceError("누구에게 어떻게 알렸는지 적어 주세요");
  await db.update(outsourceJob).set({ customerNoticeAt: now, customerNoticeBy: actor.id, customerNoticeNote: note.trim(), updatedAt: now }).where(eq(outsourceJob.id, id));
  await writeAudit(db, { actorId: actor.id, action: "outsource.notice", entityType: "outsource", entityId: j.docNo });
}

/** 반출: 고객에게 알린 뒤에만. 시각·주행거리 */
export async function vehicleOut(db: Db, actor: Actor, id: string, km: number, now = new Date()) {
  if (!can(actor, "outsource.notice")) throw new OutsourceError("반출 기록은 상담원·공장장이 합니다");
  const j = await osRow(db, id);
  mustStatus(j, "requested");
  if (!j.moveOut) throw new OutsourceError("차를 옮기지 않는 외주입니다");
  if (!j.customerNoticeAt) throw new OutsourceError("반출 전에 고객에게 먼저 알리고 기록해 주세요(STD-07 8.2)");
  if (!Number.isInteger(km) || km < 0) throw new OutsourceError("반출 주행거리를 적어 주세요");
  const [ro] = await db.select({ mileage: repairOrder.mileage }).from(repairOrder).where(eq(repairOrder.id, j.repairOrderId));
  if (ro?.mileage != null && km < ro.mileage) throw new OutsourceError(`입고 때 주행거리(${ro.mileage.toLocaleString("ko-KR")}km)보다 작습니다`);
  await db.update(outsourceJob).set({ status: "out", outAt: now, outKm: km, updatedAt: now }).where(eq(outsourceJob.id, id));
  await writeAudit(db, { actorId: actor.id, action: "outsource.out", entityType: "outsource", entityId: j.docNo, after: { km } });
}

/** 결과 받음(8.3): 결과 내용·반입 주행거리. 사진·성적서는 따로 올린다 */
export async function recordResult(db: Db, actor: Actor, id: string, input: { note: string; inKm: number | null }, now = new Date()) {
  if (!can(actor, "purchase.order") && !can(actor, "outsource.notice")) throw new OutsourceError("결과 기록은 공장장·상담원이 합니다");
  const j = await osRow(db, id);
  mustStatus(j, j.moveOut ? "out" : "requested");
  if (!input.note.trim()) throw new OutsourceError("업체가 알려 준 결과를 적어 주세요");
  if (j.moveOut) {
    if (input.inKm == null || !Number.isInteger(input.inKm)) throw new OutsourceError("반입 주행거리를 적어 주세요");
    if (j.outKm != null && input.inKm < j.outKm) throw new OutsourceError(`반출 때(${j.outKm.toLocaleString("ko-KR")}km)보다 작습니다`);
  }
  await db.update(outsourceJob).set({ status: "returned", resultNote: input.note.trim(), resultAt: now, resultBy: actor.id, inAt: j.moveOut ? now : null, inKm: j.moveOut ? input.inKm : null, updatedAt: now }).where(eq(outsourceJob.id, id));
  await writeAudit(db, { actorId: actor.id, action: "outsource.result", entityType: "outsource", entityId: j.docNo, after: { inKm: input.inKm } });
  await notifyRole(db, "plant_manager", `외주 결과 확인: ${j.docNo} — 사진·성적서를 보고 수용하거나 재작업을 요청하세요`, `os-result-${id}-${now.getTime()}`, `/outsource/${id}`);
}

/** 8.4 수용(사진·성적서 1장 이상) 또는 재작업 요청 */
export async function judgeOutsource(db: Db, actor: Actor, id: string, ok: boolean, note: string, now = new Date()) {
  mustOrder(actor);
  const j = await osRow(db, id);
  mustStatus(j, "returned");
  if (ok && !j.resultPhotos.length) throw new OutsourceError("결과 사진이나 보정 성적서를 먼저 올려 주세요");
  if (!ok && !note.trim()) throw new OutsourceError("무엇을 다시 해야 하는지 적어 주세요");
  if (ok) await db.update(outsourceJob).set({ status: "accepted", acceptedBy: actor.id, acceptedAt: now, updatedAt: now }).where(eq(outsourceJob.id, id));
  else
    await db
      .update(outsourceJob)
      .set({ status: "requested", redoCount: j.redoCount + 1, redoNote: note.trim(), outAt: null, outKm: null, inAt: null, inKm: null, resultAt: null, updatedAt: now })
      .where(eq(outsourceJob.id, id));
  await writeAudit(db, { actorId: actor.id, action: ok ? "outsource.accept" : "outsource.redo", entityType: "outsource", entityId: j.docNo, after: { note: clean(note) } });
  if (ok) await notifyRole(db, "quality", `외주 결과 수용: ${j.docNo} — 최종 검사(F-05-01)에서 함께 확인하세요`, `os-accept-${id}`, `/repairs/${j.repairOrderId}`);
}

export async function cancelOutsource(db: Db, actor: Actor, id: string, reason: string, now = new Date()) {
  mustOrder(actor);
  const j = await osRow(db, id);
  mustStatus(j, "draft", "review", "approved", "requested");
  if (!reason.trim()) throw new OutsourceError("취소 이유를 적어 주세요");
  await db.update(outsourceJob).set({ status: "cancelled", cancelReason: reason.trim(), updatedAt: now }).where(eq(outsourceJob.id, id));
  await writeAudit(db, { actorId: actor.id, action: "outsource.cancel", entityType: "outsource", entityId: j.docNo, after: { reason: reason.trim() } });
}

export async function addOsPhoto(db: Db, actor: Actor, id: string, bytes: Uint8Array) {
  if (!can(actor, "purchase.order") && !can(actor, "outsource.notice")) throw new OutsourceError("공장장·상담원이 올립니다");
  const j = await osRow(db, id);
  if (!["requested", "out", "returned"].includes(j.status)) throw new OutsourceError("의뢰한 뒤부터 수용 전까지 올립니다");
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) throw new OutsourceError("사진이 비었거나 너무 큽니다(6MB까지)");
  const type = sniffImage(bytes);
  if (!type) throw new OutsourceError("사진 파일만 올릴 수 있습니다(JPG·PNG·WEBP). 성적서는 사진으로 찍어 올리세요");
  if (j.resultPhotos.length >= 12) throw new OutsourceError("사진은 12장까지입니다");
  const path = await storeFile(`os/${j.docNo}`, bytes, IMAGE_TYPES[type]);
  await db.update(outsourceJob).set({ resultPhotos: [...j.resultPhotos, path] }).where(eq(outsourceJob.id, id));
}

export async function removeOsPhoto(db: Db, actor: Actor, id: string, path: string) {
  if (!can(actor, "purchase.order") && !can(actor, "outsource.notice")) throw new OutsourceError("공장장·상담원이 지웁니다");
  const j = await osRow(db, id);
  if (j.status === "accepted") throw new OutsourceError("수용한 뒤에는 지울 수 없습니다");
  if (!j.resultPhotos.includes(path)) return;
  await db.update(outsourceJob).set({ resultPhotos: j.resultPhotos.filter((p) => p !== path) }).where(eq(outsourceJob.id, id));
  await removeStored(path);
}

export type OsFilter = "open" | "done" | "all";

export async function listOutsource(db: Db, filter: OsFilter = "open") {
  const rows = await db
    .select({ j: outsourceJob, supplierName: supplier.name, roDocNo: repairOrder.docNo, plateNo: vehicle.plateNo })
    .from(outsourceJob)
    .innerJoin(supplier, eq(supplier.id, outsourceJob.supplierId))
    .innerJoin(repairOrder, eq(repairOrder.id, outsourceJob.repairOrderId))
    .innerJoin(vehicle, eq(vehicle.id, repairOrder.vehicleId))
    .orderBy(desc(outsourceJob.createdAt))
    .limit(300);
  return rows.filter((r) => (filter === "all" ? true : filter === "open" ? !["accepted", "cancelled"].includes(r.j.status) : ["accepted", "cancelled"].includes(r.j.status)));
}

export async function outsourceOfRo(db: Db, roId: string) {
  return db
    .select({ id: outsourceJob.id, docNo: outsourceJob.docNo, status: outsourceJob.status, workType: outsourceJob.workType, dueOn: outsourceJob.dueOn, supplierName: supplier.name })
    .from(outsourceJob)
    .innerJoin(supplier, eq(supplier.id, outsourceJob.supplierId))
    .where(eq(outsourceJob.repairOrderId, roId))
    .orderBy(outsourceJob.createdAt);
}

export async function getOutsource(db: Db, id: string) {
  const j = await osRow(db, id);
  const [s] = await db.select().from(supplier).where(eq(supplier.id, j.supplierId));
  const [ro] = await db
    .select({ id: repairOrder.id, docNo: repairOrder.docNo, mileage: repairOrder.mileage, agreeMove: repairOrder.agreeMove, plateNo: vehicle.plateNo, model: vehicle.model, customerName: customer.name, customerId: customer.id })
    .from(repairOrder)
    .innerJoin(vehicle, eq(vehicle.id, repairOrder.vehicleId))
    .innerJoin(customer, eq(customer.id, repairOrder.customerId))
    .where(eq(repairOrder.id, j.repairOrderId));
  const uids = [...new Set([j.createdBy, j.approvedBy, j.customerNoticeBy, j.resultBy, j.acceptedBy].filter((x): x is string => !!x))];
  const names = new Map((uids.length ? await db.select({ id: appUser.id, name: appUser.name }).from(appUser).where(inArray(appUser.id, uids)) : []).map((u) => [u.id, u.name]));
  return { j, supplier: s, ro, names };
}

/** 내 할 일 */
export async function outsourceTodos(db: Db, actor: Actor, today: string) {
  const out: { key: string; when: "late" | "today" | "soon"; what: string; detail?: string; href: string; action: string }[] = [];
  const rows = await db
    .select({ j: outsourceJob, supplierName: supplier.name, plateNo: vehicle.plateNo })
    .from(outsourceJob)
    .innerJoin(supplier, eq(supplier.id, outsourceJob.supplierId))
    .innerJoin(repairOrder, eq(repairOrder.id, outsourceJob.repairOrderId))
    .innerJoin(vehicle, eq(vehicle.id, repairOrder.vehicleId))
    .where(notInArray(outsourceJob.status, ["accepted", "cancelled"]));
  for (const { j, supplierName, plateNo } of rows) {
    const href = `/outsource/${j.id}`;
    const label = `${j.docNo} ${plateNo} ${OUT_TYPES[j.workType as keyof typeof OUT_TYPES]}(${supplierName})`;
    if (j.status === "review" && j.approverRole && (actor.roles.includes(j.approverRole as Role) || actor.roles.includes("owner")) && j.createdBy !== actor.id)
      out.push({ key: `os-rv-${j.id}`, when: "today", what: `외주 승인: ${label} ${won(j.amountWon)}`, href, action: "승인하기" });
    if (can(actor, "purchase.order")) {
      if (j.status === "draft") out.push({ key: `os-dr-${j.id}`, when: "today", what: `외주 되돌림: ${label}`, detail: j.returnNote ?? undefined, href, action: "고쳐 올리기" });
      if (j.status === "approved") out.push({ key: `os-req-${j.id}`, when: "today", what: `외주 의뢰하기: ${label}`, href, action: "의뢰하기" });
      if (j.status === "returned") out.push({ key: `os-judge-${j.id}`, when: "today", what: `외주 결과 확인: ${label}`, href, action: "수용·재작업" });
      if ((j.status === "requested" || j.status === "out") && j.dueOn < today) out.push({ key: `os-late-${j.id}`, when: "late", what: `외주 납기 지남: ${label}`, detail: `납기 ${j.dueOn}`, href, action: "업체 확인" });
    }
    if (can(actor, "outsource.notice") && j.moveOut && (j.status === "approved" || j.status === "requested") && !j.customerNoticeAt)
      out.push({ key: `os-ntc-${j.id}`, when: "today", what: `외주 반출 전 고객 알림: ${label}`, href, action: "알리고 기록" });
  }
  return out;
}


