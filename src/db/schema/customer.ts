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
    /**
     * 고객 구분: person 개인 · business 업체(렌터카·중고차 상품화·법인 차량 등). 업체 고객은 사업자번호·결제 조건으로
     * 외상 출고하고 월말에 업체별 청구서 한 장으로 받는다(대표 결정 2026-11-17). 업체는 개인정보 동의 대상이 아니다
     */
    kind: text("kind").notNull().default("person"),
    bizNo: text("biz_no"),
    /** 업체 담당자 이름(연락처는 위 phone 칸이 업체 대표번호) */
    contactName: text("contact_name"),
    /** 세금계산서 받을 이메일 */
    taxEmail: text("tax_email"),
    /** 결제 조건(PAY_TERMS: now 출고 때 · month_end 당월 말 · next_end 익월 말 · next_day 익월 payDay일) */
    payTerm: text("pay_term"),
    payDay: integer("pay_day"),
    /** 외상 한도(원, 부가세 포함). 비우면 한도 없음. 넘으면 출고 때 경고·확인 */
    creditLimitWon: integer("credit_limit_won"),
    /** 세금계산서: monthly 월 합계(청구서 한 장) · each 건별(출고마다) */
    invoiceMode: text("invoice_mode").notNull().default("monthly"),
    /** 업체 쪽 주문 앱(우리가 접속해 주문 확인·진행 상태 등록): techbay 테크베이 · other 그 밖의 앱. 비우면 없음 */
    portal: text("portal"),
    portalUrl: text("portal_url"),
    /** 그쪽 앱 쓰는 요령(로그인 방법·상태 이름 등). 아이디·비밀번호는 적지 않는다 */
    portalNote: text("portal_note"),
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
    /** 차형(세단·해치백·SUV·승합·화물, body-map BODY_TYPES). 비우면 차종 이름으로 짐작 */
    bodyType: text("body_type"),
    /** 마지막으로 안 주행거리(km)와 그날. 상담 때는 고객 말, 입고 때는 계기판 확인 값 */
    mileage: integer("mileage"),
    mileageOn: date("mileage_on"),
    /** 자동차등록증의 최초 등록일(법정 견적서·정비명세서의 등록년월일 칸). 처음 견적 때 한 번 받는다 */
    registeredOn: date("registered_on"),
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
    /** 차 그림에서 찍은 손상 부위(부위·면·칸·기호, 입고 도면과 같은 모양). 입고 때 수리 대상(O)으로 넘어간다 */
    damageZones: jsonb("damage_zones").$type<{ part: string; view: string; cell: number; kind: string }[]>().notNull().default([]),
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

/**
 * 업체 쪽 주문 앱의 주문(테크베이 등). 우리 상담(CS)·수리 건(RO)과 그쪽 주문번호를 잇고,
 * 그쪽 앱에 등록해야 할 진행 상태(입고·작업 시작·수리 완료·출고)를 누가 언제 등록했는지 남긴다
 */
export const portalOrder = pgTable(
  "portal_order",
  {
    id: id(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customer.id),
    /** techbay · other */
    platform: text("platform").notNull(),
    /** 그쪽 주문 식별값(테크베이 hash_id, 손으로 적은 주문번호) */
    extId: text("ext_id").notNull(),
    /** 화면에 보일 그쪽 주문번호 */
    extNo: text("ext_no"),
    requestedAt: text("requested_at"),
    plateNo: text("plate_no"),
    /** 불러올 때 받은 내용(차량·요청 항목·메모) */
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    consultationId: uuid("consultation_id").references(() => consultation.id),
    /** 그쪽 앱에 등록한 진행 상태 */
    posted: jsonb("posted").$type<{ step: string; at: string; by: string; note?: string }[]>().notNull().default([]),
    createdBy: uuid("created_by").references(() => appUser.id),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("portal_order_ext_uq").on(t.platform, t.extId), index("portal_order_consult_idx").on(t.consultationId)],
);
