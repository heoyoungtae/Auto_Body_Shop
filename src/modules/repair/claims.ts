// 보험 청구(STD-03 6절 보험 수리 절차 → STD-12 수납): 접수 확인 → 손해사정 요청 → 승인 범위 → (작업) → 청구 → 입금 확인.
// 보험사·사고접수번호는 상담·수리 건에서 불러오고, 금액은 견적(승인 줄)·정비명세서에서 불러온다(다시 치지 않음).
// 한 수리 건에 청구처(보험사)가 여럿일 수 있다(쌍방 과실: 자차 + 상대 대물). seq 1이 처음 보험사.
// AOS 참고 보강(2026-11-23 대표 결정): 정산 공제, 줄마다 인정 금액·동의/이의 제기, 미결 연락 이력, AOS 진행 칸.
import { rolesFor } from "@/modules/auth/permissions";
import { and, asc, desc, eq, inArray, ne } from "drizzle-orm";
import type { Db } from "@/db/client";
import { appUser, claimNote, customer, estimate, estimateLine, insuranceClaim, payment, repairOrder, repairStatement, vehicle, type LineAdjust } from "@/db/schema";
import { assertOpenDay } from "@/modules/money/lock";
import type { Role } from "@/modules/auth/roles";
import { writeAudit } from "@/modules/platform/audit";
import { loadShopCalendar } from "@/modules/platform/calendar";
import { addBusinessDays } from "@/modules/platform/business-days";
import { branchDocNo, nextDocNo } from "@/modules/platform/docno";
import { UserError } from "@/modules/platform/errors";
import { notifyRole } from "@/modules/platform/notify";
import { seoulDate } from "@/modules/platform/time";
import { AOS_STEPS, CLAIM_DOCS, adjustedFromLines, claimDeadlines, isAosStep, isCoverage, splitClaims, type ClaimStatusKey } from "./claim-rules";
import { totals } from "./estimate-rules";
import { aosEnabled, insurerByName } from "./insurers";

export class ClaimError extends UserError {}
type Actor = { id: string; roles: Role[] };
const DESK: Role[] = rolesFor("claim.desk");
const MONEY: Role[] = rolesFor("claim.money");
const must = (a: Actor, roles: Role[], msg: string) => {
  if (!a.roles.some((r) => roles.includes(r))) throw new ClaimError(msg);
};
type ClaimRow = typeof insuranceClaim.$inferSelect;

async function roRow(db: Db, roId: string) {
  const [r] = await db.select().from(repairOrder).where(eq(repairOrder.id, roId));
  if (!r) throw new ClaimError("없는 수리 건입니다");
  if (r.insurance === "self") throw new ClaimError("보험 수리가 아닙니다. 상담·수리 건의 보험 구분이 '자비'입니다");
  return r;
}

const claimsOfRo = (db: Db, roId: string) => db.select().from(insuranceClaim).where(eq(insuranceClaim.repairOrderId, roId)).orderBy(asc(insuranceClaim.seq));

async function claimRow(db: Db, roId: string, seq = 1) {
  const [c] = await db.select().from(insuranceClaim).where(and(eq(insuranceClaim.repairOrderId, roId), eq(insuranceClaim.seq, seq)));
  return c ?? null;
}

async function mustClaim(db: Db, roId: string, seq = 1) {
  const c = await claimRow(db, roId, seq);
  if (!c) throw new ClaimError("1단계 접수 정보(보험사·사고접수번호·자기부담금)를 먼저 저장해 주세요");
  return c;
}

const money = (c: ClaimRow) => ({
  adjustedWon: c.adjustedWon,
  deductibleWon: c.deductibleWon,
  customerExtraWon: c.customerExtraWon,
  depreciationWon: c.depreciationWon,
  partsDiscountWon: c.partsDiscountWon,
  salvageWon: c.salvageWon,
  otherDeductWon: c.otherDeductWon,
  otherDeductPayer: c.otherDeductPayer,
});

