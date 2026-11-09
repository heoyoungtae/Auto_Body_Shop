// 구매·자재·외주(STD-07): 협력업체 대장·평가 F-07-01, 발주서·입고 검수 F-07-02, 재고, 외주 의뢰 F-07-03
import { boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { appUser, createdAt, id } from "./platform";
import { estimate, estimateLine, repairOrder } from "./repair";

/**
 * 협력업체(F-07-01). status: candidate 후보(평가 전·평가 중) / proposed 등록 제안(대표 승인 대기) / registered 등록 /
 * rejected 등록 안 함 / stopped 거래 중지
 */
export const supplier = pgTable(
  "supplier",
  {
    id: id(),
    name: text("name").notNull(),
    bizNo: text("biz_no"),
    /** parts 부품 · paint 도료 · consumable 소모품 · outsource 외주 가공 · waste 폐기물 위탁 */
    kinds: jsonb("kinds").$type<string[]>().notNull().default([]),
    items: text("items"),
    contactName: text("contact_name"),
    phone: text("phone"),
    email: text("email"),
    leadDays: integer("lead_days"),
    returnTerms: text("return_terms"),
    /** 확인한 서류(사업자등록·단가표·TDS·MSDS·인허가·보험) */
    docs: jsonb("docs").$type<string[]>().notNull().default([]),
    note: text("note"),
    status: text("status").notNull().default("candidate"),
    /** 최근 평가 점수 */
    score: integer("score"),
    /** 긴급 1회 사용(미등록 업체): 쓴 날과 등록 평가를 마쳐야 하는 날 */
    emergencyOn: text("emergency_on"),
    emergencyDue: text("emergency_due"),
    approvedBy: uuid("approved_by").references(() => appUser.id),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    stopReason: text("stop_reason"),
    createdBy: uuid("created_by").references(() => appUser.id),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("supplier_status_idx").on(t.status)],
);

/** 평가(등록 평가·정기 평가). scores: 품질·납기·가격·서류·안전환경 점수, stats: 앱 실적(납기 준수율·불량 입고·클레임) */
export const supplierEval = pgTable(
  "supplier_eval",
  {
    id: id(),
    supplierId: uuid("supplier_id")
      .notNull()
      .references(() => supplier.id),
    /** initial 등록 평가 / annual 정기 평가 */
    kind: text("kind").notNull(),
    year: integer("year").notNull(),
    scores: jsonb("scores").$type<Record<string, number>>().notNull(),
    total: integer("total").notNull(),
    stats: jsonb("stats").$type<Record<string, number | null>>().notNull().default({}),
    note: text("note"),
    evaluatedBy: uuid("evaluated_by")
      .notNull()
      .references(() => appUser.id),
    evaluatedAt: timestamp("evaluated_at", { withTimezone: true }).notNull().defaultNow(),
    /** 대표 확정(정기 평가) */
    confirmedBy: uuid("confirmed_by").references(() => appUser.id),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    /** ok 유지 / improve 개선 요청 / stop 거래 중지 */
    outcome: text("outcome"),
  },
  (t) => [index("supplier_eval_sup_idx").on(t.supplierId)],
);

/**
 * 발주서(F-07-02). kind: repair 수리 건 부품(견적에서 자동) / stock 도료·소모품(재고)
 * status: draft 작성 / review 승인 대기 / approved 승인(발주서 보낼 수 있음) / sent 보냄 / partial 일부 입고 / received 입고 끝 / cancelled 취소
 */
export const purchaseOrder = pgTable(
  "purchase_order",
  {
    id: id(),
    docNo: text("doc_no").notNull(),
    kind: text("kind").notNull(),
    supplierId: uuid("supplier_id").references(() => supplier.id),
    repairOrderId: uuid("repair_order_id").references(() => repairOrder.id),
    estimateId: uuid("estimate_id").references(() => estimate.id),
    status: text("status").notNull().default("draft"),
    /** 공급가 합계와 부가세 포함 금액(전결은 부가세 포함으로 본다) */
    supplyWon: integer("supply_won").notNull().default(0),
    totalWon: integer("total_won").notNull().default(0),
    /** 요청 납기와 업체가 회신한 납기 */
    dueOn: text("due_on"),
    replyDueOn: text("reply_due_on"),
    note: text("note"),
    approverRole: text("approver_role"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    approvedBy: uuid("approved_by").references(() => appUser.id),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    returnNote: text("return_note"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    sentBy: uuid("sent_by").references(() => appUser.id),
    /** phone 전화 · message 문자·메신저 · email 메일 · fax 팩스 · visit 방문 */
    sentVia: text("sent_via"),
    receivedAt: timestamp("received_at", { withTimezone: true }),
    /** 세금계산서·거래명세서 연결(STD-12) */
    invoiceNo: text("invoice_no"),
    invoiceOn: text("invoice_on"),
    invoiceBy: uuid("invoice_by").references(() => appUser.id),
    cancelReason: text("cancel_reason"),
    createdBy: uuid("created_by").references(() => appUser.id),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("purchase_order_no_uq").on(t.docNo), index("purchase_order_status_idx").on(t.status), index("purchase_order_ro_idx").on(t.repairOrderId)],
);

/** 발주 줄: 품명·품번·규격·부품 구분·수량·단가, 들어온 수량·불합격 수량 */
export const purchaseLine = pgTable(
  "purchase_line",
  {
    id: id(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => purchaseOrder.id),
    seq: integer("seq").notNull(),
    name: text("name").notNull(),
    partNo: text("part_no"),
    spec: text("spec"),
    /** 견적의 부품 구분(A·B·C·D·F). 견적과 달라지면 안 됨 */
    partCode: text("part_code"),
    qty: integer("qty").notNull().default(1),
    unitWon: integer("unit_won").notNull().default(0),
    estimateLineId: uuid("estimate_line_id").references(() => estimateLine.id),
    stockItemId: uuid("stock_item_id").references(() => stockItem.id),
    receivedQty: integer("received_qty").notNull().default(0),
    rejectedQty: integer("rejected_qty").notNull().default(0),
    note: text("note"),
  },
  (t) => [index("purchase_line_order_idx").on(t.orderId)],
);

/** 입고 검수(F-07-02 검수란). 한 번 들어올 때마다 한 줄. lines: 줄마다 합격·불합격 수량과 로트·유효기간 */
export const purchaseReceipt = pgTable(
  "purchase_receipt",
  {
    id: id(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => purchaseOrder.id),
    lines: jsonb("lines").$type<{ lineId: string; ok: number; bad: number; lot?: string | null; expiresOn?: string | null; location?: string | null }[]>().notNull(),
    /** 확인한 항목(품번·수량 대조, 외관, 포장, 유효기간·로트) */
    checks: jsonb("checks").$type<string[]>().notNull().default([]),
    badNote: text("bad_note"),
    photos: jsonb("photos").$type<string[]>().notNull().default([]),
    ncId: uuid("nc_id"),
    /** 불합격분 반품·교환 처리 */
    returnDoneAt: timestamp("return_done_at", { withTimezone: true }),
    returnNote: text("return_note"),
    receivedBy: uuid("received_by")
      .notNull()
      .references(() => appUser.id),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("purchase_receipt_order_idx").on(t.orderId)],
);

/** 재고 품목(도료·소모품·상비 부품). qty 가 장부 수량, safetyQty 아래로 떨어지면 발주 알림 */
export const stockItem = pgTable(
  "stock_item",
  {
    id: id(),
    name: text("name").notNull(),
    /** paint 도료 · consumable 소모품 · part 상비 부품 */
    kind: text("kind").notNull(),
    spec: text("spec"),
    unit: text("unit").notNull().default("개"),
    location: text("location"),
    safetyQty: integer("safety_qty").notNull().default(0),
    qty: integer("qty").notNull().default(0),
    unitWon: integer("unit_won").notNull().default(0),
    /** 유효기간 관리(도료·퍼티·경화제) */
    expiryTracked: boolean("expiry_tracked").notNull().default(false),
    supplierId: uuid("supplier_id").references(() => supplier.id),
    active: boolean("active").notNull().default(true),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: createdAt(),
  },
  (t) => [index("stock_item_kind_idx").on(t.kind)],
);

/** 유효기간이 있는 품목의 로트별 남은 수량(선입선출: 유효기간 빠른 것부터 뺀다) */
export const stockLot = pgTable(
  "stock_lot",
  {
    id: id(),
    itemId: uuid("item_id")
      .notNull()
      .references(() => stockItem.id),
    lot: text("lot"),
    expiresOn: text("expires_on").notNull(),
    qty: integer("qty").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index("stock_lot_item_idx").on(t.itemId)],
);

/** 재고 움직임. reason: receive 입고 / use 사용 / count 실사 조정 / discard 폐기(유효기간 경과) */
export const stockMove = pgTable(
  "stock_move",
  {
    id: id(),
    itemId: uuid("item_id")
      .notNull()
      .references(() => stockItem.id),
    qty: integer("qty").notNull(),
    reason: text("reason").notNull(),
    ref: text("ref"),
    repairOrderId: uuid("repair_order_id").references(() => repairOrder.id),
    lot: text("lot"),
    note: text("note"),
    by: uuid("by").references(() => appUser.id),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("stock_move_item_idx").on(t.itemId, t.at)],
);

/** 재고 실사(월말 도료·고가 소모품, 분기 말 전체). lines: 품목별 장부·실물 수량 */
export const stockCount = pgTable("stock_count", {
  id: id(),
  /** monthly 월말 / quarterly 분기 말 */
  kind: text("kind").notNull(),
  lines: jsonb("lines").$type<{ itemId: string; name: string; book: number; actual: number; unitWon: number }[]>().notNull(),
  bookWon: integer("book_won").notNull(),
  diffWon: integer("diff_won").notNull(),
  note: text("note"),
  ncId: uuid("nc_id"),
  countedBy: uuid("counted_by")
    .notNull()
    .references(() => appUser.id),
  countedAt: timestamp("counted_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * 외주 의뢰(F-07-03). workType: frame 프레임 교정 · adas 첨단운전보조 보정 · glass 유리 · electric 전장 · wheel 휠 복원 · other
 * status: draft 작성 / review 승인 대기 / approved 승인 / requested 의뢰함 / out 차량 반출 / returned 결과 받음 / accepted 수용(끝) / cancelled 취소
 */
export const outsourceJob = pgTable(
  "outsource_job",
  {
    id: id(),
    docNo: text("doc_no").notNull(),
    supplierId: uuid("supplier_id")
      .notNull()
      .references(() => supplier.id),
    repairOrderId: uuid("repair_order_id")
      .notNull()
      .references(() => repairOrder.id),
    workType: text("work_type").notNull(),
    scope: text("scope").notNull(),
    required: text("required").notNull(),
    dueOn: text("due_on").notNull(),
    amountWon: integer("amount_won").notNull().default(0),
    /** 차를 업체로 옮기는지(출장 작업이면 false) */
    moveOut: boolean("move_out").notNull().default(true),
    status: text("status").notNull().default("draft"),
    approverRole: text("approver_role"),
    approvedBy: uuid("approved_by").references(() => appUser.id),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    returnNote: text("return_note"),
    requestedAt: timestamp("requested_at", { withTimezone: true }),
    /** 반출 전 고객 사전 알림(상담원) */
    customerNoticeAt: timestamp("customer_notice_at", { withTimezone: true }),
    customerNoticeBy: uuid("customer_notice_by").references(() => appUser.id),
    customerNoticeNote: text("customer_notice_note"),
    outAt: timestamp("out_at", { withTimezone: true }),
    outKm: integer("out_km"),
    inAt: timestamp("in_at", { withTimezone: true }),
    inKm: integer("in_km"),
    /** 결과(사진·보정 성적서) */
    resultNote: text("result_note"),
    resultPhotos: jsonb("result_photos").$type<string[]>().notNull().default([]),
    resultAt: timestamp("result_at", { withTimezone: true }),
    resultBy: uuid("result_by").references(() => appUser.id),
    /** 재작업 요청 횟수와 마지막 사유 */
    redoCount: integer("redo_count").notNull().default(0),
    redoNote: text("redo_note"),
    acceptedBy: uuid("accepted_by").references(() => appUser.id),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    cancelReason: text("cancel_reason"),
    createdBy: uuid("created_by").references(() => appUser.id),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("outsource_job_no_uq").on(t.docNo), index("outsource_job_ro_idx").on(t.repairOrderId), index("outsource_job_status_idx").on(t.status)],
);
