// 협력업체 등록·평가(STD-07 4절, F-07-01)
// 공장장: 후보 등록(서류 확인) → 등록 평가(70점 이상) → 등록 제안 → 대표: 승인(등록) 또는 등록 안 함.
// 정기 평가(매년 12월): 앱의 납기 준수율·불량 입고·클레임으로 참고 점수를 내고 공장장이 평가, 대표가 확정(개선 요청·거래 중지).
// 긴급하게 미등록 업체를 써야 하면 1회만 공장장 판단으로 쓰고 7일 안에 등록 평가를 마친다.
import { and, desc, eq, gte, inArray, lt, ne } from "drizzle-orm";
import type { Db } from "@/db/client";
import { appUser, purchaseLine, purchaseOrder, purchaseReceipt, supplier, supplierEval } from "@/db/schema";
import { decrypt, encrypt } from "@/modules/auth/crypto";
import { can } from "@/modules/auth/permissions";
import type { Role } from "@/modules/auth/roles";
import { writeAudit } from "@/modules/platform/audit";
import { UserError } from "@/modules/platform/errors";
import { notifyRole } from "@/modules/platform/notify";
import { loadPolicy } from "@/modules/platform/policy";
import { addDays, seoulDate } from "@/modules/platform/time";
import {
  annualOutcome,
  bankAccountIssue,
  holderMismatch,
  maskAccount,
  EMERGENCY_DAYS,
  EVAL_ITEMS,
  evalIssues,
  evalTotal,
  isSupplierKind,
  missingDocs,
  OUTCOME_LABEL,
  REGISTER_MIN,
  SUPPLIER_DOCS,
  suggestScores,
  type SupplierDoc,
} from "./rules";

export class SupplierError extends UserError {}
type Actor = { id: string; roles: Role[] };
const clean = (s: string | null | undefined) => (s ?? "").trim() || null;

async function supRow(db: Db, id: string) {
  const [s] = await db.select().from(supplier).where(eq(supplier.id, id));
  if (!s) throw new SupplierError("협력업체를 찾을 수 없습니다");
  return s;
}

export type SupplierInput = {
  name: string;
  bizNo: string;
  kinds: string[];
  items: string;
  contactName: string;
  phone: string;
  email: string;
  leadDays: number | null;
  returnTerms: string;
  docs: string[];
  note: string;
};

function checkInput(i: SupplierInput) {
  if (!i.name.trim()) throw new SupplierError("업체 이름을 적어 주세요");
  const kinds = i.kinds.filter(isSupplierKind);
  if (!kinds.length) throw new SupplierError("취급 분야를 하나 이상 골라 주세요");
  const biz = i.bizNo.replace(/[^\d]/g, "");
  if (biz && biz.length !== 10) throw new SupplierError("사업자등록번호는 숫자 10자리입니다");
  if (i.leadDays != null && (!Number.isInteger(i.leadDays) || i.leadDays < 0 || i.leadDays > 90)) throw new SupplierError("보통 납기는 0~90일로 적어 주세요");
  const docs = i.docs.filter((d): d is SupplierDoc => d in SUPPLIER_DOCS);
  return {
    name: i.name.trim(),
    bizNo: biz ? `${biz.slice(0, 3)}-${biz.slice(3, 5)}-${biz.slice(5)}` : null,
    kinds,
    items: clean(i.items),
    contactName: clean(i.contactName),
    phone: clean(i.phone),
    email: clean(i.email),
    leadDays: i.leadDays,
    returnTerms: clean(i.returnTerms),
    docs,
    note: clean(i.note),
  };
}

export type BankInput = { bankName: string; accountNo: string; holder: string };

function checkBank(i: BankInput) {
  const bankName = i.bankName.trim();
  const no = i.accountNo.replace(/[\s-]/g, "");
  const holder = i.holder.trim();
  if (!bankName) throw new SupplierError("은행을 골라 주세요");
  if (!no) throw new SupplierError("계좌번호를 적어 주세요");
  const issue = bankAccountIssue(no);
  if (issue) throw new SupplierError(issue);
  if (!holder) throw new SupplierError("예금주를 적어 주세요(통장 사본과 같게)");
  return { bankName, no, holder };
}

