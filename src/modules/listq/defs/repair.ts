// 수리·고객 묶음 목록 정의(조회줄)
import { listConsultations, type ConsultFilter } from "@/modules/customer/service";
import { CHANNEL_LABEL, INSURANCE_LABEL, RESULT_LABEL } from "@/modules/customer/rules";
import type { ListDef } from "../core";
import { isoOf } from "../core";

export const MAX = 5000;
export const pick = <T extends string>(v: string | undefined, ok: readonly T[], dflt: T): T => (ok.includes(v as T) ? (v as T) : dflt);

type Consult = Awaited<ReturnType<typeof listConsultations>>[number];
export const CONSULT_TABS = [
  { v: "active", label: "진행 중" },
  { v: "due", label: "오늘 챙길 것" },
  { v: "reservations", label: "입고 예약" },
  { v: "all", label: "전체" },
] as const;
export const consultsList: ListDef<Consult> = {
  key: "consults",
  title: "상담·예약",
  href: "/consults",
  allowed: () => true,
  load: (db, _u, q) =>
    listConsultations(
      db,
      pick(q.f, CONSULT_TABS.map((t) => t.v) as ConsultFilter[], q.d ? "reservations" : "active"),
      new Date(),
      q.s,
      q.d,
      MAX,
    ),
  tabs: { param: "f", options: CONSULT_TABS },
  searchHint: "이름·전화 끝 4자리·차량번호·CS 번호",
  keep: ["d"],
  dates: [
    { key: "at", label: "상담일", get: (r) => r.at },
    { key: "reserved", label: "입고 예약일", get: (r) => r.reservedAt },
    { key: "recontact", label: "재연락일", get: (r) => r.recontactOn },
  ],
  cols: [
    { label: "번호", get: (r) => r.docNo },
    { label: "상담일", get: (r) => isoOf(r.at) },
    { label: "경로", get: (r) => CHANNEL_LABEL[r.channel] },
    { label: "고객", get: (r) => r.customerName },
    { label: "연락처", get: (r) => r.phone },
    { label: "차량번호", get: (r) => r.plateNo },
    { label: "차종", get: (r) => r.model },
    { label: "손상", get: (r) => [r.damageParts, r.damageTypes.join("·")].filter(Boolean).join(" ") },
    { label: "보험", get: (r) => INSURANCE_LABEL[r.insurance] },
    { label: "결과", get: (r) => RESULT_LABEL[r.result] },
    { label: "입고 예약", get: (r) => isoOf(r.reservedAt) },
    { label: "재연락일", get: (r) => r.recontactOn },
    { label: "상담자", get: (r) => r.advisor },
  ],
};

// ── 접수·입고(수리 건) ──
import { listRepairs } from "@/modules/repair/service";
import { RO_STATUS_LABEL } from "@/modules/repair/rules";
type Ro = Awaited<ReturnType<typeof listRepairs>>[number];
export const REPAIR_TABS = [
  { v: "open", label: "진행 중" },
  { v: "qc", label: "검사·출고 대기" },
  { v: "all", label: "출고·취소 포함" },
] as const;
export const repairsList: ListDef<Ro> = {
  key: "repairs",
  title: "수리 건",
  href: "/repairs",
  allowed: () => true,
  load: (db, _u, q) => listRepairs(db, pick(q.f, ["open", "qc", "all"] as const, "open"), MAX),
  tabs: { param: "f", options: REPAIR_TABS },
  dates: [
    { key: "in", label: "입고일", get: (r) => r.inAt },
    { key: "out", label: "출고일", get: (r) => r.outAt },
  ],
  text: (r) => [r.docNo, r.customerName, r.plateNo, r.model],
  cols: [
    { label: "번호", get: (r) => r.docNo },
    { label: "입고일", get: (r) => isoOf(r.inAt) },
    { label: "출고일", get: (r) => isoOf(r.outAt) },
    { label: "고객", get: (r) => r.customerName },
    { label: "차량번호", get: (r) => r.plateNo },
    { label: "차종", get: (r) => r.model },
    { label: "보험", get: (r) => INSURANCE_LABEL[r.insurance as keyof typeof INSURANCE_LABEL] },
    { label: "상태", get: (r) => RO_STATUS_LABEL[r.status] },
    { label: "사진", get: (r) => r.photos, sum: true, unit: "개" },
    { label: "손상", get: (r) => r.damages, sum: true, unit: "개" },
    { label: "고객 서명", get: (r) => isoOf(r.signedAt) },
  ],
};

