// 개인별 일일 업무일지의 '내가 적는 칸'(사용자 결정 2026-11-11: 제안 5개 + 퇴근 전 마감·확인).
// 한 사람 하루 한 줄. 자동 기록(앱에서 한 일)은 저장하지 않고 그때그때 감사 로그 등에서 만든다. 마감할 때 요약 숫자만 남긴다.
import { boolean, index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { appUser, createdAt, id } from "./platform";

export type OffAppRow = { from: string; to: string; kind: string; detail: string };
export type JournalAddendum = { at: string; by: string; text: string };
export type JournalSnapshot = { entries: number; workMinutes: number; stdMinutes: number; steps: number; carry: number; firstAt: string | null; lastAt: string | null };

/** status: draft 작성 중 / closed 마감(확인 대기) / returned 보완 요청 / confirmed 확인 끝 */
export const dailyJournal = pgTable(
  "daily_journal",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => appUser.id),
    day: text("day").notNull(),
    /** 특이사항 */
    notes: text("notes"),
    /** 내일 할 일 메모(자동으로 채운 목록 밖에 덧붙일 것) */
    tomorrow: text("tomorrow"),
    /** 앱 밖에서 한 일 */
    offApp: jsonb("off_app").$type<OffAppRow[]>().notNull().default([]),
    /** 건의 */
    suggestionText: text("suggestion_text"),
    /** 건의를 개선 제안(F-08-06)으로 올렸을 때 그 번호 */
    suggestionNo: text("suggestion_no"),
    /** 안전 확인: true 다치거나 아차사고 없음 / false 있음 / null 아직 */
    safetyOk: boolean("safety_ok"),
    safetyNote: text("safety_note"),
    status: text("status").notNull().default("draft"),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    snapshot: jsonb("snapshot").$type<JournalSnapshot>(),
    /** 확인할 역할(마감 때 정함): plant_manager / owner. 대표 본인 일지는 null(확인 없음) */
    confirmRole: text("confirm_role"),
    confirmedBy: uuid("confirmed_by").references(() => appUser.id),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    returnNote: text("return_note"),
    returnedAt: timestamp("returned_at", { withTimezone: true }),
    /** 마감 뒤 덧붙인 말(고치지 않고 더하기만) */
    addenda: jsonb("addenda").$type<JournalAddendum[]>().notNull().default([]),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("daily_journal_user_day_uq").on(t.userId, t.day), index("daily_journal_status_idx").on(t.status, t.confirmRole)],
);
