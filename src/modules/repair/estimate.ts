// 견적서(F-03-02, 법정 서식 별지 제89호의3) — STD-03 4·5절.
// 견적은 진단 확인이 끝난 수리 건에서만 만들고, 항목은 진단 줄과 공임 기준표로 채운다(다시 적지 않음).
// 작성(상담원) → 검토 요청 → 검토(전결: 200만 원 이하 공장장, 초과 대표) → 발급(법정 서식) → 고객 승인(다음 단계).
import { and, asc, desc, eq, ne } from "drizzle-orm";
import type { Db } from "@/db/client";
import { appUser, consultation, customer, estimate, estimateLine, repairOrder, roDamage, vehicle } from "@/db/schema";
import type { Role } from "@/modules/auth/roles";
import { rolesOf } from "@/modules/approval/line";
import { ROLE_LABEL } from "@/modules/auth/roles";
import { writeAudit } from "@/modules/platform/audit";
import { resolveApprover } from "@/modules/platform/delegation";
import { nextDocNo } from "@/modules/platform/docno";
import { UserError } from "@/modules/platform/errors";
import { notifyRole } from "@/modules/platform/notify";
import { loadPolicy } from "@/modules/platform/policy";
import { loadShopInfo, shopMissing } from "@/modules/platform/shop";
import { addDays, seoulDate } from "@/modules/platform/time";
import { buildLines, estimateIssues, isLineCategory, isPartCode, totals, type EstimateKind } from "./estimate-rules";
import { isPaintGrade, laborWon, paintWon, partGroup, type PaintGrade } from "./labor";
import { loadLabor } from "./labor-store";

export class EstimateError extends UserError {}

type Actor = { id: string; roles: Role[] };
const WRITERS: Role[] = ["advisor", "plant_manager", "owner"];
const clean = (s: string | null | undefined) => (s ?? "").trim() || null;

async function estRow(db: Db, id: string) {
  const [e] = await db.select().from(estimate).where(eq(estimate.id, id));
  if (!e) throw new EstimateError("없는 견적입니다");
  return e;
}

async function recalc(db: Db, id: string) {
  const lines = await db.select().from(estimateLine).where(eq(estimateLine.estimateId, id));
  const t = totals(lines);
  await db.update(estimate).set({ partsWon: t.parts, laborWon: t.labor, vatWon: t.vat, totalWon: t.total, updatedAt: new Date() }).where(eq(estimate.id, id));
  return t;
}

function mustWrite(actor: Actor) {
  if (!actor.roles.some((r) => WRITERS.includes(r))) throw new EstimateError("견적은 상담원·공장장·대표가 씁니다");
}

function mustDraft(e: { status: string; docNo: string }) {
  if (e.status !== "draft") throw new EstimateError(`${e.docNo}는 ${e.status === "review" ? "검토 중" : "검토가 끝난"} 견적이라 고칠 수 없습니다. 고치려면 검토자가 되돌리거나 새 차수로 씁니다`);
}

/** 진단에서 견적 만들기. 이미 쓰는 중인 견적이 있으면 그것을 돌려준다 */
export async function createEstimate(db: Db, actor: Actor, roId: string, now = new Date()) {
  if (!actor.roles.some((r) => WRITERS.includes(r))) throw new EstimateError("견적은 상담원·공장장·대표가 씁니다");
  const [r] = await db.select().from(repairOrder).where(eq(repairOrder.id, roId));
  if (!r) throw new EstimateError("없는 수리 건입니다");
  if (r.status !== "estimating") throw new EstimateError("공장장이 손상 진단을 확인한 뒤에 견적을 씁니다");
  const [open] = await db.select({ id: estimate.id }).from(estimate).where(and(eq(estimate.repairOrderId, roId), eq(estimate.status, "draft")));
  if (open) return { id: open.id, created: false };
  const prev = await db.select({ rev: estimate.rev }).from(estimate).where(eq(estimate.repairOrderId, roId)).orderBy(desc(estimate.rev)).limit(1);
  const [v] = await db.select().from(vehicle).where(eq(vehicle.id, r.vehicleId));
  const [c] = await db.select({ partsPref: consultation.partsPref }).from(consultation).where(eq(consultation.id, r.consultationId));
  const damages = await db.select().from(roDamage).where(eq(roDamage.repairOrderId, roId)).orderBy(asc(roDamage.seq));
  const kind: EstimateKind = r.insurance === "self" ? "general" : "insurance";
  const grade: PaintGrade = v.options.includes("paint3") ? "tricoat" : "metallic";
  const table = await loadLabor(db, seoulDate(now));
  const lines = buildLines(damages, table, grade, kind, c?.partsPref);
  return db.transaction(async (tx) => {
    const docNo = await nextDocNo(tx, "ES", now);
    const [e] = await tx.insert(estimate).values({ docNo, repairOrderId: roId, rev: (prev[0]?.rev ?? 0) + 1, kind, paintGrade: grade, createdBy: actor.id }).returning({ id: estimate.id });
    if (lines.length) await tx.insert(estimateLine).values(lines.map((l, i) => ({ ...l, estimateId: e.id, seq: i + 1 })));
    await recalc(tx, e.id);
    await writeAudit(tx, { actorId: actor.id, action: "estimate.create", entityType: "estimate", entityId: docNo, after: { ro: r.docNo, lines: lines.length } });
    return { id: e.id, created: true };
  });
}