// ── 견적·고객 승인 ──
import { listAllEstimates } from "@/modules/repair/estimate-approval";
import { ESTIMATE_KIND, ESTIMATE_STATUS_LABEL } from "@/modules/repair/estimate-rules";
type Est = Awaited<ReturnType<typeof listAllEstimates>>[number];
export const estimatesList: ListDef<Est> = {
  key: "estimates",
  title: "견적",
  href: "/estimates",
  allowed: () => true,
  load: (db, _u, q) => listAllEstimates(db, pick(q.f, ["open", "answered", "all"] as const, "open"), MAX),
  tabs: { param: "f", options: [{ v: "open", label: "진행 중(작성~승인 대기)" }, { v: "answered", label: "고객 답 받음" }, { v: "all", label: "전체" }] },
  dates: [
    { key: "created", label: "작성일", get: (r) => r.createdAt },
    { key: "issued", label: "발급일", get: (r) => r.issuedOn },
    { key: "approved", label: "고객 답 받은 날", get: (r) => r.approvedAt },
  ],
  text: (r) => [r.docNo, r.roNo, r.customerName, r.plateNo, r.model],
  cols: [
    { label: "견적 번호", get: (r) => r.docNo },
    { label: "차수", get: (r) => r.rev },
    { label: "종류", get: (r) => ESTIMATE_KIND[r.kind as keyof typeof ESTIMATE_KIND] },
    { label: "수리 건", get: (r) => r.roNo },
    { label: "작성일", get: (r) => isoOf(r.createdAt) },
    { label: "고객", get: (r) => r.customerName },
    { label: "차량번호", get: (r) => r.plateNo },
    { label: "차종", get: (r) => r.model },
    { label: "상태", get: (r) => ESTIMATE_STATUS_LABEL[r.status as keyof typeof ESTIMATE_STATUS_LABEL] },
    { label: "총액", get: (r) => r.total, sum: true, unit: "원" },
    { label: "발급일", get: (r) => r.issuedOn },
    { label: "유효기간", get: (r) => r.validUntil },
    { label: "고객 답", get: (r) => isoOf(r.approvedAt) },
  ],
};

// ── 보험 청구 ──
import { listClaims } from "@/modules/repair/claims";
import { CLAIM_STATUS_LABEL, COVERAGE_LABEL } from "@/modules/repair/claim-rules";
type Claim = Awaited<ReturnType<typeof listClaims>>[number];
export const claimsList: ListDef<Claim> = {
  key: "claims",
  title: "보험 청구",
  href: "/claims",
  allowed: () => true,
  load: (db, _u, q) => listClaims(db, pick(q.f, ["open", "all"] as const, "open")),
  tabs: { param: "f", options: [{ v: "open", label: "진행 중" }, { v: "all", label: "전체(입금 끝난 것 포함)" }] },
  dates: [
    { key: "in", label: "입고일", get: (r) => r.ro.inAt },
    { key: "claimed", label: "청구일", get: (r) => r.claim?.claimedAt },
    { key: "paid", label: "입금일", get: (r) => r.claim?.paidOn },
  ],
  text: (r) => [r.ro.docNo, r.customerName, r.plateNo, r.claim?.insurer ?? r.ro.insurer, r.claim?.claimNo ?? r.ro.claimNo],
  cols: [
    { label: "수리 건", get: (r) => r.ro.docNo },
    { label: "입고일", get: (r) => isoOf(r.ro.inAt) },
    { label: "고객", get: (r) => r.customerName },
    { label: "차량번호", get: (r) => r.plateNo },
    { label: "보험사", get: (r) => r.claim?.insurer ?? r.ro.insurer },
    { label: "접수번호", get: (r) => r.claim?.claimNo ?? r.ro.claimNo },
    { label: "담보", get: (r) => COVERAGE_LABEL[(r.claim?.coverage ?? r.ro.insurance) as keyof typeof COVERAGE_LABEL] },
    { label: "청구 단계", get: (r) => CLAIM_STATUS_LABEL[(r.claim?.status ?? "none") as keyof typeof CLAIM_STATUS_LABEL] },
    { label: "청구일", get: (r) => isoOf(r.claim?.claimedAt) },
    { label: "청구액", get: (r) => r.claim?.claimedWon ?? null, sum: true, unit: "원" },
    { label: "입금일", get: (r) => r.claim?.paidOn },
    { label: "입금액", get: (r) => r.claim?.paidWon ?? null, sum: true, unit: "원" },
    { label: "감액", get: (r) => r.claim?.cutWon ?? null, sum: true, unit: "원" },
  ],
};

