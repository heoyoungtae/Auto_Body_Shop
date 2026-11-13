// 보증·고객 불만 처리(STD-06 5~7절): 불만 처리부 F-06-02, 만족도 설문 F-06-01
// 누구나 접수 → 상담원 접수 안내 → 품질 담당 현물 확인·판정 → 상담원 고객 동의 → (보증 수리·보상) → 만족 확인·종결
import { and, asc, desc, eq, gte, inArray, isNotNull, lte, ne, notInArray } from "drizzle-orm";
import type { Db } from "@/db/client";
import { appUser, complaint, customer, nonconformance, repairOrder, repairStatement, survey, vehicle } from "@/db/schema";
import { decrypt, encrypt, normalizePhone, randomToken, sha256 } from "@/modules/auth/crypto";
import { can } from "@/modules/auth/permissions";
import type { Role } from "@/modules/auth/roles";
import { appUrl, phoneForNotice } from "@/modules/customer/service";
import { sendNotice } from "@/modules/messaging/service";
import { writeAudit } from "@/modules/platform/audit";
import { addBusinessDays } from "@/modules/platform/business-days";
import { loadShopCalendar } from "@/modules/platform/calendar";
import { nextDocNo } from "@/modules/platform/docno";
import { UserError } from "@/modules/platform/errors";
import { notifyRole, notifyUser } from "@/modules/platform/notify";
import { loadPolicy } from "@/modules/platform/policy";
import { IMAGE_TYPES, MAX_IMAGE_BYTES, removeStored, sniffImage, storeFile } from "@/modules/platform/storage";
import { addDays, seoulDate } from "@/modules/platform/time";
import { issueNc } from "@/modules/quality/nc";
import {
  CATEGORIES,
  CHANNELS,
  isCategory,
  isChannel,
  isResolution,
  judgeIssues,
  lowItems,
  quarterOf,
  REPEAT_PER_QUARTER,
  SURVEY_OPEN_DAYS,
  SURVEY_QUESTIONS,
  surveyIssues,
  VERDICTS,
  warrantyState,
  type Category,
  type Channel,
  type Verdict,
  type Warranty,
} from "./rules";

export class CsError extends UserError {}
type Actor = { id: string; roles: Role[] };
const clean = (s: string | null | undefined) => (s ?? "").trim() || null;
const contact = (a: Actor) => can(a, "complaint.contact");
const judge = (a: Actor) => can(a, "complaint.judge");

async function cpRow(db: Db, id: string) {
  const [c] = await db.select().from(complaint).where(eq(complaint.id, id));
  if (!c) throw new CsError("불만 처리부를 찾을 수 없습니다");
  return c;
}

/** 수리 건의 마지막 명세서(출고일·보증) */
async function statementFor(db: Db, roId: string) {
  const [st] = await db
    .select({ id: repairStatement.id, docNo: repairStatement.docNo, deliveredAt: repairStatement.deliveredAt, snapshot: repairStatement.snapshot })
    .from(repairStatement)
    .where(eq(repairStatement.repairOrderId, roId))
    .orderBy(desc(repairStatement.createdAt))
    .limit(1);
  return st ?? null;
}

/** 접수 화면에서 고르는 최근 출고 건(1년 남짓) */
export async function recentDelivered(db: Db, now = new Date()) {
  const since = new Date(now.getTime() - 400 * 86_400_000);
  return db
    .select({ roId: repairOrder.id, roNo: repairOrder.docNo, plateNo: vehicle.plateNo, model: vehicle.model, customerName: customer.name, stNo: repairStatement.docNo, deliveredAt: repairStatement.deliveredAt })
    .from(repairStatement)
    .innerJoin(repairOrder, eq(repairOrder.id, repairStatement.repairOrderId))
    .innerJoin(vehicle, eq(vehicle.id, repairOrder.vehicleId))
    .innerJoin(customer, eq(customer.id, repairOrder.customerId))
    .where(and(isNotNull(repairStatement.deliveredAt), gte(repairStatement.deliveredAt, since)))
    .orderBy(desc(repairStatement.deliveredAt))
    .limit(300);
}

