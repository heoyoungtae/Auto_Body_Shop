// 근태·휴가·연장근로 신청서(F-11-04, STD-11 4절)와 재직증명서 발급 신청.
// 신청은 전자결재 문서로 올리고(별도 표 없음), 연차 사용량·주 연장근로는 확정·진행 중 문서에서 센다.
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import type { Db } from "@/db/client";
import { appUser, approvalDoc, staffProfile } from "@/db/schema";
import { createDraft, submit, type DocRow } from "@/modules/approval/service";
import type { Role } from "@/modules/auth/roles";
import { loadShopCalendar } from "@/modules/platform/calendar";
import { UserError } from "@/modules/platform/errors";
import { seoulDate } from "@/modules/platform/time";
import { addDaysIso, annualEntitlement, businessDaysBetween, hoursBetween, isLeaveKind, LATE_REPORT_DAYS, LEAVE_KINDS, leaveSummary, SICK_PROOF_DAYS, weekStart, WEEKLY_OVERTIME_MAX } from "./leave-rules";
import { isBusinessDay } from "@/modules/platform/business-days";

export class LeaveError extends UserError {}
type Actor = { id: string; roles: Role[] };
const ISO = /^\d{4}-\d{2}-\d{2}$/;
export const LEAVE_FORM = "F-11-04";
export const CERT_FORM = "HR-CERT";
const LIVE = ["draft", "in_progress", "confirmed", "checked"] as const;
const DONE = ["confirmed", "checked"];

export type LeaveData = { leaveKind: string; fromDate: string; toDate: string; fromTime: string; toTime: string; days: number; hours: number; deduct: number; reason: string };
export const canSeeTeamLeave = (a: Actor) => a.roles.some((r) => r === "owner" || r === "plant_manager" || r === "accounting");

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
  const ent = annualEntitlement(p.hiredOn, on);
  let used = 0;
  let pending = 0;
  for (const { doc, data } of await liveLeaves(db, userId)) {
    if (!data.deduct || data.fromDate < ent.from || data.fromDate > ent.to) continue;
    if (DONE.includes(doc.status)) used += data.deduct;
    else pending += data.deduct;
  }
  return { hiredOn: p.hiredOn, ...ent, used, pending, remain: ent.days - used - pending };
}

