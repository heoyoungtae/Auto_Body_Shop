// 근태·휴가·연장근로 신청서(F-11-04, STD-11 4절)와 재직증명서 발급 신청.
// 신청은 전자결재 문서로 올리고(별도 표 없음), 연차 사용량·주 연장근로는 확정·진행 중 문서에서 센다.
import { can } from "@/modules/auth/permissions";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import type { Db } from "@/db/client";
import { appUser, approvalDoc, staffProfile } from "@/db/schema";
import { act, createDraft, submit, withdrawAndDiscard, type DocRow } from "@/modules/approval/service";
import { notifyUser } from "@/modules/platform/notify";
import { hm, overlap, seoulHM } from "./punch-rules";
import type { Role } from "@/modules/auth/roles";
import { loadShopCalendar } from "@/modules/platform/calendar";
import { UserError } from "@/modules/platform/errors";
import { seoulDate } from "@/modules/platform/time";
import { loadPolicy } from "@/modules/platform/policy";
import { addDaysIso, smallShopEntitlement, annualEntitlement, businessDaysBetween, hoursBetween, isLeaveKind, LATE_REPORT_DAYS, LEAVE_KINDS, leaveSummary, OVERTIME_AFTER_DAYS, SICK_PROOF_DAYS, weekStart, WEEKLY_OVERTIME_MAX } from "./leave-rules";
import { isBusinessDay } from "@/modules/platform/business-days";

export class LeaveError extends UserError {}
type Actor = { id: string; roles: Role[] };
const ISO = /^\d{4}-\d{2}-\d{2}$/;
export const LEAVE_FORM = "F-11-04";
export const CERT_FORM = "HR-CERT";
const LIVE = ["draft", "in_progress", "confirmed", "checked"] as const;
const DONE = ["confirmed", "checked"];

/** after: 사후 신청한 연장근무. orderedBy: 공장장·대표가 지시한 연장근무(직원 동의로 상신) */
export type LeaveData = { leaveKind: string; fromDate: string; toDate: string; fromTime: string; toTime: string; days: number; hours: number; deduct: number; reason: string; after?: boolean; orderedBy?: string; orderedByName?: string };
export const canSeeTeamLeave = (a: Actor) => can(a, "leave.team");

async function hiredOnOf(db: Db, userId: string) {
  const [p] = await db.select({ hiredOn: staffProfile.hiredOn, leftOn: staffProfile.leftOn }).from(staffProfile).where(eq(staffProfile.userId, userId));
  return p ?? null;
}

/** 한 사람의 근태 문서(취소 문서 제외, 살아 있는 것) */
async function liveLeaves(db: Db, userId: string) {
  const rows = await db
    .select()
    .from(approvalDoc)
    .where(and(eq(approvalDoc.formCode, LEAVE_FORM), eq(approvalDoc.drafterId, userId), isNull(approvalDoc.cancelsId), inArray(approvalDoc.status, [...LIVE])));
  return rows.map((d) => ({ doc: d, data: d.data as LeaveData }));
}

/** 연차 현황: 올해(입사일 기준 연차 연도) 생긴 일수·쓴 일수·결재 중·남은 일수 */
export async function leaveBalance(db: Db, userId: string, on = seoulDate()) {
  const p = await hiredOnOf(db, userId);
  if (!p?.hiredOn) return null;
  const pol = await loadPolicy(db, on);
  const legal = pol["hr.headcount_5plus"] === 1;
  const ent = legal ? annualEntitlement(p.hiredOn, on) : smallShopEntitlement(p.hiredOn, on, pol["leave.small_annual_days"]);
  let used = 0;
  let pending = 0;
  for (const { doc, data } of await liveLeaves(db, userId)) {
    if (!data.deduct || data.fromDate < ent.from || data.fromDate > ent.to) continue;
    if (DONE.includes(doc.status)) used += data.deduct;
    else pending += data.deduct;
  }
  return { hiredOn: p.hiredOn, ...ent, legal, used, pending, remain: ent.days - used - pending };
}

