// 설비 관리(STD-08): 설비 대장(F-08-01)·점검표(F-08-02)·윤활(F-08-03)·운전 일지·고장 기록(F-08-04)·예방정비(F-08-07)
// 날짜는 서울 기준 'YYYY-MM-DD' 글자로 둔다(다른 표와 같음).
import { boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { appUser, createdAt, id } from "./platform";
import { assetColumns } from "./asset";

export type CheckItem = { item: string; std: string };
export type CheckResult = CheckItem & { mark: "o" | "tri" | "x" | "na"; note?: string };

/** 설비 대장 F-08-01 */
export const equipment = pgTable(
  "equipment",
  {
    id: id(),
    /** EQ-001 */
    no: text("no").notNull(),
    name: text("name").notNull(),
    /** booth/compressor/lift/welder/gauge/dryer/other — 점검 항목·운전 일지 틀을 정한다 */
    kind: text("kind").notNull(),
    model: text("model"),
    maker: text("maker"),
    makerContact: text("maker_contact"),
    boughtOn: text("bought_on"),
    price: integer("price"),
    /** 구역(3정5S 구역 A~H) */
    zone: text("zone"),
    rating: text("rating"),
    /** 중요도 A/B/C */
    grade: text("grade").notNull(),
    ownerId: uuid("owner_id").references(() => appUser.id),
    operators: jsonb("operators").$type<string[]>().notNull().default([]),
    legalKind: text("legal_kind"),
    legalNextOn: text("legal_next_on"),
    manualRef: text("manual_ref"),
    checkDaily: boolean("check_daily").notNull().default(true),
    checkMonthly: boolean("check_monthly").notNull().default(true),
    dailyItems: jsonb("daily_items").$type<CheckItem[]>().notNull().default([]),
    monthlyItems: jsonb("monthly_items").$type<CheckItem[]>().notNull().default([]),
    /** 이 설비를 쓰는 작업 공정(공정 시작 때 점검·사용 금지 경고) */
    processes: jsonb("processes").$type<string[]>().notNull().default([]),
    /** 측정 장비란 */
    measureRange: text("measure_range"),
    tolerance: text("tolerance"),
    calibMonths: integer("calib_months"),
    calibNextOn: text("calib_next_on"),
    /** in_use 사용 중 / stopped 사용 금지 / disposed 처분 */
    status: text("status").notNull().default("in_use"),
    stopReason: text("stop_reason"),
    stoppedAt: timestamp("stopped_at", { withTimezone: true }),
    /** 사용 전 시운전 확인(4.6) */
    trialOn: text("trial_on"),
    note: text("note"),
    ...assetColumns(),
    /** 라벨(번호·관리자·QR) 붙인 때 */
    labeledAt: timestamp("labeled_at", { withTimezone: true }),
    disposedOn: text("disposed_on"),
    createdBy: uuid("created_by").references(() => appUser.id),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("equipment_no_uq").on(t.no)],
);

/** 점검표 F-08-02(일상·월간). 한 번 점검 = 한 줄 */
export const equipmentCheck = pgTable(
  "equipment_check",
  {
    id: id(),
    equipmentId: uuid("equipment_id")
      .notNull()
      .references(() => equipment.id),
    kind: text("kind").notNull(),
    checkDate: text("check_date").notNull(),
    results: jsonb("results").$type<CheckResult[]>().notNull(),
    /** × 가 있으면 false */
    ok: boolean("ok").notNull(),
    /** 모두 비가동(-)이면 true */
    idle: boolean("idle").notNull().default(false),
    note: text("note"),
    checkedBy: uuid("checked_by")
      .notNull()
      .references(() => appUser.id),
    createdAt: createdAt(),
  },
  (t) => [index("equipment_check_eq_date").on(t.equipmentId, t.checkDate)],
);

/** 윤활 개소표 F-08-03 */
export const lubePoint = pgTable(
  "lube_point",
  {
    id: id(),
    equipmentId: uuid("equipment_id")
      .notNull()
      .references(() => equipment.id),
    /** L-01 */
    code: text("code").notNull(),
    spot: text("spot").notNull(),
    oil: text("oil").notNull(),
    color: text("color"),
    amount: text("amount"),
    cycleDays: integer("cycle_days").notNull(),
    method: text("method"),
    ownerId: uuid("owner_id").references(() => appUser.id),
    lastDoneOn: text("last_done_on"),
    nextDueOn: text("next_due_on").notNull(),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("lube_point_code_uq").on(t.equipmentId, t.code)],
);

/** 윤활 기록 F-08-03 */
export const lubeLog = pgTable(
  "lube_log",
  {
    id: id(),
    pointId: uuid("point_id")
      .notNull()
      .references(() => lubePoint.id),
    doneOn: text("done_on").notNull(),
    used: text("used"),
    /** normal/over/leak/discolor/foreign */
    state: text("state").notNull(),
    action: text("action"),
    doneBy: uuid("done_by")
      .notNull()
      .references(() => appUser.id),
    createdAt: createdAt(),
  },
  (t) => [index("lube_log_point").on(t.pointId)],
);

/** 운전 일지 F-08-04(도장 부스·컴프레서 등). 값은 설비 종류별 틀(data) */
export const equipmentRunLog = pgTable(
  "equipment_run_log",
  {
    id: id(),
    equipmentId: uuid("equipment_id")
      .notNull()
      .references(() => equipment.id),
    logDate: text("log_date").notNull(),
    data: jsonb("data").$type<Record<string, string>>().notNull(),
    operatorId: uuid("operator_id")
      .notNull()
      .references(() => appUser.id),
    createdAt: createdAt(),
  },
  (t) => [index("equipment_run_log_eq").on(t.equipmentId, t.logDate)],
);

/** 고장 기록 F-08-04 고장 기록란 */
export const equipmentFailure = pgTable(
  "equipment_failure",
  {
    id: id(),
    docNo: text("doc_no").notNull(),
    equipmentId: uuid("equipment_id")
      .notNull()
      .references(() => equipment.id),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    foundBy: uuid("found_by")
      .notNull()
      .references(() => appUser.id),
    symptom: text("symptom").notNull(),
    /** 점검표 × 에서 열렸으면 그 점검 */
    checkId: uuid("check_id").references(() => equipmentCheck.id),
    action: text("action"),
    external: boolean("external").notNull().default(false),
    downMinutes: integer("down_minutes"),
    parts: text("parts"),
    cost: integer("cost"),
    /** lube/missed/operation/wear/other */
    cause: text("cause"),
    prevention: jsonb("prevention").$type<string[]>().notNull().default([]),
    ncRef: text("nc_ref"),
    /** open 조치 중 / closed 공장장 확인(사용 재개) */
    status: text("status").notNull().default("open"),
    closedBy: uuid("closed_by").references(() => appUser.id),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("equipment_failure_no_uq").on(t.docNo), index("equipment_failure_eq").on(t.equipmentId)],
);

/** 측정 장비 교정란 F-08-01 */
export const equipmentCalibration = pgTable(
  "equipment_calibration",
  {
    id: id(),
    equipmentId: uuid("equipment_id")
      .notNull()
      .references(() => equipment.id),
    calibratedOn: text("calibrated_on").notNull(),
    agency: text("agency").notNull(),
    pass: boolean("pass").notNull(),
    certNo: text("cert_no"),
    nextOn: text("next_on").notNull(),
    recordedBy: uuid("recorded_by")
      .notNull()
      .references(() => appUser.id),
    createdAt: createdAt(),
  },
  (t) => [index("equipment_calibration_eq").on(t.equipmentId)],
);

/** 예방정비 계획 F-08-07(연도별, 대표 승인) */
export const pmPlan = pgTable(
  "pm_plan",
  {
    id: id(),
    year: integer("year").notNull(),
    /** draft 작성 중 / approved 승인 */
    status: text("status").notNull().default("draft"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => appUser.id),
    approvedBy: uuid("approved_by").references(() => appUser.id),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("pm_plan_year_uq").on(t.year)],
);

/** 계획란 한 줄: 설비·정비 항목·주기·자체/외부·예상 비용·계획 월 */
export const pmItem = pgTable(
  "pm_item",
  {
    id: id(),
    planId: uuid("plan_id")
      .notNull()
      .references(() => pmPlan.id),
    equipmentId: uuid("equipment_id")
      .notNull()
      .references(() => equipment.id),
    task: text("task").notNull(),
    cycleMonths: integer("cycle_months").notNull(),
    months: jsonb("months").$type<number[]>().notNull(),
    day: integer("day").notNull().default(10),
    external: boolean("external").notNull().default(false),
    cost: integer("cost"),
    createdAt: createdAt(),
  },
  (t) => [index("pm_item_plan").on(t.planId)],
);

/** 실적란: 승인하면 계획 월마다 한 줄씩 생긴다 */
export const pmTask = pgTable(
  "pm_task",
  {
    id: id(),
    itemId: uuid("item_id")
      .notNull()
      .references(() => pmItem.id),
    dueOn: text("due_on").notNull(),
    doneOn: text("done_on"),
    doneBy: uuid("done_by").references(() => appUser.id),
    work: text("work"),
    parts: text("parts"),
    minutes: integer("minutes"),
    cost: integer("cost"),
    vendor: text("vendor"),
    createdAt: createdAt(),
  },
  (t) => [index("pm_task_due").on(t.dueOn), uniqueIndex("pm_task_item_due_uq").on(t.itemId, t.dueOn)],
);

/**
 * 치공구 대장(F-08-08, STD-08 8.7). no: 관리 번호(TL-001).
 * keep: board 공용(쉐도우 보드 정위치) · personal 개인 공구함(holderId).
 * special: 고가·특수 치공구 → 반출할 때 반출자·시각·반납 시각을 남긴다(outBy·outAt·outNote 는 지금 반출 중인 것).
 * status: ok 사용 가능 · repair 수리 중 · lost 분실 · disposed 폐기
 */
export const tool = pgTable(
  "tool",
  {
    id: id(),
    no: text("no").notNull(),
    name: text("name").notNull(),
    spec: text("spec"),
    purchasedOn: text("purchased_on"),
    location: text("location"),
    keep: text("keep").notNull().default("board"),
    holderId: uuid("holder_id").references(() => appUser.id),
    managerId: uuid("manager_id").references(() => appUser.id),
    special: boolean("special").notNull().default(false),
    status: text("status").notNull().default("ok"),
    outBy: uuid("out_by").references(() => appUser.id),
    outAt: timestamp("out_at", { withTimezone: true }),
    outNote: text("out_note"),
    labeledAt: timestamp("labeled_at", { withTimezone: true }),
    note: text("note"),
    /** 지출 결의에서 함께 등록했으면 그 결의(입고 대기 → 들어옴 확인). 대표 지시 2026-11-12 */
    expenseId: uuid("expense_id"),
    /** 한 개 공급가(지출 결의에서 불러옴) */
    priceWon: integer("price_won"),
    createdBy: uuid("created_by").references(() => appUser.id),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("tool_no_uq").on(t.no)],
);

/** 치공구 안전재고: 품명별 최소 보유 수량. 사용 가능 + 입고 대기가 이보다 적으면 관리자 할 일(대표 지시 2026-11-12) */
export const toolMin = pgTable("tool_min", {
  name: text("name").primaryKey(),
  minQty: integer("min_qty").notNull(),
  updatedBy: uuid("updated_by").references(() => appUser.id),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * 치공구 이력: register 등록 · edit 고침 · out 반출 · return 반납 · check 분기 점검(result·decision) · lost 분실 · found 되찾음 ·
 * repaired 수리 끝 · label 라벨 · dispose 폐기. quarter: 분기 점검이면 'YYYY-Qn'
 */
export const toolEvent = pgTable(
  "tool_event",
  {
    id: id(),
    toolId: uuid("tool_id")
      .notNull()
      .references(() => tool.id),
    kind: text("kind").notNull(),
    result: text("result"),
    decision: text("decision"),
    quarter: text("quarter"),
    detail: text("detail"),
    by: uuid("by").references(() => appUser.id),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("tool_event_tool_idx").on(t.toolId, t.at)],
);

/**
 * 개선 제안(F-08-06 제안란, STD-08 8.12). docNo: SG-연월-순번.
 * status: submitted 검토 중 · adopted 채택(실행 전) · held 보류 · rejected 불채택 · done 실행·효과 확인 끝
 */
export const suggestion = pgTable(
  "suggestion",
  {
    id: id(),
    docNo: text("doc_no").notNull(),
    title: text("title").notNull(),
    area: text("area"),
    problem: text("problem").notNull(),
    proposal: text("proposal").notNull(),
    effect: text("effect"),
    photos: jsonb("photos").$type<string[]>().notNull().default([]),
    proposerId: uuid("proposer_id")
      .notNull()
      .references(() => appUser.id),
    status: text("status").notNull().default("submitted"),
    /** 결정 기한(제출 + 14일) */
    replyDue: text("reply_due").notNull(),
    reply: text("reply"),
    decidedBy: uuid("decided_by").references(() => appUser.id),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    /** 실행 내용·효과 확인 */
    doneNote: text("done_note"),
    effectNote: text("effect_note"),
    doneBy: uuid("done_by").references(() => appUser.id),
    doneAt: timestamp("done_at", { withTimezone: true }),
    /** 표준서·지침서 개정 요청(F-Q-05) 문서 번호 */
    revisionRef: text("revision_ref"),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("suggestion_no_uq").on(t.docNo), index("suggestion_status_idx").on(t.status), index("suggestion_proposer_idx").on(t.proposerId)],
);
