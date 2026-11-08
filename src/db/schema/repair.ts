// 수리 건(RO)과 입고 점검표(F-02-01, STD-02). 수리 건은 상담 일지에서만 만든다(고객·차량·보험·손상을 그대로 불러옴).
import { boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { appUser, createdAt, id } from "./platform";
import { consultation, customer, vehicle } from "./customer";

/** 수리 건 상태. intake=입고 점검 중, checked=점검·서명 끝(견적 대기). 견적·작업·출고 단계는 다음 개발에서 더한다 */
export const RO_STATUSES = ["intake", "checked", "estimating", "working", "inspecting", "ready", "delivered", "cancelled"] as const;

import { PHOTO_SLOTS, type BodyMark } from "@/modules/repair/rules";
export { PHOTO_SLOTS, type BodyMark };

export const repairOrder = pgTable(
  "repair_order",
  {
    id: id(),
    docNo: text("doc_no").notNull(),
    formRev: text("form_rev").notNull().default("v0.2"),
    status: text("status", { enum: RO_STATUSES }).notNull().default("intake"),
    consultationId: uuid("consultation_id")
      .notNull()
      .references(() => consultation.id),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customer.id),
    vehicleId: uuid("vehicle_id")
      .notNull()
      .references(() => vehicle.id),
    /** 상담에서 불러온 보험 정보(견적·청구가 이어 쓴다) */
    insurance: text("insurance").notNull().default("self"),
    insurer: text("insurer"),
    claimNo: text("claim_no"),
    inAt: timestamp("in_at", { withTimezone: true }).notNull().defaultNow(),
    /** 탁송 입고(고객 없이 기사와 점검) */
    delivered: boolean("delivered_by_driver").notNull().default(false),
    driverName: text("driver_name"),
    // ── 입고 점검(F-02-01)
    mileage: integer("mileage"),
    fuelPct: integer("fuel_pct"),
    bodyNotes: jsonb("body_notes").$type<string[]>().notNull().default([]),
    warningLights: text("warning_lights"),
    marks: jsonb("marks").$type<BodyMark[]>().notNull().default([]),
    valuables: text("valuables"),
    valuablesNone: boolean("valuables_none").notNull().default(false),
    devices: jsonb("devices").$type<string[]>().notNull().default([]),
    keyCount: integer("key_count"),
    keyTag: text("key_tag"),
    /** 시트·핸들·바닥 커버 설치(STD-02 4절 8단계) */
    coversOn: boolean("covers_on").notNull().default(false),
    /** 세워 둔 곳(지정 구역) */
    parkSpot: text("park_spot"),
    intakeNote: text("intake_note"),
    // ── 고객 확인(서명)
    agreeChecked: boolean("agree_checked").notNull().default(false),
    agreeMove: boolean("agree_move").notNull().default(false),
    signerName: text("signer_name"),
    signaturePath: text("signature_path"),
    signedAt: timestamp("signed_at", { withTimezone: true }),
    advisorId: uuid("advisor_id").references(() => appUser.id),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("repair_order_no_uq").on(t.docNo), uniqueIndex("repair_order_consult_uq").on(t.consultationId), index("repair_order_status_idx").on(t.status), index("repair_order_vehicle_idx").on(t.vehicleId)],
);

export const roPhoto = pgTable(
  "ro_photo",
  {
    id: id(),
    repairOrderId: uuid("repair_order_id")
      .notNull()
      .references(() => repairOrder.id),
    slot: text("slot", { enum: PHOTO_SLOTS }).notNull(),
    path: text("path").notNull(),
    width: integer("width"),
    height: integer("height"),
    bytes: integer("bytes").notNull(),
    note: text("note"),
    takenBy: uuid("taken_by").references(() => appUser.id),
    createdAt: createdAt(),
  },
  (t) => [index("ro_photo_ro_idx").on(t.repairOrderId)],
);