/** 근태 신청 검사: 맞으면 결재 문서에 넣을 값과 제목을 돌려준다(본인 신청·공장장 연장 지시가 같이 쓴다) */
async function prepareLeave(
  db: Db,
  userId: string,
  input: { leaveKind: string; fromDate: string; toDate: string; fromTime: string; toTime: string; reason: string },
  now: Date,
): Promise<{ data: LeaveData; title: string }> {
  if (!isLeaveKind(input.leaveKind)) throw new LeaveError("근태 종류를 골라 주세요");
  const k = LEAVE_KINDS[input.leaveKind];
  const today = seoulDate(now);
  const ot = input.leaveKind === "overtime";
  if (!ISO.test(input.fromDate)) throw new LeaveError("날짜를 골라 주세요");
  const toDate = k.unit === "day" ? input.toDate || input.fromDate : input.fromDate;
  if (!ISO.test(toDate) || toDate < input.fromDate) throw new LeaveError("끝나는 날이 시작일보다 앞섭니다");
  // 연장근무: 미리 신청이 원칙. 급하게 생긴 것은 7일 안 사후 신청('사후' 표시, 승인자가 인정 여부를 정함)
  let after = false;
  if (ot) {
    if (input.fromDate < addDaysIso(today, -OVERTIME_AFTER_DAYS)) throw new LeaveError(`연장근무는 미리 신청합니다. 급하게 한 연장은 ${OVERTIME_AFTER_DAYS}일 안에만 사후 신청할 수 있습니다`);
    after = input.fromDate < today || (input.fromDate === today && input.fromTime !== "" && input.fromTime < seoulHM(now));
  } else if (k.ahead && input.fromDate < today) throw new LeaveError(`${k.label}는 미리 신청합니다. 지난 날짜는 공장장에게 말하고 '결근'이나 '병가'로 사후 신고하세요`);
  if (!k.ahead && input.fromDate < addDaysIso(today, -LATE_REPORT_DAYS)) throw new LeaveError(`사후 신고는 ${LATE_REPORT_DAYS}일 안에 합니다`);
  if (input.leaveKind === "late" || input.leaveKind === "absent" || input.leaveKind === "punch_fix") {
    if (input.fromDate > today) throw new LeaveError(`${k.label}는 일이 생긴 뒤에 신고합니다`);
  }
  if (toDate > addDaysIso(today, 366)) throw new LeaveError("1년 안의 날짜만 신청할 수 있습니다");
  if (!input.reason.trim()) throw new LeaveError("사유를 적어 주세요");

  const prof = await hiredOnOf(db, userId);
  if (prof?.leftOn) throw new LeaveError("퇴직 처리된 직원입니다");
  const cal = await loadShopCalendar(db);
  let days = 0;
  let hours = 0;
  let fromTime = "";
  let toTime = "";
  if (k.unit === "day") {
    days = businessDaysBetween(input.fromDate, toDate, cal);
    if (!days) throw new LeaveError("고른 기간이 모두 쉬는 날입니다. 영업일을 골라 주세요");
  } else if (k.unit === "half") {
    if (!isBusinessDay(cal, input.fromDate)) throw new LeaveError("쉬는 날에는 반차를 쓰지 않습니다");
    days = 0.5;
  } else {
    const h = hoursBetween(input.fromTime, input.toTime);
    if (h == null) throw new LeaveError(input.leaveKind === "punch_fix" ? "출근(시작)·퇴근(끝) 시각을 확인해 주세요(퇴근이 출근보다 뒤)" : "시작·끝 시각을 확인해 주세요(끝이 시작보다 뒤)");
    if (h > 8 && !ot && input.leaveKind !== "punch_fix") throw new LeaveError("8시간이 넘으면 연차·결근으로 신청하세요");
    // 시간은 분 단위로 정확히(30분 반올림 없이) 남긴다
    hours = Math.round(((hm(input.toTime)! - hm(input.fromTime)!) / 60) * 100) / 100;
    fromTime = input.fromTime;
    toTime = input.toTime;
  }

  const mine = await liveLeaves(db, userId);
  // 같은 날 겹치는 휴가(하루·반나절)
  if (k.unit !== "time") {
    const clash = mine.find(({ data }) => LEAVE_KINDS[data.leaveKind as keyof typeof LEAVE_KINDS]?.unit !== "time" && data.fromDate <= toDate && input.fromDate <= data.toDate && !(k.unit === "half" && data.leaveKind.startsWith("half") && data.leaveKind !== input.leaveKind));
    if (clash) throw new LeaveError(`이미 신청한 근태와 날짜가 겹칩니다: ${clash.doc.docNo} ${leaveSummary(clash.data)}`);
  }
  if (input.leaveKind === "punch_fix") {
    const dup = mine.find(({ data }) => data.leaveKind === "punch_fix" && data.fromDate === input.fromDate);
    if (dup) throw new LeaveError(`그날 출퇴근 정정이 이미 있습니다: ${dup.doc.docNo}. 바꾸려면 그 문서를 취소하고 새로 올리세요`);
  }
  if (ot) {
    const s = hm(fromTime)!;
    const e = hm(toTime)!;
    const dup = mine.find(({ data }) => data.leaveKind === "overtime" && data.fromDate === input.fromDate && overlap({ from: s, to: e }, { from: hm(data.fromTime) ?? 0, to: hm(data.toTime) ?? 0 }) > 0);
    if (dup) throw new LeaveError(`그 시각에 이미 연장근무 신청이 있습니다: ${dup.doc.docNo} ${leaveSummary(dup.data)}`);
  }
  const deduct = k.unit === "half" ? k.deduct : k.deduct * days;
  if (k.deduct) {
    if (!prof?.hiredOn) throw new LeaveError("근로자 명부에 입사일이 없어 연차를 계산할 수 없습니다. 회계 담당에게 명부 작성을 요청하세요");
    const b = (await leaveBalance(db, userId, input.fromDate))!;
    if (b.firstYear && input.fromDate > b.to) throw new LeaveError("입사 1년 안에 생긴 연차는 1년이 되기 전에 씁니다");
    if (deduct > b.remain) throw new LeaveError(`남은 연차가 ${b.remain}일입니다(생김 ${b.days} · 씀 ${b.used} · 결재 중 ${b.pending}). ${deduct}일을 쓸 수 없습니다`);
  }
  // 주 12시간 한도: 5명 미만일 때도 지킨다(취업규칙 제15조 ③)
  if (ot) {
    const ws = weekStart(input.fromDate);
    const we = addDaysIso(ws, 6);
    const sum = mine.filter(({ data }) => data.leaveKind === "overtime" && data.fromDate >= ws && data.fromDate <= we).reduce((a, { data }) => a + data.hours, 0);
    if (sum + hours > WEEKLY_OVERTIME_MAX) throw new LeaveError(`그 주(${ws}~) 연장근무가 이미 ${sum}시간입니다. 주 ${WEEKLY_OVERTIME_MAX}시간을 넘을 수 없습니다(근로기준법 제53조, 취업규칙 제15조)`);
  }
  if (input.leaveKind === "sick" && days >= SICK_PROOF_DAYS && !/진단|소견|병원/.test(input.reason)) {
    throw new LeaveError(`병가 ${SICK_PROOF_DAYS}일 이상은 진단서를 냅니다. 사유에 '진단서 제출 예정' 등을 적어 주세요`);
  }

  const [u] = await db.select({ name: appUser.name }).from(appUser).where(eq(appUser.id, userId));
  const data: LeaveData = { leaveKind: input.leaveKind, fromDate: input.fromDate, toDate, fromTime, toTime, days, hours, deduct, reason: input.reason.trim(), ...(after ? { after: true } : {}) };
  return { data, title: `${u?.name ?? ""} ${leaveSummary(data)}` };
}

