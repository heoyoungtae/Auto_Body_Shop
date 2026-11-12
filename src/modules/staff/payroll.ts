// 급여대장·임금명세서(F-11-05), STD-11 5절
// 1 계산(회계: 서명한 근로계약서 + 확정 근태) → 2 대표 승인(전결: 전액 대표) → 3 지급일 지급 기록 → 4 명세서 앱 교부.
// 급여 자료는 대표·회계 담당만 보고, 직원은 자기 명세서만 본다(STD-13).
import { and, asc, desc, eq, inArray, isNull, ne } from "drizzle-orm";
import type { Db } from "@/db/client";
import {
  appUser,
  approvalDoc,
  payrollRun,
  payslip,
  staffDocument,
  staffProfile,
} from "@/db/schema";
import { decrypt, encrypt } from "@/modules/auth/crypto";
import { can } from "@/modules/auth/permissions";
import type { Role } from "@/modules/auth/roles";
import { writeAudit } from "@/modules/platform/audit";
import { loadShopCalendar } from "@/modules/platform/calendar";
import { nextDocNo } from "@/modules/platform/docno";
import { UserError } from "@/modules/platform/errors";
import { notifyRole, notifyUser } from "@/modules/platform/notify";
import { loadPolicy } from "@/modules/platform/policy";
import { seoulDate } from "@/modules/platform/time";
import { LEAVE_FORM } from "./attendance";
import { isBusinessDay } from "@/modules/platform/business-days";
import { actualDays, DEFAULT_SCHEDULE } from "./punch";
import { hm, unapprovedMinutes } from "./punch-rules";
import type { ContractTerms } from "./contract-rules";
import {
  computeSlip,
  monthRange,
  payDateFor,
  summarizeAttendance,
  type AttLeave,
  type Extra,
  type PayPolicy,
  type SlipData,
} from "./payroll-rules";

export class PayrollError extends UserError {}
type Actor = { id: string; roles: Role[] };
const YM = /^\d{4}-(0[1-9]|1[0-2])$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const mustPrep = (a: Actor) => {
  if (!can(a, "payroll.prepare"))
    throw new PayrollError("급여 계산은 회계 담당이 합니다");
};
const prevYm = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
};
const readSlip = (enc: string) => JSON.parse(decrypt(enc)) as SlipData;
const writeSlip = (d: SlipData) => encrypt(JSON.stringify(d), "sensitive");

async function run(db: Db, id: string) {
  const [r] = await db.select().from(payrollRun).where(eq(payrollRun.id, id));
  if (!r) throw new PayrollError("급여대장을 찾을 수 없습니다");
  return r;
}

async function payPolicy(db: Db, on: string): Promise<PayPolicy> {
  const p = await loadPolicy(db, on);
  return {
    legal5: p["hr.headcount_5plus"] === 1,
    minWage: p["wage.minimum_hourly"],
    pensionRate: p["ins.pension_rate"],
    healthRate: p["ins.health_rate"],
    ltcRatio: p["ins.ltc_ratio"],
    employmentRate: p["ins.employment_rate"],
    pensionCap: p["ins.pension_cap"],
    pensionFloor: p["ins.pension_floor"],
    mealExempt: p["tax.meal_exempt"],
    carExempt: p["tax.car_exempt"],
    employmentEmployerRate: p["ins.employment_employer_rate"],
    accidentRate: p["ins.accident_rate"],
    taxTable: {
      pensionRate: p["tax.table_pension_rate"],
      pensionCap: p["tax.table_pension_cap"],
      pensionFloor: p["tax.table_pension_floor"],
      childOne: p["tax.child_one"],
      childTwo: p["tax.child_two"],
      childMore: p["tax.child_more"],
    },
  };
}

