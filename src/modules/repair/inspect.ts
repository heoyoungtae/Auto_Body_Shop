// 최종 검사(F-05-01)와 출고(점검·정비명세서 별지 제89호의2, 인수 확인 F-05-02) — STD-05.
// 검사자는 주 작업자가 아니어야 하고(공장장만 예외, 사유 기록), 불합격이면 재작업 공정이 생겨 다시 검사한다.
// 합격하면 출고 대기. 정비명세서는 승인한 견적 줄로 만들고, 고객 인수 서명을 받으면 출고된다.
import { rolesFor } from "@/modules/auth/permissions";
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import type { Db } from "@/db/client";
import { appUser, customer, estimate, estimateLine, inspection, repairOrder, repairStatement, vehicle, workOrder, workStep } from "@/db/schema";
import type { Role } from "@/modules/auth/roles";
import { phoneForNotice } from "@/modules/customer/service";
import { sendNotice } from "@/modules/messaging/service";
import { issueNc } from "@/modules/quality/nc";
import { writeAudit } from "@/modules/platform/audit";
import { nextDocNo } from "@/modules/platform/docno";
import { UserError } from "@/modules/platform/errors";
import { notifyRole } from "@/modules/platform/notify";
import { loadPolicy } from "@/modules/platform/policy";
import { loadShopInfo, shopMissing } from "@/modules/platform/shop";
import { userSignature } from "@/modules/auth/signature";
import { inspectorIssue } from "@/modules/staff/service";
import { IMAGE_TYPES, MAX_IMAGE_BYTES, removeStored, sniffImage, storeFile } from "@/modules/platform/storage";
import { addDays, seoulDate } from "@/modules/platform/time";
import { totals } from "./estimate-rules";
import { DELIVERY_NOTICES, judge, legalFreeDays, PAY_METHODS, type InspectInput } from "./inspect-rules";
import { processLabel } from "./work-rules";

export class InspectError extends UserError {}
type Actor = { id: string; roles: Role[] };
const INSPECTORS: Role[] = rolesFor("inspect.do");
const DESK: Role[] = rolesFor("delivery.do");

async function roRow(db: Db, id: string) {
  const [r] = await db.select().from(repairOrder).where(eq(repairOrder.id, id));
  if (!r) throw new InspectError("없는 수리 건입니다");
  return r;
}
async function currentWo(db: Db, roId: string) {
  const [w] = await db.select().from(workOrder).where(eq(workOrder.repairOrderId, roId)).orderBy(desc(workOrder.createdAt)).limit(1);
  if (!w) throw new InspectError("작업 지시서가 없습니다");
  return w;
}
const processesOf = async (db: Db, woId: string) => [...new Set((await db.select({ p: workStep.process }).from(workStep).where(eq(workStep.workOrderId, woId))).map((x) => x.p))];

/** 검사 시작: 검사자를 정하고 독립성을 확인한다. 진행 중인 회차가 있으면 그것을 돌려준다 */
export async function startInspection(db: Db, actor: Actor, roId: string, independenceNote = "", now = new Date()) {
  if (!actor.roles.some((r) => INSPECTORS.includes(r))) throw new InspectError("최종 검사는 품질 담당·공장장이 합니다");
  const r = await roRow(db, roId);
  if (r.status !== "inspecting") throw new InspectError("작업이 모두 끝나 검사 대기인 수리 건만 검사합니다");
  const [open] = await db.select().from(inspection).where(and(eq(inspection.repairOrderId, roId), isNull(inspection.result)));
  if (open) return { id: open.id, created: false };
  const w = await currentWo(db, roId);
  const workers = (await db.select({ a: workStep.assignee, e: workStep.endedBy }).from(workStep).where(eq(workStep.workOrderId, w.id))).flatMap((x) => [x.a, x.e]);
  let note: string | null = null;
  if (workers.includes(actor.id)) {
    if (!actor.roles.includes("plant_manager") && !actor.roles.includes("owner")) throw new InspectError("이 차를 작업한 사람은 검사할 수 없습니다(검사 독립성). 다른 검사자나 공장장이 검사합니다");
    if (!independenceNote.trim()) throw new InspectError("이 차를 작업했습니다. 인원이 부족해 직접 검사하는 사유를 적어 주세요(STD-05 3절)");
    note = independenceNote.trim();
  }
  const skill = await inspectorIssue(db, actor.id);
  if (skill) throw new InspectError(skill);
  const prev = await db.select({ round: inspection.round }).from(inspection).where(eq(inspection.repairOrderId, roId)).orderBy(desc(inspection.round)).limit(1);
  const [i] = await db.insert(inspection).values({ repairOrderId: roId, workOrderId: w.id, round: (prev[0]?.round ?? 0) + 1, inspector: actor.id, independenceNote: note, startedAt: now }).returning({ id: inspection.id });
  await writeAudit(db, { actorId: actor.id, action: "inspect.start", entityType: "repair_order", entityId: r.docNo, after: { round: (prev[0]?.round ?? 0) + 1, independenceNote: note } });
  return { id: i.id, created: true };
}

