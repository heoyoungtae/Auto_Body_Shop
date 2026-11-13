// 마감(STD-12 12.4). 일일 마감: 상담원이 그날 카드 단말기 합계·세어 본 현금을 입금 전표와 맞춘다.
// 월 마감: 회계가 매출·수납·미수·매입·지출·미지급을 모아 올리고 대표가 승인한다. 대표 본인 결재 건은 따로 보여 다시 본다.
import { and, desc, eq, gte, inArray, lte } from "drizzle-orm";
import type { Db } from "@/db/client";
import {
  appUser,
  approvalDoc,
  dailyClose,
  expense,
  insuranceClaim,
  monthClose,
  outsourceJob,
  payment,
  payrollRun,
  purchaseOrder,
  repairOrder,
  repairStatement,
  userRole,
} from "@/db/schema";
import type { ResolvedStep } from "@/modules/approval/types";
import { can } from "@/modules/auth/permissions";
import type { Role } from "@/modules/auth/roles";
import { writeAudit } from "@/modules/platform/audit";
import { UserError } from "@/modules/platform/errors";
import { notifyRole, notifyUser } from "@/modules/platform/notify";
import { seoulDate } from "@/modules/platform/time";
import { EXPENSE_FORM, listExpenses, payables } from "./expense";
import { accruedIn, balancesAt } from "./payable";
import { customerReceivables, insurerReceivables } from "./receipts";
import { AR_DUN_DAYS, EXP_CATEGORIES, isYm, prevYm, ymRange } from "./rules";

export class CloseError extends UserError {}
type Actor = { id: string; roles: Role[] };
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;
const sum = <T>(xs: T[], f: (x: T) => number) =>
  xs.reduce((a, x) => a + f(x), 0);
const tsRange = (from: string, to: string) => ({
  start: new Date(`${from}T00:00:00+09:00`),
  end: new Date(`${to}T23:59:59.999+09:00`),
});

/** 그날 입금 전표 합계(취소 전표 포함). 카드·현금·이체는 고객 수납, 보험사 입금은 따로 */
export async function dayTotals(db: Db, day: string) {
  const rows = await db
    .select()
    .from(payment)
    .where(eq(payment.receivedOn, day));
  const cust = rows.filter((r) => r.payer !== "insurer");
  const by = (m: string) =>
    sum(
      cust.filter((r) => r.method === m),
      (r) => r.amountWon,
    );
  return {
    card: by("card"),
    cash: by("cash"),
    transfer: by("transfer"),
    insurer: sum(
      rows.filter((r) => r.payer === "insurer"),
      (r) => r.amountWon,
    ),
    count: rows.length,
    rows,
  };
}

export async function dayClose(db: Db, day: string) {
  const [d] = await db.select().from(dailyClose).where(eq(dailyClose.day, day));
  return d ?? null;
}