/** 근태 신청: 검사하고 결재 문서를 만들어 바로 상신한다 */
export async function requestLeave(
  db: Db,
  actor: Actor,
  input: { leaveKind: string; fromDate: string; toDate: string; fromTime: string; toTime: string; reason: string },
  now = new Date(),
): Promise<DocRow> {
  const { data, title } = await prepareLeave(db, actor.id, input, now);
  const doc = await createDraft(db, { formCode: LEAVE_FORM, title, data, drafterId: actor.id }, now);
  await submit(db, doc.id, actor.id, now);
  return doc;
}

// ── 공장장의 연장근무 지시 → 직원 동의(근로기준법 제53조 '당사자 합의') ─────────────

/** 공장장(또는 대표)이 직원에게 연장근무를 지시한다. 직원이 동의하면 상신되고, 지시한 사람이 결재 담당이면 바로 승인된다 */
export async function orderOvertime(
  db: Db,
  actor: Actor,
  input: { userId: string; fromDate: string; fromTime: string; toTime: string; reason: string },
  now = new Date(),
) {
  if (!can(actor, "leave.approve")) throw new LeaveError("연장근무 지시는 공장장·대표가 합니다");
  if (input.userId === actor.id) throw new LeaveError("본인 연장근무는 근태 신청서로 올립니다");
  const { data, title } = await prepareLeave(db, input.userId, { ...input, leaveKind: "overtime", toDate: "" }, now);
  if (data.after) throw new LeaveError("이미 지난 시각입니다. 지시는 미리 합니다. 이미 일했으면 본인이 사후 신청하게 하세요");
  const [me] = await db.select({ name: appUser.name }).from(appUser).where(eq(appUser.id, actor.id));
  const d: LeaveData = { ...data, orderedBy: actor.id, orderedByName: me?.name ?? "" };
  const doc = await createDraft(db, { formCode: LEAVE_FORM, title, data: d, drafterId: input.userId }, now);
  await notifyUser(db, input.userId, `연장근무 지시: ${leaveSummary(d)} (${d.orderedByName}). 동의하거나 거절해 주세요`, `ot-order-${doc.id}`, "/attendance");
  return doc;
}

