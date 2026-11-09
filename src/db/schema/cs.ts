// 보증·고객 불만 처리(STD-06): 불만 처리부 F-06-02, 만족도 설문 F-06-01
import { boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { customer, vehicle } from "./customer";
import { appUser, createdAt, id } from "./platform";
import { nonconformance } from "./quality";
import { repairOrder, repairStatement } from "./repair";

/** 불만 처리부 F-06-02. received 접수 → acked 접수 안내 → judged 판정 → agreed 고객 동의(처리 중) → closed 종결 */
export const complaint = pgTable(
  "complaint",
  {
    id: id(),
    docNo: text("doc_no").notNull(),
    /** visit/phone/app/review/survey/partner/resident */
    channel: text("channel").notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull(),
    /** 설문 자동 접수는 비어 있다 */
    receivedBy: uuid("received_by").references(() => appUser.id),
    repairOrderId: uuid("repair_order_id").references(() => repairOrder.id),
    statementId: uuid("statement_id").references(() => repairStatement.id),
    customerId: uuid("customer_id").references(() => customer.id),
    vehicleId: uuid("vehicle_id").references(() => vehicle.id),
    /** 고객이 아닌 사람(주민·거래처 담당자)이면 이름·회사 */
    who: text("who"),
    phoneEnc: text("phone_enc"),
    /** quality/schedule/explain/price/kindness/environment/other */
    category: text("category").notNull(),
    content: text("content").notNull(),
    wish: text("wish"),
    urgent: boolean("urgent").notNull().default(false),
    ackDue: text("ack_due").notNull(),
    ackAt: timestamp("ack_at", { withTimezone: true }),
    ackBy: uuid("ack_by").references(() => appUser.id),
    ackNote: text("ack_note"),
    // ── 현물 확인·판정(품질 담당)
    judgeDue: text("judge_due").notNull(),
    inspectNote: text("inspect_note"),
    photos: jsonb("photos").$type<string[]>().notNull().default([]),
    /** covered 보증 해당 / partial 일부 해당 / not 비해당 / none 보증과 무관(친절·설명 등) */
    verdict: text("verdict"),
    verdictReason: text("verdict_reason"),
    ncId: uuid("nc_id").references(() => nonconformance.id),
    judgedBy: uuid("judged_by").references(() => appUser.id),
    judgedAt: timestamp("judged_at", { withTimezone: true }),
    // ── 고객 동의·처리
    plan: text("plan"),
    /** warranty_repair 보증 수리 / explain 설명 종결 / other 기타 */
    resolution: text("resolution"),
    warrantyRoId: uuid("warranty_ro_id").references(() => repairOrder.id),
    agreedAt: timestamp("agreed_at", { withTimezone: true }),
    agreedBy: uuid("agreed_by").references(() => appUser.id),
    // ── 보상(대표 승인)
    compWon: integer("comp_won"),
    compNote: text("comp_note"),
    compApprovedBy: uuid("comp_approved_by").references(() => appUser.id),
    compApprovedAt: timestamp("comp_approved_at", { withTimezone: true }),
    replyDue: text("reply_due").notNull(),
    // ── 종결
    satisfied: boolean("satisfied"),
    closeNote: text("close_note"),
    closedBy: uuid("closed_by").references(() => appUser.id),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    status: text("status").notNull().default("received"),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("complaint_no_uq").on(t.docNo), index("complaint_status").on(t.status), index("complaint_ro").on(t.repairOrderId), index("complaint_received").on(t.receivedAt)],
);

/** 만족도 설문 F-06-01: 출고 뒤 정해진 날 링크를 보내고 고객이 답한다 */
export const survey = pgTable(
  "survey",
  {
    id: id(),
    tokenHash: text("token_hash").notNull(),
    repairOrderId: uuid("repair_order_id")
      .notNull()
      .references(() => repairOrder.id),
    statementId: uuid("statement_id").references(() => repairStatement.id),
    customerId: uuid("customer_id").references(() => customer.id),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull(),
    sentOk: boolean("sent_ok").notNull().default(false),
    sendError: text("send_error"),
    answeredAt: timestamp("answered_at", { withTimezone: true }),
    /** 질문 6개, 1~5점 */
    scores: jsonb("scores").$type<number[]>(),
    comment: text("comment"),
    complaintId: uuid("complaint_id").references(() => complaint.id),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("survey_token_uq").on(t.tokenHash), uniqueIndex("survey_ro_uq").on(t.repairOrderId)],
);
