// 품질·안전·현장 묶음 목록 정의(조회줄): 부적합·법규·리스크·사고·화학물질·개선 제안
import { can } from "@/modules/auth/permissions";
import { listSuggestions, type SuggestionFilter } from "@/modules/equipment/suggestion";
import { SG_STATUS } from "@/modules/equipment/rules";
import { listLegal, type LegalFilter } from "@/modules/quality/legal";
import { APPLIES } from "@/modules/quality/legal-rules";
import { listNc } from "@/modules/quality/nc";
import { listRisks, type RiskFilter } from "@/modules/quality/risk";
import { RISK_KIND, RISK_STATUS } from "@/modules/quality/risk-rules";
import { NC_SOURCES, NC_STATUS } from "@/modules/quality/rules";
import { listChemicals } from "@/modules/safety/chemical";
import { listIncidents, type IncidentFilter } from "@/modules/safety/incident";
import { INC_KIND, INC_SEVERITY, INC_STATUS } from "@/modules/safety/rules";
import type { ListDef } from "../core";
import { isoOf } from "../core";
import { MAX, pick } from "./repair";

const L = <T extends Record<string, string>>(m: T, k: unknown) => (k == null ? "" : (m[k as keyof T] ?? String(k)));

// ── 부적합·시정 조치 ──
type Nc = Awaited<ReturnType<typeof listNc>>[number];
export const NC_TABS = [
  { v: "openish", label: "진행 중" },
  { v: "closed", label: "종결" },
  { v: "all", label: "전체" },
] as const;
export const ncList: ListDef<Nc> = {
  key: "nc",
  title: "부적합·시정 조치",
  href: "/nc",
  allowed: () => true,
  load: (db, _u, q) => listNc(db, { status: pick(q.st, ["openish", "closed", "all"] as const, "openish"), source: q.src, max: MAX }),
  tabs: { param: "st", options: NC_TABS },
  keep: ["src"],
  dates: [
    { key: "created", label: "발행일", get: (r) => r.n.createdAt },
    { key: "occurred", label: "발생일", get: (r) => r.n.occurredAt },
    { key: "due", label: "조치 기한", get: (r) => r.n.dueOn },
    { key: "closed", label: "종결일", get: (r) => r.n.closedAt },
  ],
  text: (r) => [r.n.docNo, r.n.refLabel, r.n.content, r.assigneeName, L(NC_SOURCES, r.n.source)],
  cols: [
    { label: "번호", get: (r) => r.n.docNo },
    { label: "출처", get: (r) => L(NC_SOURCES, r.n.source) },
    { label: "관련", get: (r) => r.n.refLabel },
    { label: "발행일", get: (r) => isoOf(r.n.createdAt) },
    { label: "내용", get: (r) => r.n.content },
    { label: "중대", get: (r) => (r.n.major ? "중대" : "") },
    { label: "담당", get: (r) => r.assigneeName },
    { label: "조치 기한", get: (r) => r.n.dueOn },
    { label: "상태", get: (r) => L(NC_STATUS, r.n.status) },
    { label: "종결일", get: (r) => isoOf(r.n.closedAt) },
  ],
};