/**
 * 후보 등록(4.1). 같은 사업자등록번호가 있으면 막는다.
 * 등록할 때 받은 통장 사본으로 입금 계좌도 같이 넣을 수 있다(처음 한 번). 넣은 사람이 아닌 회계·대표가 전화로 확인해야 지급에 쓴다.
 */
export async function createSupplier(db: Db, actor: Actor, input: SupplierInput, now = new Date(), bank?: BankInput) {
  if (!can(actor, "supplier.manage")) throw new SupplierError("협력업체 등록은 공장장·대표가 합니다");
  const v = checkInput(input);
  const b = bank && (bank.bankName.trim() || bank.accountNo.trim() || bank.holder.trim()) ? checkBank(bank) : null;
  if (v.bizNo) {
    const [dup] = await db.select({ name: supplier.name }).from(supplier).where(eq(supplier.bizNo, v.bizNo));
    if (dup) throw new SupplierError(`같은 사업자등록번호의 업체(${dup.name})가 이미 있습니다`);
  }
  const bankCols = b
    ? { bankName: b.bankName, bankAccountEnc: encrypt(b.no, "sensitive"), bankAccountMasked: maskAccount(b.no), bankHolder: b.holder, bankChangedBy: actor.id, bankChangedAt: now }
    : {};
  const [s] = await db.insert(supplier).values({ ...v, ...bankCols, createdBy: actor.id, createdAt: now, updatedAt: now }).returning({ id: supplier.id });
  await writeAudit(db, { actorId: actor.id, action: "supplier.create", entityType: "supplier", entityId: s.id, after: { name: v.name, kinds: v.kinds, account: b ? `${b.bankName} ${maskAccount(b.no)} ${b.holder}` : null } });
  return s.id;
}

export async function updateSupplier(db: Db, actor: Actor, id: string, input: SupplierInput, now = new Date()) {
  if (!can(actor, "supplier.manage")) throw new SupplierError("협력업체 정보는 공장장·대표가 고칩니다");
  await supRow(db, id);
  const v = checkInput(input);
  if (v.bizNo) {
    const [dup] = await db.select({ name: supplier.name }).from(supplier).where(and(eq(supplier.bizNo, v.bizNo), ne(supplier.id, id)));
    if (dup) throw new SupplierError(`같은 사업자등록번호의 업체(${dup.name})가 이미 있습니다`);
  }
  await db.update(supplier).set({ ...v, updatedAt: now }).where(eq(supplier.id, id));
  await writeAudit(db, { actorId: actor.id, action: "supplier.update", entityType: "supplier", entityId: id, after: { name: v.name, kinds: v.kinds, docs: v.docs } });
}

/** 등록 평가(4.2): 점수를 적고 70점 이상이면 대표에게 등록 제안. 미달이면 후보로 남는다 */
export async function evaluateInitial(db: Db, actor: Actor, id: string, input: { scores: Record<string, number>; note: string }, now = new Date()) {
  if (!can(actor, "supplier.manage")) throw new SupplierError("등록 평가는 공장장이 합니다");
  const s = await supRow(db, id);
  if (s.status !== "candidate" && s.status !== "rejected") throw new SupplierError("후보 업체만 등록 평가를 합니다");
  const issues = evalIssues(input.scores);
  if (issues.length) throw new SupplierError(issues.join(" / "));
  const miss = missingDocs(s.kinds, s.docs);
  if (miss.length) throw new SupplierError(`먼저 서류를 확인해 주세요: ${miss.map((d) => SUPPLIER_DOCS[d].label).join(", ")}`);
  const total = evalTotal(input.scores);
  await db.insert(supplierEval).values({ supplierId: id, kind: "initial", year: Number(seoulDate(now).slice(0, 4)), scores: input.scores, total, note: clean(input.note), evaluatedBy: actor.id, evaluatedAt: now });
  const pass = total >= REGISTER_MIN;
  await db.update(supplier).set({ score: total, status: pass ? "proposed" : "candidate", updatedAt: now }).where(eq(supplier.id, id));
  await writeAudit(db, { actorId: actor.id, action: "supplier.evaluate", entityType: "supplier", entityId: id, after: { total, pass } });
  if (pass) await notifyRole(db, "owner", `협력업체 등록 승인 요청: ${s.name} ${total}점`, `sup-propose-${id}-${now.getTime()}`, `/suppliers/${id}`);
  return { total, pass };
}

