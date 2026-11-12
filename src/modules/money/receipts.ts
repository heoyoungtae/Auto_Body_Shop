// 수납(STD-12 12.1)·미수금(12.3). 받을 금액은 정비명세서(보험 건은 보험 청구의 고객 몫)에서 불러오고, 다시 치지 않는다.
// 전표는 고치지 않는다. 잘못 적었으면 취소 전표(같은 금액을 뺌)를 오늘 날짜로 적는다(12.4).
import { and, desc, eq, gte, inArray, lte, ne } from "drizzle-orm";
import type { Db } from "@/db/client";
import {
  appUser,
  arFollow,
  customer,
  estimate,
  estimateLine,
  insuranceClaim,
  payment,
  repairOrder,
  repairStatement,
  vehicle,
} from "@/db/schema";
import { can } from "@/modules/auth/permissions";
import type { Role } from "@/modules/auth/roles";
import { writeAudit } from "@/modules/platform/audit";
import { nextDocNo } from "@/modules/platform/docno";
import { UserError } from "@/modules/platform/errors";
import { notifyRole } from "@/modules/platform/notify";
import { seoulDate } from "@/modules/platform/time";
import { claimView } from "@/modules/repair/claims";
import { totals } from "@/modules/repair/estimate-rules";
import { assertOpenDay } from "./lock";
import {
  AR_DUN_DAYS,
  daysBetween,
  isPayInMethod,
  isReceiptKind,
  PAY_IN_METHODS,
  receiptProblem,
  RECEIPT_KINDS,
} from "./rules";

export class MoneyError extends UserError {}
type Actor = { id: string; roles: Role[] };
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;

async function roOf(db: Db, roId: string) {
  const [r] = await db
    .select({
      ro: repairOrder,
      plateNo: vehicle.plateNo,
      customerName: customer.name,
    })
    .from(repairOrder)
    .innerJoin(vehicle, eq(vehicle.id, repairOrder.vehicleId))
    .innerJoin(customer, eq(customer.id, repairOrder.customerId))
    .where(eq(repairOrder.id, roId));
  if (!r) throw new MoneyError("없는 수리 건입니다");
  return r;
}

/**
 * 고객에게 받을 금액과 그 출처. 보험 건: 보험 청구의 고객 몫(일반 줄 + 자기부담금 + 합의한 미승인분).
 * 자비 건: 정비명세서 합계, 명세서 전이면 고객 승인한 견적 합계(선수금용 어림)
 */
export async function customerDue(db: Db, roId: string) {
  const { ro } = await roOf(db, roId);
  const [st] = await db
    .select()
    .from(repairStatement)
    .where(eq(repairStatement.repairOrderId, roId));
  if (ro.insurance !== "self") {
    const v = await claimView(db, roId);
    return {
      due: v.amounts.customerDue,
      from: `보험 청구의 고객 몫(${v.amounts.from ?? "견적 없음"})`,
      final: !!st,
      statement: st ?? null,
      insurerDue: v.amounts.insurerDue,
    };
  }
  if (st)
    return {
      due: st.totalWon,
      from: `정비명세서 ${st.docNo}`,
      final: true,
      statement: st,
      insurerDue: 0,
    };
  const [e] = await db
    .select()
    .from(estimate)
    .where(
      and(
        eq(estimate.repairOrderId, roId),
        inArray(estimate.status, ["accepted", "partial"]),
      ),
    )
    .orderBy(desc(estimate.rev))
    .limit(1);
  if (!e)
    return { due: 0, from: null, final: false, statement: null, insurerDue: 0 };
  const lines = await db
    .select()
    .from(estimateLine)
    .where(eq(estimateLine.estimateId, e.id));
  return {
    due: totals(lines, true).total,
    from: `견적 ${e.docNo}(고객 승인 줄, 명세서 발급 전 어림)`,
    final: false,
    statement: null,
    insurerDue: 0,
  };
}

async function paymentsOf(db: Db, roId: string) {
  return db
    .select()
    .from(payment)
    .where(and(eq(payment.repairOrderId, roId), eq(payment.payer, "customer")))
    .orderBy(payment.createdAt);
}

