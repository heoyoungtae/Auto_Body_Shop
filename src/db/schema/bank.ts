// 통장·카드·홈택스 거래 내역(STD-12). 대표 휴대폰의 은행·카드 알림 문자(무료 문자 전달 앱 → 앱 수신 주소)와
// 인터넷뱅킹·카드사·홈택스에서 내려받은 엑셀/CSV 를 한곳에 모으고, 앱의 전표(입금 전표·보험 입금·지출 결의·급여)와 맞춘다.
// 거래 한 줄은 고치지 않는다. 맞춘 곳(match*)과 분류(cls)만 바뀐다. 같은 거래가 문자·엑셀로 두 번 와도 한 줄로 합친다.
import { boolean, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { appUser, createdAt, id } from "./platform";

/**
 * 거래 한 줄.
 * kind: in 통장 입금 · out 통장 출금 · card 카드 승인 · card_cancel 카드 취소 ·
 *       tax_sale 매출 세금계산서 · tax_buy 매입 세금계산서 · cash_sale 현금영수증 매출 · cash_buy 현금영수증 매입 · card_buy 홈택스 사업용 카드 매입
 * source: sms 문자 · file 엑셀/CSV · api 유료 자동 연동(나중에) · manual 손으로
 */
export const bankTx = pgTable(
  "bank_tx",
  {
    id: id(),
    kind: text("kind").notNull(),
    /** 설정 › 통장·카드 연동에 등록한 계좌·카드 id(홈택스 줄은 없음) */
    accountId: text("account_id"),
    accountLabel: text("account_label"),
    on: text("on").notNull(),
    /** 시:분(문자·엑셀에 있으면) */
    at: text("at"),
    amountWon: integer("amount_won").notNull(),
    balanceWon: integer("balance_won"),
    /** 상대방: 입금자·받는 분·가맹점·거래처 상호 */
    party: text("party"),
    partyBizNo: text("party_biz_no"),
    memo: text("memo"),
    /** 카드 승인번호 · 세금계산서/현금영수증 승인번호 */
    approvalNo: text("approval_no"),
    supplyWon: integer("supply_won"),
    vatWon: integer("vat_won"),
    source: text("source").notNull(),
    importId: uuid("import_id"),
    /** 받은 문자 원문(엑셀 줄은 비움) */
    raw: text("raw"),
    /** 같은 출처에서 같은 거래가 다시 오면 막는 열쇠 */
    dedupeKey: text("dedupe_key").notNull(),
    /** 맞춘 곳: payment 입금 전표 · expense 지출 결의 · payroll 급여대장 · payable 외상 · tx 다른 거래(카드 취소·홈택스 카드) · class 분류만 */
    matchKind: text("match_kind"),
    matchId: text("match_id"),
    matchNo: text("match_no"),
    /** 분류(전표가 없는 돈): self 내 계좌끼리 · card_bill 카드 대금 · tax 세금 · social 4대보험 · loan 대출 · interest 이자 · fee 수수료 · owner 대표 인출·입금 · refund 환불 · other 기타 · personal 개인 거래(제외) */
    cls: text("cls"),
    matchNote: text("match_note"),
    matchedAuto: boolean("matched_auto").notNull().default(false),
    matchedBy: uuid("matched_by").references(() => appUser.id),
    matchedAt: timestamp("matched_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("bank_tx_dedupe_uq").on(t.dedupeKey),
    index("bank_tx_on_idx").on(t.on),
    index("bank_tx_match_idx").on(t.matchKind, t.matchId),
    index("bank_tx_import_idx").on(t.importId),
  ],
);

/** 엑셀/CSV 올리기 한 번. 잘못 올렸으면 '되돌리기'로 이 번에 새로 들어간 줄(아직 안 맞춘 것)을 지운다 */
export const bankImport = pgTable("bank_import", {
  id: id(),
  /** bank · card · tax_sale · tax_buy · cash_sale · cash_buy · card_buy · hometax(섞임) */
  fileKind: text("file_kind").notNull(),
  fileName: text("file_name").notNull(),
  accountId: text("account_id"),
  rowCount: integer("row_count").notNull(),
  added: integer("added").notNull(),
  dup: integer("dup").notNull(),
  skipped: integer("skipped").notNull(),
  /** 인식한 열(머리글 → 뜻) */
  columns: text("columns"),
  firstOn: text("first_on"),
  lastOn: text("last_on"),
  by: uuid("by").references(() => appUser.id),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  undoneAt: timestamp("undone_at", { withTimezone: true }),
});