/** 대표: 등록 승인 또는 등록 안 함(4.3) */
export async function decideSupplier(db: Db, actor: Actor, id: string, ok: boolean, reason: string, now = new Date()) {
  if (!can(actor, "supplier.approve")) throw new SupplierError("등록 승인은 대표가 합니다");
  const s = await supRow(db, id);
  if (s.status !== "proposed") throw new SupplierError("등록 제안된 업체가 아닙니다");
  if (!ok && !reason.trim()) throw new SupplierError("등록하지 않는 이유를 적어 주세요");
  await db
    .update(supplier)
    .set({ status: ok ? "registered" : "rejected", approvedBy: ok ? actor.id : null, approvedAt: ok ? now : null, stopReason: ok ? null : reason.trim(), emergencyDue: ok ? null : s.emergencyDue, updatedAt: now })
    .where(eq(supplier.id, id));
  await writeAudit(db, { actorId: actor.id, action: ok ? "supplier.approve" : "supplier.reject", entityType: "supplier", entityId: id, after: { reason: clean(reason) } });
  await notifyRole(db, "plant_manager", ok ? `협력업체 등록: ${s.name}` : `협력업체 등록 안 함: ${s.name} — ${reason.trim()}`, `sup-decide-${id}-${now.getTime()}`, `/suppliers/${id}`);
}

/** 거래 중지·재개(대표). 중지하면 새 발주·외주에 고를 수 없다 */
export async function stopSupplier(db: Db, actor: Actor, id: string, stop: boolean, reason: string, now = new Date()) {
  if (!can(actor, "supplier.approve")) throw new SupplierError("거래 중지는 대표가 합니다");
  const s = await supRow(db, id);
  if (stop && s.status !== "registered") throw new SupplierError("등록 업체만 거래를 중지합니다");
  if (!stop && s.status !== "stopped") throw new SupplierError("거래 중지된 업체가 아닙니다");
  if (stop && !reason.trim()) throw new SupplierError("중지 이유를 적어 주세요");
  await db.update(supplier).set({ status: stop ? "stopped" : "registered", stopReason: stop ? reason.trim() : null, updatedAt: now }).where(eq(supplier.id, id));
  await writeAudit(db, { actorId: actor.id, action: stop ? "supplier.stop" : "supplier.resume", entityType: "supplier", entityId: id, after: { reason: clean(reason) } });
}

/** 발주·외주에 쓸 수 있는지. 미등록 후보는 긴급 1회만(공장장 판단) */
export async function usableSupplier(db: Db, id: string, emergency: boolean, today: string) {
  const s = await supRow(db, id);
  if (s.status === "registered") return s;
  if (s.status === "stopped") throw new SupplierError(`${s.name}은(는) 거래 중지된 업체입니다`);
  if (s.status === "rejected") throw new SupplierError(`${s.name}은(는) 등록하지 않기로 한 업체입니다`);
  if (s.emergencyOn) throw new SupplierError(`${s.name}은(는) 미등록 업체로 이미 한 번 긴급 사용했습니다(${s.emergencyOn}). 등록 평가를 마쳐야 다시 씁니다`);
  if (!emergency) throw new SupplierError(`${s.name}은(는) 아직 등록 전입니다. 급하면 '긴급 사용(1회)'을 고르세요`);
  return s;
}

/** 긴급 사용 기록: 7일 안에 등록 평가 */
export async function markEmergency(db: Db, id: string, today: string) {
  await db.update(supplier).set({ emergencyOn: today, emergencyDue: addDays(today, EMERGENCY_DAYS) }).where(eq(supplier.id, id));
}

