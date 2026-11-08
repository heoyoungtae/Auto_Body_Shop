// 수리 건(RO)과 입고 점검표(F-02-01, STD-02). 수리 건은 상담 일지에서만 만든다(고객·차량·보험·손상을 그대로 불러옴).
import { boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { appUser, createdAt, id } from "./platform";
import { consultation, customer, vehicle } from "./customer";

/** 수리 건 상태. intake=입고 점검 중, checked=점검·서명 끝(견적 대기). 견적·작업·출고 단계는 다음 개발에서 더한다 */
export const RO_STATUSES = ["intake", "checked", "estimating", "working", "inspecting", "ready", "delivered", "cancelled"] as const;

import { PHOTO_SLOTS, type BodyMark } from "@/modules/repair/rules";
export { PHOTO_SLOTS, type BodyMark };

export const repairOrder = pgTable(
  "repair_order",
  {
    id: id(),
    docNo: text("doc_no").notNull(),
    formRev: text("form_rev").notNull().default("v0.2"),
    status: text("status", { enum: RO_STATUSES }).notNull().default("intake"),
    /** 고객에게 수리 완료(출고 대기) 안내를 보낸 때 */
    readyNoticeAt: timestamp("ready_notice_at", { withTimezone: true }),
    consultationId: uuid("consultation_id")
      .notNull()
      .references(() => consultation.id),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customer.id),
    vehicleId: uuid("vehicle_id")
      .notNull()
      .references(() => vehicle.id),
    /** 상담에서 불러온 보험 정보(견적·청구가 이어 쓴다) */
    insurance: text("insurance").notNull().default("self"),
    insurer: text("insurer"),
    claimNo: text("claim_no"),
    inAt: timestamp("in_at", { withTimezone: true }).notNull().defaultNow(),
    /** 탁송 입고(고객 없이 기사와 점검) */
    delivered: boolean("delivered_by_driver").notNull().default(false),
    driverName: text("driver_name"),
    // ── 입고 점검(F-02-01)
    mileage: integer("mileage"),
    fuelPct: integer("fuel_pct"),
    bodyNotes: jsonb("body_notes").$type<string[]>().notNull().default([]),
    warningLights: text("warning_lights"),
    marks: jsonb("marks").$type<BodyMark[]>().notNull().default([]),
    valuables: text("valuables"),
    valuablesNone: boolean("valuables_none").notNull().default(false),
    devices: jsonb("devices").$type<string[]>().notNull().default([]),
    keyCount: integer("key_count"),
    keyTag: text("key_tag"),
    /** 시트·핸들·바닥 커버 설치(STD-02 4절 8단계) */
    coversOn: boolean("covers_on").notNull().default(false),
    /** 세워 둔 곳(지정 구역) */
    parkSpot: text("park_spot"),
    intakeNote: text("intake_note"),
    // ── 고객 확인(서명)
    agreeChecked: boolean("agree_checked").notNull().default(false),
    agreeMove: boolean("agree_move").notNull().default(false),
    signerName: text("signer_name"),
    signaturePath: text("signature_path"),
    signedAt: timestamp("signed_at", { withTimezone: true }),
    advisorId: uuid("advisor_id").references(() => appUser.id),
    // ── 손상 진단(STD-02 5절): 기술자가 적고 공장장이 확인하면 견적으로
    diagnosedBy: uuid("diagnosed_by").references(() => appUser.id),
    diagnosedAt: timestamp("diagnosed_at", { withTimezone: true }),
    diagConfirmedBy: uuid("diag_confirmed_by").references(() => appUser.id),
    diagConfirmedAt: timestamp("diag_confirmed_at", { withTimezone: true }),
    /** 공장장 판단: 외주 진단 필요 여부·메모 */
    diagNote: text("diag_note"),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("repair_order_no_uq").on(t.docNo), uniqueIndex("repair_order_consult_uq").on(t.consultationId), index("repair_order_status_idx").on(t.status), index("repair_order_vehicle_idx").on(t.vehicleId)],
);

export const roPhoto = pgTable(
  "ro_photo",
  {
    id: id(),
    repairOrderId: uuid("repair_order_id")
      .notNull()
      .references(() => repairOrder.id),
    slot: text("slot", { enum: PHOTO_SLOTS }).notNull(),
    path: text("path").notNull(),
    width: integer("width"),
    height: integer("height"),
    bytes: integer("bytes").notNull(),
    note: text("note"),
    takenBy: uuid("taken_by").references(() => appUser.id),
    createdAt: createdAt(),
  },
  (t) => [index("ro_photo_ro_idx").on(t.repairOrderId)],
);