async function openInspection(db: Db, actor: Actor, inspectionId: string) {
  const [i] = await db.select().from(inspection).where(eq(inspection.id, inspectionId));
  if (!i) throw new InspectError("없는 검사입니다");
  if (i.result) throw new InspectError("이미 판정한 검사입니다");
  if (i.inspector !== actor.id && !actor.roles.includes("owner")) throw new InspectError("검사를 시작한 검사자만 이어 합니다");
  return i;
}

export async function addInspectionPhoto(db: Db, actor: Actor, inspectionId: string, bytes: Uint8Array) {
  const i = await openInspection(db, actor, inspectionId);
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) throw new InspectError("사진이 비었거나 너무 큽니다(6MB까지)");
  const type = sniffImage(bytes);
  if (!type) throw new InspectError("사진 파일만 올릴 수 있습니다(JPG·PNG·WEBP)");
  if (i.photos.length >= 20) throw new InspectError("검사 사진은 20장까지입니다");
  const r = await roRow(db, i.repairOrderId);
  const path = await storeFile(`ro/${r.docNo}/qc`, bytes, IMAGE_TYPES[type]);
  await db.update(inspection).set({ photos: [...i.photos, path] }).where(eq(inspection.id, inspectionId));
}

export async function removeInspectionPhoto(db: Db, actor: Actor, inspectionId: string, path: string) {
  const i = await openInspection(db, actor, inspectionId);
  if (!i.photos.includes(path)) return;
  await db.update(inspection).set({ photos: i.photos.filter((p) => p !== path) }).where(eq(inspection.id, inspectionId));
  await removeStored(path);
}

/** 판정. 합격이면 출고 대기, 불합격이면 재작업 공정을 만들고 작업으로 되돌린다 */
export async function judgeInspection(db: Db, actor: Actor, inspectionId: string, input: InspectInput, now = new Date()) {
  const i = await openInspection(db, actor, inspectionId);
  const r = await roRow(db, i.repairOrderId);
  const p = await loadPolicy(db, seoulDate(now));
  const res = judge(await processesOf(db, i.workOrderId), input, i.photos.length, { gapMm: p["inspect.gap_mm"], filmMin: p["inspect.film_min_um"], filmMax: p["inspect.film_max_um"], photos: p["inspect.after_photos"] });
  if (!res.pass && !input.failNote.trim()) throw new InspectError(`불합격입니다(${res.fails.map((f) => f.why).join(" / ")}). 결함 위치와 내용을 적어 주세요`);
  await db.transaction(async (tx) => {
    await tx
      .update(inspection)
      .set({ passed: input.passed, gapMm: input.gapMm == null ? null : Math.round(input.gapMm * 10), filmUm: input.filmUm, result: res.pass ? "pass" : "fail", fails: res.fails, failNote: input.failNote.trim() || null, judgedAt: now })
      .where(eq(inspection.id, inspectionId));
    if (res.pass) {
      await tx.update(repairOrder).set({ status: "ready", updatedAt: now }).where(eq(repairOrder.id, r.id));
    } else {
      const steps = await tx.select({ seq: workStep.seq }).from(workStep).where(eq(workStep.workOrderId, i.workOrderId));
      await tx.insert(workStep).values({ workOrderId: i.workOrderId, seq: Math.max(0, ...steps.map((s) => s.seq)) + 1, process: "rework", lineIds: [], note: `${i.round}차 검사 불합격: ${res.fails.map((f) => f.why).join(" / ")} — ${input.failNote.trim()}` });
      await tx.update(workOrder).set({ status: "working", completedAt: null, updatedAt: now }).where(eq(workOrder.id, i.workOrderId));
      await tx.update(repairOrder).set({ status: "working", updatedAt: now }).where(eq(repairOrder.id, r.id));
    }
  });
  await writeAudit(db, { actorId: actor.id, action: res.pass ? "inspect.pass" : "inspect.fail", entityType: "repair_order", entityId: r.docNo, after: { round: i.round, fails: res.fails } });
  if (res.pass) await notifyRole(db, "advisor", `최종 검사 합격: ${r.docNo} — 고객에게 완료 안내를 보내고 인도 일시를 정하세요`, `qc-pass-${r.docNo}-${i.round}`, `/repairs/${r.id}/delivery`);
  else {
    await notifyRole(db, "plant_manager", `최종 검사 불합격(${i.round}차): ${r.docNo} — 재작업 담당을 정하세요`, `qc-fail-${r.docNo}-${i.round}`, `/work/${i.workOrderId}`);
    // 최종 검사 불합격은 부적합 자동 발행(설계 6.3). 같은 차의 안 끝난 보고서가 있으면 그것을 쓴다
    await issueNc(db, actor.id, { source: "inspect", refType: "repair_order", refId: r.id, refLabel: r.docNo, content: `${i.round}차 최종 검사 불합격: ${res.fails.map((f) => f.why).join(" / ")} — ${input.failNote.trim()}`, immediate: "재작업 공정 지시(작업 지시서)" }, now);
    if (i.round >= 2) await notifyRole(db, "quality", `같은 차 ${i.round}회 연속 불합격: ${r.docNo} — 원인 분석·시정 조치(7일 안, STD-05 6.5)`, `qc-repeat-${r.docNo}-${i.round}`, `/repairs/${r.id}/inspect`);
  }
  return res;
}