/** 받은 연장근무 지시(아직 답하지 않은 것) */
export async function pendingOrders(db: Db, userId: string) {
  const rows = await db
    .select()
    .from(approvalDoc)
    .where(and(eq(approvalDoc.formCode, LEAVE_FORM), eq(approvalDoc.drafterId, userId), eq(approvalDoc.status, "draft"), isNull(approvalDoc.cancelsId)));
  return rows.map((d) => ({ doc: d, data: d.data as LeaveData })).filter((r) => r.data.orderedBy);
}

/** 직원이 지시에 답한다. 동의 → 상신(지시한 사람이 결재 담당이면 바로 승인), 거절 → 버리고 지시한 사람에게 알림 */
export async function answerOrder(db: Db, actor: Actor, docId: string, agree: boolean, note: string, now = new Date()) {
  const [doc] = await db.select().from(approvalDoc).where(eq(approvalDoc.id, docId));
  const data = doc?.data as LeaveData | undefined;
  if (!doc || doc.formCode !== LEAVE_FORM || !data?.orderedBy) throw new LeaveError("없는 연장근무 지시입니다");
  if (doc.drafterId !== actor.id) throw new LeaveError("지시받은 본인만 답할 수 있습니다");
  if (doc.status !== "draft") throw new LeaveError("이미 답한 지시입니다");
  if (!agree) {
    if (!note.trim()) throw new LeaveError("거절하는 이유를 적어 주세요");
    await withdrawAndDiscard(db, doc.id, actor.id, now);
    await notifyUser(db, data.orderedBy, `연장근무 지시 거절: ${doc.title} — ${note.trim()}`, `ot-no-${doc.id}`, "/attendance");
    return "declined" as const;
  }
  if (data.fromDate < seoulDate(now) || (data.fromDate === seoulDate(now) && data.fromTime < seoulHM(now)))
    throw new LeaveError("지시한 시각이 지났습니다. 이미 일했으면 '연장근무'를 사후 신청하세요");
  await submit(db, doc.id, actor.id, now);
  try {
    await act(db, doc.id, data.orderedBy, "approve", "지시한 연장근무(본인 동의)", now);
    return "approved" as const;
  } catch {
    return "submitted" as const; // 지시한 사람이 이 단계 담당이 아니면 결재선대로 기다린다
  }
}