export type HeaderInput = { kind: string; paintGrade: string; dueDate: string; note: string; registeredOn: string };

/** 머리 칸 저장. 도장 등급이 바뀌면 도장 줄 금액을 다시 계산하고, 등록년월일은 차량 기록에 넣는다(다음 견적에 다시 묻지 않음) */
export async function saveEstimateHeader(db: Db, actor: Actor, id: string, input: HeaderInput, now = new Date()) {
  mustWrite(actor);
  const e = await estRow(db, id);
  mustDraft(e);
  if (input.kind !== "insurance" && input.kind !== "general") throw new EstimateError("견적구분(보험·일반)을 골라 주세요");
  if (!isPaintGrade(input.paintGrade)) throw new EstimateError("도장 등급을 골라 주세요");
  if (input.dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(input.dueDate)) throw new EstimateError("출고 예정일을 다시 골라 주세요");
  if (input.registeredOn && (!/^\d{4}-\d{2}-\d{2}$/.test(input.registeredOn) || input.registeredOn > seoulDate(now))) throw new EstimateError("등록년월일을 확인해 주세요(오늘이나 그 전)");
  const [r] = await db.select().from(repairOrder).where(eq(repairOrder.id, e.repairOrderId));
  if (input.registeredOn) await db.update(vehicle).set({ registeredOn: input.registeredOn, updatedAt: now }).where(eq(vehicle.id, r.vehicleId));
  if (input.paintGrade !== e.paintGrade) {
    const t = await loadLabor(db, seoulDate(now));
    const lines = await db.select().from(estimateLine).where(eq(estimateLine.estimateId, id));
    const damages = await db.select({ id: roDamage.id, part: roDamage.part }).from(roDamage).where(eq(roDamage.repairOrderId, e.repairOrderId));
    for (const l of lines) {
      if (l.laborCode?.startsWith("PNT-")) {
        const d = damages.find((x) => x.id === l.damageId);
        const won = d ? paintWon(partGroup(d.part), input.paintGrade, t) : null;
        if (won != null) await db.update(estimateLine).set({ laborWon: won }).where(eq(estimateLine.id, l.id));
      } else if (l.laborCode === "BLEND") {
        await db.update(estimateLine).set({ laborWon: Math.round((t.BLEND * t[`COEF-${input.paintGrade}`]) / 100 / 10) * 10 }).where(eq(estimateLine.id, l.id));
      }
    }
  }
  if (input.kind !== e.kind) await db.update(estimateLine).set({ payer: input.kind }).where(and(eq(estimateLine.estimateId, id), eq(estimateLine.payer, e.kind)));
  await db.update(estimate).set({ kind: input.kind, paintGrade: input.paintGrade, dueDate: input.dueDate || null, note: clean(input.note), updatedAt: now }).where(eq(estimate.id, id));
  await recalc(db, id);
  await writeAudit(db, { actorId: actor.id, action: "estimate.header", entityType: "estimate", entityId: e.docNo, after: { kind: input.kind, paintGrade: input.paintGrade } });
}

export type LineInput = { id?: string; payer: string; category: string; name: string; partCode: string; partNo: string; qty: number; unitWon: number; laborMinutes: number | null; laborWon: number | null; note: string };