export async function inspectionsOf(db: Db, roId: string) {
  const rows = await db.select().from(inspection).where(eq(inspection.repairOrderId, roId)).orderBy(asc(inspection.round));
  const names = await db.select({ id: appUser.id, name: appUser.name }).from(appUser);
  return rows.map((x) => ({ ...x, inspectorName: names.find((n) => n.id === x.inspector)?.name ?? "", gap: x.gapMm == null ? null : x.gapMm / 10 }));
}

/** 검사 화면에 필요한 것: 공정·작업자·사진 장수 기준·정책값 */
export async function inspectionContext(db: Db, roId: string, now = new Date()) {
  const r = await roRow(db, roId);
  const w = await currentWo(db, roId);
  const steps = await db.select().from(workStep).where(eq(workStep.workOrderId, w.id)).orderBy(asc(workStep.seq));
  const p = await loadPolicy(db, seoulDate(now));
  return { ro: r, wo: w, steps, processes: [...new Set(steps.map((s) => s.process))], workers: [...new Set(steps.flatMap((s) => [s.assignee, s.endedBy]).filter((x): x is string => !!x))], limits: { gapMm: p["inspect.gap_mm"], filmMin: p["inspect.film_min_um"], filmMax: p["inspect.film_max_um"], photos: p["inspect.after_photos"] } };
}

// ── 출고
function mustDesk(a: Actor) {
  if (!a.roles.some((r) => DESK.includes(r))) throw new InspectError("출고는 상담원·공장장·대표가 합니다");
}

/** 고객에게 수리 완료 안내(알림톡·문자) */
export async function sendReadyNotice(db: Db, actor: Actor, roId: string, now = new Date(), f: typeof fetch = fetch) {
  mustDesk(actor);
  const r = await roRow(db, roId);
  if (r.status !== "ready") throw new InspectError("최종 검사에 합격한 차만 완료 안내를 보냅니다");
  const [v] = await db.select().from(vehicle).where(eq(vehicle.id, r.vehicleId));
  const w = await currentWo(db, roId);
  const steps = await db.select({ p: workStep.process }).from(workStep).where(eq(workStep.workOrderId, w.id));
  const what = [...new Set(steps.map((s) => s.p).filter((x) => !["detach", "assemble", "mask", "dry", "color", "rework"].includes(x)))].map(processLabel).join("·") || "외관 수리";
  const p = await phoneForNotice(db, r.customerId);
  const res = await sendNotice(db, { key: "ready_notice", to: p.to, vars: { 고객명: p.name, 차량번호: v.plateNo, 작업내용: what }, purpose: "수리 완료 안내", customerName: p.name, ref: r.docNo, sentBy: actor.id }, f);
  if (res.ok) await db.update(repairOrder).set({ readyNoticeAt: now, updatedAt: now }).where(eq(repairOrder.id, roId));
  return res;
}

