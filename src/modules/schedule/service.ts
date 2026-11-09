// 일정표(사용자 지시 2026-11-09): 사내 공용 일정·개인 일정을 나눠 올리고, 다른 업무 기록의 날짜(입고 예약·출고 약속·휴가·점검 기한…)를 자동 일정으로 함께 보여 준다.
// 공용 일정: 권한표 '공용 일정 올리기' 역할이 올리고 모든 직원이 본다. 고치기·취소는 올린 사람과 대표.
// 개인 일정: 누구나 자기 것만 올리고 본인만 본다(대표도 남의 개인 일정은 못 본다).
import { and, eq, gte, inArray, isNotNull, isNull, lte, ne, notInArray, or } from "drizzle-orm";
import type { Db } from "@/db/client";
import { appUser, approvalDoc, consultation, equipment, instruction, instructionTask, lubePoint, nonconformance, outsourceJob, pmItem, pmTask, purchaseOrder, repairOrder, scheduleEvent, supplier, vehicle, workOrder } from "@/db/schema";
import { can } from "@/modules/auth/permissions";
import type { Role } from "@/modules/auth/roles";
import { writeAudit } from "@/modules/platform/audit";
import { KR_PUBLIC_HOLIDAYS } from "@/modules/platform/business-days";
import { loadShopCalendar } from "@/modules/platform/calendar";
import { UserError } from "@/modules/platform/errors";
import { notifyUser } from "@/modules/platform/notify";
import { addDays, seoulDate } from "@/modules/platform/time";
import { LEAVE_KINDS } from "@/modules/staff/leave-rules";
import { AUTO_KINDS, AUTO_TONE, eventIssues, KINDS, LAYER_TONE, occurrences, type AutoKind, type EventInput, type Kind, type Layer, type Tone } from "./rules";

export class ScheduleError extends UserError {}
type Actor = { id: string; roles: Role[] };
const clean = (s: string | null | undefined) => (s ?? "").trim() || null;

export const canPostShop = (a: Actor) => can(a, "schedule.shop");

/** 달력 한 칸에 놓을 항목 */
export type CalItem = {
  key: string;
  layer: Layer;
  /** 직접 올린 일정은 KINDS, 자동은 AUTO_KINDS */
  kind: string;
  kindLabel: string;
  title: string;
  date: string;
  endDate: string;
  startTime: string | null;
  endTime: string | null;
  href: string | null;
  tone: Tone;
  /** 공용 일정에서 내가 참석자인지(전 직원 대상이면 true) */
  forMe?: boolean;
  place?: string | null;
};

type Ev = typeof scheduleEvent.$inferSelect;

async function eventRow(db: Db, id: string) {
  const [e] = await db.select().from(scheduleEvent).where(eq(scheduleEvent.id, id));
  if (!e) throw new ScheduleError("일정을 찾을 수 없습니다");
  return e;
}

function canSee(a: Actor, e: Ev) {
  return e.scope === "shop" || e.ownerId === a.id;
}

export function canEdit(a: Actor, e: Ev) {
  if (e.cancelledAt) return false;
  if (e.scope === "personal") return e.ownerId === a.id;
  return e.ownerId === a.id || a.roles.includes("owner");
}

async function checkAttendees(db: Db, ids: string[]) {
  const uniq = [...new Set(ids.filter(Boolean))];
  if (!uniq.length) return [];
  const rows = await db.select({ id: appUser.id }).from(appUser).where(and(inArray(appUser.id, uniq), eq(appUser.active, true)));
  if (rows.length !== uniq.length) throw new ScheduleError("참석자 중 퇴사했거나 없는 직원이 있습니다");
  return uniq;
}

function values(i: EventInput) {
  const endOn = i.endOn || i.startOn;
  return {
    scope: i.scope,
    kind: i.kind,
    title: i.title.trim(),
    startOn: i.startOn,
    endOn,
    startTime: clean(i.startTime),
    endTime: i.startTime ? clean(i.endTime) : null,
    place: clean(i.place),
    note: clean(i.note),
    repeat: i.repeat,
    repeatUntil: i.repeat === "none" ? null : clean(i.repeatUntil),
    remindDays: i.remindDays === "" ? null : Number(i.remindDays),
  };
}