/** 금액 출처: 정비명세서가 있으면 명세서(발급 때 고정), 없으면 고객 승인한 견적의 승인 줄. 보험 줄 목록(줄마다 인정 금액 적기용)은 견적에서 */
async function amountSource(db: Db, roId: string) {
  const [st] = await db.select().from(repairStatement).where(eq(repairStatement.repairOrderId, roId));
  const [e] = await db
    .select()
    .from(estimate)
    .where(and(eq(estimate.repairOrderId, roId), ne(estimate.status, "void")))
    .orderBy(desc(estimate.rev))
    .limit(1);
  const lines = e ? await db.select().from(estimateLine).where(eq(estimateLine.estimateId, e.id)).orderBy(asc(estimateLine.seq)) : [];
  const ok = e && (e.status === "accepted" || e.status === "partial");
  const use = ok ? lines.filter((l) => l.approved !== false) : lines;
  const ins = use.filter((l) => l.payer === "insurance");
  const insLines = ins.map((l) => ({ id: l.id, name: l.name, category: l.category, amount: l.qty * l.unitWon + l.laborWon }));
  const insPartsWon = ins.filter((l) => l.category === "part").reduce((s, l) => s + l.qty * l.unitWon, 0);
  const by = (st?.snapshot as { byPayer?: { insurance: number; general: number } } | undefined)?.byPayer;
  if (st && by) return { insuranceWon: by.insurance, generalWon: by.general, from: `정비명세서 ${st.docNo}`, statement: st, insLines, insPartsWon };
  if (!e) return { insuranceWon: 0, generalWon: 0, from: null, statement: st ?? null, insLines, insPartsWon };
  return {
    insuranceWon: totals(ins).total,
    generalWon: totals(use.filter((l) => l.payer !== "insurance")).total,
    from: `견적 ${e.docNo}${ok ? "(승인 줄)" : "(아직 고객 승인 전)"}`,
    statement: st ?? null,
    insLines,
    insPartsWon,
  };
}

/**
 * 청구 화면 한 장에 필요한 것: 고른 청구처(seq)의 기록, 모든 청구처를 합친 금액 나누기, 기한, 연락 이력.
 * amounts.insurerDue 는 고른 청구처 몫, insurerDueTotal 은 모든 보험사 몫 합계.
 */
export async function claimView(db: Db, roId: string, seq = 1) {
  const r = await roRow(db, roId);
  const claims = await claimsOfRo(db, roId);
  const c = claims.find((x) => x.seq === seq) ?? null;
  const src = await amountSource(db, roId);
  const split = splitClaims({ insuranceWon: src.insuranceWon, generalWon: src.generalWon, claims: claims.map(money) });
  const idx = c ? claims.indexOf(c) : 0;
  const cal = await loadShopCalendar(db);
  const deliveredDate = src.statement?.deliveredAt ? seoulDate(src.statement.deliveredAt) : null;
  const due = claimDeadlines({ inDate: seoulDate(r.inAt), deliveredDate, claimedDate: c?.claimedAt ? seoulDate(c.claimedAt) : null }, cal);
  const notes = c
    ? await db
        .select({ n: claimNote, byName: appUser.name })
        .from(claimNote)
        .leftJoin(appUser, eq(appUser.id, claimNote.by))
        .where(eq(claimNote.claimId, c.id))
        .orderBy(desc(claimNote.at))
    : [];
  const ins = await insurerByName(db, c?.insurer ?? r.insurer);
  return {
    ro: r,
    claim: c,
    claims: claims.map((x, i) => ({ ...x, adjustedEst: split.per[i].adjusted, insurerDue: split.per[i].insurerDue })),
    seq,
    nextSeq: (claims.at(-1)?.seq ?? 0) + 1,
    status: (c?.status ?? "none") as ClaimStatusKey,
    amounts: {
      ...src,
      adjusted: split.per[idx]?.adjusted ?? split.adjusted,
      insurerDue: split.per[idx]?.insurerDue ?? split.insurerDue,
      insurerDueTotal: split.insurerDue,
      adjustedTotal: split.adjusted,
      customerDue: split.customerDue,
      unapproved: split.unapproved,
      shopLoss: split.shopLoss,
      shopDeduct: split.shopDeduct,
      deductibleTotal: claims.reduce((s, x) => s + x.deductibleWon, 0),
      extraTotal: claims.reduce((s, x) => s + x.customerExtraWon, 0),
      depreciationTotal: claims.reduce((s, x) => s + x.depreciationWon, 0),
    },
    due,
    deliveredDate,
    notes: notes.map((x) => ({ ...x.n, byName: x.byName ?? "" })),
    insurer: ins,
    aos: await aosEnabled(db),
  };
}