/** 일일 마감. 단말기 합계·현금이 전표와 다르면 사유를 적고, 대표에게 알린다 */
export async function closeDay(
  db: Db,
  actor: Actor,
  day: string,
  input: {
    cardTerminalWon: number | null;
    cashCountedWon: number | null;
    note: string;
  },
  now = new Date(),
) {
  if (!can(actor, "money.close_day"))
    throw new CloseError("일일 마감은 상담원·회계 담당·대표가 합니다");
  const today = seoulDate(now);
  if (!ISO.test(day) || day > today)
    throw new CloseError("마감할 날을 확인해 주세요(오늘이나 그 전)");
  if (await dayClose(db, day)) throw new CloseError("이미 마감한 날입니다");
  if (input.cardTerminalWon == null || input.cardTerminalWon < 0)
    throw new CloseError(
      "카드 단말기의 그날 승인 합계를 적어 주세요(없으면 0)",
    );
  if (input.cashCountedWon == null || input.cashCountedWon < 0)
    throw new CloseError(
      "그날 받은 현금을 세어 적어 주세요(없으면 0, 거스름돈 시재는 빼고)",
    );
  const t = await dayTotals(db, day);
  const diff = input.cardTerminalWon - t.card + (input.cashCountedWon - t.cash);
  const cardDiff = input.cardTerminalWon - t.card;
  const cashDiff = input.cashCountedWon - t.cash;
  if ((cardDiff || cashDiff) && !input.note.trim())
    throw new CloseError(
      `전표와 ${cardDiff ? `카드 ${won(cardDiff)}` : ""}${cardDiff && cashDiff ? " · " : ""}${cashDiff ? `현금 ${won(cashDiff)}` : ""} 차이가 납니다. 빠진 전표가 있으면 먼저 적고, 그래도 다르면 이유를 적어 주세요`,
    );
  await db.insert(dailyClose).values({
    day,
    cardWon: t.card,
    cashWon: t.cash,
    transferWon: t.transfer,
    cardTerminalWon: input.cardTerminalWon,
    cashCountedWon: input.cashCountedWon,
    diffWon: diff,
    note: input.note.trim() || null,
    closedBy: actor.id,
    closedAt: now,
  });
  await writeAudit(db, {
    actorId: actor.id,
    action: "close.day",
    entityType: "daily_close",
    entityId: day,
    after: {
      card: t.card,
      cash: t.cash,
      transfer: t.transfer,
      cardDiff,
      cashDiff,
    },
  });
  if (cardDiff || cashDiff)
    await notifyRole(
      db,
      "owner",
      `일일 마감 차이: ${day} 카드 ${won(cardDiff)} · 현금 ${won(cashDiff)} — ${input.note.trim()}`,
      `close-diff-${day}`,
      `/money/close?day=${day}`,
    );
}

/** 최근 일일 마감 기록 */
export async function recentDayCloses(db: Db, limit = 14) {
  return db
    .select({ d: dailyClose, by: appUser.name })
    .from(dailyClose)
    .leftJoin(appUser, eq(appUser.id, dailyClose.closedBy))
    .orderBy(desc(dailyClose.day))
    .limit(limit);
}

/** 입금 전표가 있는데 마감 안 한 날(오늘 제외) */
export async function unclosedDays(db: Db, from: string, to: string) {
  const days = [
    ...new Set(
      (
        await db
          .select({ d: payment.receivedOn })
          .from(payment)
          .where(
            and(gte(payment.receivedOn, from), lte(payment.receivedOn, to)),
          )
      ).map((r) => r.d),
    ),
  ];
  if (!days.length) return [];
  const closed = new Set(
    (
      await db
        .select({ d: dailyClose.day })
        .from(dailyClose)
        .where(inArray(dailyClose.day, days))
    ).map((r) => r.d),
  );
  return days.filter((d) => !closed.has(d)).sort();
}

export type MonthSummary = {
  ym: string;
  range: { from: string; to: string };
  sales: {
    count: number;
    total: number;
    parts: number;
    labor: number;
    vat: number;
    selfTotal: number;
    insuranceTotal: number;
  };
  collected: {
    card: number;
    cash: number;
    transfer: number;
    customer: number;
    insurer: number;
    insurerCut: number;
    total: number;
  };
  receivables: {
    customer: number;
    customerCount: number;
    customerOld: number;
    insurer: number;
    insurerCount: number;
  };
  purchases: {
    po: number;
    poCount: number;
    outsource: number;
    outsourceCount: number;
    total: number;
  };
  expenses: {
    paid: number;
    paidCount: number;
    byCategory: { category: string; label: string; won: number }[];
    payroll: number;
  };
  /** toDraft 아직 지급 결의 안 한 외상, toPay 결의·승인했는데 지급 전(지금 기준). balance 그 기간 마지막 날 기준 잔액(예전 자료엔 없음) */
  payables: {
    toDraft: number;
    toPay: number;
    balance?: { trade: number; other: number; card: number; bySupplier: { name: string; trade: number; other: number }[] };
  };
  selfApproved: { kind: string; docNo: string; title: string; won: number }[];
  dayIssues: {
    unclosed: string[];
    diffs: { day: string; diff: number; note: string | null }[];
  };
};

