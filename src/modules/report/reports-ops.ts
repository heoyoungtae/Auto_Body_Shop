// 재고·구매, 인사·안전·설비 보고서: 구매·협력업체 실적, 인력·근태·교육, 안전·환경, 설비.
// 재고현황·수불부·회전율은 reports-stock.ts.
import { and, eq, gte, inArray, isNotNull, isNull, lt, lte, ne } from "drizzle-orm";
import {
  appUser,
  approvalDoc,
  equipment,
  equipmentCheck,
  equipmentFailure,
  hazardRow,
  incident,
  outsourceJob,
  payrollRun,
  pmTask,
  purchaseOrder,
  purchaseReceipt,
  supplier,
  supplierEval,
  training,
  trainingAttendee,
  wasteLog,
  workDay,
} from "@/db/schema";
import { can } from "@/modules/auth/permissions";
import { rangeSummary } from "@/modules/money/close";
import { addDays } from "@/modules/platform/time";
import { WASTE_ITEMS } from "@/modules/safety/env-rules";
import { INC_KIND, INC_SEVERITY } from "@/modules/safety/rules";
import { LEAVE_FORM, type LeaveData } from "@/modules/staff/attendance";
import { LEAVE_KINDS } from "@/modules/staff/leave-rules";
import { type Builder, type Row, both, daysBetween, groupBy, m, pct, round1, sum, tsRange } from "./kit";
import { safetyValues } from "./service";

const lbl = (t: Record<string, string>, k: string | null) => (k ? (t[k] ?? k) : "—");

/** 21. 구매·협력업체 실적 */
export const purchase: Builder = async (c) => {
  const load = async (p: { from: string; to: string }) => {
    const { start, end } = tsRange(p);
    const pos = await c.db
      .select({ o: purchaseOrder, name: supplier.name })
      .from(purchaseOrder)
      .leftJoin(supplier, eq(supplier.id, purchaseOrder.supplierId))
      .where(and(inArray(purchaseOrder.status, ["received", "partial"]), gte(purchaseOrder.receivedAt, start), lte(purchaseOrder.receivedAt, end)));
    const rc = await c.db
      .select({ orderId: purchaseReceipt.orderId, bad: purchaseReceipt.badNote, nc: purchaseReceipt.ncId })
      .from(purchaseReceipt)
      .where(and(gte(purchaseReceipt.receivedAt, start), lte(purchaseReceipt.receivedAt, end)));
    const os = await c.db
      .select({ j: outsourceJob, name: supplier.name })
      .from(outsourceJob)
      .leftJoin(supplier, eq(supplier.id, outsourceJob.supplierId))
      .where(and(eq(outsourceJob.status, "accepted"), gte(outsourceJob.acceptedAt, start), lte(outsourceJob.acceptedAt, end)));
    return { pos, rc, os };
  };
  const [a, b] = await both(c, load);
  const onTime = (x: typeof a) => pct(x.pos.filter((r) => r.o.dueOn && r.o.receivedAt && daysBetween(r.o.dueOn, r.o.receivedAt.toISOString().slice(0, 10)) <= 0).length, x.pos.filter((r) => r.o.dueOn).length);
  const bad = (x: typeof a) => x.rc.filter((r) => r.bad || r.nc).length;
  const by = new Map<string, { po: number; won: number; late: number; bad: number; os: number; osWon: number; redo: number }>();
  const g = (k: string) => by.get(k) ?? (by.set(k, { po: 0, won: 0, late: 0, bad: 0, os: 0, osWon: 0, redo: 0 }), by.get(k)!);
  const poSup = new Map(a.pos.map((r) => [r.o.id, r.name ?? "업체 미지정"]));
  for (const r of a.pos) {
    const x = g(r.name ?? "업체 미지정");
    x.po++;
    x.won += r.o.totalWon;
    if (r.o.dueOn && r.o.receivedAt && r.o.receivedAt.toISOString().slice(0, 10) > r.o.dueOn) x.late++;
  }
  for (const r of a.rc) if ((r.bad || r.nc) && poSup.has(r.orderId)) g(poSup.get(r.orderId)!).bad++;
  for (const r of a.os) {
    const x = g(r.name ?? "업체 미지정");
    x.os++;
    x.osWon += r.j.amountWon;
    x.redo += r.j.redoCount;
  }
  const evals = await c.db.select({ id: supplierEval.supplierId, total: supplierEval.total, year: supplierEval.year, name: supplier.name }).from(supplierEval).innerJoin(supplier, eq(supplier.id, supplierEval.supplierId)).where(isNotNull(supplierEval.confirmedAt));
  const lastEval = new Map<string, { total: number; year: number }>();
  for (const e of evals) if (!lastEval.has(e.name) || lastEval.get(e.name)!.year < e.year) lastEval.set(e.name, e);
  const won = (x: typeof a) => sum(x.pos, (r) => r.o.totalWon) + sum(x.os, (r) => r.j.amountWon);
  return {
    kpis: [
      m("won", "입고·외주 금액", "원", won(a), won(b), { note: "부가세 포함" }),
      m("po", "입고된 발주", "건", a.pos.length, b.pos.length, { href: "/purchases" }),
      m("onTime", "납기 준수율", "%", onTime(a), onTime(b), { better: "up", note: "납기일까지 들어온 발주 ÷ 납기를 적은 발주" }),
      m("bad", "입고 불량", "건", bad(a), bad(b), { better: "down" }),
      m("os", "외주 완료", "건", a.os.length, b.os.length, { href: "/outsource" }),
    ],
    tables: [
      {
        key: "supplier",
        title: "업체별",
        help: "rep.t.supplier",
        cols: [{ label: "업체" }, { label: "입고 발주", unit: "건", num: true }, { label: "발주 금액", unit: "원", num: true }, { label: "납기 늦음", unit: "건", num: true }, { label: "입고 불량", unit: "건", num: true }, { label: "외주", unit: "건", num: true }, { label: "외주 금액", unit: "원", num: true }, { label: "외주 재작업", unit: "건", num: true }, { label: "최근 평가", unit: "점", num: true }],
        rows: [...by.entries()].sort((x, y) => y[1].won + y[1].osWon - (x[1].won + x[1].osWon)).map(([k, v]) => ({ cells: [k, v.po, v.won, v.late, v.bad, v.os, v.osWon, v.redo, lastEval.get(k)?.total ?? null], tone: v.late + v.bad + v.redo > 0 ? ("warn" as const) : undefined, href: "/suppliers" })),
        empty: "이 기간 입고·외주가 없습니다.",
        note: "평가 점수는 확정한 협력업체 평가 중 가장 최근 해의 점수입니다.",
      },
    ],
  };
};

