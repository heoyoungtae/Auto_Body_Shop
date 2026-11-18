// 업체 고객 외상매출금·거래처 청구서(STD-12 12.1·12.3, 대표 결정 2026-11-17).
// - 업체 고객은 출고 때 '외상'을 고르면 결제 없이 출고한다. 정비명세서 금액이 그날 매출·외상매출금이 된다(회계 장부는 명세서·입금 전표로 이미 그렇게 적는다).
// - 받을 날: 출고 건은 결제 조건으로, 청구서에 묶이면 청구서의 받을 날(은행 쉬는 날이면 다음 영업일).
// - 달이 끝나면 업체별 청구서(BL) 한 장에 지난 출고분을 모은다. 월 합계 세금계산서 번호를 청구서에 적는다(다음 달 10일까지).
// - 입금은 청구서에서 한 번 적으면 수리 건별 입금 전표(PM, payment.billId)로 나눠 적는다(오래된 건부터). 통장 입금과 맞추기에서도 바로 연다.
// - 한도를 넘거나 받을 날이 지난 업체에 외상 출고하면 경고하고, 확인 체크를 받은 뒤 대표에게 알린다.
import { and, asc, desc, eq, inArray, isNull, ne } from "drizzle-orm";
import type { Db } from "@/db/client";
import { arBill, customer, payment, repairOrder, repairStatement, vehicle } from "@/db/schema";
import { can } from "@/modules/auth/permissions";
import type { Role } from "@/modules/auth/roles";
import { isBusinessDay } from "@/modules/platform/business-days";
import { writeAudit } from "@/modules/platform/audit";
import { nextDocNo } from "@/modules/platform/docno";
import { UserError } from "@/modules/platform/errors";
import { notifyRole } from "@/modules/platform/notify";
import { seoulDate } from "@/modules/platform/time";
import { billDueDate, creditDueDate, creditWarnings, forwardToBusinessDay, monthlyInvoiceDeadline } from "./credit-rules";
import { assertOpenDay } from "./lock";
import { bankCalendar } from "./payable";
import { daysBetween, isPayInMethod, payTermLabel } from "./rules";

export class CreditError extends UserError {}
type Actor = { id: string; roles: Role[] };
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;

/** 외상 출고 한 건의 받을 날(은행 영업일) */
export async function creditDueOn(db: Db, deliveredOn: string, term: string | null, day: number | null) {
  const cal = await bankCalendar(db);
  return forwardToBusinessDay(creditDueDate(deliveredOn, term, day), (d) => isBusinessDay(cal, d));
}

export type CreditLine = {
  statementId: string;
  statementNo: string;
  roId: string;
  roNo: string;
  plateNo: string;
  deliveredOn: string;
  totalWon: number;
  supplyWon: number;
  vatWon: number;
  paid: number;
  remain: number;
  dueOn: string;
  billId: string | null;
  billNo: string | null;
};

/** 업체 고객의 외상 출고 건(정비명세서 payMethod=credit)과 받은 금액. customerId 를 주면 그 업체만 */
export async function creditLines(db: Db, customerId?: string): Promise<(CreditLine & { customerId: string })[]> {
  const conds = [eq(repairStatement.payMethod, "credit"), ne(repairOrder.status, "cancelled")];
  if (customerId) conds.push(eq(repairOrder.customerId, customerId));
  const rows = await db
    .select({ st: repairStatement, ro: repairOrder, plateNo: vehicle.plateNo, bill: arBill })
    .from(repairStatement)
    .innerJoin(repairOrder, eq(repairOrder.id, repairStatement.repairOrderId))
    .innerJoin(vehicle, eq(vehicle.id, repairOrder.vehicleId))
    .leftJoin(arBill, eq(arBill.id, repairStatement.billId))
    .where(and(...conds))
    .orderBy(asc(repairStatement.deliveredAt));
  if (!rows.length) return [];
  const pays = await db
    .select({ ro: payment.repairOrderId, amt: payment.amountWon })
    .from(payment)
    .where(and(inArray(payment.repairOrderId, rows.map((r) => r.ro.id)), eq(payment.payer, "customer")));
  return rows.map(({ st, ro, plateNo, bill }) => {
    const paid = pays.filter((p) => p.ro === ro.id).reduce((s, p) => s + p.amt, 0);
    const deliveredOn = st.deliveredAt ? seoulDate(st.deliveredAt) : st.issuedOn;
    return {
      customerId: ro.customerId,
      statementId: st.id,
      statementNo: st.docNo,
      roId: ro.id,
      roNo: ro.docNo,
      plateNo,
      deliveredOn,
      totalWon: st.totalWon,
      supplyWon: st.totalWon - st.vatWon,
      vatWon: st.vatWon,
      paid,
      remain: st.totalWon - paid,
      dueOn: bill && !bill.cancelledAt ? bill.dueOn : (st.creditDueOn ?? deliveredOn),
      billId: bill && !bill.cancelledAt ? bill.id : null,
      billNo: bill && !bill.cancelledAt ? bill.docNo : null,
    };
  });
}