/** 한 달 모아 보기(마감 자료). 미수·미지급은 지금 기준 */
export async function monthSummary(db: Db, ym: string): Promise<MonthSummary> {
  if (!isYm(ym)) throw new CloseError("달을 확인해 주세요(YYYY-MM)");
  return { ym, ...(await rangeSummary(db, ymRange(ym))) };
}

/** 아무 기간(일·주·월·분기·연) 모아 보기. 통계·보고서도 이것을 쓴다. 미수·미지급은 지금 기준 */
export async function rangeSummary(
  db: Db,
  range: { from: string; to: string },
): Promise<Omit<MonthSummary, "ym">> {
  const { start, end } = tsRange(range.from, range.to);
  const st = await db
    .select({ s: repairStatement, insurance: repairOrder.insurance })
    .from(repairStatement)
    .innerJoin(repairOrder, eq(repairOrder.id, repairStatement.repairOrderId))
    .where(
      and(
        gte(repairStatement.issuedOn, range.from),
        lte(repairStatement.issuedOn, range.to),
      ),
    );
  // 보험사 입금 전표는 아래 insurer(보험 청구 입금 확인)로 따로 센다
  const pays = await db
    .select()
    .from(payment)
    .where(
      and(
        gte(payment.receivedOn, range.from),
        lte(payment.receivedOn, range.to),
        eq(payment.payer, "customer"),
      ),
    );
  const claims = await db
    .select()
    .from(insuranceClaim)
    .where(
      and(
        gte(insuranceClaim.paidOn, range.from),
        lte(insuranceClaim.paidOn, range.to),
      ),
    );
  const car = await customerReceivables(db);
  const iar = await insurerReceivables(db);
  const pos = await db
    .select()
    .from(purchaseOrder)
    .where(
      and(
        inArray(purchaseOrder.status, ["received", "partial"]),
        gte(purchaseOrder.receivedAt, start),
        lte(purchaseOrder.receivedAt, end),
      ),
    );
  const oss = await db
    .select()
    .from(outsourceJob)
    .where(
      and(
        eq(outsourceJob.status, "accepted"),
        gte(outsourceJob.acceptedAt, start),
        lte(outsourceJob.acceptedAt, end),
      ),
    );
  const paidExp = (await listExpenses(db, "paid")).filter(
    (e) => e.paidOn && e.paidOn >= range.from && e.paidOn <= range.to,
  );
  const runs = await db
    .select()
    .from(payrollRun)
    .where(
      and(
        eq(payrollRun.status, "paid"),
        gte(payrollRun.payDate, range.from),
        lte(payrollRun.payDate, range.to),
      ),
    );
  const pay = await payables(db);

  // 대표 본인 결재: 대표가 쓰고 대표가 승인한 지출 결의, 대표가 만들고 승인한 발주서
  const owners = new Set(
    (
      await db
        .select({ id: userRole.userId })
        .from(userRole)
        .where(eq(userRole.role, "owner"))
    ).map((u) => u.id),
  );
  const docs = await db
    .select()
    .from(approvalDoc)
    .where(
      and(
        eq(approvalDoc.formCode, EXPENSE_FORM),
        gte(approvalDoc.confirmedAt, start),
        lte(approvalDoc.confirmedAt, end),
      ),
    );
  const selfApproved: MonthSummary["selfApproved"] = [];
  for (const d of docs) {
    if (!d.drafterId || !owners.has(d.drafterId) || d.cancelsId) continue;
    const approvers = (d.steps as ResolvedStep[])
      .filter((s) => s.kind === "approve")
      .flatMap((s) => s.doneBy);
    if (approvers.includes(d.drafterId))
      selfApproved.push({
        kind: "지출 결의",
        docNo: d.docNo,
        title: d.title,
        won: Number((d.data as { amount?: number }).amount ?? 0),
      });
  }
  const selfPo = await db
    .select()
    .from(purchaseOrder)
    .where(
      and(
        gte(purchaseOrder.approvedAt, start),
        lte(purchaseOrder.approvedAt, end),
      ),
    );
  for (const o of selfPo)
    if (o.createdBy && o.createdBy === o.approvedBy && owners.has(o.createdBy))
      selfApproved.push({
        kind: "발주서",
        docNo: o.docNo,
        title: o.note ?? "",
        won: o.totalWon,
      });

  // 계정별 매입·비용(발생 기준): 외상은 입고(세금계산서)한 날, 결의서로 승인한 지출은 증빙 날짜(없으면 결의한 날),
  // 예전 방식(발주서마다 결의)은 지급한 날. 지급 결의(settle)는 이미 외상으로 센 것을 갚는 것이라 넣지 않는다
  const cats = new Map<string, number>();
  const addCat = (parts: { category: string; won: number }[]) => {
    for (const part of parts) cats.set(part.category, (cats.get(part.category) ?? 0) + part.won);
  };
  for (const x of await accruedIn(db, range.from, range.to)) addCat(x.split.length ? x.split : [{ category: x.category, won: x.amountWon }]);
  for (const e of await listExpenses(db, "all")) {
    if (e.status === "cancelled" || e.status === "draft" || e.status === "rejected" || e.status === "in_progress") continue;
    const parts = e.split?.length ? e.split : [{ category: e.category, won: e.amountWon }];
    if (e.sourceKind === "none") {
      const on = e.evidenceOn ?? seoulDate(e.createdAt);
      if (on >= range.from && on <= range.to) addCat(parts);
    } else if ((e.sourceKind === "po" || e.sourceKind === "outsource") && e.paidOn && e.paidOn >= range.from && e.paidOn <= range.to) addCat(parts);
  }
  const closes = await db
    .select()
    .from(dailyClose)
    .where(and(gte(dailyClose.day, range.from), lte(dailyClose.day, range.to)));
  const card = sum(
    pays.filter((p) => p.method === "card"),
    (p) => p.amountWon,
  );
  const cash = sum(
    pays.filter((p) => p.method === "cash"),
    (p) => p.amountWon,
  );
  const transfer = sum(
    pays.filter((p) => p.method === "transfer"),
    (p) => p.amountWon,
  );
  const insurer = sum(claims, (c) => c.paidWon ?? 0);
  const poWon = sum(pos, (o) => o.totalWon);
  const osWon = sum(oss, (o) => o.amountWon);
  return {
    range,
    sales: {
      count: st.length,
      total: sum(st, (r) => r.s.totalWon),
      parts: sum(st, (r) => r.s.partsWon),
      labor: sum(st, (r) => r.s.laborWon),
      vat: sum(st, (r) => r.s.vatWon),
      selfTotal: sum(
        st.filter((r) => r.insurance === "self"),
        (r) => r.s.totalWon,
      ),
      insuranceTotal: sum(
        st.filter((r) => r.insurance !== "self"),
        (r) => r.s.totalWon,
      ),
    },
    collected: {
      card,
      cash,
      transfer,
      customer: card + cash + transfer,
      insurer,
      insurerCut: sum(claims, (c) => c.cutWon ?? 0),
      total: card + cash + transfer + insurer,
    },
    receivables: {
      customer: sum(car, (a) => a.remain),
      customerCount: car.length,
      customerOld: car.filter((a) => (a.days ?? 0) >= AR_DUN_DAYS).length,
      insurer: sum(iar, (a) => a.claimedWon),
      insurerCount: iar.length,
    },
    purchases: {
      po: poWon,
      poCount: pos.length,
      outsource: osWon,
      outsourceCount: oss.length,
      total: poWon + osWon,
    },
    expenses: {
      paid: sum(paidExp, (e) => e.amountWon),
      paidCount: paidExp.length,
      byCategory: [...cats.entries()]
        .map(([category, w]) => ({
          category,
          label:
            EXP_CATEGORIES[category as keyof typeof EXP_CATEGORIES] ?? category,
          won: w,
        }))
        .sort((a, b) => b.won - a.won),
      payroll: sum(runs, (r) => r.totalGross),
    },
    payables: {
      toDraft: sum(pay, (p) => p.toDraft),
      toPay: sum(pay, (p) => p.toPay),
      balance: await balancesAt(db, range.to),
    },
    selfApproved,
    dayIssues: {
      unclosed: await unclosedDays(db, range.from, range.to),
      diffs: closes
        .filter(
          (c) =>
            c.diffWon !== 0 ||
            c.cardTerminalWon !== c.cardWon ||
            c.cashCountedWon !== c.cashWon,
        )
        .map((c) => ({
          day: c.day,
          diff: c.cardTerminalWon - c.cardWon + c.cashCountedWon - c.cashWon,
          note: c.note,
        })),
    },
  };
}