/** 항목 넣기·고치기. 공임은 표준 시간을 주면 시간당 공임으로 계산하고, 금액을 직접 주면 그 금액 */
export async function saveLine(db: Db, actor: Actor, estimateId: string, input: LineInput, now = new Date()) {
  mustWrite(actor);
  const e = await estRow(db, estimateId);
  mustDraft(e);
  if (!isLineCategory(input.category)) throw new EstimateError("항목 구분을 골라 주세요");
  if (!input.name.trim()) throw new EstimateError("항목 이름을 적어 주세요");
  if (input.payer !== "insurance" && input.payer !== "general") throw new EstimateError("보험·일반 구분을 골라 주세요");
  const isPart = input.category === "part";
  if (isPart && !isPartCode(input.partCode)) throw new EstimateError("부품 코드(A·B·C·D·F)를 골라 주세요");
  if (input.qty < 1 || input.qty > 99) throw new EstimateError("수량은 1~99입니다");
  const t = await loadLabor(db, seoulDate(now));
  const minutes = isPart ? 0 : (input.laborMinutes ?? 0);
  const won = isPart ? 0 : input.laborWon != null && input.laborWon > 0 ? input.laborWon : laborWon(minutes, t);
  const values = {
    payer: input.payer,
    category: input.category,
    name: input.name.trim(),
    partCode: isPart ? input.partCode : null,
    partNo: isPart ? clean(input.partNo) : null,
    qty: input.qty,
    unitWon: isPart ? Math.max(0, input.unitWon) : 0,
    laborMinutes: minutes,
    laborWon: won,
    note: clean(input.note),
  };
  if (input.id) {
    const [old] = await db.select().from(estimateLine).where(and(eq(estimateLine.id, input.id), eq(estimateLine.estimateId, estimateId)));
    if (!old) throw new EstimateError("없는 항목입니다");
    await db.update(estimateLine).set(values).where(eq(estimateLine.id, input.id));
  } else {
    const lines = await db.select({ seq: estimateLine.seq }).from(estimateLine).where(eq(estimateLine.estimateId, estimateId));
    await db.insert(estimateLine).values({ ...values, estimateId, seq: Math.max(0, ...lines.map((l) => l.seq)) + 1, laborCode: null, damageId: null });
  }
  await recalc(db, estimateId);
  await writeAudit(db, { actorId: actor.id, action: "estimate.line", entityType: "estimate", entityId: e.docNo, after: { name: values.name, parts: values.qty * values.unitWon, labor: values.laborWon } });
}

export async function removeLine(db: Db, actor: Actor, estimateId: string, lineId: string) {
  mustWrite(actor);
  const e = await estRow(db, estimateId);
  mustDraft(e);
  await db.delete(estimateLine).where(and(eq(estimateLine.id, lineId), eq(estimateLine.estimateId, estimateId)));
  await recalc(db, estimateId);
  await writeAudit(db, { actorId: actor.id, action: "estimate.line_remove", entityType: "estimate", entityId: e.docNo });
}

/** 검토 요청: 빠진 것이 없어야 하고, 전결(부록 B 견적 승인)으로 검토자 역할을 정해 알린다 */
export async function submitEstimate(db: Db, actor: Actor, id: string, now = new Date()) {
  mustWrite(actor);
  const e = await estRow(db, id);
  mustDraft(e);
  const g = await getEstimate(db, id);
  const issues = estimateIssues(g.lines, { registeredOn: g.vehicle.registeredOn, mileage: g.ro.mileage });
  if (issues.length) throw new EstimateError(issues.map((i) => i.msg).join(" / "));
  const role = await resolveApprover(db, "estimate", e.totalWon, actor.roles, seoulDate(now));
  await db.update(estimate).set({ status: "review", updatedAt: now }).where(eq(estimate.id, id));
  await writeAudit(db, { actorId: actor.id, action: "estimate.submit", entityType: "estimate", entityId: e.docNo, after: { total: e.totalWon, reviewer: role } });
  await notifyRole(db, role, `견적 검토: ${e.docNo} ${e.totalWon.toLocaleString("ko-KR")}원`, `est-review-${e.docNo}-${now.getTime()}`, `/repairs/${e.repairOrderId}/estimate/${id}`);
  return role;
}

/** 검토: 승인하면 발급할 수 있고, 되돌리면 작성 중으로 */
export async function reviewEstimate(db: Db, actor: Actor, id: string, ok: boolean, note: string, now = new Date()) {
  const e = await estRow(db, id);
  if (e.status !== "review") throw new EstimateError("검토 요청된 견적이 아닙니다");
  const role = await resolveApprover(db, "estimate", e.totalWon, e.createdBy ? await rolesOf(db, e.createdBy) : [], seoulDate(now));
  if (!actor.roles.includes(role) && !actor.roles.includes("owner")) throw new EstimateError(`이 견적(${e.totalWon.toLocaleString("ko-KR")}원)은 ${ROLE_LABEL[role]}이(가) 검토합니다(전결 규정)`);
  if (!ok && !note.trim()) throw new EstimateError("되돌리는 이유를 적어 주세요");
  await db.update(estimate).set({ status: ok ? "approved" : "draft", reviewedBy: ok ? actor.id : null, reviewedAt: ok ? now : null, note: ok ? e.note : [e.note, `검토 의견: ${note.trim()}`].filter(Boolean).join("\n"), updatedAt: now }).where(eq(estimate.id, id));
  await writeAudit(db, { actorId: actor.id, action: ok ? "estimate.approve" : "estimate.return", entityType: "estimate", entityId: e.docNo, after: { note: note.trim() || null } });
  if (!ok) await notifyRole(db, "advisor", `견적 되돌림: ${e.docNo} — ${note.trim()}`, `est-return-${e.docNo}-${now.getTime()}`, `/repairs/${e.repairOrderId}/estimate/${id}`);
}

