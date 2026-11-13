// 구매·자재 묶음 목록 정의(조회줄): 발주서·재고 품목·협력업체·외주·비품
import { can } from "@/modules/auth/permissions";
import { listFixtures, type FixtureFilter } from "@/modules/purchase/fixture";
import { listOrders, type OrderFilter } from "@/modules/purchase/order";
import { listOutsource, type OsFilter } from "@/modules/purchase/outsource";
import { FX_CATEGORIES, FX_STATUS, OS_STATUS, OUT_TYPES, PO_KINDS, PO_STATUS, STOCK_KINDS, SUPPLIER_KINDS, SUPPLIER_STATUS } from "@/modules/purchase/rules";
import { listStock, type StockFilter } from "@/modules/purchase/stock";
import { listSuppliers, type SupplierFilter } from "@/modules/purchase/supplier";
import type { ListDef } from "../core";
import { isoOf } from "../core";
import { MAX, pick } from "./repair";

const L = <T extends Record<string, string>>(m: T, k: unknown) => (k == null ? "" : (m[k as keyof T] ?? String(k)));

type Po = Awaited<ReturnType<typeof listOrders>>[number];
export const PO_TABS = [
  { v: "open", label: "진행 중" },
  { v: "review", label: "작성·승인" },
  { v: "receiving", label: "입고 기다림" },
  { v: "done", label: "끝·취소" },
  { v: "all", label: "전체" },
] as const;
export const ordersList: ListDef<Po> = {
  key: "purchases",
  title: "발주서",
  href: "/purchases",
  allowed: () => true,
  load: (db, _u, q) => listOrders(db, pick(q.f, PO_TABS.map((t) => t.v) as OrderFilter[], "open"), MAX),
  tabs: { param: "f", options: PO_TABS },
  dates: [
    { key: "created", label: "작성일", get: (r) => r.o.createdAt },
    { key: "sent", label: "발주일(보낸 날)", get: (r) => r.o.sentAt },
    { key: "received", label: "입고일", get: (r) => r.o.receivedAt },
    { key: "due", label: "납기일", get: (r) => r.o.dueOn },
  ],
  text: (r) => [r.o.docNo, r.supplierName, r.roDocNo, r.plateNo, r.o.invoiceNo, r.o.note],
  cols: [
    { label: "발주 번호", get: (r) => r.o.docNo },
    { label: "종류", get: (r) => L(PO_KINDS, r.o.kind) },
    { label: "업체", get: (r) => r.supplierName },
    { label: "수리 건", get: (r) => r.roDocNo },
    { label: "차량번호", get: (r) => r.plateNo },
    { label: "작성일", get: (r) => isoOf(r.o.createdAt) },
    { label: "보낸 날", get: (r) => isoOf(r.o.sentAt) },
    { label: "납기일", get: (r) => r.o.dueOn },
    { label: "입고일", get: (r) => isoOf(r.o.receivedAt) },
    { label: "공급가액", get: (r) => r.o.supplyWon, sum: true, unit: "원" },
    { label: "합계", get: (r) => r.o.totalWon, sum: true, unit: "원" },
    { label: "상태", get: (r) => L(PO_STATUS, r.o.status) },
    { label: "계산서 번호", get: (r) => r.o.invoiceNo },
  ],
};

type Stock = Awaited<ReturnType<typeof listStock>>[number];
export const STOCK_TABS = [
  { v: "all", label: "전체" },
  { v: "low", label: "안전 재고 미달" },
  { v: "expiry", label: "유효기간 임박·지남" },
  { v: "paint", label: "도료" },
  { v: "consumable", label: "소모품" },
  { v: "part", label: "상비 부품" },
  { v: "docs", label: "문서 기한" },
  { v: "stopped", label: "사용 중지" },
] as const;
export const stockList: ListDef<Stock> = {
  key: "stock",
  title: "재고 품목",
  href: "/stock",
  allowed: () => true,
  load: (db, _u, q) => listStock(db, pick(q.f, STOCK_TABS.map((t) => t.v) as StockFilter[], "all")),
  tabs: { param: "f", options: STOCK_TABS },
  dates: [
    { key: "created", label: "등록일", get: (r) => r.createdAt },
    { key: "stopped", label: "사용 중지일", get: (r) => r.stoppedAt },
  ],
  text: (r) => [r.name, r.spec, r.location, r.supplierName, L(STOCK_KINDS, r.kind)],
  cols: [
    { label: "품목", get: (r) => r.name },
    { label: "구분", get: (r) => L(STOCK_KINDS, r.kind) },
    { label: "규격", get: (r) => r.spec },
    { label: "위치", get: (r) => r.location },
    { label: "수량", get: (r) => r.qty },
    { label: "단위", get: (r) => r.unit },
    { label: "안전 재고", get: (r) => r.safetyQty },
    { label: "최근 매입 단가", get: (r) => r.unitWon },
    { label: "평균 단가", get: (r) => (r.qty > 0 ? Math.round(r.valueWon / r.qty) : null) },
    { label: "재고 금액", get: (r) => r.valueWon, sum: true, unit: "원" },
    { label: "업체", get: (r) => r.supplierName },
    { label: "사용 중지", get: (r) => (r.active ? "" : "중지") },
  ],
};