/** 앱 실적(4.4): 한 해 동안 발주 건 납기 준수율, 불량 입고 줄 수, 불만 처리부 연결은 아직 없어 0 */
export async function supplierStats(db: Db, id: string, year: number) {
  const from = new Date(`${year}-01-01T00:00:00+09:00`);
  const to = new Date(`${year + 1}-01-01T00:00:00+09:00`);
  const orders = await db
    .select({ id: purchaseOrder.id, dueOn: purchaseOrder.dueOn, replyDueOn: purchaseOrder.replyDueOn, receivedAt: purchaseOrder.receivedAt, status: purchaseOrder.status })
    .from(purchaseOrder)
    .where(and(eq(purchaseOrder.supplierId, id), gte(purchaseOrder.createdAt, from), lt(purchaseOrder.createdAt, to), ne(purchaseOrder.status, "cancelled")));
  const done = orders.filter((o) => o.receivedAt);
  const onTime = done.filter((o) => seoulDate(o.receivedAt!) <= (o.replyDueOn ?? o.dueOn ?? "9999")).length;
  const ids = orders.map((o) => o.id);
  const lines = ids.length ? await db.select({ rejectedQty: purchaseLine.rejectedQty }).from(purchaseLine).where(inArray(purchaseLine.orderId, ids)) : [];
  const receipts = ids.length ? await db.select({ id: purchaseReceipt.id }).from(purchaseReceipt).where(inArray(purchaseReceipt.orderId, ids)) : [];
  return {
    orders: orders.length,
    received: done.length,
    onTimePct: done.length ? Math.round((onTime / done.length) * 100) : null,
    lines: lines.length,
    badLines: lines.filter((l) => l.rejectedQty > 0).length,
    receipts: receipts.length,
    claims: 0,
  };
}

/** 정기 평가(4.4~4.5): 공장장이 점수를 적고 대표가 확정 */
export async function evaluateAnnual(db: Db, actor: Actor, id: string, input: { year: number; scores: Record<string, number>; note: string }, now = new Date()) {
  if (!can(actor, "supplier.manage")) throw new SupplierError("정기 평가는 공장장이 합니다");
  const s = await supRow(db, id);
  if (s.status !== "registered" && s.status !== "stopped") throw new SupplierError("등록 업체만 정기 평가를 합니다");
  const issues = evalIssues(input.scores);
  if (issues.length) throw new SupplierError(issues.join(" / "));
  const [dup] = await db.select({ id: supplierEval.id }).from(supplierEval).where(and(eq(supplierEval.supplierId, id), eq(supplierEval.kind, "annual"), eq(supplierEval.year, input.year)));
  if (dup) throw new SupplierError(`${input.year}년 정기 평가는 이미 했습니다`);
  const total = evalTotal(input.scores);
  const stats = await supplierStats(db, id, input.year);
  await db.insert(supplierEval).values({ supplierId: id, kind: "annual", year: input.year, scores: input.scores, total, stats, note: clean(input.note), evaluatedBy: actor.id, evaluatedAt: now });
  await db.update(supplier).set({ score: total, updatedAt: now }).where(eq(supplier.id, id));
  await writeAudit(db, { actorId: actor.id, action: "supplier.annual", entityType: "supplier", entityId: id, after: { year: input.year, total } });
  await notifyRole(db, "owner", `협력업체 정기 평가 확정 요청: ${s.name} ${input.year}년 ${total}점`, `sup-annual-${id}-${input.year}`, `/suppliers/${id}`);
  return total;
}

/** 대표 확정: 결과(유지·개선 요청·거래 중지)는 정책값으로 정하고, 거래 중지면 업체 상태도 바꾼다 */
export async function confirmAnnual(db: Db, actor: Actor, evalId: string, now = new Date()) {
  if (!can(actor, "supplier.approve")) throw new SupplierError("정기 평가 확정은 대표가 합니다");
  const [e] = await db.select().from(supplierEval).where(eq(supplierEval.id, evalId));
  if (!e || e.kind !== "annual") throw new SupplierError("정기 평가를 찾을 수 없습니다");
  if (e.confirmedAt) throw new SupplierError("이미 확정했습니다");
  const p = await loadPolicy(db, seoulDate(now));
  const [prev] = await db.select({ total: supplierEval.total }).from(supplierEval).where(and(eq(supplierEval.supplierId, e.supplierId), eq(supplierEval.kind, "annual"), eq(supplierEval.year, e.year - 1)));
  const outcome = annualOutcome(e.total, prev?.total ?? null, { improveBelow: p["supplier.improve_below"], stopBelow: p["supplier.stop_below"] });
  await db.update(supplierEval).set({ confirmedBy: actor.id, confirmedAt: now, outcome }).where(eq(supplierEval.id, evalId));
  if (outcome === "stop") await db.update(supplier).set({ status: "stopped", stopReason: `${e.year}년 정기 평가 ${e.total}점(2년 연속 기준 미만)`, updatedAt: now }).where(eq(supplier.id, e.supplierId));
  await writeAudit(db, { actorId: actor.id, action: "supplier.annual_confirm", entityType: "supplier", entityId: e.supplierId, after: { year: e.year, total: e.total, outcome } });
  const s = await supRow(db, e.supplierId);
  if (outcome !== "ok") await notifyRole(db, "plant_manager", `협력업체 ${OUTCOME_LABEL[outcome]}: ${s.name}(${e.year}년 ${e.total}점) — 업체에 결과를 알리세요`, `sup-outcome-${evalId}`, `/suppliers/${e.supplierId}`);
  return outcome;
}