/** 22. 인력·근태·교육 */
export const people: Builder = async (c) => {
  const load = async (p: { from: string; to: string }) => {
    const days = await c.db.select({ userId: workDay.userId, inAt: workDay.inAt, outAt: workDay.outAt, name: appUser.name }).from(workDay).innerJoin(appUser, eq(appUser.id, workDay.userId)).where(and(gte(workDay.day, p.from), lte(workDay.day, p.to)));
    const lv = (
      await c.db
        .select({ doc: approvalDoc, name: appUser.name })
        .from(approvalDoc)
        .leftJoin(appUser, eq(appUser.id, approvalDoc.drafterId))
        .where(and(eq(approvalDoc.formCode, LEAVE_FORM), isNull(approvalDoc.cancelsId), inArray(approvalDoc.status, ["confirmed", "checked"])))
    )
      .map((r) => ({ name: r.name ?? "", userId: r.doc.drafterId, d: r.doc.data as LeaveData }))
      .filter((r) => r.d.fromDate <= p.to && r.d.toDate >= p.from);
    const tr = await c.db
      .select({ name: appUser.name, userId: trainingAttendee.userId, hours: trainingAttendee.hours, t: training.hours })
      .from(trainingAttendee)
      .innerJoin(training, eq(training.id, trainingAttendee.trainingId))
      .innerJoin(appUser, eq(appUser.id, trainingAttendee.userId))
      .where(and(isNotNull(trainingAttendee.signedAt), eq(training.status, "done"), gte(training.heldOn, p.from), lte(training.heldOn, p.to)));
    const runs = await c.db.select({ gross: payrollRun.totalGross, head: payrollRun.headcount }).from(payrollRun).where(and(eq(payrollRun.status, "paid"), gte(payrollRun.payDate, p.from), lte(payrollRun.payDate, p.to)));
    const sales = can(c.actor, "money.view") ? (await rangeSummary(c.db, p)).sales.total : null;
    return { days, lv, tr, runs, sales };
  };
  const [a, b] = await both(c, load);
  const hours = (x: typeof a) => sum(x.days.filter((d) => d.inAt && d.outAt), (d) => (d.outAt!.getTime() - d.inAt!.getTime()) / 36e5);
  const ot = (x: typeof a) => sum(x.lv.filter((l) => l.d.leaveKind === "overtime"), (l) => l.d.hours);
  const gross = (x: typeof a) => sum(x.runs, (r) => r.gross);
  const users = new Map<string, { name: string; days: number; hours: number; ot: number; leave: number; train: number }>();
  const u = (id: string, name: string) => users.get(id) ?? (users.set(id, { name, days: 0, hours: 0, ot: 0, leave: 0, train: 0 }), users.get(id)!);
  for (const d of a.days) {
    const x = u(d.userId, d.name);
    x.days++;
    if (d.inAt && d.outAt) x.hours += (d.outAt.getTime() - d.inAt.getTime()) / 36e5;
  }
  for (const l of a.lv) {
    const x = u(l.userId ?? "", l.name);
    if (l.d.leaveKind === "overtime") x.ot += l.d.hours;
    else x.leave += l.d.deduct || l.d.days || 0;
  }
  for (const t of a.tr) u(t.userId, t.name).train += t.hours ?? t.t ?? 0;
  const byKind = groupBy(a.lv, (l) => l.d.leaveKind);
  return {
    kpis: [
      m("hours", "출퇴근 기록 근무 시간", "시간", hours(a), hours(b), { href: "/attendance", note: "출근~퇴근(휴게 포함)" }),
      m("ot", "승인한 연장근무", "시간", ot(a), ot(b), { better: "down" }),
      m("leave", "휴가·근태 신청(승인)", "건", a.lv.filter((l) => l.d.leaveKind !== "overtime").length, b.lv.filter((l) => l.d.leaveKind !== "overtime").length),
      m("train", "교육 이수 시간", "시간", sum(a.tr, (t) => t.hours ?? t.t ?? 0), sum(b.tr, (t) => t.hours ?? t.t ?? 0), { better: "up", href: "/training" }),
      m("gross", "급여 지급 총액", "원", gross(a), gross(b), { href: "/payroll" }),
      ...(a.sales != null ? [m("ratio", "매출 대비 인건비", "%", pct(gross(a), a.sales), b.sales != null ? pct(gross(b), b.sales) : null, { better: "down", note: "급여 지급 총액 ÷ 매출(4대보험 회사 부담분 제외)" })] : []),
    ],
    tables: [
      {
        key: "staff",
        title: "직원별",
        help: "rep.t.staff",
        cols: [{ label: "직원" }, { label: "출근일", unit: "일", num: true }, { label: "근무 시간", unit: "시간", num: true }, { label: "연장(승인)", unit: "시간", num: true }, { label: "휴가 쓴 날", unit: "일", num: true }, { label: "교육", unit: "시간", num: true }],
        rows: [...users.values()].sort((x, y) => y.hours - x.hours).map((x) => ({ cells: [x.name, x.days, round1(x.hours), round1(x.ot), x.leave, round1(x.train)] })),
        empty: "이 기간 출퇴근·근태 기록이 없습니다.",
      },
      {
        key: "leaveKind",
        title: "근태 신청 종류별(승인)",
        help: "rep.t.leaveKind",
        cols: [{ label: "종류" }, { label: "건수", unit: "건", num: true }],
        rows: [...byKind.entries()].sort((x, y) => y[1] - x[1]).map(([k, n]) => ({ cells: [LEAVE_KINDS[k as keyof typeof LEAVE_KINDS]?.label ?? k, n] })),
        empty: "이 기간 승인한 근태 신청이 없습니다.",
      },
    ],
  };
};