/** 수리 건에서 불러올 값: 고객·차량·명세서·출고일·보증 */
export async function roContext(db: Db, roId: string, today = seoulDate()) {
  const [r] = await db
    .select({ id: repairOrder.id, docNo: repairOrder.docNo, customerId: repairOrder.customerId, vehicleId: repairOrder.vehicleId, advisorId: repairOrder.advisorId, plateNo: vehicle.plateNo, model: vehicle.model, customerName: customer.name })
    .from(repairOrder)
    .innerJoin(vehicle, eq(vehicle.id, repairOrder.vehicleId))
    .innerJoin(customer, eq(customer.id, repairOrder.customerId))
    .where(eq(repairOrder.id, roId));
  if (!r) return null;
  const st = await statementFor(db, roId);
  const w = warrantyState((st?.snapshot as { warranty?: Warranty[] } | undefined)?.warranty, today);
  return { ...r, statement: st ? { id: st.id, docNo: st.docNo, deliveredOn: st.deliveredAt ? seoulDate(st.deliveredAt) : null } : null, warranty: w };
}

export type ComplaintInput = { channel: string; category: string; repairOrderId?: string; who?: string; phone?: string; content: string; wish?: string; urgent?: boolean };

/** 5.1 접수: 누구나. 상담원(수리 건 담당 상담원)에게 알림, 긴급이면 공장장·품질 담당에게도 */
export async function receiveComplaint(db: Db, actor: Actor | null, input: ComplaintInput, now = new Date()) {
  if (!isChannel(input.channel)) throw new CsError("경로를 골라 주세요");
  if (!isCategory(input.category)) throw new CsError("불만 유형을 골라 주세요");
  const content = clean(input.content);
  if (!content) throw new CsError("불만 내용을 적어 주세요");
  const today = seoulDate(now);
  const ro = input.repairOrderId ? await roContext(db, input.repairOrderId, today) : null;
  if (input.repairOrderId && !ro) throw new CsError("수리 건을 찾을 수 없습니다");
  if (!ro && !clean(input.who)) throw new CsError("수리 건을 고르거나, 고객이 아니면 이름(회사)을 적어 주세요");
  let phoneEnc: string | null = null;
  if (clean(input.phone)) {
    const p = normalizePhone(input.phone!);
    if (!/^0\d{8,10}$/.test(p)) throw new CsError("연락처를 확인해 주세요");
    phoneEnc = encrypt(p);
  }
  const pol = await loadPolicy(db);
  const cal = await loadShopCalendar(db);
  const docNo = await nextDocNo(db, "CP", now);
  const [c] = await db
    .insert(complaint)
    .values({
      docNo,
      channel: input.channel,
      receivedAt: now,
      receivedBy: actor?.id ?? null,
      repairOrderId: ro?.id ?? null,
      statementId: ro?.statement?.id ?? null,
      customerId: ro?.customerId ?? null,
      vehicleId: ro?.vehicleId ?? null,
      who: clean(input.who),
      phoneEnc,
      category: input.category,
      content,
      wish: clean(input.wish),
      urgent: !!input.urgent,
      ackDue: addBusinessDays(today, pol["complaint.ack_business_days"], cal),
      judgeDue: addBusinessDays(today, pol["warranty.decision_business_days"], cal),
      replyDue: addDays(today, pol["complaint.reply_days"]),
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: complaint.id });
  const subject = ro ? `${ro.plateNo} ${ro.customerName}` : clean(input.who);
  const title = `${input.urgent ? "[긴급] " : ""}불만 접수 ${docNo}(${CHANNELS[input.channel]} · ${subject}): ${content.slice(0, 40)} — 1영업일 안에 접수 안내`;
  if (ro?.advisorId) await notifyUser(db, ro.advisorId, title, `cp-${docNo}`, `/complaints/${c.id}`);
  else await notifyRole(db, "advisor", title, `cp-${docNo}`, `/complaints/${c.id}`);
  if (input.urgent) {
    await notifyRole(db, "plant_manager", title, `cp-${docNo}-u`, `/complaints/${c.id}`);
    await notifyRole(db, "quality", title, `cp-${docNo}-u`, `/complaints/${c.id}`);
  }
  await writeAudit(db, { actorId: actor?.id ?? null, action: "complaint.receive", entityType: "complaint", entityId: docNo, after: { channel: input.channel, category: input.category, ro: ro?.docNo } });
  return { id: c.id, docNo };
}

