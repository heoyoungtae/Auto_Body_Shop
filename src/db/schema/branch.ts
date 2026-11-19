// 본점·지점·작업장 — 대표 결정 2026-11-19 '본점·지점 구분 방식 제안' 추천안.
// 앱·서버는 하나이고, 장소에 묶인 기록(수리 건·재고 이동·현금·출퇴근·설비·안전 등)에 지점 꼬리표(branch_id)를 붙인다.
// 고객·차량·협력업체·품목 목록·표준서·권한표는 회사 전체가 함께 쓰므로 지점 칸이 없다.
// 1단계(지금): 지점은 본점 하나뿐이고, 지점 칸은 모두 본점으로 자동으로 채워진다(화면에 지점 칸이 보이지 않음).
// 작업장은 지점 안의 현장 위치(판금동·도장동 등)로, 세금·전표 번호·회계와는 상관없다.
import { boolean, date, integer, jsonb, pgTable, primaryKey, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { appUser, createdAt, id } from "./platform";

/** 본점의 고정 id. 0056 마이그레이션이 이 id 로 본점 줄을 만들고, 모든 지점 칸의 기본값이 이 값이다 */
export const MAIN_BRANCH_ID = "00000000-0000-4000-8000-000000000001";

export const branch = pgTable(
  "branch",
  {
    id: id(),
    /** 화면에 보이는 이름(예: 본점, 서구점) */
    name: text("name").notNull(),
    /** 전표 번호에 붙는 짧은 코드(영문 1~2자). 본점은 빈 값 = 번호에 안 붙음 */
    code: text("code").notNull().default(""),
    isMain: boolean("is_main").notNull().default(false),
    /**
     * 지점의 사업장 정보(정비업 등록번호·주소·직인 등). 본점은 1단계에서 설정 › 사업장 정보(app_config 'shop')를 그대로 쓰고
     * 여기는 비워 둔다. 2단계(지점 개설)에 지점마다 채운다
     */
    bizNo: text("biz_no").notNull().default(""),
    /** 사업자단위과세일 때 종사업장 번호(4자리) */
    subBizNo: text("sub_biz_no").notNull().default(""),
    repairRegNo: text("repair_reg_no").notNull().default(""),
    zip: text("zip").notNull().default(""),
    address: text("address").notNull().default(""),
    addressDetail: text("address_detail").notNull().default(""),
    phone: text("phone").notNull().default(""),
    /** 지점 직인 그림(보관 폴더 상대 경로). 비어 있으면 본점 직인 */
    sealPath: text("seal_path").notNull().default(""),
    openedOn: date("opened_on"),
    closedOn: date("closed_on"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("branch_name_uq").on(t.name)],
);

/** 지점 꼬리표. 넣지 않으면 본점으로 채워진다(1단계는 모든 기록이 본점) */
export const branchId = () =>
  uuid("branch_id")
    .notNull()
    .default(MAIN_BRANCH_ID)
    .references(() => branch.id);

/** 작업장 종류. 공정 배정 때 이 종류로 알맞은 작업장을 먼저 채운다 */
export const WORKPLACE_KINDS = ["panel", "paint", "dent", "polish", "inspect", "storage", "waiting", "other"] as const;
export type WorkplaceKind = (typeof WORKPLACE_KINDS)[number];

/** 작업장: 같은 부지(같은 주소) 안의 작업 공간·보관 장소. 떨어진 보관 창고는 하치장 신고 뒤 '보관(storage)'으로 둔다 */
export const workplace = pgTable(
  "workplace",
  {
    id: id(),
    branchId: branchId(),
    name: text("name").notNull(),
    kind: text("kind", { enum: WORKPLACE_KINDS }).notNull(),
    /** 작업 자리(베이·리프트) 수. 보관·대기 장소는 0 */
    bays: integer("bays").notNull().default(0),
    /** 담당자(보통 공장장) */
    managerId: uuid("manager_id").references(() => appUser.id),
    /** 하치장 신고 등 메모 */
    note: text("note").notNull().default(""),
    sortOrder: integer("sort_order").notNull().default(0),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("workplace_branch_name_uq").on(t.branchId, t.name)],
);

/** 작업장 칸(비어 있으면 '정하지 않음'). 작업 공정·설비·5S 구역에 붙는다 */
export const workplaceId = () => uuid("workplace_id").references(() => workplace.id);

/**
 * 지점별 접근·역할(2단계). 줄이 있으면 그 지점에 들어갈 수 있고, roles 가 비어 있지 않으면 그 지점에서는 이 역할로 일한다
 * (예: 본점 기술자가 서구점에서는 공장장). 줄이 없으면 소속 지점에서 원래 역할(user_role)로 일한다.
 * 대표·회계는 줄 없이도 모든 지점에 들어간다.
 */
export const userBranch = pgTable(
  "user_branch",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => appUser.id),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branch.id),
    roles: jsonb("roles").$type<string[]>().notNull().default([]),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.branchId] })],
);

/** 사람마다 마지막으로 고른 지점(원격으로 어디서 접속해도 같음). 대표·회계는 null = 전체 보기 */
export const userBranchPref = pgTable("user_branch_pref", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => appUser.id),
  branchId: uuid("branch_id").references(() => branch.id),
  updatedAt: createdAt(),
});
