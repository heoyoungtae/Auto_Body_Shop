// 보험 청구(STD-03 6절 보험 수리 절차 → STD-12 수납): 접수 확인 → 손해사정 요청 → 승인 범위 → (작업) → 청구 → 입금 확인.
// 보험사·사고접수번호는 상담·수리 건에서 불러오고, 금액은 견적(승인 줄)·정비명세서에서 불러온다(다시 치지 않음).
import { rolesFor } from "@/modules/auth/permissions";
import { and, desc, eq, inArray, ne } from "drizzle-orm";
import type { Db } from "@/db/client";
import { customer, estimate, estimateLine, insuranceClaim, payment, repairOrder, repairStatement, vehicle } from "@/db/schema";
import { assertOpenDay } from "@/modules/money/lock";
import type { Role } from "@/modules/auth/roles";
import { writeAudit } from "@/modules/platform/audit";
import { loadShopCalendar } from "@/modules/platform/calendar";
import { nextDocNo } from "@/modules/platform/docno";
import { UserError } from "@/modules/platform/errors";
import { notifyRole } from "@/modules/platform/notify";
import { seoulDate } from "@/modules/platform/time";
import { CLAIM_DOCS, claimDeadlines, isCoverage, splitClaim, type ClaimStatusKey } from "./claim-rules";
import { totals } from "./estimate-rules";

export class ClaimError extends UserError {}
type Actor = { id: string; roles: Role[] };
const DESK: Role[] = rolesFor("claim.desk");
const MONEY: Role[] = rolesFor("claim.money");
const must = (a: Actor, roles: Role[], msg: string) => {
  if (!a.roles.some((r) => roles.includes(r))) throw new ClaimError(msg);
};

async function roRow(db: Db, roId: string) {
  const [r] = await db.select().from(repairOrder).where(eq(repairOrder.id, roId));
  if (!r) throw new ClaimError("없는 수리 건입니다");
  if (r.insurance === "self") throw new ClaimError("보험 수리가 아닙니다. 상담·수리 건의 보험 구분이 '자비'입니다");
  return r;
}

async function claimRow(db: Db, roId: string) {
  const [c] = await db.select().from(insuranceClaim).where(eq(insuranceClaim.repairOrderId, roId));
  return c ?? null;
}

async function mustClaim(db: Db, roId: string) {
  const c = await claimRow(db, roId);
  if (!c) throw new ClaimError("1단계 접수 정보(보험사·사고접수번호·자기부담금)를 먼저 저장해 주세요");
  return c;
}

/** 금액 출처: 정비명세서가 있으면 명세서(발급 때 고정), 없으면 고객 승인한 견적의 승인 줄 */
async function amountSource(db: Db, roId: string) {
  const [st] = await db.select().from(repairStatement).where(eq(repairStatement.repairOrderId, roId));
  const by = (st?.snapshot as { byPayer?: { insurance: number; general: number } } | undefined)?.byPayer;
  if (st && by) return { insuranceWon: by.insurance, generalWon: by.general, from: `정비명세서 ${st.docNo}`, statement: st };
  const [e] = await db
    .select()
    .from(estimate)
    .where(and(eq(estimate.repairOrderId, roId), ne(estimate.status, "void")))
    .orderBy(desc(estimate.rev))
    .limit(1);
  if (!e) return { insuranceWon: 0, generalWon: 0, from: null, statement: st ?? null };
  const lines = await db.select().from(estimateLine).where(eq(estimateLine.estimateId, e.id));
  const use = e.status === "accepted" || e.status === "partial" ? lines.filter((l) => l.approved !== false) : lines;
  return {
    insuranceWon: totals(use.filter((l) => l.payer === "insurance")).total,
    generalWon: totals(use.filter((l) => l.payer !== "insurance")).total,
    from: `견적 ${e.docNo}${e.status === "accepted" || e.status === "partial" ? "(승인 줄)" : "(아직 고객 승인 전)"}`,
    statement: st ?? null,
  };
}

