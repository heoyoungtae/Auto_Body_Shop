// 구매·자재·외주(STD-07): 협력업체 대장·평가 F-07-01, 발주서·입고 검수 F-07-02, 재고, 외주 의뢰 F-07-03
import { boolean, doublePrecision, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid, type AnyPgColumn } from "drizzle-orm/pg-core";
import { appUser, createdAt, id } from "./platform";
import { assetColumns } from "./asset";
import { estimate, estimateLine, repairOrder } from "./repair";
import { chemical } from "./safety";

export type SupplierDocFile = { doc: string; path: string; name: string; at: string; by: string };

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
    /** 올린 서류 파일(그림·PDF). 통장 사본(bankbook)은 계좌 권한자만 열어 봄 */
    docFiles: jsonb("doc_files").$type<SupplierDocFile[]>().notNull().default([]),
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
    /**
     * 대금 입금 계좌. 계좌번호는 민감 키로 암호화(bankAccountEnc), 화면·감사 기록에는 가린 번호(bankAccountMasked)만.
     * 바꾸면 확인(bankVerified*)이 풀리고, 계좌 권한자가 업체에 전화로 확인해야 지급에 씁니다(계좌 바꿔치기 사기 방지).
     */
    bankName: text("bank_name"),
    bankAccountEnc: text("bank_account_enc"),
    bankAccountMasked: text("bank_account_masked"),
    bankHolder: text("bank_holder"),
    bankChangedBy: uuid("bank_changed_by").references(() => appUser.id),
    bankChangedAt: timestamp("bank_changed_at", { withTimezone: true }),
    bankVerifiedBy: uuid("bank_verified_by").references(() => appUser.id),
    bankVerifiedAt: timestamp("bank_verified_at", { withTimezone: true }),
    bankVerifyNote: text("bank_verify_note"),
    /** 결제 조건: now 즉시 · month_end 당월 말 · next_end 익월 말 · next_day 익월 payDay일. 발주서가 불러온다 */
    payTerm: text("pay_term").notNull().default("next_end"),
    payDay: integer("pay_day"),
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
    /** 결제 조건(업체 값을 불러오고 건마다 바꿀 수 있음). 비어 있으면 업체 값 */
    payTerm: text("pay_term"),
    payDay: integer("pay_day"),
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
    /** 단가를 적은 방식: excluded 부가세 별도 · included 부가세 포함(공급가로 바꿔 unitWon 에 저장) · none 부가세 없음(면세·간이과세 업체). unitWon 은 늘 공급가 */
    vatMode: text("vat_mode").notNull().default("excluded"),
    /** 한 단위(캔·통)의 용량·중량. 예: 4 L, 1 kg. 조색 사용량 환산·화학물질 월 사용량에 씀 */
    packAmount: doublePrecision("pack_amount"),
    packUnit: text("pack_unit"),
    /** 지출 계정(money/rules EXP_CATEGORIES). 비우면 구분에서 정한다(도료→도료, 소모품→소모품, 상비 부품→부품) */
    expCategory: text("exp_category"),
    /** 화학물질 목록(F-09-02) 연결. MSDS 는 그쪽 한 곳에서 관리한다 */
    chemicalId: uuid("chemical_id").references(() => chemical.id),
    /** false = 사용 중지(목록·발주·사용에서 빠짐) */
    active: boolean("active").notNull().default(true),
    /** 소진 후 중지: 새 발주는 막고 남은 것은 쓴다. 0이 되면 사용 중지로 바뀜 */
    windDown: boolean("wind_down").notNull().default(false),
    /** 중지 사유: discontinued 단종 · replaced 대체품으로 바꿈 · unused 안 씀 · other 기타 */
    stopReason: text("stop_reason"),
    stopNote: text("stop_note"),
    replacedById: uuid("replaced_by_id").references((): AnyPgColumn => stockItem.id),
    stoppedBy: uuid("stopped_by").references(() => appUser.id),
    stoppedAt: timestamp("stopped_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: createdAt(),
  },
  (t) => [index("stock_item_kind_idx").on(t.kind)],
);