export async function getMonthClose(db: Db, ym: string) {
  const [m] = await db.select().from(monthClose).where(eq(monthClose.ym, ym));
  return m ?? null;
}

export async function listMonthCloses(db: Db) {
  return db.select().from(monthClose).orderBy(desc(monthClose.ym)).limit(24);
}

/** 월 마감 올리기(회계): 그 달이 끝났고, 수납이 있는 날은 모두 일일 마감했어야 한다 */
export async function prepareMonth(
  db: Db,
  actor: Actor,
  ym: string,
  note: string,
  now = new Date(),
) {
  if (!can(actor, "money.close_month"))
    throw new CloseError("월 마감은 회계 담당·대표가 올립니다");
  if (!isYm(ym)) throw new CloseError("달을 확인해 주세요");
  const today = seoulDate(now);
  if (ymRange(ym).to >= today)
    throw new CloseError(
      `${ym}이(가) 아직 끝나지 않았습니다. 다음 달에 올립니다`,
    );
  const old = await getMonthClose(db, ym);
  if (old && old.status !== "returned")
    throw new CloseError(
      old.status === "approved"
        ? "이미 마감(승인)한 달입니다"
        : "이미 올려서 대표 승인을 기다립니다",
    );
  const prev = await getMonthClose(db, prevYm(ym));
  const anyBefore =
    (await db.select({ ym: monthClose.ym }).from(monthClose).limit(1)).length >
    0;
  if (anyBefore && (!prev || prev.status !== "approved"))
    throw new CloseError(`앞달(${prevYm(ym)}) 마감을 먼저 끝내 주세요`);
  const s = await monthSummary(db, ym);
  if (s.dayIssues.unclosed.length)
    throw new CloseError(
      `일일 마감을 안 한 날이 있습니다: ${s.dayIssues.unclosed.join(", ")}`,
    );
  if (s.selfApproved.length && !note.trim())
    throw new CloseError(
      `대표 본인이 쓰고 승인한 건이 ${s.selfApproved.length}건 있습니다. 확인했다는 메모를 적어 주세요(12.4)`,
    );
  const values = {
    ym,
    status: "submitted",
    snapshot: s as unknown as Record<string, unknown>,
    note: note.trim() || null,
    preparedBy: actor.id,
    preparedAt: now,
    approvedBy: null,
    approvedAt: null,
    returnNote: null,
  };
  if (old)
    await db.update(monthClose).set(values).where(eq(monthClose.id, old.id));
  else await db.insert(monthClose).values(values);
  await writeAudit(db, {
    actorId: actor.id,
    action: "close.month_submit",
    entityType: "month_close",
    entityId: ym,
    after: {
      sales: s.sales.total,
      collected: s.collected.total,
      expenses: s.expenses.paid,
    },
  });
  await notifyRole(
    db,
    "owner",
    `월 마감 승인 요청: ${ym} 매출 ${won(s.sales.total)} · 지출 ${won(s.expenses.paid)}`,
    `close-month-${ym}-${now.getTime()}`,
    `/money/close/${ym}`,
  );
}