/** 청구 화면 한 장에 필요한 것: 기록·금액 나누기·기한 */
export async function claimView(db: Db, roId: string) {
  const r = await roRow(db, roId);
  const c = await claimRow(db, roId);
  const src = await amountSource(db, roId);
  const split = splitClaim({ insuranceWon: src.insuranceWon, generalWon: src.generalWon, adjustedWon: c?.adjustedWon ?? null, deductibleWon: c?.deductibleWon ?? 0, customerExtraWon: c?.customerExtraWon ?? 0 });
  const cal = await loadShopCalendar(db);
  const deliveredDate = src.statement?.deliveredAt ? seoulDate(src.statement.deliveredAt) : null;
  const due = claimDeadlines({ inDate: seoulDate(r.inAt), deliveredDate, claimedDate: c?.claimedAt ? seoulDate(c.claimedAt) : null }, cal);
  return { ro: r, claim: c, status: (c?.status ?? "none") as ClaimStatusKey, amounts: { ...src, ...split }, due, deliveredDate };
}

export type ClaimInfoInput = { insurer: string; claimNo: string; coverage: string; faultPct: number | null; deductibleWon: number | null; adjusterName: string; adjusterPhone: string };

/** 1. 접수 확인: 보험사·사고접수번호·담보·과실·자기부담금·손해사정사. 수리 건의 보험사·접수번호도 같이 고친다 */
export async function saveClaimInfo(db: Db, actor: Actor, roId: string, input: ClaimInfoInput, now = new Date()) {
  must(actor, DESK, "보험 접수 정보는 상담원·공장장·대표가 적습니다");
  const r = await roRow(db, roId);
  const insurer = input.insurer.trim();
  const claimNo = input.claimNo.trim();
  if (!insurer) throw new ClaimError("보험사를 적어 주세요");
  if (!claimNo) throw new ClaimError("사고접수번호를 적어 주세요(보험사 접수 문자·고객에게 확인)");
  if (!isCoverage(input.coverage)) throw new ClaimError("담보(자차·대물)를 골라 주세요");
  if (input.faultPct != null && (input.faultPct < 0 || input.faultPct > 100)) throw new ClaimError("과실 비율은 0~100%입니다");
  if (input.deductibleWon == null) throw new ClaimError("자기부담금을 적어 주세요. 없으면 0입니다(대물은 보통 0)");
  if (input.deductibleWon < 0) throw new ClaimError("자기부담금은 0 이상입니다");
  const values = { insurer, claimNo, coverage: input.coverage, faultPct: input.faultPct, deductibleWon: input.deductibleWon, adjusterName: input.adjusterName.trim() || null, adjusterPhone: input.adjusterPhone.trim() || null, updatedAt: now };
  const old = await claimRow(db, roId);
  if (old) {
    if (old.status === "paid") throw new ClaimError("입금까지 끝난 청구는 고칠 수 없습니다");
    await db.update(insuranceClaim).set(values).where(eq(insuranceClaim.id, old.id));
  } else {
    await db.insert(insuranceClaim).values({ ...values, docNo: await nextDocNo(db, "CH", now), repairOrderId: roId, createdBy: actor.id });
  }
  await db.update(repairOrder).set({ insurer, claimNo, insurance: input.coverage, updatedAt: now }).where(eq(repairOrder.id, roId));
  await writeAudit(db, { actorId: actor.id, action: "claim.info", entityType: "repair_order", entityId: r.docNo, after: { insurer, claimNo, coverage: input.coverage, faultPct: input.faultPct, deductible: input.deductibleWon } });
}

