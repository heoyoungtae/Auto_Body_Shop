// 내 업무·설비·문서 묶음 목록 정의(조회줄): 결재 문서·업무지시·발송 이력·치공구·문서 목록
import { desc } from "drizzle-orm";
import { approvalDoc } from "@/db/schema";
import { listTools, type ToolFilter } from "@/modules/equipment/tools";
import { TOOL_STATUS } from "@/modules/equipment/rules";
import { DOC_KINDS } from "@/modules/quality/qms-rules";
import { listLogs } from "@/modules/messaging/service";
import { listDocs } from "@/modules/quality/qms";
import { listInstructions } from "@/modules/task/service";
import type { ListDef } from "../core";
import { isoOf } from "../core";
import { MAX, pick } from "./repair";

const APPROVAL_STATUS: Record<string, string> = { draft: "작성 중", in_progress: "결재 중", approved: "승인", rejected: "반려", cancelled: "취소" };

// ── 결재 문서(전체) ──
type Doc = typeof approvalDoc.$inferSelect;
export const approvalsList: ListDef<Doc> = {
  key: "approvals",
  title: "결재 문서",
  href: "/approvals",
  allowed: () => true,
  load: (db) => db.select().from(approvalDoc).orderBy(desc(approvalDoc.updatedAt)).limit(MAX),
  dates: [
    { key: "updated", label: "마지막 처리일", get: (r) => r.updatedAt },
    { key: "created", label: "올린 날", get: (r) => r.createdAt },
    { key: "confirmed", label: "확정일", get: (r) => r.confirmedAt },
  ],
  text: (r) => [r.docNo, r.title, r.formCode],
  cols: [
    { label: "문서 번호", get: (r) => r.docNo },
    { label: "양식", get: (r) => r.formCode },
    { label: "제목", get: (r) => r.title },
    { label: "상태", get: (r) => APPROVAL_STATUS[r.status] ?? r.status },
    { label: "올린 날", get: (r) => isoOf(r.createdAt) },
    { label: "확정일", get: (r) => isoOf(r.confirmedAt) },
  ],
};

// ── 업무지시 ──
type Ins = Awaited<ReturnType<typeof listInstructions>>[number];
export const tasksList: ListDef<Ins> = {
  key: "tasks",
  title: "업무지시",
  href: "/tasks",
  allowed: () => true,
  load: (db, u, q) => listInstructions(db, u, q.tab === "sent" ? "sent" : q.tab === "all" && u.roles.includes("owner") ? "all" : "received"),
  keep: ["tab"],
  dates: [
    { key: "created", label: "지시일", get: (r) => r.i.createdAt },
    { key: "due", label: "기한", get: (r) => r.i.dueOn },
  ],
  text: (r) => [r.i.docNo, r.i.title, r.i.refLabel, r.issuer],
  cols: [
    { label: "번호", get: (r) => r.i.docNo },
    { label: "제목", get: (r) => r.i.title },
    { label: "관련", get: (r) => r.i.refLabel },
    { label: "지시한 사람", get: (r) => r.issuer },
    { label: "지시일", get: (r) => isoOf(r.i.createdAt) },
    { label: "기한", get: (r) => r.i.dueOn },
    { label: "긴급", get: (r) => (r.i.urgent ? "긴급" : "") },
    { label: "받은 사람 수", get: (r) => r.total },
    { label: "끝낸 사람 수", get: (r) => r.doneCount },
    { label: "끝남", get: (r) => (r.closed ? "끝" : "") },
  ],
};