/** 새 일정 */
export async function createEvent(db: Db, actor: Actor, input: EventInput, now = new Date()) {
  const issues = eventIssues(input);
  if (issues.length) throw new ScheduleError(issues[0]);
  if (input.scope === "shop" && !canPostShop(actor)) throw new ScheduleError("사내 공용 일정은 권한표 '공용 일정 올리기' 역할이 올립니다. 개인 일정으로 올리거나 공장장에게 부탁하세요");
  const attendeeIds = input.scope === "shop" ? await checkAttendees(db, input.attendeeIds) : [];
  const [e] = await db
    .insert(scheduleEvent)
    .values({ ...values(input), attendeeIds, ownerId: actor.id, createdAt: now, updatedAt: now })
    .returning({ id: scheduleEvent.id });
  if (input.scope === "shop") {
    await writeAudit(db, { actorId: actor.id, action: "schedule.create", entityType: "schedule_event", entityId: e.id, after: { title: input.title, startOn: input.startOn } });
    const to = attendeeIds.length ? attendeeIds : (await db.select({ id: appUser.id }).from(appUser).where(eq(appUser.active, true))).map((u) => u.id);
    for (const uid of to.filter((x) => x !== actor.id)) await notifyUser(db, uid, `새 공용 일정 ${input.startOn} ${input.title.trim()}`, `sch-new-${e.id}-${uid}`, `/schedule/${e.id}`);
  }
  return e.id;
}

/** 고치기(공용·개인 구분은 바꾸지 않는다) */
export async function updateEvent(db: Db, actor: Actor, id: string, input: Omit<EventInput, "scope">, now = new Date()) {
  const e = await eventRow(db, id);
  if (!canEdit(actor, e)) throw new ScheduleError(e.cancelledAt ? "취소한 일정입니다" : e.scope === "personal" ? "남의 개인 일정입니다" : "공용 일정은 올린 사람이나 대표가 고칩니다");
  const full = { ...input, scope: e.scope };
  const issues = eventIssues(full);
  if (issues.length) throw new ScheduleError(issues[0]);
  const attendeeIds = e.scope === "shop" ? await checkAttendees(db, input.attendeeIds) : [];
  const v = values(full);
  await db.update(scheduleEvent).set({ ...v, attendeeIds, updatedBy: actor.id, updatedAt: now }).where(eq(scheduleEvent.id, id));
  if (e.scope === "shop") {
    await writeAudit(db, { actorId: actor.id, action: "schedule.update", entityType: "schedule_event", entityId: id, before: { title: e.title, startOn: e.startOn, startTime: e.startTime }, after: { title: v.title, startOn: v.startOn, startTime: v.startTime } });
    if (e.startOn !== v.startOn || e.startTime !== v.startTime || e.place !== v.place) {
      const to = attendeeIds.length ? attendeeIds : (await db.select({ id: appUser.id }).from(appUser).where(eq(appUser.active, true))).map((u) => u.id);
      for (const uid of to.filter((x) => x !== actor.id)) await notifyUser(db, uid, `공용 일정 바뀜: ${v.title} → ${v.startOn} ${v.startTime ?? "종일"}${v.place ? ` · ${v.place}` : ""}`, `sch-upd-${id}-${now.getTime()}-${uid}`, `/schedule/${id}`);
    }
  }
}

/** 취소(지우지 않고 취소 표시) */
export async function cancelEvent(db: Db, actor: Actor, id: string, reason: string, now = new Date()) {
  const e = await eventRow(db, id);
  if (!canEdit(actor, e)) throw new ScheduleError(e.cancelledAt ? "이미 취소한 일정입니다" : "취소할 수 없는 일정입니다");
  if (e.scope === "shop" && !reason.trim()) throw new ScheduleError("공용 일정은 취소 이유를 적어 주세요(참석자에게 알림이 갑니다)");
  await db.update(scheduleEvent).set({ cancelledAt: now, cancelledBy: actor.id, cancelReason: clean(reason), updatedAt: now }).where(eq(scheduleEvent.id, id));
  if (e.scope === "shop") {
    await writeAudit(db, { actorId: actor.id, action: "schedule.cancel", entityType: "schedule_event", entityId: id, after: { reason } });
    const to = e.attendeeIds.length ? e.attendeeIds : (await db.select({ id: appUser.id }).from(appUser).where(eq(appUser.active, true))).map((u) => u.id);
    for (const uid of to.filter((x) => x !== actor.id)) await notifyUser(db, uid, `공용 일정 취소: ${e.startOn} ${e.title}(${reason.trim()})`, `sch-cancel-${id}-${uid}`, `/schedule/${id}`);
  }
}