/** 23. 안전·환경 */
export const safety: Builder = async (c) => {
  const { start, end } = tsRange(c.p);
  const [s, sq] = await both(c, (p) => safetyValues(c.db, p));
  const inc = await c.db.select({ i: incident }).from(incident).where(and(gte(incident.occurredAt, start), lte(incident.occurredAt, end)));
  const late = await c.db.select().from(hazardRow).where(and(isNotNull(hazardRow.due), lt(hazardRow.due, c.today), isNull(hazardRow.measureDoneAt)));
  const doneIn = await c.db.select({ id: hazardRow.id }).from(hazardRow).where(and(gte(hazardRow.measureDoneAt, start), lte(hazardRow.measureDoneAt, end)));
  const waste = await c.db.select().from(wasteLog).where(and(gte(wasteLog.on, c.p.from), lte(wasteLog.on, c.p.to)));
  const wby = new Map<string, { gen: number; out: number }>();
  for (const w of waste) {
    const x = wby.get(w.item) ?? { gen: 0, out: 0 };
    if (w.kind === "gen") x.gen += w.qty;
    else if (w.kind === "out") x.out += w.qty;
    wby.set(w.item, x);
  }
  return {
    kpis: [
      m("acc", "사고", "건", s.accidents, sq.accidents, { better: "down", href: "/incidents" }),
      m("near", "아차사고 보고", "건", s.near, sq.near, { note: "많이 보고할수록 위험을 일찍 찾습니다" }),
      m("done", "위험성평가 개선 조치 끝냄", "건", doneIn.length, null, { better: "up", href: "/hazards" }),
      m("late", "기한 지난 개선 조치", "건", late.length, null, { now: true, better: "down", href: "/hazards" }),
      m("wasteGen", "지정폐기물 발생", "kg", s.wasteGen, sq.wasteGen, { better: "down", href: "/environment" }),
      m("wasteOut", "지정폐기물 위탁 인계", "kg", s.wasteOut, sq.wasteOut),
    ],
    tables: [
      {
        key: "incidents",
        title: "사고·아차사고 목록",
        help: "rep.t.incidents",
        cols: [{ label: "번호" }, { label: "구분" }, { label: "장소" }, { label: "공정" }, { label: "정도" }],
        rows: inc.map(({ i }) => ({ cells: [i.docNo, lbl(INC_KIND, i.kind), i.place, i.process ?? "", lbl(INC_SEVERITY, i.severity)], href: `/incidents/${i.id}`, tone: i.kind === "accident" ? ("danger" as const) : undefined })),
        total: false,
        empty: "이 기간 사고·아차사고 보고가 없습니다.",
      },
      {
        key: "hazLate",
        title: "기한 지난 위험성평가 개선 조치",
        help: "rep.t.hazLate",
        cols: [{ label: "공정" }, { label: "유해·위험 요인" }, { label: "조치" }, { label: "기한" }, { label: "지난 날", unit: "일", num: true }],
        rows: late.map((h) => ({ cells: [h.process, h.hazard, h.measure ?? "", h.due, daysBetween(h.due!, c.today)], href: `/hazards/${h.assessmentId}`, tone: "danger" as const })),
        total: false,
        empty: "기한 지난 개선 조치가 없습니다.",
        now: true,
      },
      {
        key: "waste",
        title: "폐기물 종류별",
        help: "rep.t.waste",
        cols: [{ label: "종류" }, { label: "발생", unit: "kg", num: true }, { label: "위탁 인계", unit: "kg", num: true }],
        rows: [...wby.entries()].map(([k, v]) => ({ cells: [WASTE_ITEMS[k as keyof typeof WASTE_ITEMS]?.label ?? k, round1(v.gen), round1(v.out)] })),
        empty: "이 기간 폐기물 기록이 없습니다.",
      },
    ],
  };
};