/** 그 달 급여 대상: 근무 기간이 그 달에 걸친 사람. 서명한 근로계약서(그 달에 시작한 것 중 가장 최근)를 쓴다 */
export async function payrollTargets(db: Db, ym: string) {
  const m = monthRange(ym);
  const users = await db
    .select({
      id: appUser.id,
      name: appUser.name,
      hiredOn: staffProfile.hiredOn,
      leftOn: staffProfile.leftOn,
    })
    .from(appUser)
    .leftJoin(staffProfile, eq(staffProfile.userId, appUser.id))
    .orderBy(asc(appUser.name));
  const contracts = await db
    .select()
    .from(staffDocument)
    .where(
      and(
        eq(staffDocument.kind, "contract"),
        eq(staffDocument.status, "signed"),
      ),
    )
    .orderBy(desc(staffDocument.signedAt));
  const out: {
    id: string;
    name: string;
    hiredOn: string | null;
    leftOn: string | null;
    terms: ContractTerms | null;
  }[] = [];
  for (const u of users) {
    const mine = contracts
      .filter((c) => c.userId === u.id)
      .map((c) => c.terms as unknown as ContractTerms)
      .filter((t) => t.startOn <= m.to && (!t.endOn || t.endOn >= m.from));
    const hired = u.hiredOn ?? mine.map((t) => t.startOn).sort()[0] ?? null;
    if (!hired || hired > m.to) continue;
    if (u.leftOn && u.leftOn < m.from) continue;
    const terms =
      mine.sort((a, b) => b.startOn.localeCompare(a.startOn))[0] ?? null;
    out.push({
      id: u.id,
      name: u.name,
      hiredOn: hired,
      leftOn: u.leftOn,
      terms,
    });
  }
  return out;
}

/** 그 달 근태: 결재 끝난 것(DONE)과 아직 결재 중인 것 */
async function monthLeaves(db: Db, ym: string) {
  const m = monthRange(ym);
  const rows = await db
    .select()
    .from(approvalDoc)
    .where(
      and(
        eq(approvalDoc.formCode, LEAVE_FORM),
        isNull(approvalDoc.cancelsId),
        inArray(approvalDoc.status, ["in_progress", "confirmed", "checked"]),
      ),
    );
  const inMonth = rows
    .map((d) => ({ d, data: d.data as AttLeave }))
    .filter(({ data }) => data.toDate >= m.from && data.fromDate <= m.to);
  return {
    done: inMonth.filter(({ d }) => d.status !== "in_progress"),
    pending: inMonth.filter(({ d }) => d.status === "in_progress"),
  };
}

/** 지난달 명세서(소득세·가족 수 불러오기) */
async function lastSlips(db: Db, ym: string) {
  const [prev] = await db
    .select()
    .from(payrollRun)
    .where(eq(payrollRun.ym, prevYm(ym)));
  if (!prev) return new Map<string, SlipData>();
  const rows = await db
    .select()
    .from(payslip)
    .where(eq(payslip.runId, prev.id));
  return new Map(rows.map((r) => [r.userId, readSlip(r.dataEnc)]));
}

type Kept = {
  incomeTax: number;
  incomeTaxSource: SlipData["incomeTaxSource"];
  family: number;
  children: number;
  withholdRate: number;
  extras: Extra[];
};

