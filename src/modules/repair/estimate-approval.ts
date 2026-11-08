// 고객 승인(STD-03 5절): 발급한 견적을 고객(보험이면 보험사)이 작업 묶음별로 승인한다.
// 방법은 기록이 남는 것만: 문자 링크(고객 휴대폰에서 서명), 매장 서명, 보험사 회신. 전화로만 받은 승인은 인정하지 않는다.
// 승인 시각·승인자·방법·본인 확인 근거를 남기고, 승인한 줄만 작업 대상이 된다(totals(lines, true)).
import { and, desc, eq, inArray, ne } from "drizzle-orm";
import type { Db } from "@/db/client";
import { appUser, customer, estimate, estimateLine, repairOrder, vehicle } from "@/db/schema";
import { randomToken, sha256 } from "@/modules/auth/crypto";
import type { Role } from "@/modules/auth/roles";
import { appUrl, phoneForNotice } from "@/modules/customer/service";
import { sendNotice } from "@/modules/messaging/service";
import { writeAudit } from "@/modules/platform/audit";
import { notifyRole } from "@/modules/platform/notify";
import { loadPolicy } from "@/modules/platform/policy";
import { sniffImage, storeFile } from "@/modules/platform/storage";
import { addDays, seoulDate } from "@/modules/platform/time";
import { koDateTime } from "@/modules/customer/rules";
import { EstimateError, getEstimate } from "./estimate";
import { APPROVAL_METHOD, approvalGroups, approvalOutcome, totals, type ApprovalMethod } from "./estimate-rules";

type Actor = { id: string; roles: Role[] };
const WRITERS: Role[] = ["advisor", "plant_manager", "owner"];
const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;

function mustWrite(actor: Actor) {
  if (!actor.roles.some((r) => WRITERS.includes(r))) throw new EstimateError("고객 승인은 상담원·공장장·대표가 받습니다");
}

/** 승인을 받을 수 있는 견적인지: 발급했고, 아직 답이 없고, 유효기간 안 */
function mustAwait(e: { status: string; docNo: string; validUntil: string | null }, today: string) {
  if (e.status === "accepted" || e.status === "partial" || e.status === "declined") throw new EstimateError(`${e.docNo}는 이미 고객 답을 받았습니다`);
  if (e.status !== "sent") throw new EstimateError("법정 견적서를 발급한 뒤에 고객 승인을 받습니다");
  if (e.validUntil && e.validUntil < today) throw new EstimateError(`유효기간(${e.validUntil})이 지난 견적입니다. 새 차수로 다시 견적해 발급하세요`);
}

/** 승인 링크를 문자·알림톡으로 보낸다. 다시 보내면 앞 링크는 못 쓴다. 링크는 유효기간까지 열린다 */
export async function sendApprovalLink(db: Db, actor: Actor, id: string, now = new Date(), f: typeof fetch = fetch) {
  mustWrite(actor);
  const e = await getEstimate(db, id);
  mustAwait(e, seoulDate(now));
  const p = await phoneForNotice(db, e.customer.id);
  const token = randomToken(24);
  const r = await sendNotice(
    db,
    { key: "estimate_ready", to: p.to, vars: { 고객명: p.name, 차량번호: e.vehicle.plateNo, 견적금액: won(e.totalWon), 유효기간: e.validUntil ?? "", 확인링크: `${appUrl()}/estimate/${token}` }, purpose: "견적 승인 요청", customerName: p.name, ref: e.docNo, sentBy: actor.id },
    f,
  );
  await db.update(estimate).set({ approvalTokenHash: sha256(token), approvalSentAt: now, approvalSentOk: r.ok, updatedAt: now }).where(eq(estimate.id, id));
  await writeAudit(db, { actorId: actor.id, action: "estimate.approval_link", entityType: "estimate", entityId: e.docNo, after: { ok: r.ok, channel: r.channel } });
  return { ...r, token };
}

async function byToken(db: Db, token: string) {
  if (!token) return null;
  const [e] = await db.select({ id: estimate.id }).from(estimate).where(and(eq(estimate.approvalTokenHash, sha256(token)), ne(estimate.status, "void")));
  return e ? getEstimate(db, e.id) : null;
}

/** 고객이 링크를 열었을 때 보여 줄 것. 법정 서식에 고정한 차량·사업자 값을 쓴다. 이름은 첫 글자만 */
export async function approvalView(db: Db, token: string, now = new Date()) {
  const e = await byToken(db, token);
  if (!e) return { state: "invalid" as const };
  if (e.status === "accepted" || e.status === "partial" || e.status === "declined") return { state: "done" as const, status: e.status, approvedAt: e.approvedAt };
  if (e.status !== "sent") return { state: "invalid" as const };
  if (e.validUntil && e.validUntil < seoulDate(now)) return { state: "expired" as const, validUntil: e.validUntil };
  const s = e.snapshot as { carName?: string; plateNo?: string; shop?: { name: string; phone: string } };
  return {
    state: "open" as const,
    docNo: e.docNo,
    name: `${e.customer.name.slice(0, 1)}${"*".repeat(Math.max(1, e.customer.name.length - 1))}`,
    plateNo: s.plateNo ?? e.vehicle.plateNo,
    carName: s.carName ?? "",
    shop: s.shop ?? null,
    kind: e.kind,
    issuedOn: e.issuedOn,
    validUntil: e.validUntil,
    dueDate: e.dueDate,
    lines: e.lines,
    groups: approvalGroups(e.lines),
    totals: totals(e.lines),
  };
}