/** 5.2 접수 안내(상담원) */
export async function ackComplaint(db: Db, actor: Actor, id: string, note: string, now = new Date()) {
  if (!contact(actor)) throw new CsError("고객 안내는 상담원·공장장이 합니다");
  const c = await cpRow(db, id);
  if (c.status !== "received") throw new CsError("이미 접수 안내를 했습니다");
  if (!clean(note)) throw new CsError("누구에게 어떻게 안내했는지 적어 주세요");
  await db.update(complaint).set({ ackAt: now, ackBy: actor.id, ackNote: clean(note), status: "acked", updatedAt: now }).where(eq(complaint.id, id));
  await notifyRole(db, "quality", `불만 ${c.docNo} 현물 확인·판정(기한 ${c.judgeDue})`, `cp-judge-${id}`, `/complaints/${id}`);
}

/** 5.3~5.4 현물 확인·판정(품질 담당). 시정 조치가 필요하면 부적합(F-Q-10)을 발행한다 */
export async function judgeComplaint(db: Db, actor: Actor, id: string, p: { inspectNote: string; verdict: string; reason: string; needNc: boolean }, now = new Date()) {
  if (!judge(actor)) throw new CsError("보증 판정은 품질 담당·공장장이 합니다");
  const c = await cpRow(db, id);
  if (c.status === "received") throw new CsError("먼저 고객에게 접수 안내를 합니다(상담원)");
  if (c.status === "agreed" || c.status === "closed") throw new CsError("고객 동의를 받은 뒤에는 판정을 바꾸지 않습니다");
  const issues = judgeIssues(p);
  if (issues.length) throw new CsError(issues.join(" / "));
  let ncId = c.ncId;
  if (p.needNc && !ncId) {
    const ro = c.repairOrderId ? await roContext(db, c.repairOrderId) : null;
    const nc = await issueNc(db, actor.id, { source: "complaint", refType: "complaint", refId: id, refLabel: `${c.docNo}${ro ? ` ${ro.plateNo} ${ro.docNo}` : ""}`, content: `고객 불만(${VERDICTS[p.verdict as Verdict]}): ${c.content}`.slice(0, 500), occurredAt: c.receivedAt }, now);
    ncId = nc.id;
  }
  await db
    .update(complaint)
    .set({ inspectNote: clean(p.inspectNote), verdict: p.verdict, verdictReason: clean(p.reason), ncId, judgedBy: actor.id, judgedAt: now, status: "judged", updatedAt: now })
    .where(eq(complaint.id, id));
  const who = c.ackBy ?? null;
  const title = `불만 ${c.docNo} 판정: ${VERDICTS[p.verdict as Verdict]} — 고객에게 설명하고 동의를 받으세요`;
  if (who) await notifyUser(db, who, title, `cp-judged-${id}-${now.getTime()}`, `/complaints/${id}`);
  else await notifyRole(db, "advisor", title, `cp-judged-${id}-${now.getTime()}`, `/complaints/${id}`);
  await writeAudit(db, { actorId: actor.id, action: "complaint.judge", entityType: "complaint", entityId: c.docNo, after: { verdict: p.verdict, nc: !!ncId } });
}

export type AgreeInput = { plan: string; resolution: string; warrantyRoId?: string; compWon?: number | null; compNote?: string };

