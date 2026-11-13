// 외상매입금·미지급금(STD-12 12.2, 대표 결정 2026-11-11).
// - 입고 검수가 끝난 발주서·결과를 수용한 외주 의뢰서는 그날(세금계산서가 먼저면 그 날) 채무가 된다. 발주 승인이 곧 구매 승인이라 발주서마다 결의를 쓰지 않는다.
// - 지출 계정으로 외상매입금(부품·도료·소모품, 외주는 정책값)과 미지급금(그 밖)을 나눈다.
// - 지급 기한은 결제 조건(발주서 → 업체)으로 계산하고, 은행이 쉬는 날이면 바로 앞 영업일로 당긴다.
// - 갚을 때는 업체별 '지급 결의' 한 장(expense.sourceKind = settle)에 기한 된 채무를 모아 결재 한 번 받고 지급한다.
// - 결의서로 바로 승인한 지출(설비·광고 등)은 승인 뒤 지급 전까지 미지급금, 사업자 카드로 쓴 것은 카드 결제일까지 미지급금(카드).
import { and, asc, desc, eq, inArray, isNull, lte, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { approvalDoc, expense, outsourceJob, payable, purchaseLine, purchaseOrder, purchaseReceipt, stockItem, supplier } from "@/db/schema";
import { can } from "@/modules/auth/permissions";
import type { Role } from "@/modules/auth/roles";
import { isBusinessDay, type ShopCalendar } from "@/modules/platform/business-days";
import { loadShopCalendar } from "@/modules/platform/calendar";
import { loadPolicy } from "@/modules/platform/policy";
import { addDays, seoulDate } from "@/modules/platform/time";
import { itemExpCategory, VAT } from "@/modules/purchase/rules";
import { monthLocked } from "./lock";
import { backToBusinessDay, cardDueOn, expStatus, isPayTerm, PO_KIND_CATEGORY, payableKind, splitByShare, termDate, type ExpStatus, type PayTerm } from "./rules";

type Actor = { id: string; roles: Role[] };
const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;

/** 은행 영업일 달력: 평일, 법정 공휴일·설정에서 넣은 공휴일은 쉼(가게 휴무·특별 영업일은 상관없음) */
export async function bankCalendar(db: Db): Promise<ShopCalendar> {
  const shop = await loadShopCalendar(db);
  return {
    workdays: [1, 2, 3, 4, 5],
    excludeHolidays: true,
    days: Object.fromEntries(Object.entries(shop.days).filter(([, d]) => d.kind === "holiday")),
    official: shop.official,
  };
}

/** 지급 기한: 결제 조건으로 정한 날을 은행 영업일로 당긴다. 선입금은 승인한 날(당기지 않음 — 승인 전에 낼 수는 없다) */
export function payDueOn(cal: ShopCalendar, accruedOn: string, term: PayTerm, day: number | null) {
  if (term === "prepay") return accruedOn;
  return backToBusinessDay(termDate(accruedOn, term, day), (d) => isBusinessDay(cal, d));
}

/** 발주서의 결제 조건(발주서 → 업체 → 익월 말) */
const poTerm = (o: { payTerm: string | null; payDay: number | null }, s: { payTerm: string; payDay: number | null } | null) => ({
  term: (isPayTerm(o.payTerm ?? "") ? o.payTerm : s && isPayTerm(s.payTerm) ? s.payTerm : "next_end") as PayTerm,
  day: o.payTerm ? o.payDay : (s?.payDay ?? null),
});

/** 발주서 줄로 계정 나누기. received: 들어온(합격) 수량 기준, 아니면 주문 수량 기준 */
const lineParts = (ls: (typeof purchaseLine.$inferSelect)[], itemCat: Map<string, string>, baseCat: string, received: boolean) =>
  ls.map((l) => ({ category: (l.stockItemId && itemCat.get(l.stockItemId)) || baseCat, won: (received ? Math.max(0, l.receivedQty - l.rejectedQty) : l.qty) * l.unitWon }));

/** 마감한 달로는 새 채무를 적지 않는다(마감 숫자가 바뀌지 않게). 그럴 땐 오늘로 */
async function openDay(db: Db, day: string, today: string) {
  return (await monthLocked(db, day.slice(0, 7))) ? today : day;
}

/**
 * 입고 끝난 발주서·수용한 외주에서 채무를 만든다(아직 없는 금액만). 예전 방식(발주서마다 결의)으로 이미 결의한 금액은 뺀다.
 * 화면·할 일·마감에서 읽기 전에 부른다. 같은 금액이 두 번 생기지 않게 잠금 안에서 돈다
 */
export async function syncPayables(db: Db, now = new Date()) {
  const today = seoulDate(now);
  const p = await loadPolicy(db, today);
  const outTrade = p["money.outsource_trade"] === 1;
  const cal = await bankCalendar(db);
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(712202)`);
    const pos = await tx
      .select({ o: purchaseOrder, s: supplier })
      .from(purchaseOrder)
      .leftJoin(supplier, eq(supplier.id, purchaseOrder.supplierId))
      .where(inArray(purchaseOrder.status, ["approved", "sent", "partial", "received", "cancelled"]));
    const oss = await tx
      .select({ j: outsourceJob, s: supplier })
      .from(outsourceJob)
      .innerJoin(supplier, eq(supplier.id, outsourceJob.supplierId))
      .where(eq(outsourceJob.status, "accepted"));
    const ids = [...pos.map((x) => x.o.id), ...oss.map((x) => x.j.id)];
    if (!ids.length) return;
    // 취소한 선입금 발주서: 아직 지급 결의에 묶이지 않은 '낼 돈'은 지운다(결의했거나 낸 것은 남겨 선급금 잔액으로 보인다)
    const cancelled = pos.filter((x) => x.o.status === "cancelled").map((x) => x.o.id);
    if (cancelled.length) await tx.delete(payable).where(and(inArray(payable.sourceId, cancelled), eq(payable.kind, "prepay"), isNull(payable.settleExpenseId)));
    const have = await tx.select({ sourceId: payable.sourceId, amountWon: payable.amountWon }).from(payable).where(inArray(payable.sourceId, ids));
    // 예전 방식 결의(발주서·외주 의뢰서를 근거로 직접 쓴 결의 중 살아 있는 것)
    const legacy = await tx
      .select({ sourceId: expense.sourceId, amountWon: expense.amountWon, docStatus: approvalDoc.status, paidAt: expense.paidAt, cancelledAt: expense.cancelledAt })
      .from(expense)
      .innerJoin(approvalDoc, eq(approvalDoc.id, expense.approvalDocId))
      .where(and(inArray(expense.sourceId, ids), inArray(expense.sourceKind, ["po", "outsource"])));
    const covered = (id: string) =>
      have.filter((h) => h.sourceId === id).reduce((a, h) => a + h.amountWon, 0) +
      legacy.filter((l) => l.sourceId === id && expStatus(l.docStatus, l.paidAt, l.cancelledAt) !== "cancelled").reduce((a, l) => a + l.amountWon, 0);

    const lines = pos.length ? await tx.select().from(purchaseLine).where(inArray(purchaseLine.orderId, pos.map((x) => x.o.id))) : [];
    const itemIds = [...new Set(lines.map((l) => l.stockItemId).filter((x): x is string => !!x))];
    const itemCat = new Map((itemIds.length ? await tx.select({ id: stockItem.id, kind: stockItem.kind, expCategory: stockItem.expCategory }).from(stockItem).where(inArray(stockItem.id, itemIds)) : []).map((i) => [i.id, itemExpCategory(i)]));
    const lastRcv = pos.length
      ? await tx.select({ orderId: purchaseReceipt.orderId, at: sql<Date>`max(${purchaseReceipt.receivedAt})` }).from(purchaseReceipt).where(inArray(purchaseReceipt.orderId, pos.map((x) => x.o.id))).groupBy(purchaseReceipt.orderId)
      : [];

    for (const { o, s } of pos) {
      if (o.status === "cancelled") continue;
      const ls = lines.filter((l) => l.orderId === o.id);
      const { term, day } = poTerm(o, s);
      const baseCat0 = PO_KIND_CATEGORY[o.kind] ?? "parts";
      if (term === "prepay") {
        // 선입금: 승인한 날 발주서 합계만큼 '낼 돈'이 생긴다. 입고 때는 따로 채무를 만들지 않는다(낸 돈이 선급금에서 매입으로 바뀜)
        const delta = o.totalWon - covered(o.id);
        if (delta <= 10) continue;
        const split = splitByShare(lineParts(ls, itemCat, baseCat0, false), delta);
        const on = await openDay(tx as unknown as Db, seoulDate(o.approvedAt ?? now), today);
        const supply = Math.round(delta / (1 + VAT));
        await tx.insert(payable).values({
          kind: "prepay",
          supplierId: o.supplierId,
          payeeName: s?.name ?? "(업체 없음)",
          sourceKind: "po",
          sourceId: o.id,
          sourceNo: o.docNo,
          category: split[0]?.category ?? baseCat0,
          split,
          supplyWon: supply,
          vatWon: delta - supply,
          amountWon: delta,
          accruedOn: on,
          dueOn: on,
          payTerm: term,
          invoiceNo: o.invoiceNo,
          createdAt: now,
        });
        continue;
      }
      if (o.status !== "partial" && o.status !== "received") continue;
      const got = ls.reduce((a, l) => a + Math.max(0, l.receivedQty - l.rejectedQty) * l.unitWon, 0);
      // 다 들어왔으면 발주서 합계, 일부면 들어온 만큼(줄이 없는 옛 자료는 발주서 합계)
      const amount = o.status === "received" && (got === o.supplyWon || !ls.length) ? o.totalWon : got + Math.round(got * VAT);
      const delta = amount - covered(o.id);
      if (delta <= 10) continue;
      const baseCat = PO_KIND_CATEGORY[o.kind] ?? "parts";
      const parts = ls.map((l) => ({ category: (l.stockItemId && itemCat.get(l.stockItemId)) || baseCat, won: Math.max(0, l.receivedQty - l.rejectedQty) * l.unitWon }));
      const split = splitByShare(parts, delta);
      const category = split[0]?.category ?? parts.find((x) => x.won > 0)?.category ?? baseCat;
      const rcv = lastRcv.find((r) => r.orderId === o.id)?.at ?? o.receivedAt ?? now;
      let on = seoulDate(new Date(rcv));
      if (o.invoiceOn && o.invoiceOn < on) on = o.invoiceOn;
      on = await openDay(tx as unknown as Db, on, today);
      const supply = Math.round(delta / (1 + VAT));
      await tx.insert(payable).values({
        kind: payableKind(category, outTrade),
        supplierId: o.supplierId,
        payeeName: s?.name ?? "(업체 없음)",
        sourceKind: "po",
        sourceId: o.id,
        sourceNo: o.docNo,
        category,
        split,
        supplyWon: supply,
        vatWon: delta - supply,
        amountWon: delta,
        accruedOn: on,
        dueOn: payDueOn(cal, on, term, day),
        payTerm: term,
        invoiceNo: o.invoiceNo,
        createdAt: now,
      });
    }
    for (const { j, s } of oss) {
      const delta = j.amountWon - covered(j.id);
      if (delta <= 10) continue;
      const on = await openDay(tx as unknown as Db, seoulDate(j.acceptedAt ?? now), today);
      // 외주는 결과를 받고 수용한 뒤에 내므로 선입금이면 '입고 때 바로'로 본다
      const term: PayTerm = isPayTerm(s.payTerm) ? (s.payTerm === "prepay" ? "now" : (s.payTerm as PayTerm)) : "next_end";
      const supply = Math.round(delta / (1 + VAT));
      await tx.insert(payable).values({
        kind: payableKind("outsource", outTrade),
        supplierId: s.id,
        payeeName: s.name,
        sourceKind: "outsource",
        sourceId: j.id,
        sourceNo: j.docNo,
        category: "outsource",
        split: [],
        supplyWon: supply,
        vatWon: delta - supply,
        amountWon: delta,
        accruedOn: on,
        dueOn: payDueOn(cal, on, term, s.payDay),
        payTerm: term,
        createdAt: now,
      });
    }
  });
}

export type PayableRow = typeof payable.$inferSelect & { status: "open" | ExpStatus; settleNo: string | null; paidOn: string | null };

/** 채무 목록(지급 결의 상태 포함). supplierId 를 주면 그 업체만 */
export async function listPayables(db: Db, supplierId?: string): Promise<PayableRow[]> {
  const rows = await db
    .select({ p: payable, e: expense, docStatus: approvalDoc.status })
    .from(payable)
    .leftJoin(expense, eq(expense.id, payable.settleExpenseId))
    .leftJoin(approvalDoc, eq(approvalDoc.id, expense.approvalDocId))
    .where(supplierId ? eq(payable.supplierId, supplierId) : undefined)
    .orderBy(asc(payable.dueOn), asc(payable.accruedOn));
  return rows.map(({ p, e, docStatus }) => {
    const st = e ? expStatus(docStatus ?? "", e.paidAt, e.cancelledAt) : "open";
    // 결의가 취소됐으면 다시 갚을 채무
    return { ...p, status: st === "cancelled" ? "open" : st, settleNo: st === "cancelled" ? null : (e?.docNo ?? null), paidOn: st === "paid" ? (e?.paidOn ?? null) : null };
  });
}

const unpaidStatus = (s: PayableRow["status"]) => s !== "paid";

/** 결의서로 바로 승인했는데 아직 안 낸 지출(설비·광고 등) = 미지급금, 카드로 쓰고 결제일 전 = 미지급금(카드) */
async function directUnpaid(db: Db, asOf: string, cardPayDay: number) {
  const rows = await db
    .select({ e: expense, docStatus: approvalDoc.status })
    .from(expense)
    .innerJoin(approvalDoc, eq(approvalDoc.id, expense.approvalDocId))
    .where(and(inArray(expense.sourceKind, ["none", "po", "outsource"]), isNull(expense.cancelledAt)));
  const other: { e: typeof expense.$inferSelect; on: string }[] = [];
  const card: { e: typeof expense.$inferSelect; on: string; dueOn: string }[] = [];
  for (const { e, docStatus } of rows) {
    const st = expStatus(docStatus, e.paidAt, e.cancelledAt);
    if (st === "cancelled" || st === "draft" || st === "rejected" || st === "in_progress") continue;
    const on = e.evidenceOn ?? seoulDate(e.createdAt);
    if (on > asOf) continue;
    if (e.payMethod === "card" && e.paidOn) {
      const due = cardDueOn(e.paidOn, cardPayDay);
      if (e.paidOn <= asOf && due > asOf) card.push({ e, on: e.paidOn, dueOn: due });
      continue;
    }
    if (!e.paidOn || e.paidOn > asOf) other.push({ e, on });
  }
  return { other, card };
}

/** 업체별 외상매입금·미지급금(지금 기준): 잔액·기한 지남·이번 달·다음 달 지급할 돈 */
export async function payableGroups(db: Db, now = new Date()) {
  await syncPayables(db, now);
  const today = seoulDate(now);
  const p = await loadPolicy(db, today);
  const thisEnd = termDate(today, "month_end", null);
  const nextEnd = termDate(today, "next_end", null);
  const open = (await listPayables(db)).filter((x) => unpaidStatus(x.status));
  const sids = [...new Set(open.map((x) => x.supplierId).filter((x): x is string => !!x))];
  const sups = new Map((sids.length ? await db.select().from(supplier).where(inArray(supplier.id, sids)) : []).map((s) => [s.id, s]));
  const groups = new Map<string, { supplierId: string | null; name: string; bankVerified: boolean | null; trade: number; other: number; prepay: number; overdue: number; dueThisMonth: number; dueNextMonth: number; toSettle: number; inSettle: number; items: PayableRow[] }>();
  for (const x of open) {
    const k = x.supplierId ?? `name:${x.payeeName}`;
    const s = x.supplierId ? sups.get(x.supplierId) : undefined;
    if (!groups.has(k)) groups.set(k, { supplierId: x.supplierId, name: s?.name ?? x.payeeName, bankVerified: s ? !!s.bankAccountEnc && !!s.bankVerifiedAt : null, trade: 0, other: 0, prepay: 0, overdue: 0, dueThisMonth: 0, dueNextMonth: 0, toSettle: 0, inSettle: 0, items: [] });
    const g = groups.get(k)!;
    g.items.push(x);
    g[x.kind === "trade" ? "trade" : x.kind === "prepay" ? "prepay" : "other"] += x.amountWon;
    if (x.dueOn < today) g.overdue += x.amountWon;
    if (x.dueOn <= thisEnd) g.dueThisMonth += x.amountWon;
    else if (x.dueOn <= nextEnd) g.dueNextMonth += x.amountWon;
    if (x.status === "open") g.toSettle += x.amountWon;
    else g.inSettle += x.amountWon;
  }
  const direct = await directUnpaid(db, today, p["money.card_pay_day"]);
  const prepaid = await prepaidBalances(db, today);
  const list = [...groups.values()].sort((a, b) => b.overdue - a.overdue || b.trade + b.other - (a.trade + a.other));
  return {
    groups: list,
    direct: direct.other,
    card: direct.card,
    prepaid,
    totals: {
      prepay: list.reduce((a, g) => a + g.prepay, 0),
      prepaid: prepaid.reduce((a, x) => a + x.balance, 0),
      trade: list.reduce((a, g) => a + g.trade, 0),
      other: list.reduce((a, g) => a + g.other, 0) + direct.other.reduce((a, d) => a + d.e.amountWon, 0),
      card: direct.card.reduce((a, d) => a + d.e.amountWon, 0),
      overdue: list.reduce((a, g) => a + g.overdue, 0),
      dueThisMonth: list.reduce((a, g) => a + g.dueThisMonth, 0),
      dueNextMonth: list.reduce((a, g) => a + g.dueNextMonth, 0),
    },
  };
}

/** 거래처 원장: 채무가 생긴 날(+)과 지급한 날(−)을 날짜순으로, 잔액과 함께 */
export async function supplierLedger(db: Db, supplierId: string, now = new Date()) {
  await syncPayables(db, now);
  const [s] = await db.select().from(supplier).where(eq(supplier.id, supplierId));
  if (!s) return null;
  const all = await listPayables(db, supplierId);
  // 지급 결의(settle)와 예전 방식 결의의 지급
  const paidExp = await db
    .select({ e: expense, docStatus: approvalDoc.status })
    .from(expense)
    .innerJoin(approvalDoc, eq(approvalDoc.id, expense.approvalDocId))
    .where(and(eq(expense.supplierId, supplierId), inArray(expense.sourceKind, ["settle"])))
    .orderBy(desc(expense.createdAt));
  const rows: { on: string; what: string; href: string; plus: number; minus: number }[] = [];
  for (const x of all) rows.push({ on: x.accruedOn, what: `${x.sourceKind === "po" ? "발주서" : "외주"} ${x.sourceNo} ${x.kind === "prepay" ? "선입금(발주 승인)" : "입고"}${x.invoiceNo ? ` · 계산서 ${x.invoiceNo}` : ""}`, href: x.sourceKind === "po" ? `/purchases/${x.sourceId}` : `/outsource/${x.sourceId}`, plus: x.amountWon, minus: 0 });
  for (const { e, docStatus } of paidExp) if (expStatus(docStatus, e.paidAt, e.cancelledAt) === "paid" && e.paidOn) rows.push({ on: e.paidOn, what: `지급 ${e.docNo}${e.paidTo ? ` → ${e.paidTo}` : ""}`, href: `/money/expenses/${e.id}`, plus: 0, minus: e.amountWon });
  rows.sort((a, b) => a.on.localeCompare(b.on) || b.plus - a.plus);
  let bal = 0;
  const ledger = rows.map((r) => ({ ...r, balance: (bal += r.plus - r.minus) }));
  const prepaid = (await prepaidBalances(db, seoulDate(now))).filter((x) => x.supplierId === supplierId);
  return { s, prepaid, open: all.filter((x) => x.status === "open"), inSettle: all.filter((x) => x.status !== "open" && x.status !== "paid"), ledger: ledger.reverse(), balance: bal };
}

/** 지급 결의에 넣을 채무(그 업체의 아직 결의 안 한 것 중 고른 것). 없거나 이미 결의 중이면 오류 문구 */
export async function settleTargets(db: Db, supplierId: string, ids: string[]) {
  const open = (await listPayables(db, supplierId)).filter((x) => x.status === "open");
  const picked = ids.length ? open.filter((x) => ids.includes(x.id)) : [];
  if (ids.length && picked.length !== ids.length) return { error: "고른 채무 중 이미 지급 결의했거나 없는 것이 있습니다. 목록을 새로 열어 다시 고르세요", picked: [], open };
  return { error: null, picked, open };
}

/** 내 할 일(회계): 지급 기한이 정책값(일) 안에 오거나 지난 채무를 업체별로 지급 결의하라 */
export async function payableTodos(db: Db, actor: Actor, today: string, now = new Date()) {
  const out: { key: string; when: "late" | "today" | "soon"; what: string; detail?: string; href: string; action: string }[] = [];
  if (!can(actor, "expense.draft")) return out;
  const p = await loadPolicy(db, today);
  const until = addDays(today, p["money.pay_alert_days"]);
  const { groups } = await payableGroups(db, now);
  for (const g of groups) {
    const due = g.items.filter((x) => x.status === "open" && x.dueOn <= until);
    if (!due.length || !g.supplierId) continue;
    const first = due[0].dueOn;
    out.push({
      key: `pay-due-${g.supplierId}-${first}`,
      when: first < today ? "late" : first === today ? "today" : "soon",
      what: `지급 결의: ${g.name} ${won(due.reduce((a, x) => a + x.amountWon, 0))}(${due.length}건)`,
      detail: `기한 ${first}${first < today ? " 지남" : ""}`,
      href: `/money/payables/${g.supplierId}`,
      action: "지급 결의 쓰기",
    });
  }
  return out;
}

/** 어느 날 기준 잔액(월 마감 자료): 그날까지 생겼고 그날까지 안 낸 것 */
export async function balancesAt(db: Db, asOf: string, now = new Date()) {
  await syncPayables(db, now);
  const p = await loadPolicy(db, asOf);
  // 선입금 '낼 돈'은 물건을 받기 전이라 채무가 아니다(낸 뒤에는 선급금 = 자산으로 따로 센다)
  const all = (await listPayables(db)).filter((x) => x.kind !== "prepay" && x.accruedOn <= asOf && !(x.paidOn && x.paidOn <= asOf));
  const by = new Map<string, { name: string; trade: number; other: number }>();
  for (const x of all) {
    const k = x.supplierId ?? x.payeeName;
    if (!by.has(k)) by.set(k, { name: x.payeeName, trade: 0, other: 0 });
    by.get(k)![x.kind === "trade" ? "trade" : "other"] += x.amountWon;
  }
  const d = await directUnpaid(db, asOf, p["money.card_pay_day"]);
  return {
    trade: all.filter((x) => x.kind === "trade").reduce((a, x) => a + x.amountWon, 0),
    other: all.filter((x) => x.kind !== "trade").reduce((a, x) => a + x.amountWon, 0) + d.other.reduce((a, x) => a + x.e.amountWon, 0),
    card: d.card.reduce((a, x) => a + x.e.amountWon, 0),
    prepaid: (await prepaidBalances(db, asOf)).reduce((a, x) => a + x.balance, 0),
    bySupplier: [...by.values()].sort((a, b) => b.trade + b.other - (a.trade + a.other)),
  };
}

/** 기간 안에 생긴 매입·비용(월 마감 계정별, 입고일 기준). 선입금 발주서는 낸 날이 아니라 입고 검수한 날 매입으로 센다 */
export async function accruedIn(db: Db, from: string, to: string): Promise<{ category: string; split: { category: string; won: number }[]; amountWon: number }[]> {
  const rows = (await db.select().from(payable).where(and(sql`${payable.accruedOn} >= ${from}`, lte(payable.accruedOn, to)))).filter((x) => x.kind !== "prepay");
  for (const r of await prepayReceipts(db)) if (r.on >= from && r.on <= to && r.won > 0) rows.push({ ...r.payable, split: splitByShare(r.parts, r.won), amountWon: r.won });
  return rows;
}

/** 선입금 발주서마다: 들어온(합격) 물건 값(부가세 포함)과 마지막 입고 날짜 */
export async function prepayReceipts(db: Db) {
  const pre = await db.select().from(payable).where(eq(payable.kind, "prepay"));
  const poIds = [...new Set(pre.map((x) => x.sourceId))];
  if (!poIds.length) return [];
  const pos = await db.select().from(purchaseOrder).where(inArray(purchaseOrder.id, poIds));
  const lines = await db.select().from(purchaseLine).where(inArray(purchaseLine.orderId, poIds));
  const itemIds = [...new Set(lines.map((l) => l.stockItemId).filter((x): x is string => !!x))];
  const itemCat = new Map((itemIds.length ? await db.select({ id: stockItem.id, kind: stockItem.kind, expCategory: stockItem.expCategory }).from(stockItem).where(inArray(stockItem.id, itemIds)) : []).map((i) => [i.id, itemExpCategory(i)]));
  const last = await db.select({ orderId: purchaseReceipt.orderId, at: sql<Date>`max(${purchaseReceipt.receivedAt})` }).from(purchaseReceipt).where(inArray(purchaseReceipt.orderId, poIds)).groupBy(purchaseReceipt.orderId);
  return pos.map((o) => {
    const ls = lines.filter((l) => l.orderId === o.id);
    const got = ls.reduce((a, l) => a + Math.max(0, l.receivedQty - l.rejectedQty) * l.unitWon, 0);
    const won = o.status === "received" && (got === o.supplyWon || !ls.length) ? o.totalWon : got + Math.round(got * VAT);
    const at = last.find((r) => r.orderId === o.id)?.at ?? o.receivedAt;
    return {
      poId: o.id,
      payable: pre.find((x) => x.sourceId === o.id)!,
      on: at ? seoulDate(new Date(at)) : "9999-12-31",
      won,
      parts: lineParts(ls, itemCat, PO_KIND_CATEGORY[o.kind] ?? "parts", true),
    };
  });
}

/** 선급금 잔액(낸 돈 중 아직 물건이 안 들어온 만큼) — asOf 날까지 낸 것·들어온 것으로. 발주를 취소했으면 낸 돈 전부(돌려받을 돈) */
export async function prepaidBalances(db: Db, asOf: string) {
  const paid = (await listPayables(db)).filter((x) => x.kind === "prepay" && x.status === "paid" && x.paidOn && x.paidOn <= asOf);
  if (!paid.length) return [];
  const rcv = await prepayReceipts(db);
  const by = new Map<string, { supplierId: string | null; name: string; poId: string; poNo: string; paid: number; received: number; balance: number }>();
  for (const x of paid) {
    const r = rcv.find((y) => y.poId === x.sourceId);
    const got = r && r.on <= asOf ? r.won : 0;
    const k = x.sourceId;
    if (!by.has(k)) by.set(k, { supplierId: x.supplierId, name: x.payeeName, poId: x.sourceId, poNo: x.sourceNo, paid: 0, received: Math.min(got, Number.MAX_SAFE_INTEGER), balance: 0 });
    by.get(k)!.paid += x.amountWon;
  }
  return [...by.values()].map((v) => ({ ...v, balance: Math.max(0, v.paid - v.received) })).filter((v) => v.balance > 0);
}