/** 수리 건의 수납 화면 한 장: 받을 금액·받은 금액·남은 금액·전표·독촉 */
export async function receiptView(db: Db, roId: string) {
  const r = await roOf(db, roId);
  const due = await customerDue(db, roId);
  const list = await paymentsOf(db, roId);
  const paid = list.reduce((s, p) => s + p.amountWon, 0);
  const reversed = new Set(list.map((p) => p.reversalOf).filter(Boolean));
  const follows = await db
    .select()
    .from(arFollow)
    .where(eq(arFollow.repairOrderId, roId))
    .orderBy(desc(arFollow.at));
  const uids = [
    ...new Set(
      [...list.map((p) => p.createdBy), ...follows.map((f) => f.by)].filter(
        (x): x is string => !!x,
      ),
    ),
  ];
  const names = new Map(
    (uids.length
      ? await db
          .select({ id: appUser.id, name: appUser.name })
          .from(appUser)
          .where(inArray(appUser.id, uids))
      : []
    ).map((u) => [u.id, u.name]),
  );
  const [claim] =
    r.ro.insurance !== "self"
      ? await db
          .select()
          .from(insuranceClaim)
          .where(eq(insuranceClaim.repairOrderId, roId))
      : [];
  return {
    ...r,
    due,
    paid,
    remain: due.due - paid,
    payments: list.map((p) => ({
      ...p,
      reversed: reversed.has(p.id),
      byName: p.createdBy ? (names.get(p.createdBy) ?? "?") : "",
    })),
    follows: follows.map((f) => ({
      ...f,
      byName: f.by ? (names.get(f.by) ?? "?") : "",
    })),
    claim: claim ?? null,
    /** 출고 때 고른 수납 방법(불러오기용) */
    deliveredMethod: due.statement?.payMethod ?? null,
    deliveredOn: due.statement?.deliveredAt
      ? seoulDate(due.statement.deliveredAt)
      : null,
  };
}

export type PaymentInput = {
  method: string;
  amountWon: number | null;
  receivedOn: string;
  receiptKind: string;
  receiptNo: string;
  payerName: string;
  note: string;
};

/** 수납 기록. 남은 금액보다 많이 받을 수 없고, 마감한 날짜에는 적지 않는다 */
export async function recordPayment(
  db: Db,
  actor: Actor,
  roId: string,
  input: PaymentInput,
  now = new Date(),
) {
  if (!can(actor, "money.receive"))
    throw new MoneyError("수납은 상담원·공장장·회계 담당·대표가 기록합니다");
  const v = await receiptView(db, roId);
  if (v.ro.status === "cancelled") throw new MoneyError("취소된 수리 건입니다");
  if (!isPayInMethod(input.method))
    throw new MoneyError("받은 방법(카드·현금·계좌 이체)을 골라 주세요");
  if (!isReceiptKind(input.receiptKind))
    throw new MoneyError("고객에게 준 증빙을 골라 주세요");
  const amount = input.amountWon ?? 0;
  if (amount <= 0) throw new MoneyError("받은 금액을 적어 주세요");
  const today = seoulDate(now);
  if (!ISO.test(input.receivedOn) || input.receivedOn > today)
    throw new MoneyError("받은 날을 확인해 주세요(오늘이나 그 전)");
  if (!v.due.from)
    throw new MoneyError(
      "받을 금액이 없습니다. 견적을 고객에게 승인받거나 정비명세서를 먼저 발급하세요",
    );
  if (amount > v.remain)
    throw new MoneyError(
      `남은 금액(${won(Math.max(0, v.remain))})보다 많습니다. 받을 금액은 ${v.due.from}에서 불러옵니다. 금액이 바뀌었으면 견적·청구를 먼저 고치세요`,
    );
  const prob = receiptProblem(
    input.method,
    input.receiptKind,
    amount,
    input.receiptNo,
  );
  if (prob) throw new MoneyError(prob);
  if (
    input.receiptKind === "none" &&
    input.method !== "card" &&
    !input.note.trim()
  )
    throw new MoneyError(
      "현금영수증을 발행하지 않았으면 이유를 메모에 적어 주세요(예: 이미 발행된 선수금의 잔액)",
    );
  await assertOpenDay(db, input.receivedOn);
  const docNo = await nextDocNo(db, "PM", now);
  const [p] = await db
    .insert(payment)
    .values({
      docNo,
      repairOrderId: roId,
      method: input.method,
      amountWon: amount,
      receivedOn: input.receivedOn,
      receiptKind: input.receiptKind,
      receiptNo: input.receiptNo.trim() || null,
      payerName: input.payerName.trim() || null,
      note: input.note.trim() || null,
      createdBy: actor.id,
    })
    .returning({ id: payment.id });
  await writeAudit(db, {
    actorId: actor.id,
    action: "payment.record",
    entityType: "repair_order",
    entityId: v.ro.docNo,
    after: { docNo, method: input.method, amount, receipt: input.receiptKind },
  });
  return { id: p.id, docNo, remain: v.remain - amount };
}