/** 5.5 고객 동의(상담원). 보상이 있으면 대표 승인을 기다린다(5.7) */
export async function agreeComplaint(db: Db, actor: Actor, id: string, p: AgreeInput, now = new Date()) {
  if (!contact(actor)) throw new CsError("고객 동의는 상담원·공장장이 받습니다");
  const c = await cpRow(db, id);
  if (c.status !== "judged" && c.status !== "agreed") throw new CsError(c.status === "closed" ? "종결한 건입니다" : "품질 담당 판정 뒤에 고객 동의를 받습니다");
  if (!clean(p.plan)) throw new CsError("고객에게 설명하고 동의받은 처리 방안을 적어 주세요");
  if (!isResolution(p.resolution)) throw new CsError("처리 방법을 골라 주세요");
  if (p.resolution === "warranty_repair" && c.verdict !== "covered" && c.verdict !== "partial") throw new CsError("보증 비해당 판정은 보증 수리로 처리할 수 없습니다(유상 수리는 새 상담으로)");
  let warrantyRoId: string | null = null;
  if (p.resolution === "warranty_repair" && clean(p.warrantyRoId)) {
    const [r] = await db.select({ id: repairOrder.id, vehicleId: repairOrder.vehicleId }).from(repairOrder).where(eq(repairOrder.id, p.warrantyRoId!));
    if (!r || (c.vehicleId && r.vehicleId !== c.vehicleId)) throw new CsError("보증 수리 건은 같은 차량의 수리 건이어야 합니다");
    if (r.id === c.repairOrderId) throw new CsError("보증 수리는 새 수리 건(보증 표시)으로 접수합니다. 원래 수리 건이 아닙니다");
    warrantyRoId = r.id;
  }
  const compWon = p.compWon && p.compWon > 0 ? Math.round(p.compWon) : null;
  const compNote = clean(p.compNote);
  if (compWon && !compNote) throw new CsError("보상 내용(환불·대차·금전 등)을 적어 주세요");
  const compChanged = compWon !== c.compWon || compNote !== c.compNote;
  await db
    .update(complaint)
    .set({
      plan: clean(p.plan),
      resolution: p.resolution,
      warrantyRoId,
      compWon,
      compNote,
      compApprovedBy: compChanged ? null : c.compApprovedBy,
      compApprovedAt: compChanged ? null : c.compApprovedAt,
      agreedAt: c.agreedAt ?? now,
      agreedBy: actor.id,
      status: "agreed",
      updatedAt: now,
    })
    .where(eq(complaint.id, id));
  if ((compWon || compNote) && compChanged) await notifyRole(db, "owner", `불만 ${c.docNo} 보상 승인 요청: ${compNote ?? ""}${compWon ? ` ${compWon.toLocaleString("ko-KR")}원` : ""}`, `cp-comp-${id}-${now.getTime()}`, `/complaints/${id}`);
  if (p.resolution === "warranty_repair") await notifyRole(db, "plant_manager", `보증 수리 배정 ${c.docNo}: ${clean(p.plan)!.slice(0, 40)}`, `cp-wr-${id}`, `/complaints/${id}`);
  await writeAudit(db, { actorId: actor.id, action: "complaint.agree", entityType: "complaint", entityId: c.docNo, after: { resolution: p.resolution, compWon } });
}

/** 5.7 보상 승인(대표) */
export async function approveCompensation(db: Db, actor: Actor, id: string, now = new Date()) {
  if (!can(actor, "complaint.compensate")) throw new CsError("보상은 대표가 승인합니다");
  const c = await cpRow(db, id);
  if (!c.compWon && !c.compNote) throw new CsError("보상 내용이 없습니다");
  if (c.compApprovedAt) throw new CsError("이미 승인했습니다");
  await db.update(complaint).set({ compApprovedBy: actor.id, compApprovedAt: now, updatedAt: now }).where(eq(complaint.id, id));
  if (c.agreedBy) await notifyUser(db, c.agreedBy, `불만 ${c.docNo} 보상을 대표가 승인했습니다`, `cp-comp-ok-${id}`, `/complaints/${id}`);
  await writeAudit(db, { actorId: actor.id, action: "complaint.compensate", entityType: "complaint", entityId: c.docNo, after: { compWon: c.compWon } });
}