export type ClaimInfoInput = { insurer: string; claimNo: string; coverage: string; faultPct: number | null; deductibleWon: number | null; adjusterName: string; adjusterPhone: string };

/** 1. 접수 확인: 보험사·사고접수번호·담보·과실·자기부담금(면책금)·손해사정사. 첫 청구처는 수리 건의 보험사·접수번호도 같이 고친다 */
export async function saveClaimInfo(db: Db, actor: Actor, roId: string, input: ClaimInfoInput, now = new Date(), seq = 1) {
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
  if (!Number.isInteger(seq) || seq < 1) throw new ClaimError("청구처 번호가 잘못됐습니다");
  const all = await claimsOfRo(db, roId);
  const old = all.find((x) => x.seq === seq) ?? null;
  if (!old && seq !== (all.at(-1)?.seq ?? 0) + 1) throw new ClaimError("청구처는 차례로 더합니다");
  if (all.some((x) => x.seq !== seq && x.insurer === insurer && x.claimNo === claimNo)) throw new ClaimError("같은 보험사·사고접수번호의 청구처가 이미 있습니다");
  const ins = await insurerByName(db, insurer);
  const values = { insurer: ins?.name ?? insurer, insurerId: ins?.id ?? null, claimNo, coverage: input.coverage, faultPct: input.faultPct, deductibleWon: input.deductibleWon, adjusterName: input.adjusterName.trim() || null, adjusterPhone: input.adjusterPhone.trim() || null, updatedAt: now };
  if (old) {
    if (old.status === "paid") throw new ClaimError("입금까지 끝난 청구는 고칠 수 없습니다");
    await db.update(insuranceClaim).set(values).where(eq(insuranceClaim.id, old.id));
  } else {
    await db.insert(insuranceClaim).values({ ...values, seq, docNo: await nextDocNo(db, "CH", now), repairOrderId: roId, createdBy: actor.id });
  }
  if (seq === 1) await db.update(repairOrder).set({ insurer: values.insurer, claimNo, insurance: input.coverage, updatedAt: now }).where(eq(repairOrder.id, roId));
  await writeAudit(db, { actorId: actor.id, action: "claim.info", entityType: "repair_order", entityId: r.docNo, after: { seq, insurer: values.insurer, claimNo, coverage: input.coverage, faultPct: input.faultPct, deductible: input.deductibleWon } });
}

/** 2. 손해사정 요청: 손상 사진·견적을 보냈고 현장 확인 일정을 잡았음을 남긴다 */
export async function markRequested(db: Db, actor: Actor, roId: string, note: string, now = new Date(), seq = 1) {
  must(actor, DESK, "손해사정 요청은 상담원·공장장·대표가 합니다");
  const r = await roRow(db, roId);
  const c = await mustClaim(db, roId, seq);
  if (!note.trim()) throw new ClaimError("무엇을 어떻게 보냈는지 적어 주세요(예: 손상 사진 12장·견적서 전송, 11/10 현장 확인)");
  await db.update(insuranceClaim).set({ requestedAt: now, requestedBy: actor.id, requestNote: note.trim(), status: c.status === "info" ? "requested" : c.status, updatedAt: now }).where(eq(insuranceClaim.id, c.id));
  await writeAudit(db, { actorId: actor.id, action: "claim.request", entityType: "repair_order", entityId: r.docNo, after: { seq, note: note.trim() } });
}