// ── 법규 등록부 ──
type Legal = Awaited<ReturnType<typeof listLegal>>["list"][number];
export const LEGAL_TABS = [
  { v: "all", label: "전체" },
  { v: "check", label: "대상 확인 필요" },
  { v: "due", label: "기한 다가옴·지남" },
  { v: "permit", label: "인허가·신고증" },
  { v: "mine", label: "내 담당" },
] as const;
export const legalList: ListDef<Legal> = {
  key: "legal",
  title: "법규 등록부",
  href: "/legal",
  allowed: () => true,
  load: async (db, u, q) => (await listLegal(db, u, pick(q.f, LEGAL_TABS.map((t) => t.v) as LegalFilter[], "all"))).list,
  tabs: { param: "f", options: LEGAL_TABS },
  dates: [
    { key: "next", label: "다음 기한", get: (r) => r.nextDue },
    { key: "valid", label: "인허가 유효기간", get: (r) => r.validUntil },
    { key: "created", label: "등록일", get: (r) => r.createdAt },
  ],
  text: (r) => [r.area, r.lawName, r.clause, r.duty, r.authority, r.permitNo, r.stdRef],
  cols: [
    { label: "분야", get: (r) => r.area },
    { label: "법령", get: (r) => r.lawName },
    { label: "조항", get: (r) => r.clause },
    { label: "의무", get: (r) => r.duty },
    { label: "대상", get: (r) => L(APPLIES, r.applies) },
    { label: "주기", get: (r) => r.cycle },
    { label: "다음 기한", get: (r) => r.nextDue },
    { label: "기관", get: (r) => r.authority },
    { label: "인허가 번호", get: (r) => r.permitNo },
    { label: "유효기간", get: (r) => r.validUntil },
  ],
};

// ── 리스크·기회 ──
type Risk = Awaited<ReturnType<typeof listRisks>>["list"][number];
export const RISK_TABS = [
  { v: "live", label: "관리·대응 중" },
  { v: "high", label: "고점수" },
  { v: "mine", label: "내가 올림·담당" },
  { v: "done", label: "끝·종료" },
  { v: "all", label: "전체" },
] as const;
export const risksList: ListDef<Risk> = {
  key: "risks",
  title: "리스크·기회 등록부",
  href: "/risks",
  allowed: () => true,
  load: async (db, u, q) => (await listRisks(db, u, pick(q.f, RISK_TABS.map((t) => t.v) as RiskFilter[], "live"))).list,
  tabs: { param: "f", options: RISK_TABS },
  dates: [
    { key: "created", label: "등록일", get: (r) => r.createdAt },
    { key: "due", label: "대응 기한", get: (r) => r.due },
  ],
  text: (r) => [r.docNo, r.content, r.chapter, r.plan, r.control],
  cols: [
    { label: "번호", get: (r) => r.docNo },
    { label: "구분", get: (r) => L(RISK_KIND, r.kind) },
    { label: "내용", get: (r) => r.content },
    { label: "가능성", get: (r) => r.likelihood },
    { label: "영향", get: (r) => r.impact },
    { label: "점수", get: (r) => r.score },
    { label: "현재 관리", get: (r) => r.control },
    { label: "대응 계획", get: (r) => r.plan },
    { label: "기한", get: (r) => r.due },
    { label: "상태", get: (r) => L(RISK_STATUS, r.status) },
    { label: "등록일", get: (r) => isoOf(r.createdAt) },
  ],
};

// ── 사고·아차사고 ──
type Inc = Awaited<ReturnType<typeof listIncidents>>[number];
export const INC_TABS = [
  { v: "open", label: "처리 중" },
  { v: "accident", label: "사고" },
  { v: "near", label: "아차사고" },
  { v: "all", label: "전체" },
] as const;
export const incidentsList: ListDef<Inc> = {
  key: "incidents",
  title: "사고·아차사고",
  href: "/incidents",
  allowed: () => true,
  load: (db, _u, q) => listIncidents(db, pick(q.f, INC_TABS.map((t) => t.v) as IncidentFilter[], "open")),
  tabs: { param: "f", options: INC_TABS },
  dates: [
    { key: "occurred", label: "발생일", get: (r) => r.occurredAt },
    { key: "reported", label: "보고일", get: (r) => r.reportedAt },
  ],
  text: (r) => [r.docNo, r.place, r.process, r.description],
  cols: [
    { label: "번호", get: (r) => r.docNo },
    { label: "구분", get: (r) => L(INC_KIND, r.kind) },
    { label: "발생일", get: (r) => isoOf(r.occurredAt) },
    { label: "장소", get: (r) => r.place },
    { label: "공정", get: (r) => r.process },
    { label: "내용", get: (r) => r.description },
    { label: "정도", get: (r) => L(INC_SEVERITY, r.severity) },
    { label: "상태", get: (r) => L(INC_STATUS, r.status) },
  ],
};