async function computeAll(db: Db, ym: string, kept: Map<string, Kept>) {
  const m = monthRange(ym);
  const pol = await payPolicy(db, m.to);
  const cal = await loadShopCalendar(db);
  const { done, pending } = await monthLeaves(db, ym);
  const actual = await actualDays(db, m.from, m.to);
  const last = await lastSlips(db, ym);
  const targets = await payrollTargets(db, ym);
  const slips: { userId: string; data: SlipData }[] = [];
  const skipped: string[] = [];
  for (const u of targets) {
    if (!u.terms) {
      skipped.push(u.name);
      continue;
    }
    // 연장·휴일근로: 승인 시각 ∩ 실제 출퇴근만 인정. 승인 없는 시간은 따로 센다(수당 없음, 경고)
    const att: SlipData["att"] = summarizeAttendance(
      done.filter(({ d }) => d.drafterId === u.id).map(({ data }) => data),
      ym,
      cal,
      (day) => actual.get(`${u.id}|${day}`)?.span,
    );
    const end = hm(u.terms.workEnd) ?? DEFAULT_SCHEDULE.end;
    let unapproved = 0;
    for (const a of actual.values()) {
      if (a.userId !== u.id) continue;
      const spans = [...done, ...pending]
        .filter(({ d, data }) => d.drafterId === u.id && data.leaveKind === "overtime" && data.fromDate === a.day)
        .map(({ data }) => ({ from: hm(data.fromTime) ?? 0, to: hm(data.toTime) ?? 0 }));
      unapproved += unapprovedMinutes(a.span, end, isBusinessDay(cal, a.day), spans);
    }
    if (unapproved) att.unapproved = Math.round((unapproved / 60) * 100) / 100;
    const prev = last.get(u.id);
    // 가족 수·자녀 수·원천징수 비율은 지난달 명세서에서 불러온다(다시 넣지 않음).
    // 소득세는 자동 계산. 지난달 직접 넣은 값이 있으면 그 값을 쓰고 확인을 부탁한다.
    const prevTyped =
      prev?.incomeTaxSource === "manual" || prev?.incomeTaxSource === "last";
    const k: Kept = kept.get(u.id) ?? {
      incomeTax: prevTyped ? prev.incomeTax : 0,
      incomeTaxSource: prevTyped ? "last" : "auto",
      family: prev?.family ?? 1,
      children: prev?.children ?? 0,
      withholdRate: prev?.withholdRate ?? 100,
      extras: [],
    };
    const data = computeSlip({
      name: u.name,
      terms: u.terms,
      ym,
      hiredOn: u.hiredOn,
      leftOn: u.leftOn,
      att,
      pol,
      ...k,
    });
    const waiting = pending.filter(({ d }) => d.drafterId === u.id).length;
    if (waiting)
      data.warnings.unshift(
        `결재가 끝나지 않은 근태 ${waiting}건은 빠졌습니다. 확정되면 '다시 계산'을 누르세요`,
      );
    slips.push({ userId: u.id, data });
  }
  return { slips, skipped };
}

async function saveTotals(db: Db, runId: string, now: Date) {
  const rows = await db.select().from(payslip).where(eq(payslip.runId, runId));
  const ds = rows.map((r) => readSlip(r.dataEnc));
  await db
    .update(payrollRun)
    .set({
      headcount: ds.length,
      totalGross: ds.reduce((s, d) => s + d.gross, 0),
      totalDeduct: ds.reduce((s, d) => s + d.deductTotal, 0),
      totalNet: ds.reduce((s, d) => s + d.net, 0),
      updatedAt: now,
    })
    .where(eq(payrollRun.id, runId));
}

/** 1 계산: 그 달 급여대장을 만든다(근태 확정일 뒤) */
export async function preparePayroll(
  db: Db,
  actor: Actor,
  ym: string,
  now = new Date(),
) {
  mustPrep(actor);
  if (!YM.test(ym)) throw new PayrollError("급여 달을 골라 주세요");
  const today = seoulDate(now);
  if (monthRange(ym).from > today)
    throw new PayrollError("아직 시작하지 않은 달입니다");
  const [dup] = await db
    .select({ id: payrollRun.id })
    .from(payrollRun)
    .where(eq(payrollRun.ym, ym));
  if (dup) throw new PayrollError("그 달 급여대장이 이미 있습니다");
  const { slips, skipped } = await computeAll(db, ym, new Map());
  if (!slips.length)
    throw new PayrollError(
      skipped.length
        ? `서명한 근로계약서가 있는 직원이 없습니다(${skipped.join(", ")})`
        : "그 달에 근무한 직원이 없습니다",
    );
  const pol = await loadPolicy(db, today);
  const payDate = payDateFor(
    ym,
    pol["payroll.pay_day"],
    await loadShopCalendar(db),
  );
  const docNo = await nextDocNo(db, "PY", now);
  const [r] = await db
    .insert(payrollRun)
    .values({
      docNo,
      ym,
      payDate,
      createdBy: actor.id,
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: payrollRun.id });
  for (const s of slips)
    await db
      .insert(payslip)
      .values({
        runId: r.id,
        userId: s.userId,
        dataEnc: writeSlip(s.data),
        updatedAt: now,
      });
  await saveTotals(db, r.id, now);
  await writeAudit(db, {
    actorId: actor.id,
    action: "payroll.prepare",
    entityType: "payroll_run",
    entityId: docNo,
    after: { ym, headcount: slips.length },
  });
  return { id: r.id, skipped };
}