/** 5.8 만족 확인·종결(상담원). 만족하지 않으면 종결하지 않고 대표 면담으로 넘긴다 */
export async function closeComplaint(db: Db, actor: Actor, id: string, p: { satisfied: boolean; note: string }, now = new Date()) {
  if (!contact(actor)) throw new CsError("종결은 상담원·공장장이 합니다");
  const c = await cpRow(db, id);
  if (c.status !== "agreed") throw new CsError(c.status === "closed" ? "이미 종결했습니다" : "고객 동의를 받고 처리한 뒤 종결합니다");
  if ((c.compWon || c.compNote) && !c.compApprovedAt) throw new CsError("보상은 대표 승인 뒤에 종결합니다");
  if (c.resolution === "warranty_repair") {
    if (!c.warrantyRoId) throw new CsError("보증 수리 건을 연결한 뒤 종결합니다");
    const [r] = await db.select({ status: repairOrder.status }).from(repairOrder).where(eq(repairOrder.id, c.warrantyRoId));
    if (r?.status !== "delivered") throw new CsError("보증 수리를 검사·출고한 뒤 종결합니다");
  }
  if (!p.satisfied && !clean(p.note)) throw new CsError("고객이 만족하지 않으면 무엇이 남았는지 적어 주세요");
  if (!p.satisfied) {
    await db.update(complaint).set({ satisfied: false, closeNote: clean(p.note), updatedAt: now }).where(eq(complaint.id, id));
    await notifyRole(db, "owner", `불만 ${c.docNo} 고객 미수용: 대표 면담이 필요합니다(합의 안 되면 소비자 분쟁 조정 안내)`, `cp-owner-${id}-${seoulDate(now)}`, `/complaints/${id}`);
    return { closed: false };
  }
  await db.update(complaint).set({ satisfied: true, closeNote: clean(p.note), closedBy: actor.id, closedAt: now, status: "closed", updatedAt: now }).where(eq(complaint.id, id));
  await writeAudit(db, { actorId: actor.id, action: "complaint.close", entityType: "complaint", entityId: c.docNo });
  return { closed: true };
}

/** 현물 사진(상담원·품질 담당) */
export async function addComplaintPhoto(db: Db, actor: Actor, id: string, bytes: Uint8Array) {
  if (!contact(actor) && !judge(actor)) throw new CsError("상담원·품질 담당만 사진을 올립니다");
  const c = await cpRow(db, id);
  if (c.status === "closed") throw new CsError("종결한 건입니다");
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) throw new CsError("사진이 비었거나 너무 큽니다(6MB까지)");
  const type = sniffImage(bytes);
  if (!type) throw new CsError("사진 파일만 올릴 수 있습니다(JPG·PNG·WEBP)");
  if (c.photos.length >= 8) throw new CsError("사진은 8장까지입니다");
  const path = await storeFile(`cp/${c.docNo}`, bytes, IMAGE_TYPES[type]);
  await db.update(complaint).set({ photos: [...c.photos, path] }).where(eq(complaint.id, id));
}

export async function removeComplaintPhoto(db: Db, actor: Actor, id: string, path: string) {
  if (!contact(actor) && !judge(actor)) throw new CsError("상담원·품질 담당만 사진을 지웁니다");
  const c = await cpRow(db, id);
  if (c.status === "closed") throw new CsError("종결한 건입니다");
  if (!c.photos.includes(path)) return;
  await db.update(complaint).set({ photos: c.photos.filter((p) => p !== path) }).where(eq(complaint.id, id));
  await removeStored(path);
}

/** 상세 화면 */
export async function getComplaint(db: Db, id: string, today = seoulDate()) {
  const c = await cpRow(db, id);
  const names = new Map((await db.select({ id: appUser.id, name: appUser.name }).from(appUser)).map((u) => [u.id, u.name]));
  const ro = c.repairOrderId ? await roContext(db, c.repairOrderId, today) : null;
  // 접수 때 명세서가 고정되어 있으면 그 출고일로 보증을 본다
  const [nc] = c.ncId ? await db.select({ id: nonconformance.id, docNo: nonconformance.docNo, status: nonconformance.status }).from(nonconformance).where(eq(nonconformance.id, c.ncId)) : [];
  const candidates = c.vehicleId
    ? await db
        .select({ id: repairOrder.id, docNo: repairOrder.docNo, status: repairOrder.status })
        .from(repairOrder)
        .where(and(eq(repairOrder.vehicleId, c.vehicleId), gte(repairOrder.createdAt, c.receivedAt), ne(repairOrder.status, "cancelled")))
        .orderBy(asc(repairOrder.createdAt))
    : [];
  const [wr] = c.warrantyRoId ? await db.select({ id: repairOrder.id, docNo: repairOrder.docNo, status: repairOrder.status }).from(repairOrder).where(eq(repairOrder.id, c.warrantyRoId)) : [];
  let phone: string | null = c.phoneEnc ? decrypt(c.phoneEnc) : null;
  if (!phone && c.customerId) phone = await phoneForNotice(db, c.customerId).then((p) => p.to).catch(() => null);
  const [sv] = await db.select({ scores: survey.scores, comment: survey.comment }).from(survey).where(eq(survey.complaintId, id));
  return { c, names, ro, nc: nc ?? null, candidates, warrantyRo: wr ?? null, phone, survey: sv ?? null };
}