/** 24. 설비 */
export const equipmentReport: Builder = async (c) => {
  const load = async (p: { from: string; to: string }) => {
    const { start, end } = tsRange(p);
    const f = await c.db.select({ f: equipmentFailure, name: equipment.name, no: equipment.no }).from(equipmentFailure).innerJoin(equipment, eq(equipment.id, equipmentFailure.equipmentId)).where(and(gte(equipmentFailure.occurredAt, start), lte(equipmentFailure.occurredAt, end)));
    const pm = await c.db.select({ done: pmTask.doneOn }).from(pmTask).where(and(gte(pmTask.dueOn, p.from), lte(pmTask.dueOn, p.to)));
    const ck = await c.db.select({ ok: equipmentCheck.ok }).from(equipmentCheck).where(and(gte(equipmentCheck.checkDate, p.from), lte(equipmentCheck.checkDate, p.to)));
    return { f, pm, ck };
  };
  const [a, b] = await both(c, load);
  const pmRate = (x: typeof a) => pct(x.pm.filter((t) => t.done).length, x.pm.length);
  const down = (x: typeof a) => sum(x.f, (r) => r.f.downMinutes ?? 0) / 60;
  const cost = (x: typeof a) => sum(x.f, (r) => r.f.cost ?? 0);
  const by = new Map<string, { n: number; down: number; cost: number }>();
  for (const r of a.f) {
    const k = `${r.no} ${r.name}`;
    const x = by.get(k) ?? { n: 0, down: 0, cost: 0 };
    x.n++;
    x.down += (r.f.downMinutes ?? 0) / 60;
    x.cost += r.f.cost ?? 0;
    by.set(k, x);
  }
  const due = await c.db.select().from(equipment).where(and(isNull(equipment.disposedOn), ne(equipment.status, "disposed")));
  const soon = due
    .flatMap((e) => [
      ...(e.calibNextOn && e.calibNextOn <= addDays(c.today, 60) ? [{ e, what: "교정", on: e.calibNextOn }] : []),
      ...(e.legalNextOn && e.legalNextOn <= addDays(c.today, 60) ? [{ e, what: "법정 검사", on: e.legalNextOn }] : []),
    ])
    .sort((x, y) => x.on.localeCompare(y.on));
  return {
    kpis: [
      m("fail", "설비 고장", "건", a.f.length, b.f.length, { better: "down", href: "/equipment/failures" }),
      m("down", "고장으로 멈춘 시간", "시간", down(a), down(b), { better: "down" }),
      m("cost", "고장 수리비", "원", cost(a), cost(b), { better: "down" }),
      m("pm", "예방정비 이행률", "%", pmRate(a), pmRate(b), { better: "up", href: "/equipment/pm", note: `${a.pm.length}건 예정` }),
      m("checks", "일상·월 점검 기록", "건", a.ck.length, b.ck.length, { href: "/equipment/checks", note: `이상 ${a.ck.filter((x) => !x.ok).length}건` }),
      m("mtbf", "고장 사이 평균 간격", "일", a.f.length ? c.p.days / a.f.length : null, b.f.length ? c.q.days / b.f.length : null, { better: "up", note: "기간 일수 ÷ 고장 건수(전체 설비)" }),
    ],
    tables: [
      {
        key: "byEquip",
        title: "설비별 고장",
        help: "rep.t.equipFail",
        cols: [{ label: "설비" }, { label: "고장", unit: "건", num: true }, { label: "멈춘 시간", unit: "시간", num: true }, { label: "수리비", unit: "원", num: true }],
        rows: [...by.entries()].sort((x, y) => y[1].n - x[1].n).map(([k, v]) => ({ cells: [k, v.n, round1(v.down), v.cost] })),
        empty: "이 기간 고장이 없습니다.",
      },
      {
        key: "due",
        title: "60일 안에 교정·법정 검사",
        help: "rep.t.equipDue",
        cols: [{ label: "설비" }, { label: "할 일" }, { label: "기한" }, { label: "남은 날", unit: "일", num: true }],
        rows: soon.map((x) => ({ cells: [`${x.e.no} ${x.e.name}`, x.what, x.on, daysBetween(c.today, x.on)], href: `/equipment/${x.e.id}`, tone: x.on < c.today ? ("danger" as const) : ("warn" as const) })),
        total: false,
        empty: "60일 안에 할 교정·법정 검사가 없습니다.",
        now: true,
      },
    ],
  };
};