/** 근태 목록: 본인 것, 또는(대표·공장장·회계) 모두. 기간은 시작일 기준 */
export async function listLeaves(db: Db, actor: Actor, opts: { all?: boolean; from?: string; to?: string } = {}) {
  const all = opts.all && canSeeTeamLeave(actor);
  const rows = await db
    .select({ doc: approvalDoc, name: appUser.name })
    .from(approvalDoc)
    .leftJoin(appUser, eq(appUser.id, approvalDoc.drafterId))
    .where(and(eq(approvalDoc.formCode, LEAVE_FORM), isNull(approvalDoc.cancelsId), all ? undefined : eq(approvalDoc.drafterId, actor.id)))
    .orderBy(desc(approvalDoc.createdAt))
    .limit(300);
  return rows
    .map((r) => ({ ...r, data: r.doc.data as LeaveData }))
    .filter((r) => (!opts.from || r.data.toDate >= opts.from) && (!opts.to || r.data.fromDate <= opts.to));
}

// ── 재직증명서 ─────────────────────────────────────────────

export type CertData = { purpose: string; submitTo: string; copies: number };
export const CERT_PURPOSES = ["금융기관 제출", "관공서 제출", "비자·출입국", "학교 제출", "개인 보관"];

export async function requestCertificate(db: Db, actor: Actor, input: { purpose: string; submitTo: string; copies: number }, now = new Date()) {
  const prof = await hiredOnOf(db, actor.id);
  if (!prof?.hiredOn) throw new LeaveError("근로자 명부에 입사일이 없어 재직증명서를 만들 수 없습니다. 회계 담당에게 명부 작성을 요청하세요");
  if (prof.leftOn) throw new LeaveError("퇴직한 직원은 경력증명서로 발급합니다(대표에게 요청)");
  if (!input.purpose.trim()) throw new LeaveError("용도를 적어 주세요");
  if (!Number.isInteger(input.copies) || input.copies < 1 || input.copies > 5) throw new LeaveError("부수는 1~5부입니다");
  const [u] = await db.select({ name: appUser.name }).from(appUser).where(eq(appUser.id, actor.id));
  const data: CertData = { purpose: input.purpose.trim(), submitTo: input.submitTo.trim(), copies: input.copies };
  const doc = await createDraft(db, { formCode: CERT_FORM, title: `재직증명서 ${u?.name ?? ""} (${data.purpose})`, data, drafterId: actor.id }, now);
  await submit(db, doc.id, actor.id, now);
  return doc;
}

export async function listCertificates(db: Db, actor: Actor) {
  const all = can(actor, "cert.all");
  return db
    .select({ doc: approvalDoc, name: appUser.name })
    .from(approvalDoc)
    .leftJoin(appUser, eq(appUser.id, approvalDoc.drafterId))
    .where(and(eq(approvalDoc.formCode, CERT_FORM), isNull(approvalDoc.cancelsId), all ? undefined : eq(approvalDoc.drafterId, actor.id)))
    .orderBy(desc(approvalDoc.createdAt))
    .limit(100);
}

/** 인쇄용: 확정된 신청서만, 본인·대표·회계만 */
export async function certificateView(db: Db, actor: Actor, docId: string) {
  const [d] = await db.select().from(approvalDoc).where(and(eq(approvalDoc.id, docId), eq(approvalDoc.formCode, CERT_FORM)));
  if (!d) throw new LeaveError("없는 신청서입니다");
  const staff = can(actor, "cert.all");
  if (d.drafterId !== actor.id && !staff) throw new LeaveError("본인과 대표·회계 담당만 볼 수 있습니다");
  if (!DONE.includes(d.status) || !d.confirmedAt) throw new LeaveError("대표 승인 뒤에 인쇄할 수 있습니다");
  return { doc: d, data: d.data as CertData, issuedOn: seoulDate(d.confirmedAt) };
}