/** 업체 한 곳의 외상 현황: 잔액·연체·청구 안 한 금액·한도 */
export function summarize(lines: CreditLine[], limit: number | null, today: string) {
  const open = lines.filter((l) => l.remain > 0);
  const late = open.filter((l) => l.dueOn < today);
  return {
    balance: open.reduce((s, l) => s + l.remain, 0),
    overdue: late.reduce((s, l) => s + l.remain, 0),
    overdueDays: late.length ? Math.max(...late.map((l) => daysBetween(l.dueOn, today))) : 0,
    unbilled: open.filter((l) => !l.billId).reduce((s, l) => s + l.remain, 0),
    unbilledCount: open.filter((l) => !l.billId).length,
    nextDue: open.filter((l) => l.dueOn >= today).map((l) => l.dueOn).sort()[0] ?? null,
    limit,
  };
}

export async function businessCustomer(db: Db, customerId: string) {
  const [c] = await db.select().from(customer).where(eq(customer.id, customerId));
  if (!c) throw new CreditError("없는 고객입니다");
  return c;
}

/** 출고 화면·서버가 같이 쓰는 외상 점검(이번 금액을 더했을 때) */
export async function creditCheck(db: Db, customerId: string, addWon: number, now = new Date()) {
  const c = await businessCustomer(db, customerId);
  const today = seoulDate(now);
  const s = summarize(await creditLines(db, customerId), c.creditLimitWon, today);
  return {
    business: c.kind === "business",
    customer: c,
    ...s,
    term: payTermLabel(c.payTerm ?? "next_end", c.payDay),
    dueOn: await creditDueOn(db, today, c.payTerm, c.payDay),
    warnings: creditWarnings(s, addWon),
  };
}

/** 외상 출고 직후: 받을 날을 적고, 경고가 있었으면 대표에게 알린다(deliver 에서 부른다) */
export async function afterCreditDelivery(db: Db, roId: string, roNo: string, statementId: string, customerId: string, warnings: string[], now = new Date()) {
  const c = await businessCustomer(db, customerId);
  const dueOn = await creditDueOn(db, seoulDate(now), c.payTerm, c.payDay);
  await db.update(repairStatement).set({ creditDueOn: dueOn }).where(eq(repairStatement.id, statementId));
  if (warnings.length) await notifyRole(db, "owner", `외상 경고 확인 후 출고: ${c.name} ${roNo} — ${warnings.join(" / ")}`, `credit-warn-${roNo}`, `/money/accounts/${customerId}`);
  return dueOn;
}

/** 거래처 외상 목록: 업체 고객마다 잔액·연체·청구 안 한 금액 */
export async function creditAccounts(db: Db, now = new Date()) {
  const today = seoulDate(now);
  const cs = await db.select().from(customer).where(eq(customer.kind, "business")).orderBy(asc(customer.name));
  const lines = await creditLines(db);
  const bills = await db.select().from(arBill).where(isNull(arBill.cancelledAt));
  return cs.map((c) => {
    const mine = lines.filter((l) => l.customerId === c.id);
    return {
      c,
      term: payTermLabel(c.payTerm ?? "next_end", c.payDay),
      bills: bills.filter((b) => b.customerId === c.id).length,
      ...summarize(mine, c.creditLimitWon, today),
    };
  });
}

