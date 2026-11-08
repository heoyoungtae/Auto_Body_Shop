// 직원 명부(F-11-01 근로자 명부)·역량 표(F-11-02), STD-11. 계정(app_user)에 붙는 인사 기록.
import { index, integer, jsonb, pgTable, serial, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { appUser } from "./platform";

export type License = { name: string; no: string; on: string };

/** 근로자 명부(근로기준법 제41조·시행령 제20조 기재 사항). 생년월일·주소는 암호화해 둔다 */
export const staffProfile = pgTable("staff_profile", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => appUser.id),
  /** 종사 업무(직무) */
  job: text("job"),
  gender: text("gender"),
  birthEnc: text("birth_enc"),
  addressEnc: text("address_enc"),
  /** 이력(경력·학력 요약) */
  career: text("career"),
  hiredOn: text("hired_on"),
  /** regular=기간 정함 없음, fixed=기간제, part=단시간 */
  contractKind: text("contract_kind"),
  contractEnd: text("contract_end"),
  licenses: jsonb("licenses").$type<License[]>().notNull().default([]),
  /** 퇴직일·사유(퇴직 점검표 F-11-07과 연결) */
  leftOn: text("left_on"),
  leftReason: text("left_reason"),
  /** 휴대폰·비상연락처(이름·관계·번호 JSON) — 암호화 */
  phoneEnc: text("phone_enc"),
  emergencyEnc: text("emergency_enc"),
  updatedBy: uuid("updated_by").references(() => appUser.id),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** 역량 평가 기록(쌓기만 함). 공장장이 매기고 대표가 확인한 것(confirmedAt)이 현재 단계 */
export const competency = pgTable(
  "competency",
  {
    id: serial("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => appUser.id),
    skill: text("skill").notNull(),
    level: integer("level").notNull(),
    note: text("note"),
    assessedOn: text("assessed_on").notNull(),
    assessedBy: uuid("assessed_by").references(() => appUser.id),
    confirmedBy: uuid("confirmed_by").references(() => appUser.id),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    rejectedAt: timestamp("rejected_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("competency_user_skill_idx").on(t.userId, t.skill)],
);