type Sup = Awaited<ReturnType<typeof listSuppliers>>[number];
export const SUP_TABS = [
  { v: "registered", label: "등록 업체" },
  { v: "candidate", label: "후보·승인 대기" },
  { v: "stopped", label: "중지·등록 안 함" },
  { v: "all", label: "전체" },
] as const;
export const suppliersList: ListDef<Sup> = {
  key: "suppliers",
  title: "협력업체 대장",
  href: "/suppliers",
  allowed: () => true,
  load: (db, _u, q) => listSuppliers(db, pick(q.f, SUP_TABS.map((t) => t.v) as SupplierFilter[], "registered")),
  tabs: { param: "f", options: SUP_TABS },
  dates: [
    { key: "created", label: "등록일", get: (r) => r.createdAt },
    { key: "approved", label: "승인일", get: (r) => r.approvedAt },
  ],
  text: (r) => [r.name, r.bizNo, r.contactName, r.phone, r.items, r.kinds.map((k) => L(SUPPLIER_KINDS, k)).join(" ")],
  cols: [
    { label: "업체", get: (r) => r.name },
    { label: "사업자번호", get: (r) => r.bizNo },
    { label: "분야", get: (r) => r.kinds.map((k) => L(SUPPLIER_KINDS, k)).join("·") },
    { label: "담당자", get: (r) => r.contactName },
    { label: "전화", get: (r) => r.phone },
    { label: "상태", get: (r) => L(SUPPLIER_STATUS, r.status) },
    { label: "평가 점수", get: (r) => r.score },
    { label: "등록일", get: (r) => isoOf(r.createdAt) },
    { label: "승인일", get: (r) => isoOf(r.approvedAt) },
  ],
};

type Os = Awaited<ReturnType<typeof listOutsource>>[number];
export const OS_TABS = [
  { v: "open", label: "진행 중" },
  { v: "done", label: "끝·취소" },
  { v: "all", label: "전체" },
] as const;
export const outsourceList: ListDef<Os> = {
  key: "outsource",
  title: "외주 의뢰서",
  href: "/outsource",
  allowed: () => true,
  load: (db, _u, q) => listOutsource(db, pick(q.f, OS_TABS.map((t) => t.v) as OsFilter[], "open"), MAX),
  tabs: { param: "f", options: OS_TABS },
  dates: [
    { key: "created", label: "작성일", get: (r) => r.j.createdAt },
    { key: "out", label: "보낸 날", get: (r) => r.j.outAt },
    { key: "accepted", label: "인수일", get: (r) => r.j.acceptedAt },
    { key: "due", label: "완료 예정일", get: (r) => r.j.dueOn },
  ],
  text: (r) => [r.j.docNo, r.supplierName, r.roDocNo, r.plateNo, r.j.scope],
  cols: [
    { label: "의뢰 번호", get: (r) => r.j.docNo },
    { label: "업체", get: (r) => r.supplierName },
    { label: "수리 건", get: (r) => r.roDocNo },
    { label: "차량번호", get: (r) => r.plateNo },
    { label: "작업", get: (r) => L(OUT_TYPES, r.j.workType) },
    { label: "범위", get: (r) => r.j.scope },
    { label: "작성일", get: (r) => isoOf(r.j.createdAt) },
    { label: "완료 예정일", get: (r) => r.j.dueOn },
    { label: "인수일", get: (r) => isoOf(r.j.acceptedAt) },
    { label: "금액", get: (r) => r.j.amountWon, sum: true, unit: "원" },
    { label: "상태", get: (r) => L(OS_STATUS, r.j.status) },
  ],
};

type Fx = Awaited<ReturnType<typeof listFixtures>>[number];
export const FX_TABS = [
  { v: "active", label: "사용 중 전체" },
  { v: "mine", label: "내 지급품" },
  { v: "asset", label: "자산 비품" },
  { v: "problem", label: "확인할 것" },
  { v: "disposed", label: "처분" },
  { v: "all", label: "전체" },
] as const;
export const fixturesList: ListDef<Fx> = {
  key: "fixtures",
  title: "비품 대장",
  href: "/fixtures",
  allowed: () => true,
  load: (db, u, q) => listFixtures(db, u, can(u, "fixture.manage") ? pick(q.f, FX_TABS.map((t) => t.v) as FixtureFilter[], "active") : "mine", q.holder),
  tabs: { param: "f", options: FX_TABS },
  keep: ["holder"],
  dates: [
    { key: "bought", label: "구입일", get: (r) => r.f.purchasedOn },
    { key: "disposed", label: "처분일", get: (r) => r.f.disposedOn },
    { key: "created", label: "등록일", get: (r) => r.f.createdAt },
  ],
  text: (r) => [r.f.no, r.f.name, r.f.spec, r.f.location, r.holderName, L(FX_CATEGORIES, r.f.category)],
  cols: [
    { label: "번호", get: (r) => r.f.no },
    { label: "이름", get: (r) => r.f.name },
    { label: "분류", get: (r) => L(FX_CATEGORIES, r.f.category) },
    { label: "규격", get: (r) => r.f.spec },
    { label: "위치", get: (r) => r.f.location },
    { label: "사용자", get: (r) => r.holderName },
    { label: "구입일", get: (r) => r.f.purchasedOn },
    { label: "구입가", get: (r) => r.f.priceWon, sum: true, unit: "원" },
    { label: "자산", get: (r) => (r.f.asset ? "자산" : "") },
    { label: "상태", get: (r) => L(FX_STATUS, r.f.status) },
    { label: "처분일", get: (r) => r.f.disposedOn },
  ],
};