/** 거래처 원장(매출): 외상 출고 건, 청구서, 입금 */
export async function creditLedger(db: Db, customerId: string, now = new Date()) {
  const today = seoulDate(now);
  const c = await businessCustomer(db, customerId);
  const lines = await creditLines(db, customerId);
  const bills = await db.select().from(arBill).where(eq(arBill.customerId, customerId)).orderBy(desc(arBill.issuedOn), desc(arBill.createdAt));
  const billPaid = await billPayments(db, bills.map((b) => b.id));
  return {
    c,
    lines,
    summary: summarize(lines, c.creditLimitWon, today),
    term: payTermLabel(c.payTerm ?? "next_end", c.payDay),
    bills: bills.map((b) => ({ ...b, paid: billPaid.get(b.id) ?? 0, remain: b.totalWon - (billPaid.get(b.id) ?? 0) })),
    /** 청구서로 묶을 것: 청구 안 한 외상 중 이번 달 전에 출고한 것(미리 고름) */
    suggested: lines.filter((l) => !l.billId && l.remain > 0 && l.deliveredOn.slice(0, 7) < today.slice(0, 7)).map((l) => l.statementId),
  };
}

async function billPayments(db: Db, billIds: string[]) {
  const m = new Map<string, number>();
  if (!billIds.length) return m;
  // 청구서에 묶인 수리 건이 받은 돈 전부(청구서에서 적은 것 + 수리 건에서 따로 적은 것)
  const sts = await db.select({ billId: repairStatement.billId, ro: repairStatement.repairOrderId }).from(repairStatement).where(inArray(repairStatement.billId, billIds));
  if (!sts.length) return m;
  const pays = await db
    .select({ ro: payment.repairOrderId, amt: payment.amountWon })
    .from(payment)
    .where(and(inArray(payment.repairOrderId, sts.map((s) => s.ro)), eq(payment.payer, "customer")));
  for (const s of sts) m.set(s.billId!, (m.get(s.billId!) ?? 0) + pays.filter((p) => p.ro === s.ro).reduce((a, p) => a + p.amt, 0));
  return m;
}

function mustBill(actor: Actor) {
  if (!can(actor, "money.close_month")) throw new CreditError("거래처 청구서는 회계 담당·대표가 만듭니다");
}

/** 청구서 만들기: 고른 외상 출고 건을 한 장으로. 받을 날은 결제 조건으로 계산 */
export async function createBill(db: Db, actor: Actor, customerId: string, statementIds: string[], note = "", now = new Date()) {
  mustBill(actor);
  const c = await businessCustomer(db, customerId);
  if (c.kind !== "business") throw new CreditError("업체 고객만 청구서를 만듭니다");
  const ids = [...new Set(statementIds.filter(Boolean))];
  if (!ids.length) throw new CreditError("청구할 출고 건을 하나 이상 골라 주세요");
  const lines = (await creditLines(db, customerId)).filter((l) => ids.includes(l.statementId));
  if (lines.length !== ids.length) throw new CreditError("고른 건 가운데 이 업체의 외상 출고가 아닌 것이 있습니다");
  const billed = lines.find((l) => l.billId);
  if (billed) throw new CreditError(`${billed.roNo}은(는) 이미 청구서 ${billed.billNo}에 들어 있습니다`);
  const today = seoulDate(now);
  const ym = lines.map((l) => l.deliveredOn.slice(0, 7)).sort().at(-1)!;
  const cal = await bankCalendar(db);
  const dueOn = forwardToBusinessDay(billDueDate(ym, today, c.payTerm, c.payDay), (d) => isBusinessDay(cal, d));
  const total = lines.reduce((s, l) => s + l.totalWon, 0);
  const vat = lines.reduce((s, l) => s + l.vatWon, 0);
  return db.transaction(async (tx) => {
    const docNo = await nextDocNo(tx, "BL", now);
    const [b] = await tx
      .insert(arBill)
      .values({ docNo, customerId, ym, issuedOn: today, dueOn, payTerm: c.payTerm ?? "next_end", supplyWon: total - vat, vatWon: vat, totalWon: total, note: note.trim() || null, createdBy: actor.id })
      .returning({ id: arBill.id });
    await tx.update(repairStatement).set({ billId: b.id }).where(inArray(repairStatement.id, ids));
    await writeAudit(tx, { actorId: actor.id, action: "bill.create", entityType: "ar_bill", entityId: docNo, after: { customer: c.name, ym, total, dueOn, count: ids.length } });
    return { id: b.id, docNo, dueOn, total };
  });
}

export async function billView(db: Db, billId: string) {
  const [b] = await db.select().from(arBill).where(eq(arBill.id, billId));
  if (!b) throw new CreditError("없는 청구서입니다");
  const c = await businessCustomer(db, b.customerId);
  const lines = (await creditLines(db, b.customerId)).filter((l) => l.billId === b.id);
  const pays = lines.length
    ? await db
        .select()
        .from(payment)
        .where(and(inArray(payment.repairOrderId, lines.map((l) => l.roId)), eq(payment.payer, "customer")))
        .orderBy(asc(payment.receivedOn), asc(payment.createdAt))
    : [];
  const paid = pays.reduce((s, p) => s + p.amountWon, 0);
  return { b, c, lines, pays, paid, remain: b.totalWon - paid, invoiceDeadline: monthlyInvoiceDeadline(b.ym) };
}

