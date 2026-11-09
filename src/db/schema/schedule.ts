// 일정표(사용자 지시 2026-11-09): 사내 공용 일정과 개인 일정을 나눠 관리한다.
// 공용 일정은 모든 직원이 보고, 개인 일정은 본인만 본다. 입고 예약·출고 약속·휴가·점검 기한 같은 자동 일정은 원래 기록에서 읽어 와 따로 저장하지 않는다.
import { index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { appUser, createdAt, id } from "./platform";

export const scheduleEvent = pgTable(
  "schedule_event",
  {
    id: id(),
    /** shop 사내 공용 / personal 개인 */
    scope: text("scope").notNull(),
    /** meeting 회의 / education 교육 / audit 점검·심사 / visit 방문·외근 / event 행사 / off 단체 휴무 / etc 기타 */
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    startOn: text("start_on").notNull(),
    endOn: text("end_on").notNull(),
    /** HH:MM. 비면 하루 종일 */
    startTime: text("start_time"),
    endTime: text("end_time"),
    place: text("place"),
    note: text("note"),
    /** 공용 일정의 참석자. 비어 있으면 전 직원 */
    attendeeIds: jsonb("attendee_ids").$type<string[]>().notNull().default([]),
    /** none / weekly / monthly / yearly */
    repeat: text("repeat").notNull().default("none"),
    repeatUntil: text("repeat_until"),
    /** 며칠 전에 알릴지(0 = 당일 아침). 비면 알리지 않음 */
    remindDays: integer("remind_days"),
    /** 개인 일정의 주인, 공용 일정은 올린 사람 */
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => appUser.id),
    updatedBy: uuid("updated_by").references(() => appUser.id),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancelledBy: uuid("cancelled_by").references(() => appUser.id),
    cancelReason: text("cancel_reason"),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("schedule_event_start").on(t.startOn), index("schedule_event_owner").on(t.ownerId, t.scope)],
);