type Record_ = { method: ApprovalMethod; approverName: string; ref: string; signature: string | null; recordedBy: string | null };

/** 승인 기록 공통: 묶음 단위로 줄마다 승인 여부를 쓰고 상태를 정한다. 승인한 것이 있으면 수리 건은 작업 대기로 */
async function apply(db: Db, id: string, groupKeys: string[], rec: Record_, now: Date) {
  const e = await getEstimate(db, id);
  mustAwait(e, seoulDate(now));
  const groups = approvalGroups(e.lines);
  const unknown = groupKeys.filter((k) => !groups.some((g) => g.key === k));
  if (unknown.length) throw new EstimateError("견적 내용이 바뀌었습니다. 화면을 새로 열어 다시 골라 주세요");
  if (!rec.approverName.trim()) throw new EstimateError("승인하는 분의 이름을 적어 주세요");
  const yes = new Set(groups.filter((g) => groupKeys.includes(g.key)).flatMap((g) => g.lineIds));
  const outcome = approvalOutcome(groups.filter((g) => groupKeys.includes(g.key)).length, groups.length);
  await db.transaction(async (tx) => {
    const ids = e.lines.map((l) => l.id);
    if (ids.length) {
      await tx.update(estimateLine).set({ approved: false }).where(inArray(estimateLine.id, ids));
      if (yes.size) await tx.update(estimateLine).set({ approved: true }).where(inArray(estimateLine.id, [...yes]));
    }
    await tx
      .update(estimate)
      .set({ status: outcome, approvedAt: now, approvalMethod: rec.method, approverName: rec.approverName.trim(), approvalRef: rec.ref, approvalSignature: rec.signature, approvalRecordedBy: rec.recordedBy, updatedAt: now })
      .where(eq(estimate.id, id));
    if (outcome !== "declined") await tx.update(repairOrder).set({ status: "working", updatedAt: now }).where(and(eq(repairOrder.id, e.repairOrderId), eq(repairOrder.status, "estimating")));
  });
  const ok = totals(e.lines.map((l) => ({ ...l, approved: yes.has(l.id) })), true).total;
  await writeAudit(db, { actorId: rec.recordedBy, action: `estimate.${outcome}`, entityType: "estimate", entityId: e.docNo, after: { method: rec.method, by: rec.approverName.trim(), ref: rec.ref, approvedTotal: ok, groups: `${groups.filter((g) => groupKeys.includes(g.key)).length}/${groups.length}` } });
  const msg = outcome === "declined" ? `견적 승인 안 함: ${e.docNo}(${e.ro.docNo}) — 고객에게 사유를 묻고 차량 반출을 안내하세요` : `견적 ${outcome === "accepted" ? "승인" : "일부 승인"}: ${e.docNo}(${e.ro.docNo}) ${won(ok)} — 작업을 준비하세요`;
  for (const role of ["advisor", "plant_manager"] as const) await notifyRole(db, role, msg, `est-answer-${e.docNo}-${role}`, `/repairs/${e.repairOrderId}/estimate/${id}`);
  return { outcome, approvedTotal: ok };
}

async function storeSignature(docNo: string, png: Uint8Array | null) {
  if (!png?.length) throw new EstimateError("서명을 받아 주세요");
  if (sniffImage(png) !== "image/png" || png.length > 400_000) throw new EstimateError("서명 그림을 읽지 못했습니다. 서명란을 지우고 다시 해 주세요");
  return storeFile(`estimate/${docNo}`, png, "png");
}

/** 고객이 링크에서 승인(로그인 없음, 링크가 곧 권한). 본인 확인 근거는 링크를 받은 휴대폰과 접속 IP, 서명 */
export async function approveByLink(db: Db, token: string, input: { groups: string[]; name: string; agree: boolean; signaturePng: Uint8Array | null }, meta: { ip?: string | null } = {}, now = new Date()) {
  const e = await byToken(db, token);
  if (!e) throw new EstimateError("링크가 만료되었거나 이미 쓰였습니다. 정비소에 다시 요청해 주세요");
  if (!input.agree) throw new EstimateError("내용을 확인했다는 칸에 체크해 주세요");
  const [c] = await db.select({ masked: customer.phoneMasked }).from(customer).where(eq(customer.id, e.customer.id));
  const sig = await storeSignature(e.docNo, input.signaturePng);
  const ref = [`문자 링크(${c?.masked ?? "등록된 휴대폰"}로 보냄)`, e.approvalSentAt ? `보낸 때 ${koDateTime(e.approvalSentAt)}` : null, meta.ip ? `IP ${meta.ip}` : null].filter(Boolean).join(" · ");
  return apply(db, e.id, input.groups, { method: "link", approverName: input.name, ref, signature: sig, recordedBy: null }, now);
}