export type ScopeInput = {
  adjustedWon: number | null;
  customerExtraWon: number | null;
  agreed: boolean;
  note: string;
  /** 정산 공제(없으면 0) */
  depreciationWon?: number | null;
  partsDiscountWon?: number | null;
  salvageWon?: number | null;
  otherDeductWon?: number | null;
  otherDeductPayer?: string;
  otherDeductNote?: string;
  /** 보험사가 줄마다 인정한 금액(부가세 별도). 비운 줄은 전액 인정 */
  lineAdjust?: LineAdjust;
  /** 손해사정 결과에 대한 입장: agreed 동의 · disputed 이의 제기 */
  dispute?: "agreed" | "disputed";
  disputeNote?: string;
};

/** 3. 승인 범위 확인(정산): 보험사 손해사정 금액, 줄마다 인정 금액, 공제, 미승인분 중 고객 부담 합의, 동의/이의 제기 */
export async function saveScope(db: Db, actor: Actor, roId: string, input: ScopeInput, now = new Date(), seq = 1) {
  must(actor, DESK, "승인 범위 확인은 상담원·공장장·대표가 합니다");
  const r = await roRow(db, roId);
  const c = await mustClaim(db, roId, seq);
  if (!c.requestedAt) throw new ClaimError("2단계 손해사정 요청을 먼저 기록해 주세요");
  if (c.status === "claimed" || c.status === "paid") throw new ClaimError("이미 청구한 뒤에는 승인 범위를 고칠 수 없습니다");
  const src = await amountSource(db, roId);
  const lineAdjust: LineAdjust = {};
  for (const [id, v] of Object.entries(input.lineAdjust ?? {})) {
    const l = src.insLines.find((x) => x.id === id);
    if (!l) continue;
    if (!Number.isFinite(v.won) || v.won < 0) throw new ClaimError(`${l.name}: 인정 금액은 0 이상입니다`);
    if (v.won > l.amount) throw new ClaimError(`${l.name}: 인정 금액이 우리 견적(${l.amount.toLocaleString("ko-KR")}원)보다 큽니다`);
    if (v.won < l.amount) lineAdjust[id] = { won: v.won, note: v.note?.trim() || undefined };
  }
  const adjusted = input.adjustedWon ?? (Object.keys(lineAdjust).length ? adjustedFromLines(src.insuranceWon, src.insLines, lineAdjust) : null);
  if (adjusted == null || adjusted < 0) throw new ClaimError("보험사가 정한 손해사정 금액(부가세 포함)을 적어 주세요");
  const nz = (n: number | null | undefined, what: string) => {
    const v = n ?? 0;
    if (v < 0) throw new ClaimError(`${what}은 0 이상입니다`);
    return v;
  };
  const dep = nz(input.depreciationWon, "감가상각");
  const disc = nz(input.partsDiscountWon, "부품 할인");
  const salv = nz(input.salvageWon, "잔존물");
  const other = nz(input.otherDeductWon, "기타 공제");
  const otherPayer = input.otherDeductPayer === "customer" ? "customer" : "shop";
  if (other > 0 && !input.otherDeductNote?.trim()) throw new ClaimError("기타 공제가 무엇인지 적어 주세요");
  if (c.deductibleWon + dep + disc + salv + other > adjusted) throw new ClaimError("자기부담금과 공제를 합친 금액이 손해사정 금액보다 큽니다. 금액을 확인해 주세요");
  // 다른 청구처까지 합친 미승인분 안에서만 고객 부담을 합의한다
  const others = (await claimsOfRo(db, roId)).filter((x) => x.seq !== seq);
  const otherAdjusted = others.reduce((s, x) => s + (x.adjustedWon ?? 0), 0);
  const otherExtra = others.reduce((s, x) => s + x.customerExtraWon, 0);
  // 다른 청구처의 손해사정 금액을 아직 모르면 남은 금액은 그쪽 몫으로 보고 미승인분을 따지지 않는다
  const unapproved = others.some((x) => x.adjustedWon == null) ? 0 : Math.max(0, src.insuranceWon - adjusted - otherAdjusted);
  const extra = input.customerExtraWon ?? 0;
  if (extra < 0 || extra + otherExtra > unapproved) throw new ClaimError(`고객 부담 합의 금액은 0 ~ 미승인 금액 ${Math.max(0, unapproved - otherExtra).toLocaleString("ko-KR")}원 사이입니다`);
  if (extra > 0 && !input.agreed) throw new ClaimError("미승인 금액을 고객이 내기로 했으면, 고객과 합의했다는 칸에 체크해 주세요(STD-03 6절 3단계)");
  if (dep > 0 && !input.agreed) throw new ClaimError("감가상각 금액은 고객이 냅니다. 고객에게 설명하고 합의했다는 칸에 체크해 주세요");
  if (unapproved > 0 && !input.note.trim() && !Object.keys(lineAdjust).length) throw new ClaimError("보험사가 인정하지 않은 항목과 이유를 적어 주세요(공임 기준표 연말 개정 자료). 줄마다 인정 금액을 적어도 됩니다");
  const dispute = input.dispute ?? "agreed";
  if (dispute === "disputed" && !input.disputeNote?.trim()) throw new ClaimError("이의 제기 내용(어느 항목을 왜)을 적어 주세요");
  await db
    .update(insuranceClaim)
    .set({
      adjustedWon: adjusted,
      customerExtraWon: extra,
      scopeNote: input.note.trim() || null,
      depreciationWon: dep,
      partsDiscountWon: disc,
      salvageWon: salv,
      otherDeductWon: other,
      otherDeductPayer: otherPayer,
      otherDeductNote: other > 0 ? input.otherDeductNote!.trim() : null,
      lineAdjust,
      dispute,
      disputeNote: dispute === "disputed" ? input.disputeNote!.trim() : c.disputeNote,
      disputedAt: dispute === "disputed" ? (c.dispute === "disputed" ? c.disputedAt : now) : c.disputedAt,
      scopedAt: now,
      scopedBy: actor.id,
      status: "scoped",
      updatedAt: now,
    })
    .where(eq(insuranceClaim.id, c.id));
  if (dispute === "disputed" && c.dispute !== "disputed") await db.insert(claimNote).values({ claimId: c.id, kind: "dispute", note: input.disputeNote!.trim(), by: actor.id, at: now });
  if (dispute === "agreed" && c.dispute === "disputed") await db.insert(claimNote).values({ claimId: c.id, kind: "reply", note: `이의 제기 결과 반영: 손해사정 금액 ${adjusted.toLocaleString("ko-KR")}원에 동의`, by: actor.id, at: now });
  await writeAudit(db, { actorId: actor.id, action: "claim.scope", entityType: "repair_order", entityId: r.docNo, after: { seq, adjusted, customerExtra: extra, unapproved, dep, disc, salv, other, dispute, lines: Object.keys(lineAdjust).length } });
}