export type CpFilter = "open" | "warranty" | "closed" | "all";

export async function listComplaints(db: Db, f: CpFilter = "open", max = 300) {
  const where = f === "open" ? ne(complaint.status, "closed") : f === "closed" ? eq(complaint.status, "closed") : f === "warranty" ? inArray(complaint.verdict, ["covered", "partial"]) : undefined;
  return db
    .select({ c: complaint, plateNo: vehicle.plateNo, customerName: customer.name })
    .from(complaint)
    .leftJoin(vehicle, eq(vehicle.id, complaint.vehicleId))
    .leftJoin(customer, eq(customer.id, complaint.customerId))
    .where(where)
    .orderBy(f === "closed" ? desc(complaint.closedAt) : desc(complaint.urgent), asc(complaint.receivedAt))
    .limit(max);
}

/** 수리 건에 걸린 불만 */
export async function complaintsFor(db: Db, roId: string) {
  return db.select({ id: complaint.id, docNo: complaint.docNo, status: complaint.status }).from(complaint).where(eq(complaint.repairOrderId, roId));
}

// ── 만족도 설문(7절) ──

/** 7.1 출고 뒤 정해진 날 설문 링크 보내기(매일 작업). 2주 넘게 지난 출고는 보내지 않는다 */
export async function sendDueSurveys(db: Db, now = new Date(), f: typeof fetch = fetch) {
  const pol = await loadPolicy(db);
  const d = pol["survey.delay_days"];
  const upto = new Date(now.getTime() - d * 86_400_000);
  const from = new Date(now.getTime() - (d + 14) * 86_400_000);
  const done = db.select({ id: survey.repairOrderId }).from(survey);
  const due = await db
    .select({ roId: repairOrder.id, roNo: repairOrder.docNo, customerId: repairOrder.customerId, plateNo: vehicle.plateNo, stId: repairStatement.id })
    .from(repairStatement)
    .innerJoin(repairOrder, eq(repairOrder.id, repairStatement.repairOrderId))
    .innerJoin(vehicle, eq(vehicle.id, repairOrder.vehicleId))
    .where(and(isNotNull(repairStatement.deliveredAt), lte(repairStatement.deliveredAt, upto), gte(repairStatement.deliveredAt, from), notInArray(repairOrder.id, done)));
  let ok = 0;
  const seen = new Set<string>();
  for (const r of due) {
    if (seen.has(r.roId)) continue;
    seen.add(r.roId);
    const token = randomToken(24);
    let sentOk = false;
    let err: string | null = null;
    try {
      const p = await phoneForNotice(db, r.customerId);
      const res = await sendNotice(db, { key: "survey", to: p.to, vars: { 고객명: p.name, 차량번호: r.plateNo, 설문링크: `${appUrl()}/survey/${token}` }, purpose: "만족도 설문", customerName: p.name, ref: r.roNo, sentBy: null }, f);
      sentOk = res.ok;
      err = res.ok ? null : (res.error ?? "발송 실패");
    } catch (e) {
      err = e instanceof Error ? e.message : String(e);
    }
    await db.insert(survey).values({ tokenHash: sha256(token), repairOrderId: r.roId, statementId: r.stId, customerId: r.customerId, sentAt: now, sentOk, sendError: err }).onConflictDoNothing();
    if (sentOk) ok++;
  }
  return `만족도 설문 ${ok}/${seen.size}건 발송`;
}

