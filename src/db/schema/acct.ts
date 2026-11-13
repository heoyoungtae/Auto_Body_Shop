// 회계 기반(보고서 센터 4단계): 개업일 기초 잔액과 자금 전표.
// 분개는 저장하지 않는다. 정비명세서·입금 전표·지출 결의·외상·급여·감가상각·재고 움직임에서 그때그때 만든다(modules/acct/journal.ts).
// 그 밖의 돈(자본금·대출·이자·세금 납부·대표 인출 등)만 자금 전표로 적는다. 전표는 고치지 않고 취소 전표(reversalOf)로 지운다.
import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { bankTx } from "./bank";
import { appUser, createdAt, id } from "./platform";

/** 기초 잔액 한 줄(계정별). won 은 그 계정이 늘어나는 쪽 금액(감가상각누계액도 +로 적는다). 한 번에 통째로 바꾼다 */
export const acctOpening = pgTable(
  "acct_opening",
  {
    id: id(),
    /** 기초 잔액 날짜(개업일). 모든 줄이 같다 */
    on: text("on").notNull(),
    code: text("code").notNull(),
    won: integer("won").notNull(),
    note: text("note"),
    by: uuid("by").references(() => appUser.id),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("acct_opening_code_uq").on(t.code)],
);

/** 자금 전표(FS-연월-순번). kind: accounts.ts FUND_KINDS. 차변·대변 계정 하나씩 */
export const fundSlip = pgTable(
  "fund_slip",
  {
    id: id(),
    docNo: text("doc_no").notNull(),
    on: text("on").notNull(),
    kind: text("kind").notNull(),
    drCode: text("dr_code").notNull(),
    crCode: text("cr_code").notNull(),
    /** 원. 취소 전표도 같은 금액(차변·대변을 뒤집어 적는다) */
    amountWon: integer("amount_won").notNull(),
    memo: text("memo"),
    /** 통장 내역에서 만들었으면 그 거래 */
    bankTxId: uuid("bank_tx_id").references(() => bankTx.id),
    /** 취소 전표가 지우는 원래 전표 */
    reversalOf: uuid("reversal_of"),
    createdBy: uuid("created_by").references(() => appUser.id),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("fund_slip_no_uq").on(t.docNo), index("fund_slip_on_idx").on(t.on)],
);

/** 연간 예산(보고서 센터 5단계): 달별·묶음별 금액. key 는 modules/acct/budget.ts BUDGET_ROWS. 연초에 대표가 적고 달별로 고칠 수 있다 */
export const budgetLine = pgTable(
  "budget_line",
  {
    id: id(),
    /** 연월(2027-01) */
    ym: text("ym").notNull(),
    key: text("key").notNull(),
    won: integer("won").notNull(),
    by: uuid("by").references(() => appUser.id),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("budget_line_uq").on(t.ym, t.key)],
);

/** 월 마감 승인 때 저장한 그 달 보고서(숫자 줄·표). 나중에 전표가 바뀌어도 마감 때 숫자를 다시 본다 */
export const reportSnapshot = pgTable(
  "report_snapshot",
  {
    id: id(),
    ym: text("ym").notNull(),
    reportId: text("report_id").notNull(),
    body: jsonb("body").notNull(),
    savedBy: uuid("saved_by").references(() => appUser.id),
    savedAt: timestamp("saved_at", { withTimezone: true }).notNull(),
  },
  (t) => [uniqueIndex("report_snapshot_uq").on(t.ym, t.reportId)],
);

/** 월간 경영보고서(MR): 그 달 핵심 숫자를 묶어 대표 결재. sections 는 올릴 때 숫자 그대로(결재받은 숫자가 바뀌지 않게) */
export const mgmtReport = pgTable(
  "mgmt_report",
  {
    id: id(),
    ym: text("ym").notNull(),
    approvalDocId: uuid("approval_doc_id").notNull(),
    sections: jsonb("sections").notNull(),
    comment: text("comment"),
    createdBy: uuid("created_by").references(() => appUser.id),
    createdAt: createdAt(),
  },
  (t) => [index("mgmt_report_ym_idx").on(t.ym)],
);