export async function getEvent(db: Db, actor: Actor, id: string) {
  const e = await eventRow(db, id);
  if (!canSee(actor, e)) throw new ScheduleError("남의 개인 일정은 볼 수 없습니다");
  const ids = [...new Set([e.ownerId, e.updatedBy, e.cancelledBy, ...e.attendeeIds].filter((x): x is string => !!x))];
  const users = ids.length ? await db.select({ id: appUser.id, name: appUser.name }).from(appUser).where(inArray(appUser.id, ids)) : [];
  const name = (uid: string | null) => users.find((u) => u.id === uid)?.name ?? "-";
  return { e, name, attendees: e.attendeeIds.map(name), editable: canEdit(actor, e) };
}

// ── 달력에 놓을 항목 모으기 ──

function evItems(rows: Ev[], actor: Actor, from: string, to: string): CalItem[] {
  const out: CalItem[] = [];
  for (const e of rows) {
    const span = Math.round((Date.parse(e.endOn) - Date.parse(e.startOn)) / 864e5);
    for (const d of occurrences(e, from, to)) {
      const layer: Layer = e.scope === "shop" ? "shop" : "mine";
      out.push({
        key: `${e.id}-${d}`,
        layer,
        kind: e.kind,
        kindLabel: KINDS[e.kind as Kind] ?? e.kind,
        title: e.title,
        date: d,
        endDate: addDays(d, span),
        startTime: e.startTime,
        endTime: e.endTime,
        href: `/schedule/${e.id}`,
        tone: e.kind === "off" ? "danger" : LAYER_TONE[layer],
        forMe: e.scope === "shop" ? !e.attendeeIds.length || e.attendeeIds.includes(actor.id) : true,
        place: e.place,
      });
    }
  }
  return out;
}

const auto = (kind: AutoKind, key: string, date: string, title: string, href: string | null, extra: Partial<CalItem> = {}): CalItem => ({
  key: `${kind}-${key}`,
  layer: "auto",
  kind,
  kindLabel: AUTO_KINDS[kind],
  title,
  date,
  endDate: extra.endDate ?? date,
  startTime: null,
  endTime: null,
  href,
  tone: AUTO_TONE[kind] ?? "neutral",
  ...extra,
});

const hm = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hour12: false });