/** 발급: 법정 서식의 차량·사업자 칸을 이때 값으로 고정하고 유효기간을 정한다 */
export async function issueEstimate(db: Db, actor: Actor, id: string, now = new Date()) {
  mustWrite(actor);
  const e = await estRow(db, id);
  if (e.status !== "approved") throw new EstimateError("검토가 끝난 견적만 발급합니다");
  const shop = await loadShopInfo(db);
  const missing = shopMissing(shop);
  if (missing.length) throw new EstimateError(`설정 › 사업장 정보에 ${missing.join("·")}이(가) 비어 있어 법정 견적서를 발급할 수 없습니다`);
  const g = await getEstimate(db, id);
  const today = seoulDate(now);
  const policy = await loadPolicy(db, today);
  const snapshot = {
    owner: g.customer.name,
    plateNo: g.vehicle.plateNo,
    carName: [g.vehicle.maker, g.vehicle.model, g.vehicle.generation].filter(Boolean).join(" "),
    mileage: g.ro.mileage,
    registeredOn: g.vehicle.registeredOn,
    vin: g.vehicle.vin,
    shop,
    writer: g.writer,
  };
  await db.update(estimate).set({ status: "sent", issuedOn: today, validUntil: addDays(today, policy["estimate.valid_days"]), snapshot, updatedAt: now }).where(eq(estimate.id, id));
  await writeAudit(db, { actorId: actor.id, action: "estimate.issue", entityType: "estimate", entityId: e.docNo, after: { total: e.totalWon } });
}

export async function getEstimate(db: Db, id: string) {
  const e = await estRow(db, id);
  const [r] = await db.select().from(repairOrder).where(eq(repairOrder.id, e.repairOrderId));
  const [[v], [cu], lines, [w], [rv]] = await Promise.all([
    db.select().from(vehicle).where(eq(vehicle.id, r.vehicleId)),
    db.select({ id: customer.id, name: customer.name }).from(customer).where(eq(customer.id, r.customerId)),
    db.select().from(estimateLine).where(eq(estimateLine.estimateId, id)).orderBy(asc(estimateLine.seq)),
    e.createdBy ? db.select({ name: appUser.name }).from(appUser).where(eq(appUser.id, e.createdBy)) : Promise.resolve([]),
    e.reviewedBy ? db.select({ name: appUser.name }).from(appUser).where(eq(appUser.id, e.reviewedBy)) : Promise.resolve([]),
  ]);
  return { ...e, ro: r, vehicle: v, customer: cu, lines, writer: w?.name ?? null, reviewer: rv?.name ?? null };
}

export const listEstimates = (db: Db, roId: string) => db.select().from(estimate).where(and(eq(estimate.repairOrderId, roId), ne(estimate.status, "void"))).orderBy(desc(estimate.rev));

/** 내 할 일용: 견적이 없는 견적 대기 수리 건, 검토 요청, 작성 중 */
export async function estimateTodos(db: Db) {
  const ros = await db.select({ id: repairOrder.id, docNo: repairOrder.docNo }).from(repairOrder).where(eq(repairOrder.status, "estimating"));
  const out: { kind: "write" | "review" | "draft"; roId: string; id?: string; label: string; total: number; reviewer?: Role }[] = [];
  for (const r of ros) {
    const es = await db.select().from(estimate).where(and(eq(estimate.repairOrderId, r.id), ne(estimate.status, "void")));
    if (!es.length) out.push({ kind: "write", roId: r.id, label: r.docNo, total: 0 });
    for (const e of es) {
      if (e.status === "review") out.push({ kind: "review", roId: r.id, id: e.id, label: `${e.docNo}(${r.docNo})`, total: e.totalWon, reviewer: await resolveApprover(db, "estimate", e.totalWon, e.createdBy ? await rolesOf(db, e.createdBy) : []) });
      if (e.status === "draft") out.push({ kind: "draft", roId: r.id, id: e.id, label: `${e.docNo}(${r.docNo})`, total: e.totalWon });
    }
  }
  return out;
}