// ── 고객·차량 ──
import { recentCustomers, searchCustomers } from "@/modules/customer/service";
type Cust = Awaited<ReturnType<typeof recentCustomers>>[number];
export const customersList: ListDef<Cust> = {
  key: "customers",
  title: "고객·차량",
  href: "/customers",
  allowed: () => true,
  load: (db, _u, q) => (q.s?.trim() ? searchCustomers(db, q.s, 500) : recentCustomers(db, 2000)),
  searchHint: "전화번호, 끝 4자리, 차량번호, 이름",
  dates: [
    { key: "last", label: "마지막 상담일", get: (r) => r.last?.at },
    { key: "created", label: "등록일", get: (r) => r.createdAt },
  ],
  cols: [
    { label: "고객", get: (r) => r.name },
    { label: "연락처", get: (r) => r.phone },
    { label: "차량", get: (r) => r.vehicles.map((v) => `${v.plateNo} ${v.model ?? ""}`.trim()).join(", ") },
    { label: "등록일", get: (r) => isoOf(r.createdAt) },
    { label: "마지막 상담", get: (r) => (r.last ? `${r.last.docNo} ${isoOf(r.last.at)} ${RESULT_LABEL[r.last.result]}` : "") },
    { label: "필수 동의", get: (r) => (r.consent.required ? "있음" : "없음") },
    { label: "광고 동의", get: (r) => (r.consent.marketing ? "있음" : "") },
  ],
};

// ── 불만 처리부 ──
import { listComplaints } from "@/modules/cs/service";
import { CATEGORIES, CHANNELS, CP_STATUS, VERDICTS } from "@/modules/cs/rules";
type Cp = Awaited<ReturnType<typeof listComplaints>>[number];
export const complaintsList: ListDef<Cp> = {
  key: "complaints",
  title: "불만 처리부",
  href: "/complaints",
  allowed: () => true,
  load: (db, _u, q) => listComplaints(db, pick(q.f, ["open", "warranty", "closed", "all"] as const, "open"), MAX),
  tabs: { param: "f", options: [{ v: "open", label: "진행 중" }, { v: "warranty", label: "보증 수리(해당·일부)" }, { v: "closed", label: "종결" }, { v: "all", label: "전체" }] },
  keep: ["ym"],
  dates: [
    { key: "received", label: "접수일", get: (r) => r.c.receivedAt },
    { key: "closed", label: "종결일", get: (r) => r.c.closedAt },
  ],
  text: (r) => [r.c.docNo, r.plateNo, r.customerName, r.c.who, r.c.content],
  cols: [
    { label: "번호", get: (r) => r.c.docNo },
    { label: "접수일", get: (r) => isoOf(r.c.receivedAt) },
    { label: "고객", get: (r) => r.customerName ?? r.c.who },
    { label: "차량번호", get: (r) => r.plateNo },
    { label: "경로", get: (r) => CHANNELS[r.c.channel as keyof typeof CHANNELS] },
    { label: "유형", get: (r) => CATEGORIES[r.c.category as keyof typeof CATEGORIES] },
    { label: "내용", get: (r) => r.c.content },
    { label: "판정", get: (r) => (r.c.verdict ? VERDICTS[r.c.verdict as keyof typeof VERDICTS] : "") },
    { label: "보상액", get: (r) => r.c.compWon, sum: true, unit: "원" },
    { label: "상태", get: (r) => CP_STATUS[r.c.status as keyof typeof CP_STATUS] },
    { label: "종결일", get: (r) => isoOf(r.c.closedAt) },
  ],
};