/** 5. 청구: 출고 뒤, 서류를 모두 갖춰 보험사에 낸다. 청구 금액은 보험사 몫(손해사정 금액 − 자기부담금 − 공제)에서 시작 */
export async function submitClaim(db: Db, actor: Actor, roId: string, input: { claimedWon: number | null; docs: string[] }, now = new Date(), seq = 1) {
  must(actor, DESK, "청구는 상담원·공장장·대표가 합니다");
  const v = await claimView(db, roId, seq);
  const c = v.claim;
  if (!c) throw new ClaimError("1단계 접수 정보를 먼저 저장해 주세요");
  if (c.status !== "scoped") throw new ClaimError(c.status === "claimed" || c.status === "paid" ? "이미 청구했습니다" : "3단계 승인 범위 확인을 먼저 해 주세요");
  if (c.dispute === "disputed") throw new ClaimError("손해사정에 이의 제기 중입니다. 보험사 답을 받아 3단계에서 '동의'로 고친 뒤 청구합니다");
  if (v.ro.status !== "delivered") throw new ClaimError("출고(인수 서명)한 뒤에 청구합니다. 정비명세서가 청구 서류에 들어갑니다");
  const missing = Object.keys(CLAIM_DOCS).filter((k) => !input.docs.includes(k));
  if (missing.length) throw new ClaimError(`청구 서류 ${missing.length}가지가 빠졌습니다: ${missing.map((k) => CLAIM_DOCS[k as keyof typeof CLAIM_DOCS]).join(", ")}`);
  const claimed = input.claimedWon ?? v.amounts.insurerDue;
  if (claimed <= 0) throw new ClaimError("청구 금액을 확인해 주세요");
  if (claimed > v.amounts.insurerDue) throw new ClaimError(`청구 금액이 보험사 몫(${v.amounts.insurerDue.toLocaleString("ko-KR")}원)보다 큽니다. 손해사정 금액을 넘는 청구는 과다 청구입니다(STD-03 6절)`);
  await db.update(insuranceClaim).set({ claimedWon: claimed, docs: input.docs, claimedAt: now, claimedBy: actor.id, status: "claimed", updatedAt: now }).where(eq(insuranceClaim.id, c.id));
  await writeAudit(db, { actorId: actor.id, action: "claim.submit", entityType: "repair_order", entityId: v.ro.docNo, after: { seq, claimed, docs: input.docs } });
  await notifyRole(db, "accounting", `보험 청구: ${c.docNo} ${c.insurer} ${claimed.toLocaleString("ko-KR")}원 — 입금을 확인해 주세요`, `claim-${c.docNo}`, `/repairs/${roId}/claim${seq > 1 ? `?c=${seq}` : ""}`);
}