async function surveyByToken(db: Db, token: string) {
  if (!token || token.length < 16) return null;
  const [s] = await db.select().from(survey).where(eq(survey.tokenHash, sha256(token)));
  return s ?? null;
}

/** 고객 설문 화면 */
export async function surveyView(db: Db, token: string, now = new Date()) {
  const s = await surveyByToken(db, token);
  if (!s) return { state: "invalid" as const };
  if (s.answeredAt) return { state: "done" as const };
  if (now.getTime() - s.sentAt.getTime() > SURVEY_OPEN_DAYS * 86_400_000) return { state: "expired" as const };
  const ctx = await roContext(db, s.repairOrderId, seoulDate(now));
  return { state: "open" as const, name: ctx?.customerName ?? "", plateNo: ctx?.plateNo ?? "", model: ctx?.model ?? "", stNo: ctx?.statement?.docNo ?? "", deliveredOn: ctx?.statement?.deliveredOn ?? "" };
}

/** 고객 응답. 기준 이하 항목이 있으면 불만 처리부를 연다(7.2) */
export async function answerSurvey(db: Db, token: string, input: { scores: number[]; comment: string }, now = new Date()) {
  const v = await surveyView(db, token, now);
  if (v.state !== "open") throw new CsError(v.state === "done" ? "이미 답해 주셨습니다. 감사합니다" : "열 수 없는 설문 링크입니다");
  const issues = surveyIssues(input.scores);
  if (issues.length) throw new CsError(issues.join(" / "));
  const s = (await surveyByToken(db, token))!;
  const comment = clean(input.comment)?.slice(0, 1000) ?? null;
  const claimed = await db
    .update(survey)
    .set({ answeredAt: now, scores: input.scores, comment })
    .where(and(eq(survey.id, s.id), eq(survey.tokenHash, s.tokenHash)))
    .returning({ id: survey.id, answeredAt: survey.answeredAt });
  if (!claimed.length) throw new CsError("이미 답해 주셨습니다");
  const pol = await loadPolicy(db);
  const low = lowItems(input.scores, pol["survey.complaint_threshold"]);
  if (!low.length) return { complaint: null };
  const worst = [...low].sort((a, b) => a.s - b.s)[0];
  const content = [`만족도 설문 낮은 점수: ${low.map((x) => `${SURVEY_QUESTIONS[x.i].q.replace(/\?$/, "")} ${x.s}점`).join(", ")}`, comment ? `고객 의견: ${comment}` : ""].filter(Boolean).join("\n");
  const cp = await receiveComplaint(db, null, { channel: "survey", category: SURVEY_QUESTIONS[worst.i].category, repairOrderId: s.repairOrderId, content }, now);
  await db.update(survey).set({ complaintId: cp.id }).where(eq(survey.id, s.id));
  return { complaint: cp };
}

// ── 월간 집계(7.3)·매일 알림 ──

const monthRange = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1) - 9 * 3_600_000);
  const end = new Date(Date.UTC(m === 12 ? y + 1 : y, m === 12 ? 0 : m, 1) - 9 * 3_600_000);
  return { start, end };
};