/** 2. 손해사정 요청: 손상 사진·견적을 보냈고 현장 확인 일정을 잡았음을 남긴다 */
export async function markRequested(db: Db, actor: Actor, roId: string, note: string, now = new Date()) {
  must(actor, DESK, "손해사정 요청은 상담원·공장장·대표가 합니다");
  const r = await roRow(db, roId);
  const c = await mustClaim(db, roId);
  if (!note.trim()) throw new ClaimError("무엇을 어떻게 보냈는지 적어 주세요(예: 손상 사진 12장·견적서 전송, 11/10 현장 확인)");
  await db.update(insuranceClaim).set({ requestedAt: now, requestedBy: actor.id, requestNote: note.trim(), status: c.status === "info" ? "requested" : c.status, updatedAt: now }).where(eq(insuranceClaim.id, c.id));
  await writeAudit(db, { actorId: actor.id, action: "claim.request", entityType: "repair_order", entityId: r.docNo, after: { note: note.trim() } });
}

/** 3. 승인 범위 확인: 보험사 손해사정 금액, 미승인 항목 중 고객이 내기로 합의한 금액 */
export async function saveScope(db: Db, actor: Actor, roId: string, input: { adjustedWon: number | null; customerExtraWon: number | null; agreed: boolean; note: string }, now = new Date()) {
  must(actor, DESK, "승인 범위 확인은 상담원·공장장·대표가 합니다");
  const r = await roRow(db, roId);
  const c = await mustClaim(db, roId);
  if (!c.requestedAt) throw new ClaimError("2단계 손해사정 요청을 먼저 기록해 주세요");
  if (c.status === "claimed" || c.status === "paid") throw new ClaimError("이미 청구한 뒤에는 승인 범위를 고칠 수 없습니다");
  if (input.adjustedWon == null || input.adjustedWon < 0) throw new ClaimError("보험사가 정한 손해사정 금액(부가세 포함)을 적어 주세요");
  const extra = input.customerExtraWon ?? 0;
  const src = await amountSource(db, roId);
  const unapproved = Math.max(0, src.insuranceWon - input.adjustedWon);
  if (extra < 0 || extra > unapproved) throw new ClaimError(`고객 부담 합의 금액은 0 ~ 미승인 금액 ${unapproved.toLocaleString("ko-KR")}원 사이입니다`);
  if (extra > 0 && !input.agreed) throw new ClaimError("미승인 금액을 고객이 내기로 했으면, 고객과 합의했다는 칸에 체크해 주세요(STD-03 6절 3단계)");
  if (unapproved > 0 && !input.note.trim()) throw new ClaimError("보험사가 인정하지 않은 항목과 이유를 적어 주세요(공임 기준표 연말 개정 자료)");
  await db.update(insuranceClaim).set({ adjustedWon: input.adjustedWon, customerExtraWon: extra, scopeNote: input.note.trim() || null, scopedAt: now, scopedBy: actor.id, status: "scoped", updatedAt: now }).where(eq(insuranceClaim.id, c.id));
  await writeAudit(db, { actorId: actor.id, action: "claim.scope", entityType: "repair_order", entityId: r.docNo, after: { adjusted: input.adjustedWon, customerExtra: extra, unapproved } });
}