async function approvedEstimateOf(db: Db, roId: string) {
  const [w] = await db.select({ e: workOrder.estimateId }).from(workOrder).where(eq(workOrder.repairOrderId, roId)).orderBy(desc(workOrder.createdAt)).limit(1);
  if (!w) throw new InspectError("작업 지시서가 없습니다");
  const [e] = await db.select().from(estimate).where(eq(estimate.id, w.e));
  return e;
}

/** 정비명세서 발급: 승인한 견적 줄로 금액을 정하고(승인 없는 증가분 없음), 차량·사업자·보증을 이때 값으로 고정 */
export async function issueStatement(db: Db, actor: Actor, roId: string, input: { mileageOut: number | null }, now = new Date()) {
  mustDesk(actor);
  const r = await roRow(db, roId);
  if (r.status !== "ready") throw new InspectError("최종 검사에 합격한 차만 정비명세서를 발급합니다");
  const [old] = await db.select({ id: repairStatement.id }).from(repairStatement).where(eq(repairStatement.repairOrderId, roId));
  if (old) return { id: old.id, created: false };
  if (input.mileageOut == null) throw new InspectError("출고 때 주행거리를 계기판에서 다시 읽어 적어 주세요(STD-04 4.4)");
  if (r.mileage != null && input.mileageOut < r.mileage) throw new InspectError(`출고 주행거리가 입고 때(${r.mileage.toLocaleString("ko-KR")}km)보다 작습니다`);
  const shop = await loadShopInfo(db);
  const missing = shopMissing(shop);
  if (missing.length) throw new InspectError(`설정 › 사업장 정보에 ${missing.join("·")}이(가) 비어 있어 발급할 수 없습니다`);
  const e = await approvedEstimateOf(db, roId);
  const lines = await db.select().from(estimateLine).where(and(eq(estimateLine.estimateId, e.id), eq(estimateLine.approved, true))).orderBy(asc(estimateLine.seq));
  const t = totals(lines);
  const [v] = await db.select().from(vehicle).where(eq(vehicle.id, r.vehicleId));
  const [c] = await db.select({ name: customer.name }).from(customer).where(eq(customer.id, r.customerId));
  const [writer] = await db.select({ name: appUser.name }).from(appUser).where(eq(appUser.id, actor.id));
  const w = await currentWo(db, roId);
  const today = seoulDate(now);
  const p = await loadPolicy(db, today);
  const procs = await processesOf(db, w.id);
  const warranty = [
    procs.some((x) => x === "paint" || x === "sheet") ? { kind: "도장·판금", until: addMonths(today, p["warranty.paint_months"]) } : null,
    procs.includes("dent") ? { kind: "덴트", until: addMonths(today, p["warranty.dent_months"]) } : null,
    procs.includes("polish") && !procs.includes("paint") ? { kind: "광택", until: addMonths(today, p["warranty.polish_months"]) } : null,
  ].filter(Boolean);
  const snapshot = {
    owner: c?.name ?? "",
    plateNo: v.plateNo,
    carName: [v.maker, v.model, v.generation].filter(Boolean).join(" "),
    mileage: input.mileageOut,
    registeredOn: v.registeredOn,
    requestedOn: seoulDate(r.inAt),
    completedOn: w.completedAt ? seoulDate(w.completedAt) : today,
    shop,
    writer: writer?.name ?? null,
    writerSign: await userSignature(db, actor.id),
    estimateNo: e.docNo,
    lines: lines.map((l) => ({ payer: l.payer, category: l.category, name: l.name, partCode: l.partCode, partNo: l.partNo, qty: l.qty, unitWon: l.unitWon, laborWon: l.laborWon })),
    byPayer: { insurance: totals(lines.filter((l) => l.payer === "insurance")).total, general: totals(lines.filter((l) => l.payer !== "insurance")).total },
    warranty,
    legalFreeDays: legalFreeDays(v.registeredOn, input.mileageOut, today),
    noWashDays: p["delivery.no_wash_days"],
  };
  return db.transaction(async (tx) => {
    const docNo = await nextDocNo(tx, "IV", now);
    const [s] = await tx.insert(repairStatement).values({ docNo, repairOrderId: roId, estimateId: e.id, snapshot, partsWon: t.parts, laborWon: t.labor, vatWon: t.vat, totalWon: t.total, mileageOut: input.mileageOut, issuedOn: today, issuedBy: actor.id }).returning({ id: repairStatement.id });
    await tx.update(vehicle).set({ mileage: input.mileageOut, updatedAt: now }).where(eq(vehicle.id, r.vehicleId));
    await writeAudit(tx, { actorId: actor.id, action: "statement.issue", entityType: "repair_order", entityId: r.docNo, after: { docNo, total: t.total } });
    return { id: s.id, created: true };
  });
}