/** 청구서 취소: 입금이 하나도 없을 때만. 묶인 출고 건은 다시 '청구 안 함'으로 */
export async function cancelBill(db: Db, actor: Actor, billId: string, reason: string, now = new Date()) {
  mustBill(actor);
  const v = await billView(db, billId);
  if (v.b.cancelledAt) throw new CreditError("이미 취소한 청구서입니다");
  if (v.pays.length) throw new CreditError("입금이 적힌 청구서는 취소하지 않습니다. 입금 전표를 먼저 취소 전표로 지워 주세요");
  if (!reason.trim()) throw new CreditError("취소 사유를 적어 주세요(예: 금액 잘못, 업체 요청으로 다시 묶음)");
  await db.transaction(async (tx) => {
    await tx.update(arBill).set({ cancelledAt: now, cancelReason: reason.trim() }).where(eq(arBill.id, billId));
    await tx.update(repairStatement).set({ billId: null }).where(eq(repairStatement.billId, billId));
    await writeAudit(tx, { actorId: actor.id, action: "bill.cancel", entityType: "ar_bill", entityId: v.b.docNo, after: { reason: reason.trim() } });
  });
}

/** 월 합계 세금계산서 번호 적기(홈택스·발행 프로그램에서 발행한 승인 번호) */
export async function setBillInvoice(db: Db, actor: Actor, billId: string, input: { no: string; on: string }, now = new Date()) {
  mustBill(actor);
  const v = await billView(db, billId);
  if (v.b.cancelledAt) throw new CreditError("취소한 청구서입니다");
  const no = input.no.trim();
  if (!/^[0-9A-Za-z-]{8,40}$/.test(no)) throw new CreditError("세금계산서 승인 번호를 적어 주세요(홈택스 승인 번호 24자리 등)");
  if (!ISO.test(input.on) || input.on > seoulDate(now)) throw new CreditError("발행한 날을 확인해 주세요(오늘이나 그 전)");
  await db.update(arBill).set({ taxInvoiceNo: no, taxInvoiceOn: input.on }).where(eq(arBill.id, billId));
  // 이미 적은 입금 전표(증빙 번호 비어 있음)에도 번호를 붙인다(통장·홈택스 맞추기에서 짝을 찾게)
  await db.update(payment).set({ receiptNo: no }).where(and(eq(payment.billId, billId), isNull(payment.receiptNo)));
  await writeAudit(db, { actorId: actor.id, action: "bill.invoice", entityType: "ar_bill", entityId: v.b.docNo, after: { no, on: input.on } });
}

export type BillPayInput = { amountWon: number | null; receivedOn: string; method: string; payerName: string; note: string };

/** 청구서 입금: 한 번 받은 돈을 수리 건별 입금 전표로 나눠 적는다(받을 날·출고가 오래된 건부터) */
export async function recordBillPayment(db: Db, actor: Actor, billId: string, input: BillPayInput, now = new Date()) {
  if (!can(actor, "money.receive")) throw new CreditError("입금은 수납 권한이 있는 사람이 적습니다");
  const v = await billView(db, billId);
  if (v.b.cancelledAt) throw new CreditError("취소한 청구서입니다");
  const amount = input.amountWon ?? 0;
  if (amount <= 0) throw new CreditError("받은 금액을 적어 주세요");
  if (amount > v.remain) throw new CreditError(`청구서에 남은 금액(${won(Math.max(0, v.remain))})보다 많습니다. 다른 청구서 몫이 섞였으면 나눠 적어 주세요`);
  if (!isPayInMethod(input.method)) throw new CreditError("받은 방법을 골라 주세요");
  if (!ISO.test(input.receivedOn) || input.receivedOn > seoulDate(now)) throw new CreditError("받은 날을 확인해 주세요(오늘이나 그 전)");
  await assertOpenDay(db, input.receivedOn);
  let left = amount;
  const made: { id: string; docNo: string }[] = [];
  await db.transaction(async (tx) => {
    for (const l of [...v.lines].sort((a, b) => a.deliveredOn.localeCompare(b.deliveredOn))) {
      if (left <= 0) break;
      if (l.remain <= 0) continue;
      const amt = Math.min(left, l.remain);
      const docNo = await nextDocNo(tx, "PM", now);
      const [p] = await tx
        .insert(payment)
        .values({
          docNo,
          repairOrderId: l.roId,
          method: input.method,
          amountWon: amt,
          receivedOn: input.receivedOn,
          receiptKind: "tax_invoice",
          receiptNo: v.b.taxInvoiceNo,
          payerName: input.payerName.trim() || v.c.name,
          note: `[청구서 ${v.b.docNo}] ${input.note.trim()}`.trim(),
          billId,
          createdBy: actor.id,
        })
        .returning({ id: payment.id });
      made.push({ id: p.id, docNo });
      left -= amt;
    }
    await writeAudit(tx, { actorId: actor.id, action: "bill.pay", entityType: "ar_bill", entityId: v.b.docNo, after: { amount, on: input.receivedOn, vouchers: made.map((m) => m.docNo) } });
  });
  return { vouchers: made, remain: v.remain - amount, billNo: v.b.docNo };
}