/**
 * 입금 계좌 등록·변경(계좌 권한: 회계·대표). 번호는 민감 키로 암호화하고 감사 기록에는 가린 번호만 남긴다.
 * 바꾸면 확인이 풀리고 대표에게 알림이 간다(계좌 바꿔치기 사기 방지). remove 면 계좌를 지운다.
 */
export async function setSupplierBank(db: Db, actor: Actor, id: string, input: { bankName: string; accountNo: string; holder: string; remove?: boolean }, now = new Date()) {
  if (!can(actor, "supplier.bank")) throw new SupplierError("입금 계좌는 회계 담당·대표가 넣습니다");
  const s = await supRow(db, id);
  const clear = !!input.remove;
  if (clear && !s.bankAccountEnc) throw new SupplierError("지울 계좌가 없습니다");
  const bankName = input.bankName.trim();
  const typed = input.accountNo.replace(/[\s-]/g, "");
  // 번호 칸을 비우면 지금 번호를 그대로 둔다(은행·예금주만 고칠 때)
  const no = typed || (s.bankAccountEnc ? decrypt(s.bankAccountEnc) : "");
  const holder = input.holder.trim();
  if (!clear) checkBank({ bankName, accountNo: no, holder });
  const same = !clear && s.bankAccountEnc && s.bankName === bankName && s.bankHolder === holder && decrypt(s.bankAccountEnc) === no;
  if (same) return { changed: false, mismatch: holderMismatch(holder, s.name) };
  const masked = clear ? null : maskAccount(no);
  await db
    .update(supplier)
    .set({
      bankName: clear ? null : bankName,
      bankAccountEnc: clear ? null : encrypt(no, "sensitive"),
      bankAccountMasked: masked,
      bankHolder: clear ? null : holder,
      bankChangedBy: actor.id,
      bankChangedAt: now,
      bankVerifiedBy: null,
      bankVerifiedAt: null,
      bankVerifyNote: null,
      updatedAt: now,
    })
    .where(eq(supplier.id, id));
  const before = s.bankAccountMasked ? `${s.bankName} ${s.bankAccountMasked} ${s.bankHolder}` : null;
  const after = masked ? `${bankName} ${masked} ${holder}` : null;
  await writeAudit(db, { actorId: actor.id, action: "supplier.bank", entityType: "supplier", entityId: id, before: { account: before }, after: { account: after } });
  if (before)
    await notifyRole(db, "owner", `협력업체 입금 계좌 ${clear ? "삭제" : "변경"}: ${s.name} ${before} → ${after ?? "없음"} — 업체에 전화로 확인하세요`, `sup-bank-${id}-${now.getTime()}`, `/suppliers/${id}`);
  return { changed: true, mismatch: !clear && holderMismatch(holder, s.name) };
}

