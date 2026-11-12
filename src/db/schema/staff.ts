// 직원 명부(F-11-01 근로자 명부)·역량 표(F-11-02), STD-11. 계정(app_user)에 붙는 인사 기록.
import {
  index,
  integer,
  jsonb,
  pgTable,
  real,
  serial,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
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
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
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
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("competency_user_skill_idx").on(t.userId, t.skill)],
);

/**
 * 직원 서류: 근로계약서(F-11-01)·정보보호 서약서(F-13-02)·퇴직 비밀유지 확인서(F-13-03).
 * 서명하면 내용(terms)·당사자 인적 사항(partyEnc, 암호화)·사업장 정보(shop)를 그때 값으로 고정한다.
 * 상태: draft(작성 중) → ready(대표 확인, 서명 대기) → signed / cancelled. 지우지 않는다.
 */
export const staffDocument = pgTable(
  "staff_document",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    docNo: text("doc_no").notNull().unique(),
    userId: uuid("user_id")
      .notNull()
      .references(() => appUser.id),
    kind: text("kind").notNull(),
    status: text("status").notNull().default("draft"),
    terms: jsonb("terms").$type<Record<string, unknown>>().notNull(),
    partyEnc: text("party_enc"),
    shop: jsonb("shop").$type<Record<string, string>>(),
    signPath: text("sign_path"),
    /** self=본인 로그인 서명, in_person=담당자 앞에서 대면 서명 */
    signedVia: text("signed_via"),
    signedAt: timestamp("signed_at", { withTimezone: true }),
    signedBy: uuid("signed_by").references(() => appUser.id),
    approvedBy: uuid("approved_by").references(() => appUser.id),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    deliveredHow: text("delivered_how"),
    deliveredBy: uuid("delivered_by").references(() => appUser.id),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancelReason: text("cancel_reason"),
    createdBy: uuid("created_by").references(() => appUser.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("staff_document_user_idx").on(t.userId, t.kind)],
);

/**
 * 교육 기록(F-11-03, STD-11 5절): 계획란(연간 계획·월) → 이수란(실시일·시간·강사·이수자 서명) → 효과란(직무 교육, 1개월 뒤).
 * 상태: planned → done / cancelled. 지우지 않는다.
 */
export const training = pgTable(
  "training",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    docNo: text("doc_no").notNull().unique(),
    year: integer("year").notNull(),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    /** 계획 달(YYYY-MM). 수시 교육은 비울 수 있음 */
    plannedMonth: text("planned_month"),
    plannedHours: real("planned_hours"),
    target: text("target"),
    organizerId: uuid("organizer_id").references(() => appUser.id),
    status: text("status").notNull().default("planned"),
    heldOn: text("held_on"),
    hours: real("hours"),
    instructor: text("instructor"),
    content: text("content"),
    effectDue: text("effect_due"),
    effectMethod: text("effect_method"),
    effectResult: text("effect_result"),
    effectNote: text("effect_note"),
    effectBy: uuid("effect_by").references(() => appUser.id),
    effectAt: timestamp("effect_at", { withTimezone: true }),
    cancelReason: text("cancel_reason"),
    createdBy: uuid("created_by").references(() => appUser.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("training_year_idx").on(t.year)],
);