// ── 화학물질 ──
type Chem = Awaited<ReturnType<typeof listChemicals>>[number];
export const CHEM_TABS = [
  { v: "all", label: "쓰는 물질" },
  { v: "nomsds", label: "MSDS 없음" },
  { v: "notrained", label: "교육 안 함" },
  { v: "flammable", label: "인화성" },
  { v: "retired", label: "사용 중지" },
] as const;
export const chemicalsList: ListDef<Chem> = {
  key: "chemicals",
  title: "화학물질",
  href: "/chemicals",
  allowed: () => true,
  load: async (db, _u, q) => {
    const f = pick(q.f, CHEM_TABS.map((t) => t.v), "all");
    return (await listChemicals(db, true)).filter((r) =>
      f === "retired" ? !r.active : r.active && (f === "all" || (f === "nomsds" && !r.msdsPath) || (f === "notrained" && !r.trainedOn) || (f === "flammable" && r.flammable)),
    );
  },
  tabs: { param: "f", options: CHEM_TABS },
  dates: [
    { key: "created", label: "등록일", get: (r) => r.createdAt },
    { key: "msds", label: "MSDS 개정일", get: (r) => r.msdsRevisedOn },
    { key: "trained", label: "교육일", get: (r) => r.trainedOn },
  ],
  text: (r) => [r.name, r.maker, r.category, r.location],
  cols: [
    { label: "물질", get: (r) => r.name },
    { label: "제조사", get: (r) => r.maker },
    { label: "분류", get: (r) => r.category },
    { label: "월 사용량", get: (r) => r.monthlyUse },
    { label: "보관 장소", get: (r) => r.location },
    { label: "인화성", get: (r) => (r.flammable ? "예" : "") },
    { label: "MSDS", get: (r) => (r.msdsPath ? "있음" : "없음") },
    { label: "MSDS 개정일", get: (r) => r.msdsRevisedOn },
    { label: "교육일", get: (r) => r.trainedOn },
    { label: "사용", get: (r) => (r.active ? "사용" : "중지") },
  ],
};

// ── 개선 제안 ──
type Sg = Awaited<ReturnType<typeof listSuggestions>>[number];
export const SG_TABS = [
  { v: "open", label: "검토 중·보류" },
  { v: "adopted", label: "채택(실행 전)" },
  { v: "closed", label: "끝난 것" },
  { v: "mine", label: "내 제안" },
  { v: "all", label: "전체" },
] as const;
export const suggestionsList: ListDef<Sg> = {
  key: "suggestions",
  title: "개선 제안",
  href: "/suggestions",
  allowed: () => true,
  load: (db, u, q) => listSuggestions(db, u, pick(q.f, SG_TABS.map((t) => t.v) as SuggestionFilter[], can(u, "suggest.decide") ? "open" : "mine")),
  tabs: { param: "f", options: SG_TABS },
  dates: [
    { key: "created", label: "제안일", get: (r) => r.s.createdAt },
    { key: "decided", label: "결정일", get: (r) => r.s.decidedAt },
    { key: "done", label: "실행일", get: (r) => r.s.doneAt },
  ],
  text: (r) => [r.s.docNo, r.s.title, r.s.area, r.s.problem, r.s.proposal, r.proposer],
  cols: [
    { label: "번호", get: (r) => r.s.docNo },
    { label: "제목", get: (r) => r.s.title },
    { label: "구역", get: (r) => r.s.area },
    { label: "제안자", get: (r) => r.proposer },
    { label: "제안일", get: (r) => isoOf(r.s.createdAt) },
    { label: "상태", get: (r) => L(SG_STATUS, r.s.status) },
    { label: "결정일", get: (r) => isoOf(r.s.decidedAt) },
    { label: "실행일", get: (r) => isoOf(r.s.doneAt) },
  ],
};