/** 다른 화면 기록의 날짜. 볼 권한이 있는 것만 */
export async function autoItems(db: Db, actor: Actor, from: string, to: string, now = new Date()): Promise<CalItem[]> {
  const out: CalItem[] = [];
  // 공휴일·가게 휴무일(설정 › 영업일·휴무일)
  const cal = await loadShopCalendar(db);
  for (const [d, name] of Object.entries(KR_PUBLIC_HOLIDAYS)) {
    if (d < from || d > to) continue;
    const own = cal.days[d];
    if (own?.kind === "open") out.push(auto("holiday", d, d, `${name}(특별 영업)`, null, { tone: "neutral" }));
    else if (cal.excludeHolidays) out.push(auto("holiday", d, d, name, null));
  }
  for (const [d, v] of Object.entries(cal.days)) {
    if (d < from || d > to || KR_PUBLIC_HOLIDAYS[d]) continue;
    if (v.kind === "open") out.push(auto("holiday", d, d, `${v.name || "특별 영업일"}`, null, { tone: "neutral" }));
    else out.push(auto("holiday", d, d, v.name || "가게 휴무", null));
  }

  const fromTs = new Date(`${from}T00:00:00+09:00`);
  const toTs = new Date(`${addDays(to, 1)}T00:00:00+09:00`);

  // 입고 예약(STD-01): 상담·수리 담당
  if (can(actor, "consult.write") || can(actor, "repair.write") || can(actor, "work.assign")) {
    const rows = await db
      .select({ id: consultation.id, docNo: consultation.docNo, at: consultation.reservedAt, plate: vehicle.plateNo })
      .from(consultation)
      .leftJoin(vehicle, eq(vehicle.id, consultation.vehicleId))
      .where(and(eq(consultation.result, "reserved"), isNotNull(consultation.reservedAt), gte(consultation.reservedAt, fromTs), lte(consultation.reservedAt, toTs)));
    for (const r of rows) {
      if (!r.at) continue;
      const d = seoulDate(r.at);
      if (d < from || d > to) continue;
      out.push(auto("reservation", r.id, d, `입고 예약 ${r.plate ?? r.docNo}`, `/consults/${r.id}`, { startTime: hm.format(r.at) }));
    }
  }

  // 출고 약속(작업 지시서의 출고 예정일)
  if (can(actor, "repair.write") || can(actor, "work.assign") || can(actor, "work.do")) {
    const rows = await db
      .select({ roId: repairOrder.id, roNo: repairOrder.docNo, due: workOrder.dueDate, plate: vehicle.plateNo })
      .from(workOrder)
      .innerJoin(repairOrder, eq(repairOrder.id, workOrder.repairOrderId))
      .leftJoin(vehicle, eq(vehicle.id, repairOrder.vehicleId))
      .where(and(isNotNull(workOrder.dueDate), gte(workOrder.dueDate, from), lte(workOrder.dueDate, to), notInArray(repairOrder.status, ["delivered", "cancelled"])));
    const seen = new Set<string>();
    for (const r of rows) {
      if (!r.due || seen.has(r.roId)) continue;
      seen.add(r.roId);
      out.push(auto("delivery", r.roId, r.due, `출고 약속 ${r.plate ?? r.roNo}`, `/repairs/${r.roId}`));
    }
  }

  // 휴가·근태(결재 끝난 것). 전체는 '직원 근태 전체 보기' 권한, 아니면 내 것만
  {
    const team = can(actor, "leave.team");
    const rows = await db
      .select({ id: approvalDoc.id, data: approvalDoc.data, drafterId: approvalDoc.drafterId, name: appUser.name })
      .from(approvalDoc)
      .leftJoin(appUser, eq(appUser.id, approvalDoc.drafterId))
      .where(and(eq(approvalDoc.formCode, "F-11-04"), inArray(approvalDoc.status, ["confirmed", "checked"]), isNull(approvalDoc.cancelsId), team ? undefined : eq(approvalDoc.drafterId, actor.id)));
    for (const r of rows) {
      const d = r.data as { leaveKind?: string; fromDate?: string; toDate?: string; fromTime?: string; toTime?: string };
      if (!d.fromDate) continue;
      const end = d.toDate || d.fromDate;
      if (end < from || d.fromDate > to) continue;
      const label = LEAVE_KINDS[d.leaveKind as keyof typeof LEAVE_KINDS]?.label ?? "휴가";
      out.push(auto("leave", r.id, d.fromDate, `${r.drafterId === actor.id ? "나" : (r.name ?? "")} ${label}`, `/approvals/${r.id}`, { endDate: end, startTime: d.fromTime || null, endTime: d.toTime || null }));
    }
  }

  // 업무지시 기한: 내가 받은 것(아직 보고 전)과 내가 내린 것
  {
    const rows = await db
      .select({ i: instruction, status: instructionTask.status, assigneeId: instructionTask.assigneeId })
      .from(instructionTask)
      .innerJoin(instruction, eq(instruction.id, instructionTask.instructionId))
      .where(and(gte(instruction.dueOn, from), lte(instruction.dueOn, to), or(eq(instructionTask.assigneeId, actor.id), eq(instruction.issuedBy, actor.id))));
    const seen = new Set<string>();
    for (const r of rows) {
      const mine = r.assigneeId === actor.id;
      if (mine && r.status !== "open") continue;
      if (seen.has(r.i.id)) continue;
      seen.add(r.i.id);
      out.push(auto("task", r.i.id, r.i.dueOn, `${mine ? "" : "(지시함) "}${r.i.title}`, `/tasks/${r.i.id}`, { tone: r.i.urgent ? "danger" : "neutral" }));
    }
  }

  // 설비: 법정 검사·교정·윤활·예방정비
  if (can(actor, "equip.check")) {
    const eqs = await db.select({ id: equipment.id, no: equipment.no, name: equipment.name, legalKind: equipment.legalKind, legalNextOn: equipment.legalNextOn, calibNextOn: equipment.calibNextOn }).from(equipment).where(ne(equipment.status, "disposed"));
    for (const e of eqs) {
      if (e.legalNextOn && e.legalNextOn >= from && e.legalNextOn <= to) out.push(auto("legal", e.id, e.legalNextOn, `${e.legalKind ?? "법정 검사"} ${e.name}`, `/equipment/${e.id}`));
      if (e.calibNextOn && e.calibNextOn >= from && e.calibNextOn <= to) out.push(auto("calib", e.id, e.calibNextOn, `교정 ${e.name}`, `/equipment/${e.id}`));
    }
    const lubes = await db
      .select({ id: lubePoint.id, code: lubePoint.code, spot: lubePoint.spot, due: lubePoint.nextDueOn, eqName: equipment.name, eqId: equipment.id })
      .from(lubePoint)
      .innerJoin(equipment, eq(equipment.id, lubePoint.equipmentId))
      .where(and(eq(lubePoint.active, true), gte(lubePoint.nextDueOn, from), lte(lubePoint.nextDueOn, to)));
    for (const l of lubes) out.push(auto("lube", l.id, l.due, `윤활 ${l.eqName} ${l.spot}`, "/equipment/lube"));
    const pms = await db
      .select({ id: pmTask.id, due: pmTask.dueOn, task: pmItem.task, eqName: equipment.name })
      .from(pmTask)
      .innerJoin(pmItem, eq(pmItem.id, pmTask.itemId))
      .innerJoin(equipment, eq(equipment.id, pmItem.equipmentId))
      .where(and(isNull(pmTask.doneOn), gte(pmTask.dueOn, from), lte(pmTask.dueOn, to)));
    for (const p of pms) out.push(auto("pm", p.id, p.due, `예방정비 ${p.eqName} ${p.task}`, "/equipment/pm"));
  }

  // 시정 조치 기한: 품질 담당·대표·공장장은 전부, 그 밖은 내가 맡은 것
  {
    const all = actor.roles.some((r) => r === "owner" || r === "quality" || r === "plant_manager");
    const rows = await db
      .select({ id: nonconformance.id, docNo: nonconformance.docNo, due: nonconformance.dueOn })
      .from(nonconformance)
      .where(and(isNotNull(nonconformance.dueOn), gte(nonconformance.dueOn, from), lte(nonconformance.dueOn, to), ne(nonconformance.status, "closed"), ne(nonconformance.status, "done"), all ? undefined : eq(nonconformance.assigneeId, actor.id)));
    for (const r of rows) if (r.due) out.push(auto("nc", r.id, r.due, `시정 조치 ${r.docNo}`, `/nc/${r.id}`));
  }

  // 발주 납기·외주 납기
  if (can(actor, "purchase.order") || can(actor, "purchase.receive")) {
    const rows = await db
      .select({ id: purchaseOrder.id, docNo: purchaseOrder.docNo, due: purchaseOrder.dueOn, sup: supplier.name })
      .from(purchaseOrder)
      .leftJoin(supplier, eq(supplier.id, purchaseOrder.supplierId))
      .where(and(isNotNull(purchaseOrder.dueOn), gte(purchaseOrder.dueOn, from), lte(purchaseOrder.dueOn, to), inArray(purchaseOrder.status, ["approved", "sent", "partial"])));
    for (const r of rows) if (r.due) out.push(auto("po", r.id, r.due, `입고 예정 ${r.docNo}${r.sup ? ` ${r.sup}` : ""}`, `/purchases/${r.id}`));
  }
  if (can(actor, "purchase.order") || can(actor, "outsource.notice")) {
    const rows = await db
      .select({ id: outsourceJob.id, docNo: outsourceJob.docNo, due: outsourceJob.dueOn, sup: supplier.name })
      .from(outsourceJob)
      .leftJoin(supplier, eq(supplier.id, outsourceJob.supplierId))
      .where(and(isNotNull(outsourceJob.dueOn), gte(outsourceJob.dueOn, from), lte(outsourceJob.dueOn, to), inArray(outsourceJob.status, ["approved", "requested", "out"])));
    for (const r of rows) if (r.due) out.push(auto("outsource", r.id, r.due, `외주 완료 예정 ${r.docNo}${r.sup ? ` ${r.sup}` : ""}`, `/outsource/${r.id}`));
  }
  void now;
  return out;
}