/** 5. 청구: 출고 뒤, 서류를 모두 갖춰 보험사에 낸다. 청구 금액은 보험사 몫(손해사정 금액 − 자기부담금)에서 시작 */
export async function submitClaim(db: Db, actor: Actor, roId: string, input: { claimedWon: number | null; docs: string[] }, now = new Date()) {
  must(actor, DESK, "청구는 상담원·공장장·대표가 합니다");
  const v = await claimView(db, roId);
  const c = v.claim;
  if (!c) throw new ClaimError("1단계 접수 정보를 먼저 저장해 주세요");
  if (c.status !== "scoped") throw new ClaimError(c.status === "claimed" || c.status === "paid" ? "이미 청구했습니다" : "3단계 승인 범위 확인을 먼저 해 주세요");
  if (v.ro.status !== "delivered") throw new ClaimError("출고(인수 서명)한 뒤에 청구합니다. 정비명세서가 청구 서류에 들어갑니다");
  const missing = Object.keys(CLAIM_DOCS).filter((k) => !input.docs.includes(k));
  if (missing.length) throw new ClaimError(`청구 서류 ${missing.length}가지가 빠졌습니다: ${missing.map((k) => CLAIM_DOCS[k as keyof typeof CLAIM_DOCS]).join(", ")}`);
  const claimed = input.claimedWon ?? v.amounts.insurerDue;
  if (claimed <= 0) throw new ClaimError("청구 금액을 확인해 주세요");
  if (claimed > v.amounts.insurerDue) throw new ClaimError(`청구 금액이 보험사 몫(${v.amounts.insurerDue.toLocaleString("ko-KR")}원)보다 큽니다. 손해사정 금액을 넘는 청구는 과다 청구입니다(STD-03 6절)`);
  await db.update(insuranceClaim).set({ claimedWon: claimed, docs: input.docs, claimedAt: now, claimedBy: actor.id, status: "claimed", updatedAt: now }).where(eq(insuranceClaim.id, c.id));
  await writeAudit(db, { actorId: actor.id, action: "claim.submit", entityType: "repair_order", entityId: v.ro.docNo, after: { claimed, docs: input.docs } });
  await notifyRole(db, "accounting", `보험 청구: ${c.docNo} ${c.insurer} ${claimed.toLocaleString("ko-KR")}원 — 입금을 확인해 주세요`, `claim-${c.docNo}`, `/repairs/${roId}/claim`);
}

/** 6. 입금 확인(회계): 받은 금액, 덜 받았으면 감액 사유 */
export async function recordPayment(db: Db, actor: Actor, roId: string, input: { paidOn: string; paidWon: number | null; cutReason: string }, now = new Date()) {
  must(actor, MONEY, "입금 확인은 회계 담당·대표가 합니다");
  const r = await roRow(db, roId);
  const c = await mustClaim(db, roId);
  if (c.status !== "claimed") throw new ClaimError(c.status === "paid" ? "이미 입금을 확인했습니다" : "청구한 건만 입금을 확인합니다");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.paidOn) || input.paidOn > seoulDate(now)) throw new ClaimError("입금일을 확인해 주세요(오늘이나 그 전)");
  if (input.paidWon == null || input.paidWon <= 0) throw new ClaimError("입금된 금액을 적어 주세요");
  if (input.paidWon > c.claimedWon!) throw new ClaimError("청구 금액보다 많이 들어왔습니다. 금액을 확인하고, 맞으면 보험사에 확인해 주세요");
  const cut = c.claimedWon! - input.paidWon;
  if (cut > 0 && !input.cutReason.trim()) throw new ClaimError(`${cut.toLocaleString("ko-KR")}원 덜 들어왔습니다. 보험사가 알려 준 감액 사유를 적어 주세요(공임 기준표 개정 자료)`);
  await assertOpenDay(db, input.paidOn);
  // 입금 확인과 함께 입금 전표(PM)를 남긴다(대표 지시 2026-11-12). 금액·날짜·보험사는 위 입금 확인 값을 그대로 쓴다
  const voucherNo = await nextDocNo(db, "PM", now);
  await db.insert(payment).values({ docNo: voucherNo, repairOrderId: roId, method: "transfer", amountWon: input.paidWon, receivedOn: input.paidOn, receiptKind: "none", payerName: c.insurer, note: `보험 청구 ${c.docNo} 입금${cut > 0 ? `(감액 ${cut.toLocaleString("ko-KR")}원)` : ""}`, payer: "insurer", createdBy: actor.id, createdAt: now });
  await db.update(insuranceClaim).set({ paidOn: input.paidOn, paidWon: input.paidWon, cutWon: cut, cutReason: cut > 0 ? input.cutReason.trim() : null, paidBy: actor.id, status: "paid", updatedAt: now }).where(eq(insuranceClaim.id, c.id));
  await writeAudit(db, { actorId: actor.id, action: "claim.paid", entityType: "repair_order", entityId: r.docNo, after: { paid: input.paidWon, cut, voucher: voucherNo } });
  if (cut > 0) await notifyRole(db, "owner", `보험 감액: ${c.docNo} ${c.insurer} ${cut.toLocaleString("ko-KR")}원 — ${input.cutReason.trim()}`, `claim-cut-${c.docNo}`, `/repairs/${roId}/claim`);
  return voucherNo;
}

