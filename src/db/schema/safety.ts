// 안전보건(STD-09): 위험성평가 F-09-01, 화학물질 목록·MSDS F-09-02, 사고·아차사고 보고서 F-09-03
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { appUser, createdAt, id } from "./platform";

/**
 * 위험성평가 F-09-01(STD-09 4절). kind: initial 최초(개업 전) · regular 정기(매년 1월) · adhoc 수시(설비·도료·공법 변경, 사고).
 * status: draft 작성 중 · done 확정(작업자에게 공유). participants: 평가에 참여한 근로자
 */
export const hazardAssessment = pgTable(
  "hazard_assessment",
  {
    id: id(),
    docNo: text("doc_no").notNull(),
    kind: text("kind").notNull(),
    year: integer("year").notNull(),
    reason: text("reason"),
    incidentId: uuid("incident_id"),
    participants: jsonb("participants").$type<string[]>().notNull().default([]),
    status: text("status").notNull().default("draft"),
    doneBy: uuid("done_by").references(() => appUser.id),
    doneAt: timestamp("done_at", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => appUser.id),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("hazard_assessment_no_uq").on(t.docNo),
    index("hazard_assessment_year_idx").on(t.year),
  ],
);

/**
 * 평가표 한 줄: 공정·유해위험 요인·가능성(1~3)×중대성(1~3). 4점 이상은 감소 대책(measureType 우선순위)·담당·기한 필수.
 * 대책을 실행하면 measureDoneAt과 잔류 위험(residualL × residualS)을 적는다
 */
export const hazardRow = pgTable(
  "hazard_row",
  {
    id: id(),
    assessmentId: uuid("assessment_id")
      .notNull()
      .references(() => hazardAssessment.id),
    process: text("process").notNull(),
    hazard: text("hazard").notNull(),
    current: text("current"),
    likelihood: integer("likelihood").notNull(),
    severity: integer("severity").notNull(),
    score: integer("score").notNull(),
    measureType: text("measure_type"),
    measure: text("measure"),
    ownerId: uuid("owner_id").references(() => appUser.id),
    due: text("due"),
    measureDoneAt: timestamp("measure_done_at", { withTimezone: true }),
    measureDoneBy: uuid("measure_done_by").references(() => appUser.id),
    measureResult: text("measure_result"),
    residualL: integer("residual_l"),
    residualS: integer("residual_s"),
    createdAt: createdAt(),
  },
  (t) => [index("hazard_row_idx").on(t.assessmentId)],
);

/** 화학물질 목록 F-09-02(STD-09 5절). MSDS 파일은 누구나 볼 수 있다(작업장 게시와 같음) */
export const chemical = pgTable("chemical", {
  id: id(),
  name: text("name").notNull(),
  maker: text("maker"),
  category: text("category").notNull(),
  hazards: text("hazards"),
  monthlyUse: text("monthly_use"),
  location: text("location"),
  ppe: jsonb("ppe").$type<string[]>().notNull().default([]),
  flammable: boolean("flammable").notNull().default(false),
  msdsPath: text("msds_path"),
  msdsName: text("msds_name"),
  msdsRevisedOn: text("msds_revised_on"),
  msdsUploadedAt: timestamp("msds_uploaded_at", { withTimezone: true }),
  trainedOn: text("trained_on"),
  active: boolean("active").notNull().default(true),
  note: text("note"),
  createdBy: uuid("created_by").references(() => appUser.id),
  createdAt: createdAt(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * 사고·아차사고 보고서 F-09-03(STD-09 9절). kind: accident 사고 · near 아차사고.
 * severity: none 부상 없음 · first_aid 응급처치 · lost_time 휴업 · serious 중대.
 * 다친 사람·부상 내용은 건강 정보라 암호화(injuredEnc, injuryEnc)하고 안전환경 담당·공장장·대표만 본다.
 * status: reported 보고 · investigated 조사 끝(원인·재발 방지) · closed 종결
 */
export const incident = pgTable(
  "incident",
  {
    id: id(),
    docNo: text("doc_no").notNull(),
    kind: text("kind").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    place: text("place").notNull(),
    process: text("process"),
    description: text("description").notNull(),
    severity: text("severity").notNull().default("none"),
    injuredEnc: text("injured_enc"),
    injuryEnc: text("injury_enc"),
    damage: text("damage"),
    immediate: text("immediate"),
    cause: text("cause"),
    prevention: text("prevention"),
    legalNeeded: boolean("legal_needed"),
    legalReportedOn: text("legal_reported_on"),
    legalNote: text("legal_note"),
    hazardReview: text("hazard_review"),
    ncId: uuid("nc_id"),
    status: text("status").notNull().default("reported"),
    reportedBy: uuid("reported_by").references(() => appUser.id),
    reportedAt: timestamp("reported_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    investigatedBy: uuid("investigated_by").references(() => appUser.id),
    investigatedAt: timestamp("investigated_at", { withTimezone: true }),
    closedBy: uuid("closed_by").references(() => appUser.id),
    closedAt: timestamp("closed_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("incident_no_uq").on(t.docNo),
    index("incident_status_idx").on(t.status),
  ],
);