/** [from, to] 기간 항목. layers 로 공용·내 일정·자동을 고른다 */
export async function listRange(db: Db, actor: Actor, from: string, to: string, layers: Layer[] = ["shop", "mine", "auto"], now = new Date()): Promise<CalItem[]> {
  const out: CalItem[] = [];
  const scopes = [...(layers.includes("shop") ? ["shop"] : []), ...(layers.includes("mine") ? ["personal"] : [])];
  if (scopes.length) {
    const rows = await db
      .select()
      .from(scheduleEvent)
      .where(
        and(
          isNull(scheduleEvent.cancelledAt),
          lte(scheduleEvent.startOn, to),
          or(
            layers.includes("shop") ? eq(scheduleEvent.scope, "shop") : undefined,
            layers.includes("mine") ? and(eq(scheduleEvent.scope, "personal"), eq(scheduleEvent.ownerId, actor.id)) : undefined,
          ),
        ),
      );
    out.push(...evItems(rows, actor, from, to));
  }
  if (layers.includes("auto")) out.push(...(await autoItems(db, actor, from, to, now)));
  return out.sort((a, b) => a.date.localeCompare(b.date) || (a.kind === "holiday" ? -1 : b.kind === "holiday" ? 1 : 0) || (a.startTime ?? "").localeCompare(b.startTime ?? "") || a.title.localeCompare(b.title));
}