/** 이수자(교육 한 건 × 직원). 본인이 앱에서 서명(signedAt)해야 이수 확인 */
export const trainingAttendee = pgTable(
  "training_attendee",
  {
    id: serial("id").primaryKey(),
    trainingId: uuid("training_id")
      .notNull()
      .references(() => training.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => appUser.id),
    hours: real("hours").notNull(),
    signedAt: timestamp("signed_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("training_attendee_uq").on(t.trainingId, t.userId)],
);

/**
 * 급여대장(F-11-05) 한 달 치. 상태: draft(회계 계산) → submitted(대표 승인 대기) → approved → paid.
 * 사람별 금액은 payslip 에 암호화해 두고, 여기에는 합계만 둔다.
 */
export const payrollRun = pgTable("payroll_run", {
  id: uuid("id").primaryKey().defaultRandom(),
  docNo: text("doc_no").notNull().unique(),
  ym: text("ym").notNull().unique(),
  status: text("status").notNull().default("draft"),
  payDate: text("pay_date").notNull(),
  headcount: integer("headcount").notNull().default(0),
  totalGross: integer("total_gross").notNull().default(0),
  totalDeduct: integer("total_deduct").notNull().default(0),
  totalNet: integer("total_net").notNull().default(0),
  returnReason: text("return_reason"),
  createdBy: uuid("created_by").references(() => appUser.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  approvedBy: uuid("approved_by").references(() => appUser.id),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  paidBy: uuid("paid_by").references(() => appUser.id),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/** 임금명세서(사람 한 명 한 달). 금액·계산 방법 전부를 dataEnc(SlipData JSON)로 암호화 */
export const payslip = pgTable(
  "payslip",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id")
      .notNull()
      .references(() => payrollRun.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => appUser.id),
    dataEnc: text("data_enc").notNull(),
    viewedAt: timestamp("viewed_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("payslip_run_user_uq").on(t.runId, t.userId)],
);

/**
 * 인사평가(F-11-06, STD-11 6절): 매년 12월. 앱 기록 근거(evidence, 평가 시작 때 고정) + 항목별 점수(1~5) + 면담.
 * 상태: draft(공장장 작성) → interview(면담·본인 의견) → confirmed(대표 확정). 확정하면 다음 해 교육 계획에 필요 교육을 올린다.
 */
export const perfReview = pgTable(
  "perf_review",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    docNo: text("doc_no").notNull().unique(),
    year: integer("year").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => appUser.id),
    status: text("status").notNull().default("draft"),
    evidence: jsonb("evidence").$type<Record<string, unknown>>().notNull(),
    scores: jsonb("scores")
      .$type<Record<string, number>>()
      .notNull()
      .default({}),
    comments: jsonb("comments")
      .$type<Record<string, string>>()
      .notNull()
      .default({}),
    total: real("total"),
    grade: text("grade"),
    strengths: text("strengths"),
    improve: text("improve"),
    trainingNeeds: text("training_needs"),
    wageNote: text("wage_note"),
    interviewedOn: text("interviewed_on"),
    employeeComment: text("employee_comment"),
    employeeAckAt: timestamp("employee_ack_at", { withTimezone: true }),
    reviewerId: uuid("reviewer_id").references(() => appUser.id),
    confirmedBy: uuid("confirmed_by").references(() => appUser.id),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    trainingId: uuid("training_id").references(() => training.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("perf_review_year_user_uq").on(t.year, t.userId)],
);

export type ExitItem = {
  done: boolean;
  by?: string;
  at?: string;
  note?: string;
};
/**
 * 퇴직 처리 점검표(F-11-07, STD-11 7절·취업규칙 제42조). 퇴직일·사유와 항목별 확인. open → closed.
 * 항목: 반납·인계·비밀유지 확인서·계정 잠금·임금·퇴직금 정산(14일 안)·4대 보험 상실 신고·경력증명서.
 */
export const exitCheck = pgTable("exit_check", {
  id: uuid("id").primaryKey().defaultRandom(),
  docNo: text("doc_no").notNull().unique(),
  userId: uuid("user_id")
    .notNull()
    .references(() => appUser.id),
  leftOn: text("left_on").notNull(),
  reason: text("reason").notNull(),
  noticeOn: text("notice_on"),
  settleDue: text("settle_due").notNull(),
  status: text("status").notNull().default("open"),
  items: jsonb("items").$type<Record<string, ExitItem>>().notNull().default({}),
  createdBy: uuid("created_by").references(() => appUser.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  closedBy: uuid("closed_by").references(() => appUser.id),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/**
 * 출퇴근 기록(사용자 결정 2026-11-11: 정비소 와이파이에서만 버튼). 한 사람 하루 한 줄.
 * 고치지 않는다. 빠졌거나 틀리면 근태 신청서의 '출퇴근 정정'(F-11-04)으로 승인받고, 계산은 정정 값을 먼저 쓴다.
 */
export const workDay = pgTable(
  "work_day",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => appUser.id),
    day: text("day").notNull(),
    inAt: timestamp("in_at", { withTimezone: true }).notNull(),
    inIp: text("in_ip"),
    outAt: timestamp("out_at", { withTimezone: true }),
    outIp: text("out_ip"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("work_day_user_day_uq").on(t.userId, t.day), index("work_day_day_idx").on(t.day)],
);

/**
 * 직원 서류함(대표 지시 2026-11-12): 이력서·자격증 사본·경력증명서 등. 파일은 민감정보 키로 암호화해 보관(hr/ 폴더)하고
 * /api/staff-files/[id] 로만 연다(대표·회계·본인). 지우면 파일은 바로 지우고 줄은 기록으로 남긴다.
 */
export const staffFile = pgTable(
  "staff_file",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => appUser.id),
    /** resume 이력서 · license 자격증 사본 · career 경력·재직 증명 · edu 졸업·교육 수료 · health 건강진단 · bank 급여 통장 사본 · other 기타 */
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    /** 자격증 사본이면 명부의 자격증 이름(연결) */
    licenseName: text("license_name"),
    path: text("path"),
    fileName: text("file_name").notNull(),
    mime: text("mime").notNull(),
    size: integer("size").notNull(),
    uploadedBy: uuid("uploaded_by").references(() => appUser.id),
    /** 본인이 올린 것은 대표·회계가 확인한다 */
    checkedBy: uuid("checked_by").references(() => appUser.id),
    checkedAt: timestamp("checked_at", { withTimezone: true }),
    removedAt: timestamp("removed_at", { withTimezone: true }),
    removedBy: uuid("removed_by").references(() => appUser.id),
    removeReason: text("remove_reason"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("staff_file_user_idx").on(t.userId)],
);
