// 회계(STD-12): 수납 전표·지출 결의(F-12-01)·일일 마감·월 마감·미수 독촉 기록.
// 전표는 고치거나 지우지 않는다. 잘못 적었으면 같은 금액을 빼는 취소 전표(reversalOf)를 새로 적는다(12.4).
import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { approvalDoc } from "./approval";
import { appUser, createdAt, id } from "./platform";
import { supplier } from "./purchase";
import { repairOrder } from "./repair";

/** 고객 수납 전표(카드·현금·계좌 이체). 보험사 입금은 보험 청구(insurance_claim)에 적는다 */
export const payment = pgTable(
  "payment",
  {
    id: id(),
    docNo: text("doc_no").notNull(),
    repairOrderId: uuid("repair_order_id")
      .notNull()
      .references(() => repairOrder.id),
    /** card 카드 · cash 현금 · transfer 계좌 이체 */
    method: text("method").notNull(),
    /** 원(부가세 포함). 취소 전표는 음수 */
    amountWon: integer("amount_won").notNull(),
    receivedOn: text("received_on").notNull(),
    /** card_slip 카드 전표 · cash_receipt 현금영수증 · tax_invoice 세금계산서 · none 발행 안 함 */
    receiptKind: text("receipt_kind").notNull(),
    receiptNo: text("receipt_no"),
    payerName: text("payer_name"),
    note: text("note"),
    /** 취소 전표가 지우는 원래 전표 */
    reversalOf: uuid("reversal_of"),
    createdBy: uuid("created_by").references(() => appUser.id),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("payment_no_uq").on(t.docNo),
    index("payment_ro_idx").on(t.repairOrderId),
    index("payment_on_idx").on(t.receivedOn),
  ],
);

/** 고객 미수 독촉 기록(30일 지나면) */
export const arFollow = pgTable(
  "ar_follow",
  {
    id: id(),
    repairOrderId: uuid("repair_order_id")
      .notNull()
      .references(() => repairOrder.id),
    note: text("note").notNull(),
    promisedOn: text("promised_on"),
    by: uuid("by").references(() => appUser.id),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ar_follow_ro_idx").on(t.repairOrderId)],
);

/**
 * 지출 결의(F-12-01). 결재는 전자결재 문서(approvalDoc, 양식 F-12-01)로 하고, 여기에는 근거 전표·증빙·지급을 둔다.
 * 근거: po 발주서 · outsource 외주 의뢰서 · none(결의서 자체가 근거). 상태는 결재 문서 + paidAt·cancelledAt 으로 본다
 */
export const expense = pgTable(
  "expense",
  {
    id: id(),
    docNo: text("doc_no").notNull(),
    approvalDocId: uuid("approval_doc_id")
      .notNull()
      .references(() => approvalDoc.id),
    category: text("category").notNull(),
    /** 한 결의에 계정이 섞이면(예: 발주서에 도료와 소모품) 계정별 금액(부가세 포함). 비어 있으면 category 하나로 전액 */
    split: jsonb("split").$type<{ category: string; won: number }[]>().notNull().default([]),
    supplierId: uuid("supplier_id").references(() => supplier.id),
    payeeName: text("payee_name").notNull(),
    sourceKind: text("source_kind").notNull().default("none"),
    sourceId: uuid("source_id"),
    sourceNo: text("source_no"),
    purpose: text("purpose").notNull(),
    supplyWon: integer("supply_won").notNull(),
    vatWon: integer("vat_won").notNull().default(0),
    amountWon: integer("amount_won").notNull(),
    /** tax_invoice 세금계산서 · card 카드 전표 · cash_receipt 현금영수증 · bill 고지서·계약서 · receipt 간이영수증 · pending 나중에 받음 */
    evidenceKind: text("evidence_kind").notNull(),
    evidenceNo: text("evidence_no"),
    evidenceOn: text("evidence_on"),
    files: jsonb("files")
      .$type<{ path: string; name: string; at: string; by: string }[]>()
      .notNull()
      .default([]),
    dueOn: text("due_on"),
    /** 지급 방법(예정): transfer 계좌 이체 · card 법인카드 · cash 현금 · auto 자동이체 */
    payMethod: text("pay_method").notNull(),
    paidOn: text("paid_on"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    paidBy: uuid("paid_by").references(() => appUser.id),
    /** 지급한 계좌(가린 번호) */
    paidTo: text("paid_to"),
    paidNote: text("paid_note"),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancelledBy: uuid("cancelled_by").references(() => appUser.id),
    cancelReason: text("cancel_reason"),
    createdBy: uuid("created_by").references(() => appUser.id),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("expense_no_uq").on(t.docNo),
    index("expense_source_idx").on(t.sourceId),
    index("expense_supplier_idx").on(t.supplierId),
  ],
);

/** 일일 마감(12.4): 그날 수납 합계와 카드 단말기 합계·세어 본 현금을 맞춘다 */
export const dailyClose = pgTable(
  "daily_close",
  {
    id: id(),
    day: text("day").notNull(),
    cardWon: integer("card_won").notNull(),
    cashWon: integer("cash_won").notNull(),
    transferWon: integer("transfer_won").notNull(),
    cardTerminalWon: integer("card_terminal_won").notNull(),
    cashCountedWon: integer("cash_counted_won").notNull(),
    diffWon: integer("diff_won").notNull(),
    note: text("note"),
    closedBy: uuid("closed_by").references(() => appUser.id),
    closedAt: timestamp("closed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("daily_close_day_uq").on(t.day)],
);

/** 월 마감(12.4): 회계가 매출·매입·미수·미지급을 모아 올리고 대표가 승인한다. status: submitted · approved · returned */
export const monthClose = pgTable(
  "month_close",
  {
    id: id(),
    ym: text("ym").notNull(),
    status: text("status").notNull(),
    snapshot: jsonb("snapshot").$type<Record<string, unknown>>().notNull(),
    note: text("note"),
    preparedBy: uuid("prepared_by").references(() => appUser.id),
    preparedAt: timestamp("prepared_at", { withTimezone: true }).notNull(),
    approvedBy: uuid("approved_by").references(() => appUser.id),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    returnNote: text("return_note"),
  },
  (t) => [uniqueIndex("month_close_ym_uq").on(t.ym)],
);