function addMonths(date: string, months: number) {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + months, d));
  return dt.toISOString().slice(0, 10);
}

export type DeliverInput = { payMethod: string; notices: string[]; receiverName: string; proxy: boolean; proxyNote: string; signaturePng: Uint8Array | null };

/** 인도: 안내 확인 4가지, 수납, 인수 서명(대리인이면 위임 확인) → 출고 */
export async function deliver(db: Db, actor: Actor, roId: string, input: DeliverInput, now = new Date()) {
  mustDesk(actor);
  const r = await roRow(db, roId);
  if (r.status !== "ready") throw new InspectError("출고 대기인 차만 인도합니다");
  const [s] = await db.select().from(repairStatement).where(eq(repairStatement.repairOrderId, roId));
  if (!s) throw new InspectError("정비명세서를 먼저 발급합니다");
  if (!(input.payMethod in PAY_METHODS)) throw new InspectError("수납 방법을 골라 주세요");
  const missing = Object.keys(DELIVERY_NOTICES).filter((k) => !input.notices.includes(k));
  if (missing.length) throw new InspectError(`안내 확인 ${missing.length}개가 비었습니다. 고객에게 설명하고 체크해 주세요`);
  if (!input.receiverName.trim()) throw new InspectError("인수하는 분의 이름을 적어 주세요");
  if (input.proxy && !input.proxyNote.trim()) throw new InspectError("대리인이면 위임 확인 방법(고객 문자·전화 확인 등)을 적어 주세요");
  const png = input.signaturePng;
  if (!png?.length || sniffImage(png) !== "image/png" || png.length > 400_000) throw new InspectError("인수 서명을 받아 주세요");
  const sig = await storeFile(`ro/${r.docNo}`, png, "png");
  await db.transaction(async (tx) => {
    await tx
      .update(repairStatement)
      .set({ payMethod: input.payMethod, notices: input.notices, receiverName: input.receiverName.trim(), proxy: input.proxy, proxyNote: input.proxy ? input.proxyNote.trim() : null, signature: sig, deliveredAt: now, deliveredBy: actor.id })
      .where(eq(repairStatement.id, s.id));
    await tx.update(repairOrder).set({ status: "delivered", updatedAt: now }).where(eq(repairOrder.id, roId));
  });
  await writeAudit(db, { actorId: actor.id, action: "repair.deliver", entityType: "repair_order", entityId: r.docNo, after: { statement: s.docNo, pay: input.payMethod, proxy: input.proxy } });
  if (input.payMethod === "receivable") await notifyRole(db, "accounting", `미수 출고: ${r.docNo} ${s.totalWon.toLocaleString("ko-KR")}원 — 수납을 챙기세요(STD-12)`, `ar-${r.docNo}`, `/repairs/${roId}/delivery`);
}

export async function statementOf(db: Db, roId: string) {
  const [s] = await db.select().from(repairStatement).where(eq(repairStatement.repairOrderId, roId));
  return s ?? null;
}

/** 내 할 일: 검사 대기(품질·공장장), 출고 대기(상담원: 완료 안내·인도) */
export async function inspectTodos(db: Db) {
  const rows = await db
    .select({ id: repairOrder.id, docNo: repairOrder.docNo, status: repairOrder.status, readyNoticeAt: repairOrder.readyNoticeAt, plateNo: vehicle.plateNo, customerName: customer.name })
    .from(repairOrder)
    .innerJoin(vehicle, eq(vehicle.id, repairOrder.vehicleId))
    .innerJoin(customer, eq(customer.id, repairOrder.customerId))
    .where(and(eq(repairOrder.status, "inspecting")));
  const ready = await db
    .select({ id: repairOrder.id, docNo: repairOrder.docNo, status: repairOrder.status, readyNoticeAt: repairOrder.readyNoticeAt, plateNo: vehicle.plateNo, customerName: customer.name })
    .from(repairOrder)
    .innerJoin(vehicle, eq(vehicle.id, repairOrder.vehicleId))
    .innerJoin(customer, eq(customer.id, repairOrder.customerId))
    .where(eq(repairOrder.status, "ready"));
  return [...rows, ...ready];
}