/** 취소 전표: 원래 전표와 같은 금액을 빼는 전표를 오늘 날짜로 적는다(원래 전표는 그대로 둔다) */
export async function reversePayment(
  db: Db,
  actor: Actor,
  paymentId: string,
  reason: string,
  now = new Date(),
) {
  if (!can(actor, "money.receive"))
    throw new MoneyError("취소 전표는 수납 권한이 있는 사람이 적습니다");
  const [p] = await db.select().from(payment).where(eq(payment.id, paymentId));
  if (!p) throw new MoneyError("없는 전표입니다");
  if (p.payer === "insurer")
    throw new MoneyError(
      "보험사 입금 전표는 보험 청구의 입금 확인에서 만들어집니다. 잘못 적었으면 대표에게 알려 주세요",
    );
  if (p.reversalOf || p.amountWon < 0)
    throw new MoneyError(
      "취소 전표는 다시 취소하지 않습니다. 맞는 금액으로 새로 수납하세요",
    );
  const [dup] = await db
    .select({ id: payment.id })
    .from(payment)
    .where(eq(payment.reversalOf, p.id));
  if (dup) throw new MoneyError("이미 취소한 전표입니다");
  if (!reason.trim())
    throw new MoneyError(
      "취소 사유를 적어 주세요(예: 금액 잘못 적음, 카드 승인 취소)",
    );
  const today = seoulDate(now);
  await assertOpenDay(db, today);
  const docNo = await nextDocNo(db, "PM", now);
  await db
    .insert(payment)
    .values({
      docNo,
      repairOrderId: p.repairOrderId,
      method: p.method,
      amountWon: -p.amountWon,
      receivedOn: today,
      receiptKind: p.receiptKind,
      receiptNo: p.receiptNo,
      payerName: p.payerName,
      note: `[취소 ${p.docNo}] ${reason.trim()}`,
      reversalOf: p.id,
      createdBy: actor.id,
    });
  await writeAudit(db, {
    actorId: actor.id,
    action: "payment.reverse",
    entityType: "payment",
    entityId: p.docNo,
    after: { docNo, amount: -p.amountWon, reason: reason.trim() },
  });
  if (p.receivedOn !== today)
    await notifyRole(
      db,
      "owner",
      `수납 취소 전표: ${p.docNo} ${won(p.amountWon)} — ${reason.trim()}`,
      `pm-rev-${p.docNo}`,
      `/money/ro/${p.repairOrderId}`,
    );
  return docNo;
}

/** 미수 독촉 기록 */
export async function recordFollow(
  db: Db,
  actor: Actor,
  roId: string,
  input: { note: string; promisedOn: string },
  now = new Date(),
) {
  if (!can(actor, "money.receive"))
    throw new MoneyError("독촉 기록은 수납 권한이 있는 사람이 합니다");
  const v = await receiptView(db, roId);
  if (v.remain <= 0) throw new MoneyError("남은 금액이 없습니다");
  if (!input.note.trim())
    throw new MoneyError("누구에게 어떻게 연락했는지 적어 주세요");
  if (
    input.promisedOn &&
    (!ISO.test(input.promisedOn) || input.promisedOn < seoulDate(now))
  )
    throw new MoneyError("약속한 날은 오늘이나 그 뒤입니다");
  await db
    .insert(arFollow)
    .values({
      repairOrderId: roId,
      note: input.note.trim(),
      promisedOn: input.promisedOn || null,
      by: actor.id,
      at: now,
    });
  await writeAudit(db, {
    actorId: actor.id,
    action: "ar.follow",
    entityType: "repair_order",
    entityId: v.ro.docNo,
    after: { note: input.note.trim(), promisedOn: input.promisedOn || null },
  });
}

