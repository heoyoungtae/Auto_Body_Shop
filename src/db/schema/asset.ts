// 비품·설비 공통(대표 지시 2026-11-12): 관리자 정/부, 지출결의 연결, 소유 구분·사용계약, 감가상각, 수리 이력
import { boolean, index, integer, jsonb, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { appUser, createdAt, id } from "./platform";

/** 빌려 쓰는 장비의 사용계약(소유 구분이 own 이 아닐 때) */
export type AssetContract = {
  /** 빌려준 곳(업체·사람) */
  party: string;
  phone?: string;
  start: string;
  end?: string;
  /** 월 사용료(부가세 별도, 무상이면 0) */
  feeWon: number;
  /** 사용료 내는 날(매달 며칠) */
  payDay?: number;
  /** 수선 책임: owner 빌려준 쪽 · us 우리 */
  repairBy: "owner" | "us";
  /** 무상 대여 조건(예: 연간 도료 구매 약정) */
  terms?: string;
  /** 계약서 파일(보관 폴더 상대 경로) */
  file?: string;
  /** 반납 확인 */
  returnedOn?: string;
  returnNote?: string;
};

/** 비품·설비 공통 칸. fixture·equipment 표에 같이 붙인다. 관리자(정)은 비품 manager_id, 설비는 기존 owner_id(설비 담당) */
export const assetColumns = () => ({
  /** 관리자(부). 정이 휴가·결근이면 알림은 부에게 */
  subManagerId: uuid("sub_manager_id").references(() => appUser.id),
  /** 이 자산을 산 지출 결의(F-12-01). 결의에서 등록하면 채워진다 */
  expenseId: uuid("expense_id"),
  /** own 자사 소유 · lease 유상 임차·렌탈·리스 · loan 무상 대여 · customer 고객·협력업체 물건 */
  ownership: text("ownership").notNull().default("own"),
  contract: jsonb("contract").$type<AssetContract>(),
  /** 마지막으로 사용료 결의를 낸 달(YYYY-MM) */
  feeBilledYm: text("fee_billed_ym"),
  /** 감가상각: sl 정액법 · db 정률법 · expense 산 날 비용 처리 · none 상각 안 함(빌린 것·소액) */
  depMethod: text("dep_method").notNull().default("none"),
  usefulYears: integer("useful_years"),
  /** 상각 시작(사용 시작일) */
  depStartOn: text("dep_start_on"),
  /** 처분 금액(공급가, 매각이면 받은 돈) */
  disposeWon: integer("dispose_won"),
});

/**
 * 정비·수리 이력(비품·설비 공통). 지출 결의(설비 수리·유지)에서 대상을 고르면 저절로 생긴다.
 * capital: 자본적 지출(내용연수 연장·가치 증가) — 장부가에 더해 남은 기간 동안 상각한다
 */
export const assetRepair = pgTable(
  "asset_repair",
  {
    id: id(),
    assetKind: text("asset_kind").notNull(),
    assetId: uuid("asset_id").notNull(),
    on: text("on").notNull(),
    what: text("what").notNull(),
    vendor: text("vendor"),
    costWon: integer("cost_won").notNull().default(0),
    capital: boolean("capital").notNull().default(false),
    files: jsonb("files").$type<{ path: string; name: string; at: string; by: string }[]>().notNull().default([]),
    expenseId: uuid("expense_id"),
    /** 설비 고장 기록(F-08-04)에서 왔으면 그 기록 */
    failureId: uuid("failure_id"),
    by: uuid("by").references(() => appUser.id),
    createdAt: createdAt(),
  },
  (t) => [index("asset_repair_asset_idx").on(t.assetKind, t.assetId)],
);

