// 환경(STD-10): 방지시설 운영 일지 F-10-01(일일 가동 기록은 도장 부스 운전 일지 F-08-04와 같이 씀), 폐기물 관리대장 F-10-02
import {
  index,
  pgTable,
  real,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { equipment } from "./equipment";
import { appUser, createdAt, id } from "./platform";
import { supplier } from "./purchase";

/**
 * 방지시설 운영 기록(F-10-01). kind: filter 필터 교체 · carbon 활성탄 교체 · measure 자가측정 · separator 유수분리조 점검 · spill 누출·흡수 처리.
 * 교체 때 폐필터 무게를 적으면 폐기물 관리대장에 발생으로 함께 들어간다(wasteLogId)
 */
export const envEvent = pgTable(
  "env_event",
  {
    id: id(),
    kind: text("kind").notNull(),
    equipmentId: uuid("equipment_id").references(() => equipment.id),
    on: text("on").notNull(),
    detail: text("detail"),
    result: text("result"),
    nextDue: text("next_due"),
    wasteLogId: uuid("waste_log_id"),
    by: uuid("by").references(() => appUser.id),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("env_event_idx").on(t.kind, t.on)],
);

/** 월 확인 서명(STD-10 5.6): 안전환경 담당이 익월 5일까지 */
export const envMonthSign = pgTable("env_month_sign", {
  ym: text("ym").primaryKey(),
  by: uuid("by").references(() => appUser.id),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  summary: text("summary"),
  note: text("note"),
});

/**
 * 폐기물 관리대장(F-10-02). kind: gen 발생(보관 시작) · out 위탁 인계(올바로 전자인계서 번호 slipNo, 위탁 업체 supplierId).
 * 보관 시작일은 아직 인계하지 않은 가장 이른 발생분의 날(먼저 낸 것 먼저 처리)
 */
export const wasteLog = pgTable(
  "waste_log",
  {
    id: id(),
    kind: text("kind").notNull(),
    item: text("item").notNull(),
    qty: real("qty").notNull(),
    on: text("on").notNull(),
    supplierId: uuid("supplier_id").references(() => supplier.id),
    slipNo: text("slip_no"),
    note: text("note"),
    by: uuid("by").references(() => appUser.id),
    createdAt: createdAt(),
  },
  (t) => [index("waste_log_idx").on(t.item, t.on)],
);