/** 계좌 확인: 업체 대표 번호로 전화해 계좌를 확인했음을 남긴다. 바꾼 사람이 아닌 다른 사람이(대표는 본인 것도 가능) */
export async function verifySupplierBank(db: Db, actor: Actor, id: string, note: string, now = new Date()) {
  if (!can(actor, "supplier.bank")) throw new SupplierError("계좌 확인은 회계 담당·대표가 합니다");
  const s = await supRow(db, id);
  if (!s.bankAccountEnc) throw new SupplierError("확인할 계좌가 없습니다");
  if (s.bankVerifiedAt) throw new SupplierError("이미 확인한 계좌입니다");
  if (!note.trim()) throw new SupplierError("누구와 어떻게 확인했는지 적어 주세요(예: 업체 대표 번호로 전화, 김부장 확인)");
  if (s.bankChangedBy === actor.id && !actor.roles.includes("owner")) throw new SupplierError("계좌를 넣은 사람이 아닌 다른 사람(대표)이 확인합니다");
  await db.update(supplier).set({ bankVerifiedBy: actor.id, bankVerifiedAt: now, bankVerifyNote: note.trim(), updatedAt: now }).where(eq(supplier.id, id));
  await writeAudit(db, { actorId: actor.id, action: "supplier.bank_verify", entityType: "supplier", entityId: id, after: { account: `${s.bankName} ${s.bankAccountMasked}`, note: note.trim() } });
}

export type SupplierBank = {
  bankName: string;
  masked: string;
  /** 전체 번호(계좌 권한이 있을 때만) */
  full: string | null;
  holder: string;
  verified: boolean;
  verifiedAt: Date | null;
  verifiedBy: string | null;
  verifiedByName: string | null;
  verifyNote: string | null;
  changedAt: Date | null;
  changedBy: string | null;
};

/** 지급·정산 화면에서 불러 쓸 입금 계좌. 권한이 없으면 가린 번호만 */
export function bankView(actor: Actor, s: typeof supplier.$inferSelect): SupplierBank | null {
  if (!s.bankAccountEnc || !s.bankName || !s.bankAccountMasked) return null;
  return {
    bankName: s.bankName,
    masked: s.bankAccountMasked,
    full: can(actor, "supplier.bank") ? decrypt(s.bankAccountEnc) : null,
    holder: s.bankHolder ?? "",
    verified: !!s.bankVerifiedAt,
    verifiedAt: s.bankVerifiedAt,
    verifiedBy: s.bankVerifiedBy,
    verifiedByName: null,
    verifyNote: s.bankVerifyNote,
    changedAt: s.bankChangedAt,
    changedBy: s.bankChangedBy,
  };
}

export async function supplierBank(db: Db, actor: Actor, id: string) {
  const b = bankView(actor, await supRow(db, id));
  if (b?.verifiedBy) b.verifiedByName = (await db.select({ name: appUser.name }).from(appUser).where(eq(appUser.id, b.verifiedBy)))[0]?.name ?? null;
  return b;
}

/** 내 할 일(계좌 권한): 바뀌고 아직 확인 안 한 입금 계좌 */
export async function supplierBankTodos(db: Db, actor: Actor) {
  if (!can(actor, "supplier.bank")) return [];
  const rows = await db.select({ id: supplier.id, name: supplier.name, enc: supplier.bankAccountEnc, verifiedAt: supplier.bankVerifiedAt, changedBy: supplier.bankChangedBy }).from(supplier);
  return rows
    .filter((s) => s.enc && !s.verifiedAt && (s.changedBy !== actor.id || actor.roles.includes("owner")))
    .map((s) => ({ key: `sup-bank-${s.id}`, when: "today" as const, what: `협력업체 입금 계좌 확인: ${s.name}`, detail: "업체 대표 번호로 전화해 은행·번호·예금주를 확인", href: `/suppliers/${s.id}#bank`, action: "확인하기" }));
}

export type SupplierFilter = "registered" | "candidate" | "stopped" | "all";

export async function listSuppliers(db: Db, filter: SupplierFilter = "registered") {
  const rows = await db.select().from(supplier).orderBy(supplier.name);
  return rows.filter((s) =>
    filter === "all" ? true : filter === "registered" ? s.status === "registered" : filter === "candidate" ? s.status === "candidate" || s.status === "proposed" : s.status === "stopped" || s.status === "rejected",
  );
}

/** 발주·외주에서 고를 업체(등록 + 후보). kind 를 주면 그 분야만 */
export async function supplierOptions(db: Db, kind?: string) {
  const rows = await db
    .select({ id: supplier.id, name: supplier.name, status: supplier.status, kinds: supplier.kinds, emergencyOn: supplier.emergencyOn, leadDays: supplier.leadDays })
    .from(supplier)
    .where(inArray(supplier.status, ["registered", "candidate", "proposed"]))
    .orderBy(supplier.name);
  return rows.filter((s) => !kind || s.kinds.includes(kind));
}