/** 손상 진단 줄: 부위마다 크기·깊이·도장 손상 범위·꺾임, 도막 두께, 수리 방법(STD-02 5절) */
export const roDamage = pgTable(
  "ro_damage",
  {
    id: id(),
    repairOrderId: uuid("repair_order_id")
      .notNull()
      .references(() => repairOrder.id),
    seq: integer("seq").notNull(),
    /** 차체 도면 부위 id(BODY_PARTS) */
    part: text("part").notNull(),
    kind: text("kind").notNull(),
    sizeCm: integer("size_cm"),
    depthMm: integer("depth_mm"),
    /** none·clear·base·primer·metal */
    paintLayer: text("paint_layer").notNull().default("none"),
    crease: boolean("crease").notNull().default(false),
    /** 찢어짐·플라스틱 파손 */
    broken: boolean("broken").notNull().default(false),
    /** 보강재·프레임 손상 의심, 도어·트렁크 간격 틀어짐 */
    structural: boolean("structural").notNull().default(false),
    /** 도막 두께(μm): 손상 패널·인접 패널 각 3곳 이상 */
    filmPanel: jsonb("film_panel").$type<number[]>().notNull().default([]),
    filmAdjacent: jsonb("film_adjacent").$type<number[]>().notNull().default([]),
    /** pdr·polish·partial·replace·outsource */
    method: text("method").notNull(),
    /** 앱이 기준표로 제안한 방법(다르게 고르면 사유 필요) */
    suggested: text("suggested").notNull(),
    methodReason: text("method_reason"),
    calibrate: boolean("calibrate").notNull().default(false),
    note: text("note"),
    createdBy: uuid("created_by").references(() => appUser.id),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ro_damage_ro_idx").on(t.repairOrderId)],
);

/** 견적서(F-03-02, 법정 서식 별지 제89호의3). 추가 견적은 같은 수리 건에 차수(rev)를 올려 새로 만든다 */
export const ESTIMATE_STATUSES = ["draft", "review", "approved", "sent", "accepted", "partial", "declined", "void"] as const;

export const estimate = pgTable(
  "estimate",
  {
    id: id(),
    docNo: text("doc_no").notNull(),
    repairOrderId: uuid("repair_order_id")
      .notNull()
      .references(() => repairOrder.id),
    rev: integer("rev").notNull().default(1),
    /** 견적구분: insurance=보험, general=일반 */
    kind: text("kind").notNull(),
    status: text("status", { enum: ESTIMATE_STATUSES }).notNull().default("draft"),
    paintGrade: text("paint_grade").notNull().default("solid"),
    /** 서식의 차량 칸을 낼 때의 값으로 고정(나중에 차량 기록이 바뀌어도 낸 견적은 그대로) */
    snapshot: jsonb("snapshot").$type<Record<string, unknown>>().notNull().default({}),
    partsWon: integer("parts_won").notNull().default(0),
    laborWon: integer("labor_won").notNull().default(0),
    vatWon: integer("vat_won").notNull().default(0),
    totalWon: integer("total_won").notNull().default(0),
    dueDate: text("due_date"),
    issuedOn: text("issued_on"),
    validUntil: text("valid_until"),
    note: text("note"),
    createdBy: uuid("created_by").references(() => appUser.id),
    reviewedBy: uuid("reviewed_by").references(() => appUser.id),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    /** 고객 승인 링크(문자·알림톡). 토큰은 해시만 둔다 */
    approvalTokenHash: text("approval_token_hash"),
    approvalSentAt: timestamp("approval_sent_at", { withTimezone: true }),
    approvalSentOk: boolean("approval_sent_ok"),
    /** 고객(보험사) 승인 기록(STD-03 5절): 언제·누가·어떤 방법(link 링크, store 매장 서명, insurer 보험사 회신)·본인 확인 */
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    approvalMethod: text("approval_method"),
    approverName: text("approver_name"),
    approvalRef: text("approval_ref"),
    approvalSignature: text("approval_signature"),
    approvalRecordedBy: uuid("approval_recorded_by").references(() => appUser.id),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("estimate_no_uq").on(t.docNo), index("estimate_ro_idx").on(t.repairOrderId), index("estimate_approval_token_idx").on(t.approvalTokenHash)],
);

/** 견적 항목. 부품이면 코드(A 신품·B 재제조·C 중고·D 인증대체·F 수입)·수량·단가, 공임이면 표준 시간과 금액 */
export const estimateLine = pgTable(
  "estimate_line",
  {
    id: id(),
    estimateId: uuid("estimate_id")
      .notNull()
      .references(() => estimate.id),
    seq: integer("seq").notNull(),
    payer: text("payer").notNull().default("general"),
    category: text("category").notNull(),
    damageId: uuid("damage_id"),
    laborCode: text("labor_code"),
    name: text("name").notNull(),
    partCode: text("part_code"),
    partNo: text("part_no"),
    qty: integer("qty").notNull().default(1),
    unitWon: integer("unit_won").notNull().default(0),
    laborMinutes: integer("labor_minutes").notNull().default(0),
    laborWon: integer("labor_won").notNull().default(0),
    /** 고객(보험사) 승인: null=아직, true=승인, false=승인 안 함 */
    approved: boolean("approved"),
    note: text("note"),
  },
  (t) => [index("estimate_line_est_idx").on(t.estimateId)],
);

/** 작업 지시서(F-04-01, STD-04). 승인한 견적 줄만으로 만든다 */
export const WO_STATUSES = ["planned", "working", "done"] as const;

export const workOrder = pgTable(
  "work_order",
  {
    id: id(),
    docNo: text("doc_no").notNull(),
    repairOrderId: uuid("repair_order_id")
      .notNull()
      .references(() => repairOrder.id),
    estimateId: uuid("estimate_id")
      .notNull()
      .references(() => estimate.id),
    status: text("status", { enum: WO_STATUSES }).notNull().default("planned"),
    /** 출고 약속일(견적의 출고 예정일에서 불러옴) */
    dueDate: text("due_date"),
    /** 제조사 수리 매뉴얼·도료 TDS 특이사항(용접 방식, 교환 불가 부품, 건조 조건) */
    note: text("note"),
    createdBy: uuid("created_by").references(() => appUser.id),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("work_order_no_uq").on(t.docNo), index("work_order_ro_idx").on(t.repairOrderId)],
);

/** 공정 한 줄: 담당·예정일·표준 시간, 시작·끝, 자주 검사, 사진, 공정별 기록(배합·건조 조건·용접 방식) */
export const workStep = pgTable(
  "work_step",
  {
    id: id(),
    workOrderId: uuid("work_order_id")
      .notNull()
      .references(() => workOrder.id),
    seq: integer("seq").notNull(),
    process: text("process").notNull(),
    lineIds: jsonb("line_ids").$type<string[]>().notNull().default([]),
    assignee: uuid("assignee").references(() => appUser.id),
    planDate: text("plan_date"),
    stdMinutes: integer("std_minutes").notNull().default(0),
    startedAt: timestamp("started_at", { withTimezone: true }),
    startedBy: uuid("started_by").references(() => appUser.id),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    endedBy: uuid("ended_by").references(() => appUser.id),
    actualMinutes: integer("actual_minutes"),
    checks: jsonb("checks").$type<string[]>().notNull().default([]),
    photos: jsonb("photos").$type<string[]>().notNull().default([]),
    detail: jsonb("detail").$type<Record<string, string>>().notNull().default({}),
    note: text("note"),
  },
  (t) => [index("work_step_wo_idx").on(t.workOrderId)],
);

/** 최종 검사(F-05-01, STD-05). 회차마다 한 줄. 검사자는 주 작업자가 아니어야 한다 */
export const inspection = pgTable(
  "inspection",
  {
    id: id(),
    repairOrderId: uuid("repair_order_id")
      .notNull()
      .references(() => repairOrder.id),
    workOrderId: uuid("work_order_id")
      .notNull()
      .references(() => workOrder.id),
    round: integer("round").notNull().default(1),
    inspector: uuid("inspector")
      .notNull()
      .references(() => appUser.id),
    /** 검사 독립성 예외(인원 부족으로 작업자가 검사) 사유 */
    independenceNote: text("independence_note"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    passed: jsonb("passed").$type<string[]>().notNull().default([]),
    gapMm: integer("gap_mm_x10"),
    filmUm: jsonb("film_um").$type<number[]>().notNull().default([]),
    photos: jsonb("photos").$type<string[]>().notNull().default([]),
    /** pass / fail, 판정 전에는 null */
    result: text("result"),
    fails: jsonb("fails").$type<{ key: string; why: string }[]>().notNull().default([]),
    failNote: text("fail_note"),
    judgedAt: timestamp("judged_at", { withTimezone: true }),
  },
  (t) => [index("inspection_ro_idx").on(t.repairOrderId)],
);

/** 점검·정비명세서(법정 서식 별지 제89호의2)와 인수 확인(F-05-02) */
export const repairStatement = pgTable(
  "repair_statement",
  {
    id: id(),
    docNo: text("doc_no").notNull(),
    repairOrderId: uuid("repair_order_id")
      .notNull()
      .references(() => repairOrder.id),
    estimateId: uuid("estimate_id")
      .notNull()
      .references(() => estimate.id),
    /** 발급 때 고정: 차량·사업자·일자·정비 내역(승인한 견적 줄)·보증 */
    snapshot: jsonb("snapshot").$type<Record<string, unknown>>().notNull().default({}),
    partsWon: integer("parts_won").notNull().default(0),
    laborWon: integer("labor_won").notNull().default(0),
    vatWon: integer("vat_won").notNull().default(0),
    totalWon: integer("total_won").notNull().default(0),
    mileageOut: integer("mileage_out"),
    issuedOn: text("issued_on").notNull(),
    issuedBy: uuid("issued_by").references(() => appUser.id),
    // ── 인도·인수
    payMethod: text("pay_method"),
    notices: jsonb("notices").$type<string[]>().notNull().default([]),
    receiverName: text("receiver_name"),
    proxy: boolean("proxy").notNull().default(false),
    proxyNote: text("proxy_note"),
    signature: text("signature"),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    deliveredBy: uuid("delivered_by").references(() => appUser.id),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("repair_statement_no_uq").on(t.docNo), index("repair_statement_ro_idx").on(t.repairOrderId)],
);