/** 대표 승인 또는 돌려보내기 */
export async function decideMonth(
  db: Db,
  actor: Actor,
  ym: string,
  ok: boolean,
  note: string,
  now = new Date(),
) {
  if (!can(actor, "money.close_approve"))
    throw new CloseError("월 마감 승인은 대표가 합니다");
  const m = await getMonthClose(db, ym);
  if (!m || m.status !== "submitted")
    throw new CloseError("승인 대기 중인 월 마감이 아닙니다");
  if (!ok && !note.trim())
    throw new CloseError("돌려보내는 이유를 적어 주세요");
  await db
    .update(monthClose)
    .set(
      ok
        ? { status: "approved", approvedBy: actor.id, approvedAt: now }
        : { status: "returned", returnNote: note.trim() },
    )
    .where(eq(monthClose.id, m.id));
  await writeAudit(db, {
    actorId: actor.id,
    action: ok ? "close.month_approve" : "close.month_return",
    entityType: "month_close",
    entityId: ym,
    after: ok ? null : { note: note.trim() },
  });
  // 마감 때 보고서 저장(보고서 센터 5단계). 보고서 모듈이 이 모듈을 쓰므로 여기서 불러온다
  if (ok) {
    const { saveMonthSnapshots } = await import("@/modules/report/snapshot");
    await saveMonthSnapshots(db, actor.id, ym, now);
  }
  if (m.preparedBy && m.preparedBy !== actor.id)
    await notifyUser(
      db,
      m.preparedBy,
      ok ? `월 마감 승인: ${ym}` : `월 마감 돌려보냄: ${ym} — ${note.trim()}`,
      `close-month-${ym}-${ok ? "ok" : now.getTime()}`,
      `/money/close/${ym}`,
    );
}