export async function getSupplier(db: Db, id: string, now = new Date()) {
  const s = await supRow(db, id);
  const evals = await db.select().from(supplierEval).where(eq(supplierEval.supplierId, id)).orderBy(desc(supplierEval.evaluatedAt));
  const uids = [...new Set([s.createdBy, s.approvedBy, s.bankChangedBy, s.bankVerifiedBy, ...evals.flatMap((e) => [e.evaluatedBy, e.confirmedBy])].filter((x): x is string => !!x))];
  const names = new Map((uids.length ? await db.select({ id: appUser.id, name: appUser.name }).from(appUser).where(inArray(appUser.id, uids)) : []).map((u) => [u.id, u.name]));
  const year = Number(seoulDate(now).slice(0, 4));
  const stats = await supplierStats(db, id, year);
  const orders = await db
    .select({ id: purchaseOrder.id, docNo: purchaseOrder.docNo, status: purchaseOrder.status, totalWon: purchaseOrder.totalWon, createdAt: purchaseOrder.createdAt })
    .from(purchaseOrder)
    .where(eq(purchaseOrder.supplierId, id))
    .orderBy(desc(purchaseOrder.createdAt))
    .limit(20);
  return { s: { ...s, bankAccountEnc: null }, hasBank: !!s.bankAccountEnc, evals, names, stats, suggested: suggestScores(stats), orders, year, missing: missingDocs(s.kinds, s.docs) };
}

/** 내 할 일: 대표 등록 승인·정기 평가 확정, 공장장 긴급 사용 뒤 등록 평가, 12월 정기 평가 */
export async function supplierTodos(db: Db, actor: Actor, today: string) {
  const out: { key: string; when: "late" | "today" | "soon"; what: string; detail?: string; href: string; action: string }[] = [];
  if (can(actor, "supplier.approve")) {
    for (const s of await db.select().from(supplier).where(eq(supplier.status, "proposed")))
      out.push({ key: `sup-ap-${s.id}`, when: "today", what: `협력업체 등록 승인: ${s.name} ${s.score ?? "-"}점`, href: `/suppliers/${s.id}`, action: "승인하기" });
    const pending = await db.select({ e: supplierEval, name: supplier.name }).from(supplierEval).innerJoin(supplier, eq(supplier.id, supplierEval.supplierId)).where(eq(supplierEval.kind, "annual"));
    for (const p of pending.filter((x) => !x.e.confirmedAt))
      out.push({ key: `sup-cf-${p.e.id}`, when: "today", what: `협력업체 정기 평가 확정: ${p.name} ${p.e.year}년 ${p.e.total}점`, href: `/suppliers/${p.e.supplierId}`, action: "확정하기" });
  }
  if (can(actor, "supplier.manage")) {
    const rows = await db.select().from(supplier);
    for (const s of rows.filter((x) => x.emergencyDue && (x.status === "candidate" || x.status === "rejected")))
      out.push({ key: `sup-em-${s.id}`, when: s.emergencyDue! < today ? "late" : "soon", what: `긴급 사용 업체 등록 평가: ${s.name}`, detail: `${s.emergencyOn} 긴급 사용 — ${s.emergencyDue}까지 평가`, href: `/suppliers/${s.id}`, action: "평가하기" });
    if (today.slice(5, 7) === "12") {
      const year = Number(today.slice(0, 4));
      const done = new Set((await db.select({ id: supplierEval.supplierId }).from(supplierEval).where(and(eq(supplierEval.kind, "annual"), eq(supplierEval.year, year)))).map((r) => r.id));
      const left = rows.filter((s) => s.status === "registered" && !done.has(s.id));
      if (left.length) out.push({ key: `sup-annual-${year}`, when: today >= `${year}-12-20` ? "today" : "soon", what: `협력업체 정기 평가 ${left.length}곳(${year}년)`, detail: left.map((s) => s.name).slice(0, 5).join(", "), href: "/suppliers", action: "평가하기" });
    }
  }
  return out;
}

export const EVAL_LABELS = Object.fromEntries(EVAL_ITEMS.map((i) => [i.key, i.label])) as Record<string, string>;