/** 6. 입금 확인(회계): 받은 금액, 덜 받았으면 감액 사유 */
export async function recordPayment(db: Db, actor: Actor, roId: string, input: { paidOn: string; paidWon: number | null; cutReason: string }, now = new Date(), seq = 1) {
  must(actor, MONEY, "입금 확인은 회계 담당·대표가 합니다");
  const r = await roRow(db, roId);
  const c = await mustClaim(db, roId, seq);
  if (c.status !== "claimed") throw new ClaimError(c.status === "paid" ? "이미 입금을 확인했습니다" : "청구한 건만 입금을 확인합니다");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.paidOn) || input.paidOn > seoulDate(now)) throw new ClaimError("입금일을 확인해 주세요(오늘이나 그 전)");
  if (input.paidWon == null || input.paidWon <= 0) throw new ClaimError("입금된 금액을 적어 주세요");
  if (input.paidWon > c.claimedWon!) throw new ClaimError("청구 금액보다 많이 들어왔습니다. 금액을 확인하고, 맞으면 보험사에 확인해 주세요");
  const cut = c.claimedWon! - input.paidWon;
  if (cut > 0 && !input.cutReason.trim()) throw new ClaimError(`${cut.toLocaleString("ko-KR")}원 덜 들어왔습니다. 보험사가 알려 준 감액 사유를 적어 주세요(공임 기준표 개정 자료)`);
  await assertOpenDay(db, input.paidOn, r.branchId);
  // 입금 확인과 함께 입금 전표(PM)를 남긴다(대표 지시 2026-11-12). 금액·날짜·보험사는 위 입금 확인 값을 그대로 쓴다
  const voucherNo = await branchDocNo(db, "PM", now, r.branchId);
  await db.insert(payment).values({ docNo: voucherNo, branchId: r.branchId, repairOrderId: roId, method: "transfer", amountWon: input.paidWon, receivedOn: input.paidOn, receiptKind: "none", payerName: c.insurer, note: `보험 청구 ${c.docNo} 입금${cut > 0 ? `(감액 ${cut.toLocaleString("ko-KR")}원)` : ""}`, payer: "insurer", createdBy: actor.id, createdAt: now });
  await db.update(insuranceClaim).set({ paidOn: input.paidOn, paidWon: input.paidWon, cutWon: cut, cutReason: cut > 0 ? input.cutReason.trim() : null, paidBy: actor.id, status: "paid", updatedAt: now }).where(eq(insuranceClaim.id, c.id));
  await writeAudit(db, { actorId: actor.id, action: "claim.paid", entityType: "repair_order", entityId: r.docNo, after: { seq, paid: input.paidWon, cut, voucher: voucherNo } });
  if (cut > 0) await notifyRole(db, "owner", `보험 감액: ${c.docNo} ${c.insurer} ${cut.toLocaleString("ko-KR")}원 — ${input.cutReason.trim()}`, `claim-cut-${c.docNo}`, `/repairs/${roId}/claim${seq > 1 ? `?c=${seq}` : ""}`);
  return voucherNo;
}