export type ArRow = {
  roId: string;
  docNo: string;
  who: string;
  due: number;
  paid: number;
  remain: number;
  deliveredOn: string | null;
  days: number | null;
  lastFollow: string | null;
  promisedOn: string | null;
  insurance: boolean;
};

/** 고객 미수: 출고한(또는 명세서 발급한) 건 중 남은 금액이 있는 것. 오래된 순 */
export async function customerReceivables(
  db: Db,
  now = new Date(),
): Promise<ArRow[]> {
  const today = seoulDate(now);
  const rows = await db
    .select({
      ro: repairOrder,
      st: repairStatement,
      plateNo: vehicle.plateNo,
      customerName: customer.name,
    })
    .from(repairStatement)
    .innerJoin(repairOrder, eq(repairOrder.id, repairStatement.repairOrderId))
    .innerJoin(vehicle, eq(vehicle.id, repairOrder.vehicleId))
    .innerJoin(customer, eq(customer.id, repairOrder.customerId))
    .where(ne(repairOrder.status, "cancelled"));
  if (!rows.length) return [];
  const ids = rows.map((r) => r.ro.id);
  const pays = await db
    .select({ ro: payment.repairOrderId, amt: payment.amountWon })
    .from(payment)
    .where(and(inArray(payment.repairOrderId, ids), eq(payment.payer, "customer")));
  const follows = await db
    .select()
    .from(arFollow)
    .where(inArray(arFollow.repairOrderId, ids))
    .orderBy(desc(arFollow.at));
  const out: ArRow[] = [];
  for (const r of rows) {
    const due =
      r.ro.insurance === "self"
        ? r.st.totalWon
        : (await customerDue(db, r.ro.id)).due;
    const paid = pays
      .filter((p) => p.ro === r.ro.id)
      .reduce((s, p) => s + p.amt, 0);
    if (due - paid <= 0) continue;
    const deliveredOn = r.st.deliveredAt ? seoulDate(r.st.deliveredAt) : null;
    const f = follows.find((x) => x.repairOrderId === r.ro.id);
    out.push({
      roId: r.ro.id,
      docNo: r.ro.docNo,
      who: `${r.customerName} ${r.plateNo}`,
      due,
      paid,
      remain: due - paid,
      deliveredOn,
      days: deliveredOn ? daysBetween(deliveredOn, today) : null,
      lastFollow: f ? seoulDate(f.at) : null,
      promisedOn: f?.promisedOn ?? null,
      insurance: r.ro.insurance !== "self",
    });
  }
  return out.sort((a, b) => (b.days ?? -1) - (a.days ?? -1));
}

/** 보험사 미수: 청구하고 아직 입금 확인 안 한 것 */
export async function insurerReceivables(db: Db, now = new Date()) {
  const today = seoulDate(now);
  const rows = await db
    .select({
      c: insuranceClaim,
      roDocNo: repairOrder.docNo,
      plateNo: vehicle.plateNo,
    })
    .from(insuranceClaim)
    .innerJoin(repairOrder, eq(repairOrder.id, insuranceClaim.repairOrderId))
    .innerJoin(vehicle, eq(vehicle.id, repairOrder.vehicleId))
    .where(eq(insuranceClaim.status, "claimed"));
  return rows
    .map(({ c, roDocNo, plateNo }) => {
      const on = c.claimedAt ? seoulDate(c.claimedAt) : today;
      return {
        roId: c.repairOrderId,
        docNo: c.docNo,
        roDocNo,
        plateNo,
        insurer: c.insurer,
        claimedWon: c.claimedWon ?? 0,
        claimedOn: on,
        days: daysBetween(on, today),
        dunnedOn: c.dunnedAt ? seoulDate(c.dunnedAt) : null,
      };
    })
    .sort((a, b) => b.days - a.days);
}

