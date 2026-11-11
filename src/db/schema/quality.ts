// 부적합·시정 조치(F-Q-10, STD-Q Q.9)와 3정5S 점검(F-08-05, STD-08 11~14절)
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { appUser, createdAt, id } from "./platform";

/** 부적합·시정 조치 보고서 F-Q-10 */
export const nonconformance = pgTable(
  "nonconformance",
  {
    id: id(),
    docNo: text("doc_no").notNull(),
    /** inspect/complaint/audit/goal/legal/equipment/five_s/accident/privacy/other */
    source: text("source").notNull(),
    /** 관련 건: repair_order / equipment / zone / equipment_failure … 와 그 id, 화면 표시 글 */
    refType: text("ref_type"),
    refId: text("ref_id"),
    refLabel: text("ref_label"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    foundBy: uuid("found_by")
      .notNull()
      .references(() => appUser.id),
    content: text("content").notNull(),
    photos: jsonb("photos").$type<string[]>().notNull().default([]),
    /** 즉시 조치(작업 중지·격리·재작업·고객 연락) */
    immediate: text("immediate"),
    /** 중대 건이면 종결에 대표 승인 */
    major: boolean("major").notNull().default(false),
    whys: jsonb("whys").$type<string[]>().notNull().default([]),
    /** person/method/equipment/material/environment/standard */
    rootCause: text("root_cause"),
    corrective: text("corrective"),
    assigneeId: uuid("assignee_id").references(() => appUser.id),
    dueOn: text("due_on"),
    /** 표준·양식 개정 필요(F-Q-05 번호) */
    stdRevision: boolean("std_revision").notNull().default(false),
    revisionRef: text("revision_ref"),
    plannedBy: uuid("planned_by").references(() => appUser.id),
    plannedAt: timestamp("planned_at", { withTimezone: true }),
    /** 조치 담당이 한 일 */
    actionDone: text("action_done"),
    actionPhotos: jsonb("action_photos")
      .$type<string[]>()
      .notNull()
      .default([]),
    actionAt: timestamp("action_at", { withTimezone: true }),
    /** 효과 확인 */
    effectOn: text("effect_on"),
    recurred: boolean("recurred"),
    effectNote: text("effect_note"),
    effectBy: uuid("effect_by").references(() => appUser.id),
    /** open 발행 / planned 조치 중 / done 조치 끝(효과 확인 대기) / closed 종결 */
    status: text("status").notNull().default("open"),
    closedBy: uuid("closed_by").references(() => appUser.id),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("nonconformance_no_uq").on(t.docNo),
    index("nonconformance_ref").on(t.refType, t.refId),
    index("nonconformance_status").on(t.status),
  ],
);

/** 현장 구역과 담당(8.8) */
export const fiveSZone = pgTable("five_s_zone", {
  /** A~H */
  code: text("code").primaryKey(),
  name: text("name").notNull(),
  ownerId: uuid("owner_id").references(() => appUser.id),
  deputyId: uuid("deputy_id").references(() => appUser.id),
  /** 기준 사진('이 상태가 정상') */
  refPhoto: text("ref_photo"),
  active: boolean("active").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/** 일일 점검 F-08-05 */
export const fiveSDaily = pgTable(
  "five_s_daily",
  {
    id: id(),
    zone: text("zone").notNull(),
    checkDate: text("check_date").notNull(),
    /** 체크 항목 순서대로 true=○ false=× */
    results: jsonb("results").$type<boolean[]>().notNull(),
    items: jsonb("items").$type<string[]>().notNull(),
    note: text("note"),
    photos: jsonb("photos").$type<string[]>().notNull().default([]),
    checkedBy: uuid("checked_by")
      .notNull()
      .references(() => appUser.id),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("five_s_daily_uq").on(t.zone, t.checkDate)],
);

/** 월간 점검 F-08-05(구역별 5S 각 20점) */
export const fiveSMonthly = pgTable(
  "five_s_monthly",
  {
    id: id(),
    ym: text("ym").notNull(),
    zone: text("zone").notNull(),
    /** 정리·정돈·청소·청결·습관화 */
    scores: jsonb("scores").$type<number[]>().notNull(),
    total: integer("total").notNull(),
    remarks: text("remarks"),
    ncId: uuid("nc_id").references(() => nonconformance.id),
    ratedBy: uuid("rated_by")
      .notNull()
      .references(() => appUser.id),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("five_s_monthly_uq").on(t.ym, t.zone)],
);

/**
 * 법규 대장(F-Q-06, 총람 Q.6). applies: yes 대상 · no 대상 아님 · check 확인 필요(부록 C 초안 그대로).
 * cycle: none 1회·수시 · monthly · quarterly · half 반기 · yearly. nextDue: 다음 이행 기한.
 * 인허가·신고증은 permitNo·validUntil(유효기간)을 두고 30일·7일 전에 알린다. revCheckedOn: 마지막 법령 개정 확인일.
 */
export const legalItem = pgTable(
  "legal_item",
  {
    id: id(),
    area: text("area").notNull(),
    lawName: text("law_name").notNull(),
    clause: text("clause"),
    duty: text("duty").notNull(),
    stdRef: text("std_ref"),
    applies: text("applies").notNull().default("check"),
    basis: text("basis"),
    ownerId: uuid("owner_id").references(() => appUser.id),
    cycle: text("cycle").notNull().default("none"),
    nextDue: text("next_due"),
    evidence: text("evidence"),
    authority: text("authority"),
    permitNo: text("permit_no"),
    validUntil: text("valid_until"),
    revCheckedOn: text("rev_checked_on"),
    active: boolean("active").notNull().default(true),
    note: text("note"),
    createdBy: uuid("created_by").references(() => appUser.id),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("legal_item_due_idx").on(t.nextDue)],
);

/**
 * 법규 이력: create · edit · done 이행(증빙) · revcheck 개정 확인(changed) · inspect 관청 점검 지적(fixDue, ncId) ·
 * eval 연간 준수 평가(year, result: ok 준수 · lacking 미흡 · na 대상 아님, ncId)
 */
export const legalEvent = pgTable(
  "legal_event",
  {
    id: id(),
    itemId: uuid("item_id")
      .notNull()
      .references(() => legalItem.id),
    kind: text("kind").notNull(),
    year: integer("year"),
    result: text("result"),
    changed: boolean("changed"),
    fixDue: text("fix_due"),
    ncId: uuid("nc_id"),
    detail: text("detail"),
    by: uuid("by").references(() => appUser.id),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("legal_event_item_idx").on(t.itemId, t.at)],
);

/** 연간 준수 평가 확정(F-Q-07): 대표가 한 해 평가를 확정한다 */
export const legalEvalYear = pgTable("legal_eval_year", {
  year: integer("year").primaryKey(),
  confirmedBy: uuid("confirmed_by").references(() => appUser.id),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  summary: text("summary"),
});

/**
 * 리스크·기회 대장(F-Q-03, 총람 Q.4). kind: risk 리스크 · opp 기회. score = likelihood(1~3) × impact(1~3).
 * 점수가 정책값(기본 6) 이상이면 대표에게 알리고 대응 계획(plan·ownerId·due)을 정한다.
 * status: open 관리 중 · acting 대응 중 · done 대응 끝(잔여 점수 다시 매김) · closed 해당 없음(종료)
 */
export const riskItem = pgTable(
  "risk_item",
  {
    id: id(),
    docNo: text("doc_no").notNull(),
    kind: text("kind").notNull().default("risk"),
    content: text("content").notNull(),
    chapter: text("chapter"),
    likelihood: integer("likelihood").notNull(),
    impact: integer("impact").notNull(),
    score: integer("score").notNull(),
    control: text("control"),
    plan: text("plan"),
    ownerId: uuid("owner_id").references(() => appUser.id),
    due: text("due"),
    result: text("result"),
    status: text("status").notNull().default("open"),
    source: text("source"),
    createdBy: uuid("created_by").references(() => appUser.id),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("risk_item_no_uq").on(t.docNo),
    index("risk_item_status_idx").on(t.status),
  ],
);

/** 리스크 이력: create · edit(점수 변화) · plan 대응 계획 · done 대응 끝 · close · reopen */
export const riskEvent = pgTable(
  "risk_event",
  {
    id: id(),
    riskId: uuid("risk_id")
      .notNull()
      .references(() => riskItem.id),
    kind: text("kind").notNull(),
    detail: text("detail"),
    by: uuid("by").references(() => appUser.id),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("risk_event_idx").on(t.riskId, t.at)],
);

/** 분기 대표 검토(Q.4): quarter "2026-Q4" */
export const riskReview = pgTable("risk_review", {
  quarter: text("quarter").primaryKey(),
  by: uuid("by").references(() => appUser.id),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  summary: text("summary"),
  note: text("note"),
});

/**
 * 내부심사 계획·보고서(F-Q-08, 총람 Q.7). 연 1회(11월) 모든 장을 심사한다. 심사자는 자기 업무를 심사하지 않는다(auditeeIds에 없어야 함).
 * 외부 심사원이면 auditorId 없이 externalAuditor 이름을 적고 품질 담당이 대신 기록한다.
 * status: planned 계획 · reported 보고(대표 승인 대기) · approved 승인
 */
export const internalAudit = pgTable(
  "internal_audit",
  {
    id: id(),
    docNo: text("doc_no").notNull(),
    year: integer("year").notNull(),
    plannedOn: text("planned_on").notNull(),
    scope: jsonb("scope").$type<string[]>().notNull().default([]),
    auditorId: uuid("auditor_id").references(() => appUser.id),
    externalAuditor: text("external_auditor"),
    auditeeIds: jsonb("auditee_ids").$type<string[]>().notNull().default([]),
    criteria: text("criteria"),
    status: text("status").notNull().default("planned"),
    summary: text("summary"),
    reportedAt: timestamp("reported_at", { withTimezone: true }),
    approvedBy: uuid("approved_by").references(() => appUser.id),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => appUser.id),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("internal_audit_no_uq").on(t.docNo),
    index("internal_audit_year_idx").on(t.year),
  ],
);

/** 심사 발견 사항: verdict ok 적합 · improve 개선 권고 · nc 부적합(F-Q-10 자동 발행) */
export const auditFinding = pgTable(
  "audit_finding",
  {
    id: id(),
    auditId: uuid("audit_id")
      .notNull()
      .references(() => internalAudit.id),
    chapter: text("chapter").notNull(),
    target: text("target"),
    evidence: text("evidence").notNull(),
    finding: text("finding"),
    verdict: text("verdict").notNull(),
    ncId: uuid("nc_id"),
    by: uuid("by").references(() => appUser.id),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_finding_idx").on(t.auditId)],
);

/**
 * 조직 상황·이해관계자 검토표(F-Q-01, 총람 Q.1). 해마다 12월 대표가 쓴다. 지난해 표를 불러와 바뀐 칸만 고친다.
 * issues: 구분(area)·이슈·영향·대응(리스크 대장 등록이면 riskId). parties: 이해관계자·요구·확인 방법·반영할 표준
 */
export const contextReview = pgTable("context_review", {
  year: integer("year").primaryKey(),
  issues: jsonb("issues")
    .$type<
      {
        area: string;
        issue: string;
        impact: string;
        action: string;
        riskId?: string | null;
        riskNo?: string | null;
      }[]
    >()
    .notNull()
    .default([]),
  parties: jsonb("parties")
    .$type<{ party: string; needs: string; check: string; std: string }[]>()
    .notNull()
    .default([]),
  note: text("note"),
  /** draft 작성 중 · confirmed 승인(대표) */
  status: text("status").notNull().default("draft"),
  importedFrom: integer("imported_from"),
  savedBy: uuid("saved_by").references(() => appUser.id),
  savedAt: timestamp("saved_at", { withTimezone: true }).notNull().defaultNow(),
  confirmedBy: uuid("confirmed_by").references(() => appUser.id),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
});

/** 품질목표(F-Q-02, Q.3) 연도별 목표값. 없으면 표준서 초기 목표 */
export const qualityGoal = pgTable(
  "quality_goal",
  {
    id: id(),
    year: integer("year").notNull(),
    key: text("key").notNull(),
    target: real("target").notNull(),
    reason: text("reason"),
    setBy: uuid("set_by").references(() => appUser.id),
    setAt: timestamp("set_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("quality_goal_uq").on(t.year, t.key)],
);

/** 품질목표 월 집계(매월 5일 앞달분을 고정). value 는 지표 단위(%, 점, 시간, 건), 대상이 없으면 null */
export const goalMonth = pgTable(
  "goal_month",
  {
    id: id(),
    ym: text("ym").notNull(),
    key: text("key").notNull(),
    value: real("value"),
    numer: real("numer"),
    denom: real("denom"),
    target: real("target").notNull(),
    ok: boolean("ok"),
    ncId: uuid("nc_id"),
    computedAt: timestamp("computed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("goal_month_uq").on(t.ym, t.key)],
);

/** 품질목표 분기 검토 서명(대표) */
export const goalQuarterSign = pgTable(
  "goal_quarter_sign",
  {
    id: id(),
    year: integer("year").notNull(),
    quarter: integer("quarter").notNull(),
    note: text("note"),
    by: uuid("by").references(() => appUser.id),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("goal_quarter_uq").on(t.year, t.quarter)],
);

/**
 * 문서 목록(F-Q-04, Q.5). kind: std 표준서 · wi 작업 지침서 · form 양식 · external 외부 문서.
 * 개정 요청서(F-Q-05)가 승인되면 판이 오르고 이전 판은 history 에 '폐기'로 남는다. status: current 현행 · retired 폐지
 */
export const docRegister = pgTable(
  "doc_register",
  {
    id: id(),
    no: text("no").notNull(),
    name: text("name").notNull(),
    kind: text("kind").notNull(),
    rev: text("rev").notNull(),
    effectiveOn: text("effective_on"),
    owner: text("owner"),
    location: text("location"),
    source: text("source"),
    receivedOn: text("received_on"),
    note: text("note"),
    status: text("status").notNull().default("current"),
    history: jsonb("history")
      .$type<
        {
          rev: string;
          effectiveOn: string | null;
          until: string;
          ref: string | null;
        }[]
      >()
      .notNull()
      .default([]),
    updatedBy: uuid("updated_by").references(() => appUser.id),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("doc_register_no_uq").on(t.no)],
);

/**
 * 경영검토서(F-Q-09, Q.8). 해마다 12월 대표. inputs: 앱이 모은 입력 자료(확정 때 고정), comments: 항목별 검토 의견.
 * actions: 개선 과제(담당·기한, 지시하면 instructionId). status: draft · confirmed
 */
export const mgmtReview = pgTable("mgmt_review", {
  year: integer("year").primaryKey(),
  heldOn: text("held_on"),
  attendees: text("attendees"),
  inputs: jsonb("inputs")
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  comments: jsonb("comments")
    .$type<Record<string, string>>()
    .notNull()
    .default({}),
  nextGoals: text("next_goals"),
  resources: text("resources"),
  actions: jsonb("actions")
    .$type<
      {
        task: string;
        assigneeId: string | null;
        dueOn: string | null;
        instructionId?: string | null;
        instructionNo?: string | null;
      }[]
    >()
    .notNull()
    .default([]),
  status: text("status").notNull().default("draft"),
  savedBy: uuid("saved_by").references(() => appUser.id),
  savedAt: timestamp("saved_at", { withTimezone: true }).notNull().defaultNow(),
  confirmedBy: uuid("confirmed_by").references(() => appUser.id),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
});