async function keptOf(db: Db, runId: string) {
  const rows = await db.select().from(payslip).where(eq(payslip.runId, runId));
  return new Map<string, Kept>(
    rows.map((r) => {
      const d = readSlip(r.dataEnc);
      return [
        r.userId,
        {
          incomeTax: d.incomeTax,
          incomeTaxSource:
            d.incomeTaxSource === "manual" || d.incomeTaxSource === "last"
              ? d.incomeTaxSource
              : "auto",
          family: d.family,
          children: d.children ?? 0,
          withholdRate: d.withholdRate ?? 100,
          extras: d.extras,
        },
      ];
    }),
  );
}

/** 다시 계산: 근태·계약서·정책값이 바뀌었을 때. 넣은 소득세·기타 항목은 그대로 둔다 */
export async function recalcPayroll(
  db: Db,
  actor: Actor,
  runId: string,
  now = new Date(),
) {
  mustPrep(actor);
  const r = await run(db, runId);
  if (r.status !== "draft")
    throw new PayrollError(
      "계산 중인 급여대장만 다시 계산합니다(승인 대기면 대표가 돌려보내야 합니다)",
    );
  const { slips, skipped } = await computeAll(
    db,
    r.ym,
    await keptOf(db, runId),
  );
  const before = await db
    .select()
    .from(payslip)
    .where(eq(payslip.runId, runId));
  for (const b of before.filter(
    (b) => !slips.some((s) => s.userId === b.userId),
  ))
    await db.delete(payslip).where(eq(payslip.id, b.id));
  for (const s of slips) {
    const old = before.find((b) => b.userId === s.userId);
    if (old)
      await db
        .update(payslip)
        .set({ dataEnc: writeSlip(s.data), updatedAt: now })
        .where(eq(payslip.id, old.id));
    else
      await db
        .insert(payslip)
        .values({
          runId,
          userId: s.userId,
          dataEnc: writeSlip(s.data),
          updatedAt: now,
        });
  }
  await saveTotals(db, runId, now);
  return { skipped };
}

/**
 * 사람별 입력: 공제 대상 가족 수·8~20세 자녀 수·원천징수 비율(다음 달로 이어짐),
 * 소득세 직접 입력(비우면 간이세액표 자동 계산), 기타 지급/공제(사유 필수)
 */