/** 매장에서: 고객이 화면(태블릿)에서 고르고 서명한다. 받은 직원이 남는다 */
export async function approveInStore(db: Db, actor: Actor, id: string, input: { groups: string[]; name: string; signaturePng: Uint8Array | null }, now = new Date()) {
  mustWrite(actor);
  const e = await getEstimate(db, id);
  mustAwait(e, seoulDate(now));
  const sig = await storeSignature(e.docNo, input.signaturePng);
  const [u] = await db.select({ name: appUser.name }).from(appUser).where(eq(appUser.id, actor.id));
  return apply(db, id, input.groups, { method: "store", approverName: input.name, ref: `매장에서 고객 서명(받은 직원 ${u?.name ?? ""})`, signature: sig, recordedBy: actor.id }, now);
}

/** 보험 견적: 보험사(손해사정) 회신을 기록한다. 담당자와 접수번호(회신 문서)가 근거 */
export async function recordInsurerApproval(db: Db, actor: Actor, id: string, input: { groups: string[]; name: string; ref: string }, now = new Date()) {
  mustWrite(actor);
  const e = await getEstimate(db, id);
  if (e.kind !== "insurance") throw new EstimateError("보험사 회신은 보험 견적에만 씁니다. 일반 견적은 고객 승인을 받으세요");
  if (!input.ref.trim()) throw new EstimateError("보험사 접수번호와 회신 방법(팩스·전산 등)을 적어 주세요. 전화만으로는 인정하지 않습니다");
  return apply(db, id, input.groups, { method: "insurer", approverName: input.name, ref: input.ref.trim(), signature: null, recordedBy: actor.id }, now);
}

/** 내 할 일: 승인 받기(링크 안 보냄)·재연락(보낸 뒤 정책 날수 지남)·기한 지남 */
export async function approvalTodos(db: Db, now = new Date()) {
  const today = seoulDate(now);
  const policy = await loadPolicy(db, today);
  const rows = await db
    .select({ id: estimate.id, docNo: estimate.docNo, roId: estimate.repairOrderId, total: estimate.totalWon, validUntil: estimate.validUntil, sentAt: estimate.approvalSentAt, issuedOn: estimate.issuedOn, ro: repairOrder.docNo })
    .from(estimate)
    .innerJoin(repairOrder, eq(repairOrder.id, estimate.repairOrderId))
    .where(eq(estimate.status, "sent"));
  return rows.map((r) => {
    const label = `${r.docNo}(${r.ro})`;
    const kind = r.validUntil && r.validUntil < today ? ("expired" as const) : !r.sentAt ? ("ask" as const) : addDays(seoulDate(r.sentAt), policy["estimate.followup_days"]) <= today ? ("followup" as const) : null;
    return { ...r, label, kind };
  });
}

export const approvalMethodLabel = (m: string | null) => (m ? (APPROVAL_METHOD[m as ApprovalMethod] ?? m) : "");

export type EstimateFilter = "open" | "answered" | "all";
const OPEN_STATUSES = ["draft", "review", "approved", "sent"] as const;
const ANSWERED = ["accepted", "partial", "declined"] as const;

/** 견적 목록(견적·고객 승인 화면). open=작성~승인 대기, answered=고객 답 받음 */
export async function listAllEstimates(db: Db, filter: EstimateFilter = "open") {
  const where = filter === "open" ? inArray(estimate.status, [...OPEN_STATUSES]) : filter === "answered" ? inArray(estimate.status, [...ANSWERED]) : ne(estimate.status, "void");
  return db
    .select({
      id: estimate.id,
      docNo: estimate.docNo,
      rev: estimate.rev,
      status: estimate.status,
      kind: estimate.kind,
      total: estimate.totalWon,
      issuedOn: estimate.issuedOn,
      validUntil: estimate.validUntil,
      sentAt: estimate.approvalSentAt,
      sentOk: estimate.approvalSentOk,
      approvedAt: estimate.approvedAt,
      roId: repairOrder.id,
      roNo: repairOrder.docNo,
      customerName: customer.name,
      plateNo: vehicle.plateNo,
      model: vehicle.model,
    })
    .from(estimate)
    .innerJoin(repairOrder, eq(repairOrder.id, estimate.repairOrderId))
    .innerJoin(customer, eq(customer.id, repairOrder.customerId))
    .innerJoin(vehicle, eq(vehicle.id, repairOrder.vehicleId))
    .where(where)
    .orderBy(desc(estimate.createdAt))
    .limit(300);
}
