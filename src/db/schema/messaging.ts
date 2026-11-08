// 문자관리 — 문자 대행사·카카오 알림톡·기프티콘 공급사 설정과 발송 이력(미래모터스 설정을 참고).
import { index, integer, jsonb, pgTable, serial, text, timestamp, uuid } from "drizzle-orm/pg-core";
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