export async function setSlipInputs(
  db: Db,
  actor: Actor,
  slipId: string,
  input: {
    /** null 이면 자동 계산 */
    incomeTax: number | null;
    family: number;
    children?: number;
    withholdRate?: number;
    extras: Extra[];
  },
  now = new Date(),
) {
  mustPrep(actor);
  const [s] = await db.select().from(payslip).where(eq(payslip.id, slipId));
  if (!s) throw new PayrollError("명세서를 찾을 수 없습니다");
  const r = await run(db, s.runId);
  if (r.status !== "draft") throw new PayrollError("계산 중일 때만 고칩니다");
  if (
    input.incomeTax != null &&
    (!Number.isInteger(input.incomeTax) || input.incomeTax < 0)
  )
    throw new PayrollError("소득세는 0 이상 원 단위로 적거나, 비워서 자동 계산으로 두세요");
  const children = input.children ?? 0;
  if (!Number.isInteger(children) || children < 0 || children >= input.family)
    throw new PayrollError(
      "8~20세 자녀 수는 0명 이상, 공제 대상 가족 수보다 적어야 합니다(자녀도 가족 수에 들어갑니다)",
    );
  const withholdRate = input.withholdRate ?? 100;
  if (![80, 100, 120].includes(withholdRate))
    throw new PayrollError("원천징수 비율은 80·100·120% 중에서 고릅니다");
  if (!Number.isInteger(input.family) || input.family < 1 || input.family > 11)
    throw new PayrollError("공제 대상 가족 수는 본인 포함 1~11명입니다");
  const extras: Extra[] = [];
  for (const e of input.extras) {
    if (!e.name.trim() && !e.amount) continue;
    if (!e.name.trim() || !(e.amount > 0) || !Number.isInteger(e.amount))
      throw new PayrollError("기타 항목은 이름과 금액(원)을 같이 적어 주세요");
    if (!e.reason.trim())
      throw new PayrollError(
        `'${e.name}' 사유를 적어 주세요(예: 10월 연장수당 누락분 정산)`,
      );
    extras.push({
      kind: e.kind === "deduct" ? "deduct" : "pay",
      name: e.name.trim(),
      amount: e.amount,
      reason: e.reason.trim(),
      taxable: e.taxable !== false,
    });
  }
  const d = readSlip(s.dataEnc);
  const kept = new Map<string, Kept>([
    [
      s.userId,
      {
        incomeTax: input.incomeTax ?? 0,
        incomeTaxSource: input.incomeTax == null ? "auto" : "manual",
        family: input.family,
        children,
        withholdRate,
        extras,
      },
    ],
  ]);
  const { slips } = await computeAll(db, r.ym, kept);
  const mine = slips.find((x) => x.userId === s.userId);
  if (!mine)
    throw new PayrollError(`${d.name}의 계약서·근무 기간을 다시 확인하세요`);
  await db
    .update(payslip)
    .set({ dataEnc: writeSlip(mine.data), updatedAt: now })
    .where(eq(payslip.id, slipId));
  await saveTotals(db, r.id, now);
}

/** 2 승인 요청: 최저임금 미달·지급액 음수는 막는다 */
export async function submitPayroll(
  db: Db,
  actor: Actor,
  runId: string,
  now = new Date(),
) {
  mustPrep(actor);
  const r = await run(db, runId);
  if (r.status !== "draft") throw new PayrollError("이미 올린 급여대장입니다");
  const rows = await db.select().from(payslip).where(eq(payslip.runId, runId));
  const pol = await payPolicy(db, monthRange(r.ym).to);
  for (const s of rows) {
    const d = readSlip(s.dataEnc);
    if (d.hourly < pol.minWage)
      throw new PayrollError(
        `${d.name}: 통상시급이 최저임금보다 적습니다. 근로계약서를 먼저 고치세요`,
      );
    if (d.net < 0)
      throw new PayrollError(`${d.name}: 실지급액이 0원보다 적습니다`);
  }
  await db
    .update(payrollRun)
    .set({
      status: "submitted",
      submittedAt: now,
      returnReason: null,
      updatedAt: now,
    })
    .where(eq(payrollRun.id, runId));
  await writeAudit(db, {
    actorId: actor.id,
    action: "payroll.submit",
    entityType: "payroll_run",
    entityId: r.docNo,
    after: { totalNet: r.totalNet },
  });
  await notifyRole(
    db,
    "owner",
    `${r.ym} 급여대장 승인 요청(${r.headcount}명, 실지급 ${r.totalNet.toLocaleString("ko-KR")}원)`,
    `py-submit-${runId}-${now.getTime()}`,
    `/payroll/${r.ym}`,
  );
}