/** 30일 미입금 독촉 기록 */
export async function recordDun(db: Db, actor: Actor, roId: string, note: string, now = new Date()) {
  must(actor, MONEY, "독촉 기록은 회계 담당·대표가 합니다");
  const c = await mustClaim(db, roId);
  if (c.status !== "claimed") throw new ClaimError("입금 대기 중인 청구만 독촉합니다");
  if (!note.trim()) throw new ClaimError("누구에게 어떻게 독촉했는지 적어 주세요");
  await db.update(insuranceClaim).set({ dunnedAt: now, dunNote: note.trim(), updatedAt: now }).where(eq(insuranceClaim.id, c.id));
  await writeAudit(db, { actorId: actor.id, action: "claim.dun", entityType: "insurance_claim", entityId: c.docNo, after: { note: note.trim() } });
}

/** 보험 수리 건 목록(청구 진행 상황). f: open 진행 중, all 전체 */
export async function listClaims(db: Db, f: "open" | "all" = "open") {
  const rows = await db
    .select({ ro: repairOrder, plateNo: vehicle.plateNo, customerName: customer.name })
    .from(repairOrder)
    .innerJoin(vehicle, eq(vehicle.id, repairOrder.vehicleId))
    .innerJoin(customer, eq(customer.id, repairOrder.customerId))
    .where(and(ne(repairOrder.insurance, "self"), ne(repairOrder.status, "cancelled")))
    .orderBy(desc(repairOrder.inAt));
  if (!rows.length) return [];
  const claims = await db.select().from(insuranceClaim).where(inArray(insuranceClaim.repairOrderId, rows.map((r) => r.ro.id)));
  const out = rows.map((r) => ({ ...r, claim: claims.find((c) => c.repairOrderId === r.ro.id) ?? null }));
  return f === "all" ? out : out.filter((r) => r.claim?.status !== "paid");
}

/** 내 할 일: 접수 정보·손해사정 요청(입고 후 1영업일)·청구(출고 후 3영업일)·30일 미입금 */
export async function claimTodos(db: Db, now = new Date()) {
  const today = seoulDate(now);
  const cal = await loadShopCalendar(db);
  const out: { id: string; docNo: string; who: string; kind: "info" | "request" | "scope" | "claim" | "dun"; due: string | null; late: boolean }[] = [];
  for (const r of await listClaims(db, "open")) {
    const who = `${r.ro.docNo} ${r.customerName} ${r.plateNo}`;
    const c = r.claim;
    const [st] = r.ro.status === "delivered" ? await db.select({ at: repairStatement.deliveredAt }).from(repairStatement).where(eq(repairStatement.repairOrderId, r.ro.id)) : [];
    const due = claimDeadlines({ inDate: seoulDate(r.ro.inAt), deliveredDate: st?.at ? seoulDate(st.at) : null, claimedDate: c?.claimedAt ? seoulDate(c.claimedAt) : null }, cal);
    const push = (kind: (typeof out)[number]["kind"], d: string | null) => out.push({ id: r.ro.id, docNo: r.ro.docNo, who, kind, due: d, late: !!d && d < today });
    if (!c) push("info", seoulDate(r.ro.inAt));
    else if (c.status === "info") push("request", due.requestBy);
    else if (c.status === "requested") push("scope", null);
    else if (c.status === "scoped" && r.ro.status === "delivered") push("claim", due.claimBy);
    else if (c.status === "claimed" && due.dunFrom && due.dunFrom <= today && !(c.dunnedAt && seoulDate(c.dunnedAt) > addDaysIso(today, -7))) push("dun", due.dunFrom);
  }
  return out;
}

const addDaysIso = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);

/** 수리 건의 청구 기록(없으면 null). 보험 건이 아니어도 오류 없이 null */
export const claimOf = (db: Db, roId: string) => claimRow(db, roId);
