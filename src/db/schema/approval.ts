// 전자결재 — 앱 설계서 8.1. 모든 양식이 이 결재 엔진 하나를 쓴다.
import { index, integer, jsonb, pgTable, serial, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { appUser, createdAt, id } from "./platform";

export const DOC_STATUS = ["draft", "in_progress", "rejected", "confirmed", "checked", "cancelled", "discarded"] as const;

export const approvalDoc = pgTable(
  "approval_doc",
  {
    id: id(),
    docNo: text("doc_no").notNull(),
    /** 표준 양식 번호(예: F-Q-05) */
    formCode: text("form_code").notNull(),
    title: text("title").notNull(),
    status: text("status", { enum: DOC_STATUS }).notNull().default("draft"),
    /** 결재선(ResolvedStep[]) — 상신 시점에 사람까지 정해 둔다 */
    steps: jsonb("steps").notNull(),
    flags: jsonb("flags").notNull().default([]),
    revision: integer("revision").notNull().default(1),
    /** 양식 입력값 */
    data: jsonb("data").notNull(),
    drafterId: uuid("drafter_id").references(() => appUser.id),
    /** 확정 시점 내용의 SHA-256(8.1) */
    contentHash: text("content_hash"),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    /** 이 문서가 취소하는 원래 문서(취소 문서일 때) */
    cancelsId: uuid("cancels_id"),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("approval_doc_no_uq").on(t.docNo), index("approval_doc_status_idx").on(t.status)],
);

export const approvalEvent = pgTable(
  "approval_event",
  {
    id: serial("id").primaryKey(),
    docId: uuid("doc_id")
      .notNull()
      .references(() => approvalDoc.id),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
    actorId: uuid("actor_id").references(() => appUser.id),
    /** 대리 승인일 때 원래 결재자 */
    onBehalfOf: uuid("on_behalf_of").references(() => appUser.id),
    type: text("type").notNull(),
    comment: text("comment"),
  },
  (t) => [index("approval_event_doc_idx").on(t.docId)],
);
