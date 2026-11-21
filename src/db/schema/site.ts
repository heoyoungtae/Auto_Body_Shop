// 홈페이지(jmotors.co.kr) 2단계: 자주 묻는 질문, 공지사항, 작업 사례. 손님은 읽기만 하고 직원이 앱에서 쓴다.
import { boolean, date, index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { appUser, createdAt, id } from "./platform";
import { consultation, customer } from "./customer";
import { repairOrder } from "./repair";

/** 자주 묻는 질문. 공개한 것만 홈페이지에 보인다(분야별·찾기) */
export const siteFaq = pgTable(
  "site_faq",
  {
    id: id(),
    category: text("category").notNull(),
    question: text("question").notNull(),
    answer: text("answer").notNull(),
    /** 분야 안에서 보이는 순서(작을수록 위) */
    sort: integer("sort").notNull().default(100),
    published: boolean("published").notNull().default(false),
    /** 'starter'(처음 초안) · 'consult'(상담 답변에서 만든 초안) · null(직접 씀) */
    origin: text("origin"),
    starterKey: text("starter_key"),
    consultationId: uuid("consultation_id").references(() => consultation.id),
    views: integer("views").notNull().default(0),
    updatedBy: uuid("updated_by").references(() => appUser.id),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("site_faq_pub_idx").on(t.published, t.category, t.sort)],
);

/** 공지사항. 게시 기간(시작~끝) 안에서만 보이고, 끝나면 저절로 내려간다 */
export const siteNotice = pgTable(
  "site_notice",
  {
    id: id(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    /** 목록 맨 위 고정 */
    pinned: boolean("pinned").notNull().default(false),
    /** 홈페이지 첫 화면 위 띠에 한 줄로 */
    banner: boolean("banner").notNull().default(false),
    /** 광고(할인·이벤트)면 수첩 알림은 광고 수신 동의 손님에게만, 제목 앞에 (광고) */
    ad: boolean("ad").notNull().default(false),
    published: boolean("published").notNull().default(false),
    startsOn: date("starts_on").notNull(),
    endsOn: date("ends_on"),
    /** 내 차 수첩 알림(푸시)을 보낼지, 보낸 때·받은 손님 수 */
    notifyCarbook: boolean("notify_carbook").notNull().default(false),
    notifiedAt: timestamp("notified_at", { withTimezone: true }),
    notifiedCount: integer("notified_count"),
    views: integer("views").notNull().default(0),
    createdBy: uuid("created_by").references(() => appUser.id),
    updatedBy: uuid("updated_by").references(() => appUser.id),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("site_notice_pub_idx").on(t.published, t.startsOn)],
);

export type CasePhoto = { path: string; side: "before" | "after"; width?: number; height?: number };

/**
 * 작업 사례: 출고한 수리 건의 전후 사진. 손님이 '사진 홍보 사용'에 동의한 건만 만들고,
 * 번호판·얼굴을 가린 사진(직원이 화면에서 가려 새로 만든 파일, 위치정보 없음)만 올린다.
 * 손님이 동의를 거두면 홈페이지에서 저절로 빠진다.
 */
export const siteCase = pgTable(
  "site_case",
  {
    id: id(),
    repairOrderId: uuid("repair_order_id").references(() => repairOrder.id),
    customerId: uuid("customer_id").references(() => customer.id),
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    /** 찌그러짐 · 긁힘 · 도색 */
    category: text("category").notNull(),
    /** 차종(번호 없이) 예: 현대 아반떼 */
    carLabel: text("car_label"),
    photos: jsonb("photos").$type<CasePhoto[]>().notNull().default([]),
    published: boolean("published").notNull().default(false),
    workedOn: date("worked_on"),
    views: integer("views").notNull().default(0),
    createdBy: uuid("created_by").references(() => appUser.id),
    updatedBy: uuid("updated_by").references(() => appUser.id),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("site_case_pub_idx").on(t.published, t.workedOn), index("site_case_ro_idx").on(t.repairOrderId)],
);
