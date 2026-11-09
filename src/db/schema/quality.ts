// 부적합·시정 조치(F-Q-10, STD-Q Q.9)와 3정5S 점검(F-08-05, STD-08 11~14절)
import { boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { appUser, createdAt, id } from "./platform";

/** 부적합·시정 조치 보고서 F-Q-10 */
export const nonconformance = pgTable(
  "nonconformance",
  {
    id: id(),
    docNo: text("doc_no").notNull(),
    /** inspect/complaint/audit/goal/legal/equipment/five_s/accident/privacy/other */
    source: text("source").notNull(),
    /** 관련 건: repair_order / equipment / zone / equipment_failure … 와 그 id, 화면 표시 글 */
    refType: text("ref_type"),
    refId: text("ref_id"),
    refLabel: text("ref_label"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    foundBy: uuid("found_by")
      .notNull()
      .references(() => appUser.id),
    content: text("content").notNull(),
    photos: jsonb("photos").$type<string[]>().notNull().default([]),
    /** 즉시 조치(작업 중지·격리·재작업·고객 연락) */
    immediate: text("immediate"),
    /** 중대 건이면 종결에 대표 승인 */
    major: boolean("major").notNull().default(false),
    whys: jsonb("whys").$type<string[]>().notNull().default([]),
    /** person/method/equipment/material/environment/standard */
    rootCause: text("root_cause"),
    corrective: text("corrective"),
    assigneeId: uuid("assignee_id").references(() => appUser.id),
    dueOn: text("due_on"),
    /** 표준·양식 개정 필요(F-Q-05 번호) */
    stdRevision: boolean("std_revision").notNull().default(false),
    revisionRef: text("revision_ref"),
    plannedBy: uuid("planned_by").references(() => appUser.id),
    plannedAt: timestamp("planned_at", { withTimezone: true }),
    /** 조치 담당이 한 일 */
    actionDone: text("action_done"),
    actionPhotos: jsonb("action_photos").$type<string[]>().notNull().default([]),
    actionAt: timestamp("action_at", { withTimezone: true }),
    /** 효과 확인 */
    effectOn: text("effect_on"),
    recurred: boolean("recurred"),
    effectNote: text("effect_note"),
    effectBy: uuid("effect_by").references(() => appUser.id),
    /** open 발행 / planned 조치 중 / done 조치 끝(효과 확인 대기) / closed 종결 */
    status: text("status").notNull().default("open"),
    closedBy: uuid("closed_by").references(() => appUser.id),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("nonconformance_no_uq").on(t.docNo), index("nonconformance_ref").on(t.refType, t.refId), index("nonconformance_status").on(t.status)],
);

/** 현장 구역과 담당(8.8) */
export const fiveSZone = pgTable("five_s_zone", {
  /** A~H */
  code: text("code").primaryKey(),
  name: text("name").notNull(),
  ownerId: uuid("owner_id").references(() => appUser.id),
  deputyId: uuid("deputy_id").references(() => appUser.id),
  /** 기준 사진('이 상태가 정상') */
  refPhoto: text("ref_photo"),
  active: boolean("active").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** 일일 점검 F-08-05 */
export const fiveSDaily = pgTable(
  "five_s_daily",
  {
    id: id(),
    zone: text("zone").notNull(),
    checkDate: text("check_date").notNull(),
    /** 체크 항목 순서대로 true=○ false=× */
    results: jsonb("results").$type<boolean[]>().notNull(),
    items: jsonb("items").$type<string[]>().notNull(),
    note: text("note"),
    photos: jsonb("photos").$type<string[]>().notNull().default([]),
    checkedBy: uuid("checked_by")
      .notNull()
      .references(() => appUser.id),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("five_s_daily_uq").on(t.zone, t.checkDate)],
);

/** 월간 점검 F-08-05(구역별 5S 각 20점) */
export const fiveSMonthly = pgTable(
  "five_s_monthly",
  {
    id: id(),
    ym: text("ym").notNull(),
    zone: text("zone").notNull(),
    /** 정리·정돈·청소·청결·습관화 */
    scores: jsonb("scores").$type<number[]>().notNull(),
    total: integer("total").notNull(),
    remarks: text("remarks"),
    ncId: uuid("nc_id").references(() => nonconformance.id),
    ratedBy: uuid("rated_by")
      .notNull()
      .references(() => appUser.id),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("five_s_monthly_uq").on(t.ym, t.zone)],
);
