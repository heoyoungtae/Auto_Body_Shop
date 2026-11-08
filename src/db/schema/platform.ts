// 공통 플랫폼 테이블 — 앱 설계서 2장(사용자·권한), 7장(데이터 모델), 8장(결재·정책값), 9장(감사 로그)
import { boolean, date, index, integer, jsonb, pgTable, primaryKey, serial, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

export const id = () => uuid("id").primaryKey().defaultRandom();
export const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

/** 사내 표준서 2.2의 역할 7종. 한 사람이 여러 역할을 가질 수 있다 */
export const ROLE_VALUES = ["owner", "plant_manager", "advisor", "technician", "quality", "safety", "accounting"] as const;

export const appUser = pgTable(
  "app_user",
  {
    id: id(),
    /** 로그인 아이디(영문·숫자, 소문자로 저장) */
    loginId: text("login_id").notNull(),
    name: text("name").notNull(),
    passwordHash: text("password_hash").notNull(),
    /** 휴대폰 번호(앱 계층에서 암호화) */
    phoneEnc: text("phone_enc"),
    active: boolean("active").notNull().default(true),
    /** 연속 로그인 실패 횟수와 잠금 해제 시각 */
    failedLogins: integer("failed_logins").notNull().default(0),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    /** 퇴직 점검표(F-11-07) 확정일. 있으면 로그인 불가 */
    retiredOn: date("retired_on"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("app_user_login_uq").on(t.loginId)],
);

export const userRole = pgTable(
  "user_role",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => appUser.id),
    role: text("role", { enum: ROLE_VALUES }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.role] })],
);

export const session = pgTable(
  "session",
  {
    /** 쿠키 토큰의 SHA-256. 토큰 자체는 저장하지 않는다 */
    tokenHash: text("token_hash").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => appUser.id),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ip: text("ip"),
    userAgent: text("user_agent"),
    createdAt: createdAt(),
  },
  (t) => [index("session_user_idx").on(t.userId)],
);

/** 감사 로그: 추가만 한다(9.3). 수정·삭제하는 코드는 두지 않는다 */
export const auditLog = pgTable(
  "audit_log",
  {
    id: serial("id").primaryKey(),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
    actorId: uuid("actor_id"),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    before: jsonb("before"),
    after: jsonb("after"),
    ip: text("ip"),
    userAgent: text("user_agent"),
  },
  (t) => [index("audit_log_entity_idx").on(t.entityType, t.entityId), index("audit_log_at_idx").on(t.at)],
);

/** 정책값(부록 D) 변경 이력. 가장 최근 시행분이 현재 값. 없으면 코드의 기본값(제안값) */
export const policySetting = pgTable(
  "policy_setting",
  {
    id: id(),
    key: text("key").notNull(),
    value: jsonb("value").notNull(),
    effectiveFrom: date("effective_from").notNull(),
    /** 근거가 된 문서 개정 요청서(F-Q-05) 번호 */
    revisionRequestNo: text("revision_request_no"),
    reason: text("reason").notNull(),
    changedBy: uuid("changed_by").references(() => appUser.id),
    createdAt: createdAt(),
  },
  (t) => [index("policy_setting_key_idx").on(t.key, t.effectiveFrom)],
);

/** 전결 규정표(부록 B). 한 줄이 규칙 하나: 업무별로 금액(또는 비율) 구간과 최종 승인 역할 */
export const delegationRule = pgTable(
  "delegation_rule",
  {
    id: id(),
    task: text("task").notNull(),
    /** 이 값 이하까지 이 역할이 최종 승인. null 이면 상한 없음 */
    upTo: integer("up_to"),
    approverRole: text("approver_role", { enum: ROLE_VALUES }).notNull(),
    /** 같은 업무 안에서 낮은 순서부터 맞춰 본다 */
    seq: integer("seq").notNull(),
    note: text("note"),
    effectiveFrom: date("effective_from").notNull(),
    revisionRequestNo: text("revision_request_no"),
    changedBy: uuid("changed_by").references(() => appUser.id),
    createdAt: createdAt(),
  },
  (t) => [index("delegation_rule_task_idx").on(t.task, t.effectiveFrom)],
);

/** 문서 번호 일련번호: 접두어 + 연월(YYMM)별 */
export const docSequence = pgTable(
  "doc_sequence",
  {
    prefix: text("prefix").notNull(),
    period: text("period").notNull(),
    last: integer("last").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.prefix, t.period] })],
);

/** 대표 부재 시 대리 승인(10.3-7: 공장장) */
export const proxyAssignment = pgTable("proxy_assignment", {
  id: id(),
  principalId: uuid("principal_id")
    .notNull()
    .references(() => appUser.id),
  proxyId: uuid("proxy_id")
    .notNull()
    .references(() => appUser.id),
  fromDate: date("from_date").notNull(),
  toDate: date("to_date").notNull(),
  createdAt: createdAt(),
});

export const notification = pgTable(
  "notification",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => appUser.id),
    title: text("title").notNull(),
    body: text("body"),
    link: text("link"),
    /** 같은 알림을 두 번 만들지 않기 위한 키(예: lube:EQ-001:2026-11-08) */
    dedupeKey: text("dedupe_key"),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("notification_user_idx").on(t.userId, t.readAt), uniqueIndex("notification_dedupe_uq").on(t.userId, t.dedupeKey)],
);

/** 주기 작업 실행 기록(8.6). 같은 작업·같은 날은 한 번만 */
export const jobRun = pgTable(
  "job_run",
  {
    id: id(),
    job: text("job").notNull(),
    runDate: date("run_date").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    ok: boolean("ok"),
    message: text("message"),
  },
  (t) => [uniqueIndex("job_run_uq").on(t.job, t.runDate)],
);