/**
 * 품목 문서: 시험성적서·ICP 성적서·인증서 등. MSDS 는 화학물질 목록에서 관리하므로 여기 두지 않는다.
 * kind: coa 시험성적서 · icp ICP 성적서(유해물질) · cert 인증서 · other 기타. result: pass 적합 · fail 부적합 · null 해당 없음.
 * lot 이 있으면 그 로트에만 해당하는 성적서. active=false 는 새 판으로 바뀌었거나 뺀 문서(지우지 않고 남긴다)
 */
export const stockItemDoc = pgTable(
  "stock_item_doc",
  {
    id: id(),
    itemId: uuid("item_id")
      .notNull()
      .references(() => stockItem.id),
    kind: text("kind").notNull(),
    title: text("title"),
    issuer: text("issuer"),
    issuedOn: text("issued_on"),
    expiresOn: text("expires_on"),
    result: text("result"),
    lot: text("lot"),
    path: text("path"),
    fileName: text("file_name"),
    note: text("note"),
    active: boolean("active").notNull().default(true),
    uploadedBy: uuid("uploaded_by").references(() => appUser.id),
    createdAt: createdAt(),
  },
  (t) => [index("stock_item_doc_item_idx").on(t.itemId)],
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

/**
 * 비품·자산(F-07-04). no: 관리 번호(FX-001). asset: 정책값(자산 비품 기준 금액) 이상이면 자산 비품
 * status: in_use 사용 중 / lost 분실 / broken 파손 / disposed 처분
 */
export const fixture = pgTable(
  "fixture",
  {
    id: id(),
    no: text("no").notNull(),
    name: text("name").notNull(),
    /** tool 공구 · ppe 보호구 · it 전산(저장장치) · furniture 집기 · vehicle 차량·운반 · other */
    category: text("category").notNull(),
    spec: text("spec"),
    purchasedOn: text("purchased_on"),
    priceWon: integer("price_won").notNull().default(0),
    asset: boolean("asset").notNull().default(false),
    location: text("location"),
    holderId: uuid("holder_id").references(() => appUser.id),
    /** 개인 지급품 수령 확인(사용자) */
    receivedAt: timestamp("received_at", { withTimezone: true }),
    warrantyUntil: text("warranty_until"),
    supplierId: uuid("supplier_id").references(() => supplier.id),
    /** 지출 결의(F-12-01) 번호·근거 */
    expenseRef: text("expense_ref"),
    labeledAt: timestamp("labeled_at", { withTimezone: true }),
    status: text("status").notNull().default("in_use"),
    note: text("note"),
    /** 처분: 방법(sell 매각 · scrap 폐기 · donate 기증)·근거·저장장치 자료 삭제 확인 */
    disposedOn: text("disposed_on"),
    disposeMethod: text("dispose_method"),
    disposeNote: text("dispose_note"),
    dataWiped: boolean("data_wiped"),
    /** 관리자(정). 사용자(holder)와 따로 — 공용 비품도 책임자가 있다 */
    managerId: uuid("manager_id").references(() => appUser.id),
    ...assetColumns(),
    createdBy: uuid("created_by").references(() => appUser.id),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("fixture_no_uq").on(t.no), index("fixture_holder_idx").on(t.holderId)],
);

/** 비품 이력: register 등록 · move 위치·사용자 변경 · receive 수령 확인 · check 연 1회 실물 확인 · lost 분실 · broken 파손 · found 되찾음·수리 · dispose 처분 */
export const fixtureEvent = pgTable(
  "fixture_event",
  {
    id: id(),
    fixtureId: uuid("fixture_id")
      .notNull()
      .references(() => fixture.id),
    kind: text("kind").notNull(),
    detail: text("detail"),
    by: uuid("by").references(() => appUser.id),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("fixture_event_fx_idx").on(t.fixtureId, t.at)],
);