/** 월간 평균·응답률·불만 건수·보증 수리율, 그리고 분기 같은 유형 반복(6.4) */
export async function csMonthly(db: Db, ym: string) {
  const { start, end } = monthRange(ym);
  const inMonth = <T extends { getTime(): number } | null>(d: T) => !!d && d.getTime() >= start.getTime() && d.getTime() < end.getTime();
  const svs = (await db.select().from(survey).where(and(gte(survey.sentAt, start), lte(survey.sentAt, end)))).filter((s) => inMonth(s.sentAt));
  const answered = svs.filter((s) => s.answeredAt && s.scores);
  const perQ = SURVEY_QUESTIONS.map((_, i) => (answered.length ? answered.reduce((a, s) => a + (s.scores![i] ?? 0), 0) / answered.length : null));
  const allScores = answered.flatMap((s) => s.scores!);
  const avg = allScores.length ? allScores.reduce((a, b) => a + b, 0) / allScores.length : null;
  const cps = (await db.select().from(complaint).where(and(gte(complaint.receivedAt, start), lte(complaint.receivedAt, end)))).filter((c) => inMonth(c.receivedAt));
  const delivered = (await db.select({ at: repairStatement.deliveredAt }).from(repairStatement).where(and(gte(repairStatement.deliveredAt, start), lte(repairStatement.deliveredAt, end)))).filter((r) => inMonth(r.at));
  const warrantyRepairs = cps.filter((c) => c.resolution === "warranty_repair").length;
  const byCategory = Object.fromEntries(Object.keys(CATEGORIES).map((k) => [k, cps.filter((c) => c.category === k).length])) as Record<Category, number>;
  const byChannel = Object.fromEntries(Object.keys(CHANNELS).map((k) => [k, cps.filter((c) => c.channel === k).length])) as Record<Channel, number>;
  // 분기 반복: 이 달이 든 분기의 유형별 건수
  const q = quarterOf(`${ym}-01`);
  const qStartMonth = (+q.slice(-1) - 1) * 3 + 1;
  const qs = monthRange(`${ym.slice(0, 4)}-${String(qStartMonth).padStart(2, "0")}`).start;
  const qe = monthRange(`${ym.slice(0, 4)}-${String(qStartMonth + 2).padStart(2, "0")}`).end;
  const qCps = (await db.select({ category: complaint.category, receivedAt: complaint.receivedAt }).from(complaint).where(and(gte(complaint.receivedAt, qs), lte(complaint.receivedAt, qe)))).filter((c) => c.receivedAt.getTime() < qe.getTime());
  const repeats = Object.keys(CATEGORIES)
    .map((k) => ({ category: k as Category, n: qCps.filter((c) => c.category === k).length }))
    .filter((x) => x.n >= REPEAT_PER_QUARTER);
  return {
    ym,
    quarter: q,
    sent: svs.length,
    answered: answered.length,
    responseRate: svs.length ? Math.round((answered.length / svs.length) * 100) : null,
    avg: avg == null ? null : Math.round(avg * 10) / 10,
    perQ: perQ.map((v) => (v == null ? null : Math.round(v * 10) / 10)),
    complaints: cps.length,
    open: cps.filter((c) => c.status !== "closed").length,
    delivered: delivered.length,
    warrantyRepairs,
    warrantyRate: delivered.length ? Math.round((warrantyRepairs / delivered.length) * 1000) / 10 : null,
    byCategory,
    byChannel,
    repeats,
  };
}

/** 매일: 설문 발송, 접수 안내·판정·회신 기한 지남, 보상 승인 대기 */
export async function csDailyAlerts(db: Db, now = new Date(), f: typeof fetch = fetch) {
  const sent = await sendDueSurveys(db, now, f);
  const today = seoulDate(now);
  const open = await db.select().from(complaint).where(ne(complaint.status, "closed"));
  let n = 0;
  for (const c of open) {
    const link = `/complaints/${c.id}`;
    if (c.status === "received" && c.ackDue < today) {
      await notifyRole(db, "advisor", `불만 ${c.docNo} 접수 안내 기한(${c.ackDue}) 지남`, `cp-ack-late-${c.id}-${today}`, link);
      n++;
    }
    if ((c.status === "received" || c.status === "acked") && c.judgeDue < today) {
      await notifyRole(db, "quality", `불만 ${c.docNo} 판정 기한(${c.judgeDue}) 지남`, `cp-judge-late-${c.id}-${today}`, link);
      n++;
    }
    if (c.replyDue < today) {
      await notifyRole(db, "plant_manager", `불만 ${c.docNo} 회신 기한(${c.replyDue}) 지남`, `cp-reply-late-${c.id}-${today}`, link);
      n++;
    }
    if ((c.compWon || c.compNote) && !c.compApprovedAt) {
      await notifyRole(db, "owner", `불만 ${c.docNo} 보상 승인 대기`, `cp-comp-wait-${c.id}-${today}`, link);
      n++;
    }
  }
  return `${sent} · 불만 알림 ${n}건`;
}