export async function approvePayroll(
  db: Db,
  actor: Actor,
  runId: string,
  now = new Date(),
) {
  if (!can(actor, "payroll.approve"))
    throw new PayrollError("급여 지급은 대표가 승인합니다");
  const r = await run(db, runId);
  if (r.status !== "submitted")
    throw new PayrollError("승인 대기인 급여대장만 승인합니다");
  await db
    .update(payrollRun)
    .set({
      status: "approved",
      approvedBy: actor.id,
      approvedAt: now,
      updatedAt: now,
    })
    .where(eq(payrollRun.id, runId));
  await writeAudit(db, {
    actorId: actor.id,
    action: "payroll.approve",
    entityType: "payroll_run",
    entityId: r.docNo,
    after: { totalNet: r.totalNet },
  });
  await notifyRole(
    db,
    "accounting",
    `${r.ym} 급여 승인됨. ${r.payDate}에 지급하고 지급 기록을 남기세요`,
    `py-approve-${runId}`,
    `/payroll/${r.ym}`,
  );
}

export async function returnPayroll(
  db: Db,
  actor: Actor,
  runId: string,
  reason: string,
  now = new Date(),
) {
  if (!can(actor, "payroll.approve"))
    throw new PayrollError("돌려보내기는 대표가 합니다");
  const r = await run(db, runId);
  if (r.status !== "submitted" && r.status !== "approved")
    throw new PayrollError("승인 대기·승인 상태에서만 돌려보냅니다");
  if (!reason.trim()) throw new PayrollError("돌려보내는 이유를 적어 주세요");
  await db
    .update(payrollRun)
    .set({
      status: "draft",
      returnReason: reason.trim(),
      approvedBy: null,
      approvedAt: null,
      updatedAt: now,
    })
    .where(eq(payrollRun.id, runId));
  await writeAudit(db, {
    actorId: actor.id,
    action: "payroll.return",
    entityType: "payroll_run",
    entityId: r.docNo,
    after: { reason: reason.trim() },
  });
  await notifyRole(
    db,
    "accounting",
    `${r.ym} 급여대장 돌려보냄: ${reason.trim()}`,
    `py-return-${runId}-${now.getTime()}`,
    `/payroll/${r.ym}`,
  );
}

/** 3 지급 기록 → 4 명세서 교부(직원 알림) */
export async function markPayrollPaid(
  db: Db,
  actor: Actor,
  runId: string,
  paidOn: string,
  now = new Date(),
) {
  mustPrep(actor);
  const r = await run(db, runId);
  if (r.status !== "approved")
    throw new PayrollError("대표 승인 뒤에 지급합니다");
  if (!DATE.test(paidOn) || paidOn > seoulDate(now))
    throw new PayrollError("지급한 날을 적어 주세요(오늘 이후는 안 됨)");
  await db
    .update(payrollRun)
    .set({
      status: "paid",
      payDate: paidOn,
      paidBy: actor.id,
      paidAt: now,
      updatedAt: now,
    })
    .where(eq(payrollRun.id, runId));
  await writeAudit(db, {
    actorId: actor.id,
    action: "payroll.paid",
    entityType: "payroll_run",
    entityId: r.docNo,
    after: { paidOn },
  });
  for (const s of await db
    .select()
    .from(payslip)
    .where(eq(payslip.runId, runId)))
    await notifyUser(
      db,
      s.userId,
      `${r.ym} 임금명세서가 나왔습니다`,
      `py-slip-${s.id}`,
      `/payroll/slip/${s.id}`,
    );
}

export async function listRuns(db: Db) {
  return db.select().from(payrollRun).orderBy(desc(payrollRun.ym));
}

export async function getRun(db: Db, actor: Actor, ym: string) {
  if (!can(actor, "payroll.view"))
    throw new PayrollError("급여대장은 대표·회계 담당만 봅니다");
  const [r] = await db.select().from(payrollRun).where(eq(payrollRun.ym, ym));
  if (!r) return null;
  const rows = await db.select().from(payslip).where(eq(payslip.runId, r.id));
  const slips = rows
    .map((s) => ({ s, d: readSlip(s.dataEnc) }))
    .sort((a, b) => a.d.name.localeCompare(b.d.name));
  return { r, slips };
}