/** 30일 미입금 독촉 기록(연락 이력에도 남김) */
export async function recordDun(db: Db, actor: Actor, roId: string, note: string, now = new Date(), seq = 1) {
  must(actor, MONEY, "독촉 기록은 회계 담당·대표가 합니다");
  const c = await mustClaim(db, roId, seq);
  if (c.status !== "claimed") throw new ClaimError("입금 대기 중인 청구만 독촉합니다");
  if (!note.trim()) throw new ClaimError("누구에게 어떻게 독촉했는지 적어 주세요");
  await db.update(insuranceClaim).set({ dunnedAt: now, dunNote: note.trim(), updatedAt: now }).where(eq(insuranceClaim.id, c.id));
  await db.insert(claimNote).values({ claimId: c.id, kind: "dun", note: note.trim(), by: actor.id, at: now });
  await writeAudit(db, { actorId: actor.id, action: "claim.dun", entityType: "insurance_claim", entityId: c.docNo, after: { note: note.trim() } });
}

/**
 * 미결 관리(AOS 미결관리 참고): 청구처마다 연락 이력을 여러 번 남긴다.
 * memo 확인 요청 · reply 보험사 답 · agreed 합의 · disagreed 미합의. 합의·미합의는 청구처의 미결 결과로도 남는다.
 */
export async function addClaimNote(db: Db, actor: Actor, roId: string, input: { kind: string; note: string }, now = new Date(), seq = 1) {
  must(actor, [...new Set([...DESK, ...MONEY])], "보험 연락 기록은 상담원·공장장·회계 담당·대표가 남깁니다");
  const c = await mustClaim(db, roId, seq);
  const kind = input.kind;
  if (kind !== "memo" && kind !== "reply" && kind !== "agreed" && kind !== "disagreed") throw new ClaimError("기록 종류를 골라 주세요");
  if (!input.note.trim()) throw new ClaimError("내용을 적어 주세요(누구와 무엇을)");
  if (input.note.trim().length > 300) throw new ClaimError("내용은 300자까지입니다");
  await db.insert(claimNote).values({ claimId: c.id, kind, note: input.note.trim(), by: actor.id, at: now });
  if (kind === "agreed" || kind === "disagreed") await db.update(insuranceClaim).set({ settle: kind, updatedAt: now }).where(eq(insuranceClaim.id, c.id));
  await writeAudit(db, { actorId: actor.id, action: "claim.note", entityType: "insurance_claim", entityId: c.docNo, after: { kind, note: input.note.trim() } });
}

/** AOS 진행 칸 기록·지우기('AOS 씀'일 때). 비워 둬도 다른 일은 막지 않는다 */
export async function markAos(db: Db, actor: Actor, roId: string, step: string, done: boolean, now = new Date(), seq = 1) {
  must(actor, DESK, "AOS 진행 기록은 상담원·공장장·대표가 합니다");
  if (!isAosStep(step)) throw new ClaimError("AOS 단계를 골라 주세요");
  const c = await mustClaim(db, roId, seq);
  const aos = { ...c.aos };
  if (done) aos[step] = now.toISOString();
  else delete aos[step];
  await db.update(insuranceClaim).set({ aos, updatedAt: now }).where(eq(insuranceClaim.id, c.id));
  await db.insert(claimNote).values({ claimId: c.id, kind: "aos", note: `${AOS_STEPS[step]} ${done ? "기록" : "취소"}`, by: actor.id, at: now });
}

