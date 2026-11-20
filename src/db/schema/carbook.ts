// 고객용 '내 차 수첩'(차계부) 1단계: 문자 인증 로그인·링크 로그인·차 판 기록.
// 손님은 비밀번호가 없다. 휴대폰 번호(해시)로 고객을 찾고, 문자로 받은 6자리 번호로 들어온다.
import { index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { customer, vehicle } from "./customer";
import { createdAt, id } from "./platform";
import { repairOrder } from "./repair";

/** 문자 인증번호. 번호 자체는 저장하지 않고 해시만 둔다. 등록되지 않은 번호로 요청해도 줄은 남긴다(횟수 제한용) */
export const carbookOtp = pgTable(
  "carbook_otp",
  {
    id: id(),
    phoneHash: text("phone_hash").notNull(),
    /** 등록된 고객이면 그 고객. 없으면 문자를 보내지 않는다(화면은 똑같이 '보냈습니다') */
    customerId: uuid("customer_id").references(() => customer.id),
    codeHash: text("code_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    tries: integer("tries").notNull().default(0),
    usedAt: timestamp("used_at", { withTimezone: true }),
    ip: text("ip"),
    createdAt: createdAt(),
  },
  (t) => [index("carbook_otp_phone_idx").on(t.phoneHash, t.createdAt)],
);

/** 손님 로그인 기록(쿠키 토큰의 해시). scope: full=문자 인증(모든 기록), link=알림톡 링크(그 수리 건만) */
export const carbookSession = pgTable(
  "carbook_session",
  {
    tokenHash: text("token_hash").primaryKey(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customer.id),
    scope: text("scope").notNull(),
    repairOrderId: uuid("repair_order_id").references(() => repairOrder.id),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ip: text("ip"),
    userAgent: text("user_agent"),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("carbook_session_customer_idx").on(t.customerId)],
);

/** 알림톡·문자에 넣는 '내 차 수첩' 링크. 열면 그 수리 건만 보는 로그인이 된다. 보낼 때마다 새로 만든다 */
export const carbookLink = pgTable(
  "carbook_link",
  {
    tokenHash: text("token_hash").primaryKey(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customer.id),
    repairOrderId: uuid("repair_order_id").references(() => repairOrder.id),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    openedAt: timestamp("opened_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("carbook_link_customer_idx").on(t.customerId)],
);

/** 손님이 '이 차 팔았어요'를 누른 기록. 그 차는 내 차 목록에서 빠지고 정비소에 알린다 */
export const carbookSold = pgTable(
  "carbook_sold",
  {
    id: id(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customer.id),
    vehicleId: uuid("vehicle_id")
      .notNull()
      .references(() => vehicle.id),
    soldOn: text("sold_on").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("carbook_sold_customer_idx").on(t.customerId)],
);
