// 고객·차량·개인정보 동의·상담 일지 — 사내 표준서 STD-01(상담·예약), STD-13(개인정보), 양식 F-01-01·F-13-01, 설계서 7.2
import { boolean, date, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { appUser, createdAt, id } from "./platform";

/** 고객. 연락처는 암호화하고, 찾기는 HMAC(phoneHash)로 한다. 같은 번호는 한 고객으로 다시 쓴다 */
export const customer = pgTable(
  "customer",
  {
    id: id(),
    name: text("name").notNull(),
    phoneEnc: text("phone_enc"),
    phoneHash: text("phone_hash"),
    phoneMasked: text("phone_masked"),
    memo: text("memo"),
    createdBy: uuid("created_by").references(() => appUser.id),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    /** 보관 기간이 지나 이름·연락처를 지운 날(설계서 9.2). 지운 뒤에도 업무 기록은 남는다 */
    purgedAt: timestamp("purged_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("customer_phone_uq").on(t.phoneHash), index("customer_name_idx").on(t.name)],
);

/** 차량. 차량번호는 띄어쓰기를 뺀 값으로 저장하고 한 대는 한 줄이다(소유자가 바뀌면 고객을 바꾼다) */
export const vehicle = pgTable(
  "vehicle",
  {
    id: id(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customer.id),
    plateNo: text("plate_no").notNull(),
    /** 차대번호(VIN 17자리). 제조사·연식을 여기서 읽는다 */
    vin: text("vin"),
    maker: text("maker"),
    model: text("model"),
    year: integer("year"),
    /** 세대 코드(예: CN7). src/modules/customer/generations.ts 목록 */
    generation: text("generation"),
    /** 트림(세부 모델). 고정 목록 없이 이 정비소 기록에서 추천 */
    trim: text("trim"),
    colorCode: text("color_code"),
    /** 수리 사양: 레이더·센서·카메라·램프·선루프·3코트 도장 등(VEHICLE_OPTIONS 키) */
    options: jsonb("options").$type<string[]>().notNull().default([]),
    /** 마지막으로 안 주행거리(km)와 그날. 상담 때는 고객 말, 입고 때는 계기판 확인 값 */
    mileage: integer("mileage"),
    mileageOn: date("mileage_on"),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("vehicle_plate_uq").on(t.plateNo), index("vehicle_customer_idx").on(t.customerId), index("vehicle_vin_idx").on(t.vin)],
);

export const CONSENT_METHODS = ["phone", "visit", "online"] as const;

/** 개인정보 수집·이용 동의(F-13-01). 받을 때마다 한 줄. 지금 상태는 가장 최근 줄이다 */
export const consent = pgTable(
  "consent",
  {
    id: id(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customer.id),
    /** 동의서 문구 판(바뀌면 다시 받는다) */
    version: text("version").notNull(),
    required: boolean("required").notNull(),
    photo: boolean("photo").notNull().default(false),
    marketing: boolean("marketing").notNull().default(false),
    method: text("method", { enum: CONSENT_METHODS }).notNull(),
    /** 철회면 true. 필수 동의 철회는 더 연락하지 않는다는 뜻 */
    withdrawal: boolean("withdrawal").notNull().default(false),
    note: text("note"),
    recordedBy: uuid("recorded_by").references(() => appUser.id),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("consent_customer_idx").on(t.customerId, t.at)],
);

export const CONSULT_CHANNELS = ["phone", "visit", "message", "online", "insurer", "partner"] as const;
export const CONSULT_RESULTS = ["open", "reserved", "recontact", "declined", "converted"] as const;
export const INSURANCE_TYPES = ["self", "own", "other"] as const;

/** 상담 일지(F-01-01). 번호 CS-연월-순번 */
export const consultation = pgTable(
  "consultation",
  {
    id: id(),
    docNo: text("doc_no").notNull(),
    formRev: text("form_rev").notNull().default("v0.2"),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
    channel: text("channel", { enum: CONSULT_CHANNELS }).notNull(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customer.id),
    vehicleId: uuid("vehicle_id").references(() => vehicle.id),
    /** 손상 유형(찌그러짐·긁힘·도장 박리·부식·기타), 부위, 경위 */
    damageTypes: jsonb("damage_types").$type<string[]>().notNull().default([]),
    damageParts: text("damage_parts"),
    cause: text("cause"),
    photoCount: integer("photo_count").notNull().default(0),
    /** 고객이 말한 주행거리(km, 대략) */
    mileage: integer("mileage"),
    /** 예비 판단: 수리 방법, 구조물 손상 의심 */
    methods: jsonb("methods").$type<string[]>().notNull().default([]),
    structural: boolean("structural").notNull().default(false),
    insurance: text("insurance", { enum: INSURANCE_TYPES }).notNull().default("self"),
    insurer: text("insurer"),
    claimNo: text("claim_no"),
    /** 고객 요구 확인란 */
    wantDate: date("want_date"),
    partsPref: text("parts_pref"),
    rental: boolean("rental").notNull().default(false),
    needs: text("needs"),
    /** 예상 금액 범위와 '실차 진단 후 확정' 안내 여부 */
    estMin: integer("est_min"),
    estMax: integer("est_max"),
    estNoticed: boolean("est_noticed").notNull().default(false),
    result: text("result", { enum: CONSULT_RESULTS }).notNull().default("open"),
    reservedAt: timestamp("reserved_at", { withTimezone: true }),
    /** 한도를 넘겨 예약할 때 공장장 동의를 받았다는 표시 */
    overCapacityOk: boolean("over_capacity_ok").notNull().default(false),
    recontactOn: date("recontact_on"),
    closeReason: text("close_reason"),
    /** 회신 기한(정책값 '상담 회신 기한'으로 계산)과 회신한 때 */
    replyDue: date("reply_due"),
    repliedAt: timestamp("replied_at", { withTimezone: true }),
    confirmSentAt: timestamp("confirm_sent_at", { withTimezone: true }),
    reminderSentAt: timestamp("reminder_sent_at", { withTimezone: true }),
    /** 어느 상담에서 불러와 만들었는지 */
    fromId: uuid("from_id"),
    advisorId: uuid("advisor_id").references(() => appUser.id),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("consultation_no_uq").on(t.docNo),
    index("consultation_customer_idx").on(t.customerId),
    index("consultation_result_idx").on(t.result),
    index("consultation_reserved_idx").on(t.reservedAt),
  ],
);

/** 문자·알림톡 링크로 받는 동의 요청. 링크 토큰은 해시만 저장. 기한 안에 동의가 없으면 연락처를 지운다 */
export const consentRequest = pgTable(
  "consent_request",
  {
    id: id(),
    tokenHash: text("token_hash").notNull(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customer.id),
    consultId: uuid("consult_id"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    sentOk: boolean("sent_ok").notNull().default(false),
    createdBy: uuid("created_by").references(() => appUser.id),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("consent_request_token_uq").on(t.tokenHash), index("consent_request_customer_idx").on(t.customerId)],
);