/** 그날에 걸친 항목(여러 날 일정 포함) */
export const itemsOn = (items: CalItem[], d: string) => items.filter((i) => i.date <= d && i.endDate >= d);

/** 대시보드·내 할 일용: 오늘과 내일 내 일정(공용 중 나 대상 + 개인) */
export async function upcomingForMe(db: Db, actor: Actor, now = new Date()) {
  const today = seoulDate(now);
  const items = await listRange(db, actor, today, addDays(today, 1), ["shop", "mine"], now);
  return items.filter((i) => i.forMe);
}

/** 매일 아침: '며칠 전 알림'을 정한 일정 알림 */
export async function scheduleDailyAlerts(db: Db, now = new Date()) {
  const today = seoulDate(now);
  const rows = await db.select().from(scheduleEvent).where(and(isNull(scheduleEvent.cancelledAt), isNotNull(scheduleEvent.remindDays), lte(scheduleEvent.startOn, addDays(today, 7))));
  const everyone = (await db.select({ id: appUser.id }).from(appUser).where(eq(appUser.active, true))).map((u) => u.id);
  let n = 0;
  for (const e of rows) {
    const target = addDays(today, e.remindDays ?? 0);
    if (!occurrences(e, target, target).includes(target)) continue;
    const to = e.scope === "personal" ? [e.ownerId] : e.attendeeIds.length ? e.attendeeIds : everyone;
    const when = e.remindDays === 0 ? "오늘" : `${e.remindDays}일 뒤(${target})`;
    for (const uid of to) await notifyUser(db, uid, `${when} ${e.startTime ?? ""} ${e.title}${e.place ? ` · ${e.place}` : ""}`.replace(/\s+/g, " "), `sch-remind-${e.id}-${target}-${uid}`, `/schedule/${e.id}`);
    n++;
  }
  return `일정 알림 ${n}건`;
}