/** 내 할 일: 어제까지 일일 마감 안 한 날(일일 마감 권한), 지난달 월 마감(회계), 승인 대기 월 마감(대표) */
export async function closeTodos(db: Db, actor: Actor, today: string) {
  const out: {
    key: string;
    when: "late" | "today" | "soon";
    what: string;
    detail?: string;
    href: string;
    action: string;
  }[] = [];
  if (can(actor, "money.close_day")) {
    const days = await unclosedDays(db, "2000-01-01", today);
    for (const d of days)
      out.push({
        key: `close-day-${d}`,
        when: d < today ? "late" : "today",
        what: `일일 마감: ${d}`,
        detail: "카드 단말기 합계와 현금을 입금 전표와 맞춥니다",
        href: `/money/close?day=${d}`,
        action: "마감하기",
      });
  }
  const last = prevYm(today.slice(0, 7));
  if (can(actor, "money.close_month") && Number(today.slice(8)) >= 5) {
    const m = await getMonthClose(db, last);
    const any =
      (await db.select({ id: payment.id }).from(payment).limit(1)).length +
      (await db.select({ id: expense.id }).from(expense).limit(1)).length;
    if (any && (!m || m.status === "returned"))
      out.push({
        key: `close-month-${last}`,
        when: Number(today.slice(8)) > 10 ? "late" : "today",
        what: `월 마감: ${last}`,
        detail:
          m?.status === "returned"
            ? `대표가 돌려보냄: ${m.returnNote}`
            : "매출·수납·미수·매입·지출을 모아 대표에게 올립니다",
        href: `/money/close/${last}`,
        action: "마감 자료 보기",
      });
  }
  if (can(actor, "money.close_approve")) {
    for (const m of (await listMonthCloses(db)).filter(
      (x) => x.status === "submitted",
    ))
      out.push({
        key: `close-approve-${m.ym}`,
        when: "today",
        what: `월 마감 승인: ${m.ym}`,
        href: `/money/close/${m.ym}`,
        action: "확인·승인",
      });
  }
  return out;
}