/** 근태 신청: 검사하고 결재 문서를 만들어 바로 상신한다 */
export async function requestLeave(
  db: Db,
  actor: Actor,
  input: { leaveKind: string; fromDate: string; toDate: string; fromTime: string; toTime: string; reason: string },
  now = new Date(),
): Promise<DocRow> {
  if (!isLeaveKind(input.leaveKind)) throw new LeaveError("근태 종류를 골라 주세요");
  const k = LEAVE_KINDS[input.leaveKind];
  const today = seoulDate(now);
  if (!ISO.test(input.fromDate)) throw new LeaveError("날짜를 골라 주세요");
  const toDate = k.unit === "day" ? input.toDate || input.fromDate : input.fromDate;
  if (!ISO.test(toDate) || toDate < input.fromDate) throw new LeaveError("끝나는 날이 시작일보다 앞섭니다");
  if (k.ahead && input.fromDate < today) throw new LeaveError(`${k.label}는 미리 신청합니다. 지난 날짜는 공장장에게 말하고 '결근'이나 '병가'로 사후 신고하세요`);
  if (!k.ahead && input.fromDate < addDaysIso(today, -LATE_REPORT_DAYS)) throw new LeaveError(`사후 신고는 ${LATE_REPORT_DAYS}일 안에 합니다`);
  if (input.leaveKind === "late" || input.leaveKind === "absent") {
    if (input.fromDate > today) throw new LeaveError(`${k.label}는 일이 생긴 뒤에 신고합니다`);
  }
  if (toDate > addDaysIso(today, 366)) throw new LeaveError("1년 안의 날짜만 신청할 수 있습니다");
  if (!input.reason.trim()) throw new LeaveError("사유를 적어 주세요");

  const prof = await hiredOnOf(db, actor.id);
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
    if (h == null) throw new LeaveError("시작·끝 시각을 확인해 주세요(끝이 시작보다 뒤)");
    if (h > 8 && input.leaveKind !== "overtime") throw new LeaveError("8시간이 넘으면 연차·결근으로 신청하세요");
    hours = h;
    fromTime = input.fromTime;
    toTime = input.toTime;
  }

  const mine = await liveLeaves(db, actor.id);
  // 같은 날 겹치는 휴가(하루·반나절)
  if (k.unit !== "time") {
    const clash = mine.find(({ data }) => LEAVE_KINDS[data.leaveKind as keyof typeof LEAVE_KINDS]?.unit !== "time" && data.fromDate <= toDate && input.fromDate <= data.toDate && !(k.unit === "half" && data.leaveKind.startsWith("half") && data.leaveKind !== input.leaveKind));
    if (clash) throw new LeaveError(`이미 신청한 근태와 날짜가 겹칩니다: ${clash.doc.docNo} ${leaveSummary(clash.data)}`);
  }
  const deduct = k.unit === "half" ? k.deduct : k.deduct * days;
  if (k.deduct) {
    if (!prof?.hiredOn) throw new LeaveError("근로자 명부에 입사일이 없어 연차를 계산할 수 없습니다. 회계 담당에게 명부 작성을 요청하세요");
    const b = (await leaveBalance(db, actor.id, input.fromDate))!;
    if (b.firstYear && input.fromDate > b.to) throw new LeaveError("입사 1년 안에 생긴 연차는 1년이 되기 전에 씁니다");
    if (deduct > b.remain) throw new LeaveError(`남은 연차가 ${b.remain}일입니다(생김 ${b.days} · 씀 ${b.used} · 결재 중 ${b.pending}). ${deduct}일을 쓸 수 없습니다`);
  }
  if (input.leaveKind === "overtime") {
    const ws = weekStart(input.fromDate);
    const we = addDaysIso(ws, 6);
    const sum = mine.filter(({ data }) => data.leaveKind === "overtime" && data.fromDate >= ws && data.fromDate <= we).reduce((a, { data }) => a + data.hours, 0);
    if (sum + hours > WEEKLY_OVERTIME_MAX) throw new LeaveError(`그 주(${ws}~) 연장근무가 이미 ${sum}시간입니다. 주 ${WEEKLY_OVERTIME_MAX}시간을 넘을 수 없습니다(근로기준법 제53조)`);
  }
  if (input.leaveKind === "sick" && days >= SICK_PROOF_DAYS && !/진단|소견|병원/.test(input.reason)) {
    throw new LeaveError(`병가 ${SICK_PROOF_DAYS}일 이상은 진단서를 냅니다. 사유에 '진단서 제출 예정' 등을 적어 주세요`);
  }

  const [u] = await db.select({ name: appUser.name }).from(appUser).where(eq(appUser.id, actor.id));
  const data: LeaveData = { leaveKind: input.leaveKind, fromDate: input.fromDate, toDate, fromTime, toTime, days, hours, deduct, reason: input.reason.trim() };
  const doc = await createDraft(db, { formCode: LEAVE_FORM, title: `${u?.name ?? ""} ${leaveSummary(data)}`, data, drafterId: actor.id }, now);
  await submit(db, doc.id, actor.id, now);
  return doc;
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
  const all = actor.roles.some((r) => r === "owner" || r === "accounting");
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
  const staff = actor.roles.some((r) => r === "owner" || r === "accounting");
  if (d.drafterId !== actor.id && !staff) throw new LeaveError("본인과 대표·회계 담당만 볼 수 있습니다");
  if (!DONE.includes(d.status) || !d.confirmedAt) throw new LeaveError("대표 승인 뒤에 인쇄할 수 있습니다");
  return { doc: d, data: d.data as CertData, issuedOn: seoulDate(d.confirmedAt) };
}