/** 보험 수리 건 목록(청구 진행 상황). 청구처가 여럿이면 가장 덜 끝난 것을 대표로. f: open 진행 중, all 전체 */
export async function listClaims(db: Db, f: "open" | "all" = "open") {
  const rows = await db
    .select({ ro: repairOrder, plateNo: vehicle.plateNo, customerName: customer.name })
    .from(repairOrder)
    .innerJoin(vehicle, eq(vehicle.id, repairOrder.vehicleId))
    .innerJoin(customer, eq(customer.id, repairOrder.customerId))
    .where(and(ne(repairOrder.insurance, "self"), ne(repairOrder.status, "cancelled")))
    .orderBy(desc(repairOrder.inAt));
  if (!rows.length) return [];
  const claims = await db.select().from(insuranceClaim).where(inArray(insuranceClaim.repairOrderId, rows.map((r) => r.ro.id))).orderBy(asc(insuranceClaim.seq));
  const out = rows.map((r) => {
    const mine = claims.filter((c) => c.repairOrderId === r.ro.id);
    return { ...r, claim: mine.find((c) => c.status !== "paid") ?? mine[0] ?? null, claimCount: mine.length };
  });
  return f === "all" ? out : out.filter((r) => r.claim?.status !== "paid");
}

export type ClaimTodoKind = "info" | "request" | "scope" | "dispute" | "claim" | "dun" | "aosEstimate" | "aosClaim";

/** 내 할 일: 접수 정보·손해사정 요청(입고 후 1영업일)·이의 제기 답·청구(출고 후 3영업일)·30일 미입금. 'AOS 씀'이면 AOS 전송도 */
export async function claimTodos(db: Db, now = new Date()) {
  const today = seoulDate(now);
  const cal = await loadShopCalendar(db);
  const aos = await aosEnabled(db);
  const out: { id: string; seq: number; docNo: string; who: string; kind: ClaimTodoKind; due: string | null; late: boolean }[] = [];
  const rows = await listClaims(db, "open");
  const all = rows.length ? await db.select().from(insuranceClaim).where(inArray(insuranceClaim.repairOrderId, rows.map((r) => r.ro.id))).orderBy(asc(insuranceClaim.seq)) : [];
  for (const r of rows) {
    const who = `${r.ro.docNo} ${r.customerName} ${r.plateNo}`;
    const [st] = r.ro.status === "delivered" ? await db.select({ at: repairStatement.deliveredAt }).from(repairStatement).where(eq(repairStatement.repairOrderId, r.ro.id)) : [];
    const mine = all.filter((c) => c.repairOrderId === r.ro.id);
    if (!mine.length) {
      out.push({ id: r.ro.id, seq: 1, docNo: r.ro.docNo, who, kind: "info", due: seoulDate(r.ro.inAt), late: seoulDate(r.ro.inAt) < today });
      continue;
    }
    for (const c of mine) {
      if (c.status === "paid") continue;
      const label = mine.length > 1 ? `${who} · ${c.insurer}` : who;
      const due = claimDeadlines({ inDate: seoulDate(r.ro.inAt), deliveredDate: st?.at ? seoulDate(st.at) : null, claimedDate: c.claimedAt ? seoulDate(c.claimedAt) : null }, cal);
      const push = (kind: ClaimTodoKind, d: string | null) => out.push({ id: r.ro.id, seq: c.seq, docNo: r.ro.docNo, who: label, kind, due: d, late: !!d && d < today });
      if (c.status === "info") push("request", due.requestBy);
      else if (c.status === "requested") push("scope", null);
      else if (c.status === "scoped" && c.dispute === "disputed") push("dispute", null);
      else if (c.status === "scoped" && r.ro.status === "delivered") push("claim", due.claimBy);
      else if (c.status === "claimed" && due.dunFrom && due.dunFrom <= today && !(c.dunnedAt && seoulDate(c.dunnedAt) > addDaysIso(today, -7))) push("dun", due.dunFrom);
      if (aos) {
        if (!c.aos.estimateAt && (c.status === "info" || c.status === "requested")) push("aosEstimate", addBusinessDays(seoulDate(r.ro.inAt), 1, cal));
        if (!c.aos.claimAt && c.status === "claimed" && c.claimedAt) push("aosClaim", seoulDate(c.claimedAt));
      }
    }
  }
  return out;
}

const addDaysIso = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);

/** 수리 건의 첫 청구처 기록(없으면 null). 보험 건이 아니어도 오류 없이 null */
export const claimOf = (db: Db, roId: string) => claimRow(db, roId, 1);
/** 수리 건의 모든 청구처 */
export const claimsOf = (db: Db, roId: string) => claimsOfRo(db, roId);
