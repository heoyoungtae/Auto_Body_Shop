// 고객용 '내 차 수첩'(차계부) 1단계: 문자 인증 로그인·링크 로그인·차 판 기록. 2단계: 이용 동의·손님 기록·알림. 3단계: 푸시·수리 이력 확인서.
// 손님은 비밀번호가 없다. 휴대폰 번호(해시)로 고객을 찾고, 문자로 받은 6자리 번호로 들어온다.
import { boolean, date, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
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
    /** login 내 차 수첩 들어가기 · web 홈페이지 견적 요청 본인 확인(처음 오는 손님에게도 보낸다) */
    purpose: text("purpose").notNull().default("login"),
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

/** 손님이 '이 차 팔았어요'를 누른 기록. 그 차는 내 차 목록에서 빠지고 공업사에 알린다 */
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

// ── 2단계: 내 기록·알림 ──

/** 내 차 수첩 이용 동의(F-13-01 차계부 항목). 받을 때마다·철회할 때마다 한 줄. 지금 상태는 가장 최근 줄이다.
 *  동의가 없으면 '내 기록'만 잠긴다(수리 이력·서류는 볼 수 있음). 철회하면 손님 기록을 바로 지운다 */
export const carbookConsent = pgTable(
  "carbook_consent",
  {
    id: id(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customer.id),
    version: text("version").notNull(),
    agreed: boolean("agreed").notNull(),
    ip: text("ip"),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("carbook_consent_customer_idx").on(t.customerId, t.at)],
);

export const CARBOOK_ENTRY_KINDS = ["fuel", "item", "wash", "fee", "other"] as const;

/** 손님이 적은 기록(주유·충전, 소모품·정비, 세차, 보험·세금·검사, 기타 비용). 공업사는 주행거리만 참고로 본다 */
export const carbookEntry = pgTable(
  "carbook_entry",
  {
    id: id(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customer.id),
    vehicleId: uuid("vehicle_id")
      .notNull()
      .references(() => vehicle.id),
    kind: text("kind", { enum: CARBOOK_ENTRY_KINDS }).notNull(),
    /** 세부: 주유=연료(gasoline·diesel·lpg·ev·h2), 소모품=품목(oil·tire…), 보험·세금=종류(insurance·tax·inspection·parking) */
    sub: text("sub"),
    on: date("on").notNull(),
    mileage: integer("mileage"),
    amountWon: integer("amount_won"),
    /** 넣은 양(L·kWh·kg)×100. 소수 둘째 자리까지 */
    qtyX100: integer("qty_x100"),
    /** 단가(원/L·원/kWh·원/kg) */
    unitPrice: integer("unit_price"),
    /** 주유소·공업사·세차장 이름(위치는 받지 않는다) */
    place: text("place"),
    memo: text("memo"),
    /** 소모품 다음 교체 주기(이 기록 기준). 비우면 알림 없음 */
    intervalKm: integer("interval_km"),
    intervalMonths: integer("interval_months"),
    createdAt: createdAt(),
  },
  (t) => [index("carbook_entry_customer_idx").on(t.customerId, t.vehicleId, t.on)],
);

/** 손님이 차마다 넣는 값: 보험 만기일(매년 같은 날로 넘긴다) */
export const carbookCar = pgTable(
  "carbook_car",
  {
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customer.id),
    vehicleId: uuid("vehicle_id")
      .notNull()
      .references(() => vehicle.id),
    insuranceUntil: date("insurance_until"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.customerId, t.vehicleId] })],
);

/** 알림 켜기·끄기(손님마다). 줄이 없으면 모두 켬 */
export const carbookPref = pgTable("carbook_pref", {
  customerId: uuid("customer_id")
    .primaryKey()
    .references(() => customer.id),
  alerts: jsonb("alerts").$type<Record<string, boolean>>().notNull().default({}),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** 보낸 알림(같은 알림을 두 번 보내지 않게). key 예: insp:<차>:<만료일>, warr:<수리 건>:<종류>:<끝날> */
export const carbookAlertLog = pgTable(
  "carbook_alert_log",
  {
    id: id(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customer.id),
    key: text("key").notNull(),
    kind: text("kind").notNull(),
    ok: boolean("ok").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("carbook_alert_log_uq").on(t.customerId, t.key)],
);

// ── 3단계: 푸시·수리 이력 확인서 ──

/** 홈 화면에 둔 내 차 수첩의 푸시 받기(기기마다). 보낼 곳이 없어졌다고(404·410) 하면 지운다 */
export const carbookPush = pgTable(
  "carbook_push",
  {
    id: id(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customer.id),
    endpoint: text("endpoint").notNull(),
    userAgent: text("user_agent"),
    lastOkAt: timestamp("last_ok_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("carbook_push_endpoint_uq").on(t.endpoint), index("carbook_push_customer_idx").on(t.customerId)],
);

/** 푸시로 알릴 글. 푸시는 내용 없이 깨우기만 하고, 휴대폰이 로그인한 채로 이 글을 받아 보여 준다(암호화 없이 안전하게) */
export const carbookInbox = pgTable(
  "carbook_inbox",
  {
    id: id(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customer.id),
    title: text("title").notNull(),
    body: text("body").notNull(),
    url: text("url").notNull(),
    shownAt: timestamp("shown_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("carbook_inbox_customer_idx").on(t.customerId, t.createdAt)],
);

/** 수리 이력 확인서: 차 팔 때 건네는 우리 공업사 수리 내역 한 장. 확인 번호로 누구나 진위를 본다(발급 때 내용 그대로) */
export const carbookCert = pgTable(
  "carbook_cert",
  {
    id: id(),
    docNo: text("doc_no").notNull(),
    /** 확인 번호(영문 대문자·숫자 10자, 헷갈리는 글자 뺌) */
    code: text("code").notNull(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customer.id),
    vehicleId: uuid("vehicle_id")
      .notNull()
      .references(() => vehicle.id),
    withAmount: boolean("with_amount").notNull().default(false),
    snapshot: jsonb("snapshot").$type<Record<string, unknown>>().notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("carbook_cert_code_uq").on(t.code), uniqueIndex("carbook_cert_no_uq").on(t.docNo)],
);