// ── 문자·알림톡 발송 이력 ──
type Log = Awaited<ReturnType<typeof listLogs>>[number];
export const messageLogList: ListDef<Log> = {
  key: "messages-log",
  title: "발송 이력",
  href: "/messages/log",
  allowed: () => true,
  load: (db) => listLogs(db, MAX),
  dates: [{ key: "sent", label: "보낸 날", get: (r) => r.createdAt }],
  text: (r) => [r.customerName, r.to, r.body, r.purpose, r.channel, r.sentBy],
  cols: [
    { label: "보낸 날", get: (r) => isoOf(r.createdAt) },
    { label: "방식", get: (r) => r.channel },
    { label: "용도", get: (r) => r.purpose },
    { label: "받는 사람", get: (r) => `${r.customerName ?? ""} ${r.to ?? ""}`.trim() },
    { label: "내용", get: (r) => r.body },
    { label: "결과", get: (r) => r.status },
    { label: "오류", get: (r) => r.error },
    { label: "비용", get: (r) => r.amount, sum: true, unit: "원" },
    { label: "보낸 사람", get: (r) => r.sentBy },
  ],
};

// ── 치공구 ──
type Tool = Awaited<ReturnType<typeof listTools>>["list"][number];
export const TOOL_TABS = [
  { v: "active", label: "쓰는 것 전체" },
  { v: "out", label: "반출 중" },
  { v: "special", label: "고가·특수" },
  { v: "mine", label: "내 공구·반출" },
  { v: "problem", label: "확인할 것" },
  { v: "disposed", label: "폐기" },
  { v: "all", label: "전체" },
] as const;
export const toolsList: ListDef<Tool> = {
  key: "tools",
  title: "치공구",
  href: "/tools",
  allowed: () => true,
  load: async (db, u, q) => (await listTools(db, u, pick(q.f, TOOL_TABS.map((t) => t.v) as ToolFilter[], "active"))).list,
  tabs: { param: "f", options: TOOL_TABS },
  dates: [
    { key: "bought", label: "구입일", get: (r) => r.purchasedOn },
    { key: "out", label: "반출일", get: (r) => r.outAt },
    { key: "created", label: "등록일", get: (r) => r.createdAt },
  ],
  text: (r) => [r.no, r.name, r.spec, r.location, r.outNote],
  cols: [
    { label: "번호", get: (r) => r.no },
    { label: "이름", get: (r) => r.name },
    { label: "규격", get: (r) => r.spec },
    { label: "위치", get: (r) => r.location },
    { label: "고가·특수", get: (r) => (r.special ? "예" : "") },
    { label: "구입일", get: (r) => r.purchasedOn },
    { label: "구입가", get: (r) => r.priceWon, sum: true, unit: "원" },
    { label: "반출일", get: (r) => isoOf(r.outAt) },
    { label: "상태", get: (r) => TOOL_STATUS[r.status as keyof typeof TOOL_STATUS] ?? r.status },
  ],
};

// ── 문서 목록(표준서·양식·외부 문서) ──
type QDoc = Awaited<ReturnType<typeof listDocs>>[number];
export const docsList: ListDef<QDoc> = {
  key: "docs",
  title: "문서 목록",
  href: "/qms/docs",
  allowed: () => true,
  load: async (db, _u, q) => {
    const all = await listDocs(db, pick(q.f, ["current", "retired", "all"] as const, "current"));
    return q.k ? all.filter((d) => d.kind === q.k) : all;
  },
  tabs: { param: "f", options: [{ v: "current", label: "현행" }, { v: "retired", label: "폐지" }, { v: "all", label: "전체" }] },
  keep: ["k"],
  dates: [
    { key: "effective", label: "시행일", get: (r) => r.effectiveOn },
    { key: "received", label: "받은 날(외부 문서)", get: (r) => r.receivedOn },
  ],
  text: (r) => [r.no, r.name, r.owner, r.location, r.source],
  cols: [
    { label: "번호", get: (r) => r.no },
    { label: "이름", get: (r) => r.name },
    { label: "종류", get: (r) => DOC_KINDS[r.kind as keyof typeof DOC_KINDS] ?? r.kind },
    { label: "판", get: (r) => r.rev },
    { label: "시행일", get: (r) => r.effectiveOn },
    { label: "관리자", get: (r) => r.owner },
    { label: "보관", get: (r) => r.location },
    { label: "상태", get: (r) => (r.status === "retired" ? "폐지" : "현행") },
  ],
};
