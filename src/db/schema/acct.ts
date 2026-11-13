// 회계 기반(보고서 센터 4단계): 개업일 기초 잔액과 자금 전표.
// 분개는 저장하지 않는다. 정비명세서·입금 전표·지출 결의·외상·급여·감가상각·재고 움직임에서 그때그때 만든다(modules/acct/journal.ts).
// 그 밖의 돈(자본금·대출·이자·세금 납부·대표 인출 등)만 자금 전표로 적는다. 전표는 고치지 않고 취소 전표(reversalOf)로 지운다.
import { index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
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