/** 기간의 입금 전표(고객 수납·보험사 입금, 취소 전표 포함) */
export async function listPayments(db: Db, from: string, to: string) {
  return db
    .select({
      p: payment,
      roDocNo: repairOrder.docNo,
      plateNo: vehicle.plateNo,
      customerName: customer.name,
    })
    .from(payment)
    .innerJoin(repairOrder, eq(repairOrder.id, payment.repairOrderId))
    .innerJoin(vehicle, eq(vehicle.id, repairOrder.vehicleId))
    .innerJoin(customer, eq(customer.id, repairOrder.customerId))
    .where(and(gte(payment.receivedOn, from), lte(payment.receivedOn, to)))
    .orderBy(desc(payment.receivedOn), desc(payment.createdAt));
}

/** 출고했는데 수납 기록이 하나도 없는 건(카드·현금·이체로 출고한 것) — 상담원이 적을 일 */
export async function unrecordedDeliveries(db: Db) {
  const rows = await db
    .select({
      roId: repairOrder.id,
      docNo: repairOrder.docNo,
      plateNo: vehicle.plateNo,
      method: repairStatement.payMethod,
      deliveredAt: repairStatement.deliveredAt,
    })
    .from(repairStatement)
    .innerJoin(repairOrder, eq(repairOrder.id, repairStatement.repairOrderId))
    .innerJoin(vehicle, eq(vehicle.id, repairOrder.vehicleId))
    .where(
      and(
        eq(repairOrder.status, "delivered"),
        inArray(repairStatement.payMethod, Object.keys(PAY_IN_METHODS)),
      ),
    );
  if (!rows.length) return [];
  const paid = new Set(
    (
      await db
        .select({ ro: payment.repairOrderId })
        .from(payment)
        .where(
          and(
            inArray(
              payment.repairOrderId,
              rows.map((r) => r.roId),
            ),
            eq(payment.payer, "customer"),
          ),
        )
    ).map((p) => p.ro),
  );
  return rows.filter((r) => !paid.has(r.roId));
}

/** 내 할 일: 출고 뒤 수납 기록 없음(수납 권한), 미수 30일 독촉(회계·대표) */
export async function receiptTodos(db: Db, actor: Actor, today: string) {
  const out: {
    key: string;
    when: "late" | "today" | "soon";
    what: string;
    detail?: string;
    href: string;
    action: string;
  }[] = [];
  if (can(actor, "money.receive")) {
    for (const r of await unrecordedDeliveries(db)) {
      const on = r.deliveredAt ? seoulDate(r.deliveredAt) : today;
      out.push({
        key: `pm-rec-${r.roId}`,
        when: on < today ? "late" : "today",
        what: `수납 기록: ${r.docNo} ${r.plateNo}`,
        detail: `출고 때 '${PAY_IN_METHODS[r.method as keyof typeof PAY_IN_METHODS]}'로 받았다고 했는데 입금 전표가 없습니다`,
        href: `/money/ro/${r.roId}`,
        action: "수납 적기",
      });
    }
  }
  if (can(actor, "money.close_month")) {
    for (const a of await customerReceivables(db)) {
      if (a.days == null || a.days < AR_DUN_DAYS) continue;
      if (a.lastFollow && daysBetween(a.lastFollow, today) < 7) continue;
      if (a.promisedOn && a.promisedOn >= today) continue;
      out.push({
        key: `ar-dun-${a.roId}`,
        when: "late",
        what: `미수 독촉: ${a.docNo} ${a.who} ${won(a.remain)}`,
        detail: `출고 후 ${a.days}일${a.lastFollow ? ` · 마지막 연락 ${a.lastFollow}` : ""}`,
        href: `/money/ro/${a.roId}#follow`,
        action: "연락하고 적기",
      });
    }
  }
  return out;
}

export { PAY_IN_METHODS, RECEIPT_KINDS };