/** 내 할 일: 청구서 만들기(지난달 외상), 월 합계 세금계산서, 받을 날 지남 */
export async function creditTodos(db: Db, actor: Actor, today: string) {
  type T = { key: string; when: "late" | "today" | "soon"; what: string; detail?: string; href: string; action: string };
  const out: T[] = [];
  if (!can(actor, "money.close_month")) return out;
  const ym = today.slice(0, 7);
  const accounts = await creditAccounts(db, new Date(`${today}T03:00:00Z`));
  const lines = await creditLines(db);
  for (const a of accounts) {
    const unbilledOld = lines.filter((l) => l.customerId === a.c.id && !l.billId && l.remain > 0 && l.deliveredOn.slice(0, 7) < ym);
    if (unbilledOld.length)
      out.push({
        key: `bill-make-${a.c.id}-${ym}`,
        when: today.slice(8) > "05" ? "late" : "today",
        what: `거래처 청구서 만들기: ${a.c.name} ${unbilledOld.length}건 ${won(unbilledOld.reduce((s, l) => s + l.remain, 0))}`,
        detail: `지난달까지 외상 출고분 · 결제 조건 ${a.term}`,
        href: `/money/accounts/${a.c.id}`,
        action: "청구서 만들기",
      });
    if (a.overdue > 0)
      out.push({
        key: `credit-late-${a.c.id}`,
        when: "late",
        what: `업체 외상 연체: ${a.c.name} ${won(a.overdue)}`,
        detail: `받을 날 지나 ${a.overdueDays}일 · 업체에 연락하고 입금을 확인하세요. 연체 중에는 외상 출고 때 경고합니다`,
        href: `/money/accounts/${a.c.id}`,
        action: "연락·입금 확인",
      });
  }
  const bills = await db.select({ b: arBill, name: customer.name, mode: customer.invoiceMode }).from(arBill).innerJoin(customer, eq(customer.id, arBill.customerId)).where(and(isNull(arBill.cancelledAt), isNull(arBill.taxInvoiceNo)));
  for (const { b, name, mode } of bills) {
    if (mode !== "monthly") continue;
    const dl = monthlyInvoiceDeadline(b.ym);
    out.push({
      key: `bill-tax-${b.id}`,
      when: today > dl ? "late" : daysBetween(today, dl) <= 3 ? "today" : "soon",
      what: `월 합계 세금계산서 발행: ${name} ${b.docNo} ${won(b.totalWon)}`,
      detail: `${dl}까지 발행하고 승인 번호를 청구서에 적으세요(부가가치세법 제34조)`,
      href: `/money/accounts/bills/${b.id}`,
      action: "번호 적기",
    });
  }
  return out;
}

/** 통장 입금 맞추기 후보: 남은 금액이 같은 청구서, 또는 입금자 이름이 업체와 비슷하고 금액이 남은 금액 이하 */
export async function openBills(db: Db) {
  const bills = await db.select({ b: arBill, name: customer.name }).from(arBill).innerJoin(customer, eq(customer.id, arBill.customerId)).where(isNull(arBill.cancelledAt));
  const paid = await billPayments(db, bills.map((x) => x.b.id));
  return bills.map(({ b, name }) => ({ id: b.id, docNo: b.docNo, name, totalWon: b.totalWon, remain: b.totalWon - (paid.get(b.id) ?? 0), dueOn: b.dueOn })).filter((x) => x.remain > 0);
}
