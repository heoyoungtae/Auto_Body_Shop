// 문자관리 — 문자 대행사·카카오 알림톡·기프티콘 공급사 설정과 발송 이력(미래모터스 설정을 참고).
import { index, integer, jsonb, pgTable, serial, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { appUser } from "./platform";

/**
 * 연동 설정. kind: sms(문자 대행사) · kakao(알림톡) · gift(기프티콘 공급사).
 * data 는 화면에 보여도 되는 값, secrets 는 공급사별 비밀 키를 JSON 으로 묶어 암호화한 값(화면에 다시 내려보내지 않는다).
 */
export const messagingConfig = pgTable("messaging_config", {
  kind: text("kind").primaryKey(),
  data: jsonb("data").notNull().default({}),
  secrets: text("secrets"),
  updatedBy: uuid("updated_by").references(() => appUser.id),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** 발송 이력: 문자·알림톡·기프티콘 모두. 받는 번호는 암호화하고 목록에는 가린 번호를 쓴다 */
export const messageLog = pgTable(
  "message_log",
  {
    id: serial("id").primaryKey(),
    channel: text("channel").notNull(), // SMS · LMS · 알림톡 · 기프티콘
    purpose: text("purpose").notNull(), // test · 안내 · 광고 · 선물 …
    provider: text("provider").notNull(),
    toEnc: text("to_enc").notNull(),
    toMasked: text("to_masked").notNull(),
    customerName: text("customer_name"),
    body: text("body").notNull(),
    amount: integer("amount"),
    status: text("status").notNull(), // 성공 · 실패
    error: text("error"),
    ref: text("ref"),
    sentBy: uuid("sent_by").references(() => appUser.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("message_log_created_idx").on(t.createdAt)],
);

/** 문구 서식: 직원이 골라 쓰는 문자 문구(#{고객명} 같은 바꿈 칸). 알림톡 템플릿은 kakao.ts 에 고정 */
export const smsTemplate = pgTable("sms_template", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  /** info 정보성 안내 / ad 광고(마케팅 동의 고객에게만, (광고)·수신거부 자동) */
  purpose: text("purpose").notNull(),
  body: text("body").notNull(),
  active: integer("active").notNull().default(1),
  updatedBy: uuid("updated_by").references(() => appUser.id),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * 기프티콘 발송(GF-). purpose: event 이벤트 경품 · thanks 감사(소개·후기) · complaint 불만 보상 · other 기타.
 * 이벤트·감사는 광고 수신 동의 고객에게만(동의 문구 기준), 불만 보상은 대표만 보낸다.
 * 받는 번호는 암호화, 쿠폰 핀번호는 저장하지 않는다(공급사가 MMS로 직접 보냄). status: sent · failed · cancelled
 */
export const giftSend = pgTable(
  "gift_send",
  {
    id: serial("id").primaryKey(),
    docNo: text("doc_no").notNull(),
    customerId: uuid("customer_id"),
    customerName: text("customer_name").notNull(),
    toEnc: text("to_enc").notNull(),
    toMasked: text("to_masked").notNull(),
    purpose: text("purpose").notNull(),
    reason: text("reason").notNull(),
    complaintId: uuid("complaint_id"),
    goodsCode: text("goods_code").notNull(),
    goodsName: text("goods_name").notNull(),
    price: integer("price").notNull(),
    provider: text("provider").notNull(),
    trId: text("tr_id").notNull(),
    orderNo: text("order_no"),
    status: text("status").notNull(),
    error: text("error"),
    sentBy: uuid("sent_by").references(() => appUser.id),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
    cancelledBy: uuid("cancelled_by").references(() => appUser.id),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancelReason: text("cancel_reason"),
  },
  (t) => [uniqueIndex("gift_send_tr_uq").on(t.trId), index("gift_send_customer_idx").on(t.customerId, t.sentAt)],
);
