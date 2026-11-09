// 업무지시(사용자 지시 2026-11-09): 지시 → 받은 사람 내 할 일 → (아래로 전달) → 결과보고 → 지시한 사람 확인
import { boolean, index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid, type AnyPgColumn } from "drizzle-orm/pg-core";
import { appUser, createdAt, id } from "./platform";

/** 지시 한 건(내용). 받는 사람마다 instruction_task 한 줄 */
export const instruction = pgTable(
  "instruction",
  {
    id: id(),
    docNo: text("doc_no").notNull(),
    title: text("title").notNull(),
    body: text("body"),
    photos: jsonb("photos").$type<string[]>().notNull().default([]),
    urgent: boolean("urgent").notNull().default(false),
    dueOn: text("due_on").notNull(),
    /** 결과보고에 사진 필수 */
    needPhoto: boolean("need_photo").notNull().default(false),
    /** 관련 건: repair_order / equipment / nonconformance … */
    refType: text("ref_type"),
    refId: text("ref_id"),
    refLabel: text("ref_label"),
    issuedBy: uuid("issued_by")
      .notNull()
      .references(() => appUser.id),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("instruction_no_uq").on(t.docNo)],
);

/**
 * 받은 사람 한 명의 일. fromUserId 는 이 일을 준 사람(지시자 또는 전달한 사람)이고 결과보고는 그 사람에게 간다.
 * status: open 받음 / forwarded 아래로 전달함(아래 보고 기다림) / reported 결과보고함(확인 대기) / done 확인 끝
 */
export const instructionTask = pgTable(
  "instruction_task",
  {
    id: id(),
    instructionId: uuid("instruction_id")
      .notNull()
      .references(() => instruction.id),
    parentTaskId: uuid("parent_task_id").references((): AnyPgColumn => instructionTask.id),
    assigneeId: uuid("assignee_id")
      .notNull()
      .references(() => appUser.id),
    fromUserId: uuid("from_user_id")
      .notNull()
      .references(() => appUser.id),
    /** 전달할 때 덧붙인 말 */
    note: text("note"),
    status: text("status").notNull().default("open"),
    readAt: timestamp("read_at", { withTimezone: true }),
    forwardedAt: timestamp("forwarded_at", { withTimezone: true }),
    /** done 완료 / notdone 못함 */
    result: text("result"),
    report: text("report"),
    reportPhotos: jsonb("report_photos").$type<string[]>().notNull().default([]),
    reportedAt: timestamp("reported_at", { withTimezone: true }),
    /** 보완 요청 */
    returnNote: text("return_note"),
    returnedAt: timestamp("returned_at", { withTimezone: true }),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("instruction_task_assignee").on(t.assigneeId, t.status), index("instruction_task_from").on(t.fromUserId, t.status), index("instruction_task_ins").on(t.instructionId)],
);