/** 명세서 하나: 대표·회계 또는 본인(지급 뒤). 본인이 열면 열람 시각을 남긴다 */
export async function getSlip(
  db: Db,
  actor: Actor,
  id: string,
  now = new Date(),
) {
  const [s] = await db.select().from(payslip).where(eq(payslip.id, id));
  if (!s) throw new PayrollError("명세서를 찾을 수 없습니다");
  const r = await run(db, s.runId);
  const own = s.userId === actor.id;
  if (!can(actor, "payroll.view") && !(own && r.status === "paid"))
    throw new PayrollError("본인 명세서만 볼 수 있습니다");
  if (own && !s.viewedAt)
    await db.update(payslip).set({ viewedAt: now }).where(eq(payslip.id, id));
  return { s, r, d: readSlip(s.dataEnc) };
}

export async function mySlips(db: Db, actor: Actor) {
  const rows = await db
    .select({ s: payslip, ym: payrollRun.ym, payDate: payrollRun.payDate })
    .from(payslip)
    .innerJoin(payrollRun, eq(payrollRun.id, payslip.runId))
    .where(and(eq(payslip.userId, actor.id), eq(payrollRun.status, "paid")))
    .orderBy(desc(payrollRun.ym));
  return rows.map(({ s, ym, payDate }) => ({
    id: s.id,
    ym,
    payDate,
    net: readSlip(s.dataEnc).net,
    viewedAt: s.viewedAt,
  }));
}

/** 내 할 일: 급여 계산(근태 확정일 뒤)·승인·지급 */
export async function payrollTodos(db: Db, actor: Actor, today: string) {
  const out: {
    key: string;
    when: "late" | "today" | "soon";
    what: string;
    detail?: string;
    href: string;
    action: string;
  }[] = [];
  if (!can(actor, "payroll.prepare") && !can(actor, "payroll.approve"))
    return out;
  const ym = prevYm(today.slice(0, 7));
  const pol = await loadPolicy(db, today);
  const closeDay = `${today.slice(0, 7)}-${String(pol["payroll.attendance_close_day"]).padStart(2, "0")}`;
  const runs = await db
    .select()
    .from(payrollRun)
    .where(ne(payrollRun.status, "paid"));
  const [cur] = await db.select().from(payrollRun).where(eq(payrollRun.ym, ym));
  if (
    !cur &&
    today >= closeDay &&
    can(actor, "payroll.prepare") &&
    (await payrollTargets(db, ym)).some((t) => t.terms)
  )
    out.push({
      key: `py-prep-${ym}`,
      when: "today",
      what: `${ym} 급여 계산`,
      detail: `근태 확정(${closeDay}) 뒤 급여대장 만들기`,
      href: `/payroll?ym=${ym}`,
      action: "계산하기",
    });
  for (const r of runs) {
    const late =
      r.payDate < today ? "late" : r.payDate <= today ? "today" : "soon";
    if (r.status === "draft" && can(actor, "payroll.prepare"))
      out.push({
        key: `py-draft-${r.id}`,
        when: late,
        what: `${r.ym} 급여대장 마무리·승인 요청`,
        detail: r.returnReason
          ? `돌려받음: ${r.returnReason}`
          : `${r.payDate} 지급`,
        href: `/payroll/${r.ym}`,
        action: "열기",
      });
    if (r.status === "submitted" && can(actor, "payroll.approve"))
      out.push({
        key: `py-approve-${r.id}`,
        when: late === "soon" ? "today" : late,
        what: `${r.ym} 급여 승인`,
        detail: `${r.headcount}명 · 실지급 ${r.totalNet.toLocaleString("ko-KR")}원 · ${r.payDate} 지급`,
        href: `/payroll/${r.ym}`,
        action: "승인하기",
      });
    if (
      r.status === "approved" &&
      can(actor, "payroll.prepare") &&
      r.payDate <= today
    )
      out.push({
        key: `py-pay-${r.id}`,
        when: late,
        what: `${r.ym} 급여 지급 기록`,
        detail: `${r.payDate} 지급일`,
        href: `/payroll/${r.ym}`,
        action: "지급 기록",
      });
  }
  return out;
}
