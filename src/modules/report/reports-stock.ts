// 재고 보고서(보고서 센터 3단계): 18 재고현황, 19 재고 수불부, 20 재고회전율·장기 재고.
// 금액은 재고 움직임에 남긴 단가·금액(이동평균법, purchase/cost.ts)으로 계산한다.
// 기준일 재고 = 지금 장부 − 기준일 다음부터 지금까지의 움직임(수량·금액). 그래서 지난 달 말 재고 금액도 다시 나온다.
import { and, gt, gte, inArray, lte } from "drizzle-orm";
import { repairOrder, stockCount, stockItem, stockLot, stockMove } from "@/db/schema";
import { addDays, seoulDate } from "@/modules/platform/time";
import { belowSafety, COUNT_KINDS, EXPIRY_ALERT_DAYS, STOCK_KINDS } from "@/modules/purchase/rules";
import { type Builder, type Ctx, type Row, type TrendDef, daysBetween, m, pct, round1, sum, tsRange } from "./kit";

type Item = typeof stockItem.$inferSelect;
type Move = typeof stockMove.$inferSelect;

const kindLabel = (k: string) => STOCK_KINDS[k as keyof typeof STOCK_KINDS] ?? k;
const endOf = (d: string) => new Date(`${d}T23:59:59.999+09:00`);
const startOf = (d: string) => new Date(`${d}T00:00:00+09:00`);
/** 처음 등록(기초 재고)은 실사 조정이 아니라 들어온 것으로 본다 */
const isOpening = (x: Move) => x.reason === "count" && (x.note ?? "").startsWith("처음 등록");
/** 수불부 칸: 입고 · 사용 · 조정(실사) · 폐기 */
export function moveClass(x: Pick<Move, "reason" | "note">): "in" | "use" | "adj" | "discard" {
  if (x.reason === "receive" || isOpening(x as Move)) return "in";
  if (x.reason === "use") return "use";
  if (x.reason === "discard") return "discard";
  return "adj";
}

/** 품목·움직임(가장 이른 날부터) 불러오기 */
async function load(c: Ctx, from: string) {
  const items = await c.db.select().from(stockItem).orderBy(stockItem.kind, stockItem.name);
  const moves = await c.db.select().from(stockMove).where(gte(stockMove.at, startOf(from)));
  return { items, moves };
}

/** 품목별 기준일 끝 재고(수량·금액) */
export function balanceAt(items: Item[], moves: Move[], day: string) {
  const end = endOf(day);
  const out = new Map(items.map((i) => [i.id, { qty: Math.max(0, i.qty), won: i.qty > 0 ? i.valueWon : 0 }]));
  for (const x of moves) {
    if (x.at <= end) continue;
    const b = out.get(x.itemId);
    if (!b) continue;
    b.qty -= x.qty;
    b.won -= x.amountWon ?? 0;
  }
  // 기록이 모자란 옛 품목(단가 기록 전)에서 음수가 나오지 않게
  for (const b of out.values()) {
    if (b.qty <= 0) b.qty = b.won = 0;
    if (b.won < 0) b.won = 0;
  }
  return out;
}

type Flow = { qty: number; won: number };
const z = (): Flow => ({ qty: 0, won: 0 });
/** 기간 안 움직임을 품목·칸별로 모음(금액은 + 들어옴 / − 나감 그대로) */
function flows(moves: Move[], p: { from: string; to: string }) {
  const { start, end } = tsRange(p);
  const out = new Map<string, Record<ReturnType<typeof moveClass>, Flow>>();
  for (const x of moves) {
    if (x.at < start || x.at > end) continue;
    const f = out.get(x.itemId) ?? (out.set(x.itemId, { in: z(), use: z(), adj: z(), discard: z() }), out.get(x.itemId)!);
    const k = moveClass(x);
    f[k].qty += x.qty;
    f[k].won += x.amountWon ?? 0;
  }
  return out;
}
/** 빼기 부호 뒤집기(−0 이 보이지 않게) */
const neg = (n: number) => (n ? -n : 0);
const totalWon = (b: Map<string, { won: number }>) => sum([...b.values()], (x) => x.won);
const flowSum = (f: ReturnType<typeof flows>, k: "in" | "use" | "adj" | "discard") => sum([...f.values()], (x) => x[k].won);

/** 사용 금액 추이(매출원가 재료비) */
const TREND_USE: TrendDef = {
  key: "stockUse",
  label: "자재 사용 금액",
  unit: "원",
  load: async (db, from, to) => {
    const rows = await db.select({ at: stockMove.at, w: stockMove.amountWon, reason: stockMove.reason }).from(stockMove).where(and(gte(stockMove.at, startOf(from)), lte(stockMove.at, endOf(to))));
    return rows.filter((r) => r.reason === "use").map((r) => ({ on: seoulDate(r.at), w: neg(r.w ?? 0) }));
  },
};

/** 18. 재고현황(기준일 = 기간 끝날) */
export const stock: Builder = async (c) => {
  const { items, moves } = await load(c, c.q.to < c.p.to ? c.q.to : c.p.to);
  const bal = balanceAt(items, moves, c.p.to);
  const prev = balanceAt(items, moves, c.q.to);
  const held = items.filter((i) => (bal.get(i.id)?.qty ?? 0) > 0);
  const soon = addDays(c.today, EXPIRY_ALERT_DAYS);
  const lots = await c.db.select().from(stockLot).where(gt(stockLot.qty, 0));
  const byId = new Map(items.map((i) => [i.id, i]));
  const lotRows = lots.filter((l) => l.expiresOn <= soon && byId.has(l.itemId)).sort((a, b) => a.expiresOn.localeCompare(b.expiresOn));
  const low = items.filter((i) => i.active && !i.windDown && belowSafety(i));
  const won = totalWon(bal);
  const kinds = new Map<string, { n: number; won: number }>();
  for (const i of held) {
    const k = kinds.get(i.kind) ?? (kinds.set(i.kind, { n: 0, won: 0 }), kinds.get(i.kind)!);
    k.n++;
    k.won += bal.get(i.id)!.won;
  }
  return {
    kpis: [
      m("won", "재고 금액", "원", won, totalWon(prev), { note: `${c.p.to} 끝 기준, 공급가(이동평균)` }),
      m("items", "재고 있는 품목", "건", held.length, items.filter((i) => (prev.get(i.id)?.qty ?? 0) > 0).length),
      m("low", "안전재고 미달", "건", low.length, null, { now: true, better: "down", href: "/stock?f=low" }),
      m("expiry", `유효기간 ${EXPIRY_ALERT_DAYS}일 안·지남`, "건", lotRows.length, null, { now: true, better: "down", href: "/stock?f=expiry" }),
    ],
    tables: [
      {
        key: "stockItems",
        title: `품목별 재고(${c.p.to} 끝)`,
        help: "rep.t.stockItems",
        cols: [{ label: "품목" }, { label: "구분" }, { label: "수량", num: true }, { label: "단위" }, { label: "평균 단가", unit: "원", num: true }, { label: "금액", unit: "원", num: true }, { label: "안전재고", num: true }],
        rows: held.map((i) => {
          const b = bal.get(i.id)!;
          return { cells: [i.name, kindLabel(i.kind), b.qty, i.unit, Math.round(b.won / b.qty), b.won, i.safetyQty || null], href: `/stock/${i.id}`, tone: b.qty < i.safetyQty ? ("warn" as const) : undefined };
        }),
        total: ["합계", null, null, null, null, won, null],
        empty: "이 날 남은 재고가 없습니다.",
      },
      {
        key: "stockKinds",
        title: "구분별",
        help: "rep.t.stockKinds",
        cols: [{ label: "구분" }, { label: "품목", unit: "건", num: true }, { label: "금액", unit: "원", num: true }, { label: "비중", unit: "%", num: true }],
        rows: [...kinds.entries()].sort((a, b) => b[1].won - a[1].won).map(([k, v]) => ({ cells: [kindLabel(k), v.n, v.won, round1(pct(v.won, won))] })),
      },
      {
        key: "stockExpiry",
        title: `유효기간 ${EXPIRY_ALERT_DAYS}일 안·지난 로트(지금)`,
        help: "rep.t.stockExpiry",
        now: true,
        cols: [{ label: "품목" }, { label: "로트" }, { label: "유효기간" }, { label: "남은 수량", num: true }, { label: "남은 날", unit: "일", num: true }],
        rows: lotRows.map((l) => {
          const left = daysBetween(c.today, l.expiresOn);
          return { cells: [byId.get(l.itemId)!.name, l.lot ?? "—", l.expiresOn, l.qty, left], href: `/stock/${l.itemId}`, tone: left < 0 ? ("danger" as const) : ("warn" as const) };
        }),
        total: false,
        empty: "유효기간이 가까운 로트가 없습니다.",
      },
      {
        key: "stockLow",
        title: "안전재고 미달(지금)",
        help: "rep.t.stockLow",
        now: true,
        cols: [{ label: "품목" }, { label: "지금 수량", num: true }, { label: "안전재고", num: true }, { label: "모자람", num: true }, { label: "단위" }],
        rows: low.map((i) => ({ cells: [i.name, i.qty, i.safetyQty, i.safetyQty - i.qty, i.unit], href: `/stock/${i.id}`, tone: "warn" as const })),
        total: false,
        empty: "안전재고 밑으로 떨어진 품목이 없습니다.",
      },
    ],
    notes: ["금액은 부가세를 뺀 공급가입니다. 입고는 발주 단가로 더하고, 사용·폐기·실사 부족은 그때의 평균 단가로 뺍니다(이동평균법)."],
  };
};

/** 19. 재고 수불부 */
export const stockledger: Builder = async (c) => {
  const first = c.q.from < c.p.from ? c.q.from : c.p.from;
  const { items, moves } = await load(c, first);
  const calc = (p: { from: string; to: string }) => {
    const open = balanceAt(items, moves, addDays(p.from, -1));
    const close = balanceAt(items, moves, p.to);
    const f = flows(moves, p);
    return { open, close, f };
  };
  const a = calc(c.p);
  const b = calc(c.q);
  const k = (x: typeof a) => ({ open: totalWon(x.open), in: flowSum(x.f, "in"), use: neg(flowSum(x.f, "use")), adj: flowSum(x.f, "adj") + flowSum(x.f, "discard"), close: totalWon(x.close) });
  const ka = k(a);
  const kb = k(b);
  const rows: Row[] = [];
  for (const i of items) {
    const o = a.open.get(i.id)!;
    const e = a.close.get(i.id)!;
    const f = a.f.get(i.id) ?? { in: z(), use: z(), adj: z(), discard: z() };
    const adjQ = f.adj.qty + f.discard.qty;
    const adjW = f.adj.won + f.discard.won;
    if (!o.qty && !e.qty && !f.in.qty && !f.use.qty && !adjQ) continue;
    rows.push({ cells: [i.name, i.unit, o.qty, f.in.qty, neg(f.use.qty), adjQ, e.qty, o.won, f.in.won, neg(f.use.won), adjW, e.won], href: `/stock/${i.id}`, tone: adjW < 0 ? "warn" : undefined });
  }
  // 수리 건별 자재 사용(작업 원가 참고)
  const { start, end } = tsRange(c.p);
  const used = moves.filter((x) => x.reason === "use" && x.at >= start && x.at <= end);
  const byRo = new Map<string, { won: number; n: number; ref: string }>();
  for (const x of used) {
    const key = x.repairOrderId ?? "";
    const r = byRo.get(key) ?? (byRo.set(key, { won: 0, n: 0, ref: x.ref ?? "수리 건 없이 씀" }), byRo.get(key)!);
    r.won += neg(x.amountWon ?? 0);
    r.n++;
  }
  const roIds = [...byRo.keys()].filter(Boolean);
  const ros = roIds.length ? await c.db.select({ id: repairOrder.id, docNo: repairOrder.docNo }).from(repairOrder).where(inArray(repairOrder.id, roIds)) : [];
  const roNo = new Map(ros.map((r) => [r.id, r.docNo]));
  return {
    kpis: [
      m("open", "기초 재고", "원", ka.open, kb.open, { note: `${addDays(c.p.from, -1)} 끝` }),
      m("in", "들어옴(입고·등록)", "원", ka.in, kb.in, { href: "/purchases" }),
      m("use", "사용(재료비)", "원", ka.use, kb.use, { note: "작업에 쓴 자재의 원가" }),
      m("adj", "실사 조정·폐기", "원", ka.adj, kb.adj, { better: "up", note: "−면 재고감모·폐기 손실" }),
      m("close", "기말 재고", "원", ka.close, kb.close, { note: `${c.p.to} 끝` }),
    ],
    tables: [
      {
        key: "stockLedger",
        title: "품목별 수불",
        help: "rep.t.stockLedger",
        cols: [
          { label: "품목" },
          { label: "단위" },
          { label: "기초 수량", num: true },
          { label: "입고 수량", num: true },
          { label: "사용 수량", num: true },
          { label: "조정·폐기 수량", num: true },
          { label: "기말 수량", num: true },
          { label: "기초 금액", unit: "원", num: true },
          { label: "입고 금액", unit: "원", num: true },
          { label: "사용 금액", unit: "원", num: true },
          { label: "조정·폐기 금액", unit: "원", num: true },
          { label: "기말 금액", unit: "원", num: true },
        ],
        rows,
        total: ["합계", null, null, null, null, null, null, ka.open, ka.in, ka.use, ka.adj, ka.close],
        empty: "이 기간 재고 기록이 없습니다.",
        note: "기초 + 입고 − 사용 + 조정·폐기 = 기말. 수량은 품목마다 단위가 달라 합계를 내지 않습니다.",
      },
      {
        key: "stockByRepair",
        title: "수리 건별 자재 사용",
        help: "rep.t.stockByRepair",
        cols: [{ label: "수리 번호" }, { label: "사용 기록", unit: "건", num: true }, { label: "사용 금액", unit: "원", num: true }],
        rows: [...byRo.entries()].sort((x, y) => y[1].won - x[1].won).map(([id, v]) => ({ cells: [id ? (roNo.get(id) ?? v.ref) : v.ref, v.n, v.won], href: id ? `/repairs/${id}` : undefined })),
        empty: "이 기간 사용 기록이 없습니다.",
      },
    ],
    trends: [TREND_USE],
  };
};

/** 20. 재고회전율·장기 재고 */
export const turnover: Builder = async (c) => {
  const first = c.q.from < c.p.from ? c.q.from : c.p.from;
  const longFrom = addDays(c.p.to, -365);
  const { items, moves } = await load(c, first < longFrom ? first : longFrom);
  const calc = (p: { from: string; to: string }) => {
    const open = totalWon(balanceAt(items, moves, addDays(p.from, -1)));
    const close = totalWon(balanceAt(items, moves, p.to));
    const f = flows(moves, p);
    const use = neg(flowSum(f, "use"));
    const avgInv = (open + close) / 2;
    const turns = avgInv > 0 ? use / avgInv : null;
    const days = daysBetween(p.from, p.to) + 1;
    return { use, avgInv, turns, dayz: turns ? days / turns : null, loss: neg(flowSum(f, "adj") + flowSum(f, "discard")) };
  };
  const a = calc(c.p);
  const b = calc(c.q);
  const days = daysBetween(c.p.from, c.p.to) + 1;
  // 품목별 회전
  const open = balanceAt(items, moves, addDays(c.p.from, -1));
  const close = balanceAt(items, moves, c.p.to);
  const f = flows(moves, c.p);
  const itemRows: Row[] = [];
  for (const i of items) {
    const u = neg(f.get(i.id)?.use.won ?? 0);
    const av = ((open.get(i.id)?.won ?? 0) + (close.get(i.id)?.won ?? 0)) / 2;
    if (!u && !av) continue;
    const t = av > 0 ? u / av : null;
    itemRows.push({ cells: [i.name, kindLabel(i.kind), u, Math.round(av), round1(t), t ? Math.round(days / t) : null], href: `/stock/${i.id}`, tone: !u && av > 0 ? "warn" : undefined });
  }
  itemRows.sort((x, y) => (Number(y.cells[3]) || 0) - (Number(x.cells[3]) || 0));
  // 장기 재고: 기간 끝에 남아 있는데 90일 넘게 안 쓴 품목
  const lastUse = new Map<string, Date>();
  const endD = endOf(c.p.to);
  for (const x of moves) if (x.reason === "use" && x.at <= endD && (!lastUse.has(x.itemId) || lastUse.get(x.itemId)! < x.at)) lastUse.set(x.itemId, x.at);
  const stale = items
    .filter((i) => (close.get(i.id)?.qty ?? 0) > 0)
    .map((i) => {
      const lu = lastUse.get(i.id);
      const since = lu ? seoulDate(lu) : null;
      const age = daysBetween(since ?? seoulDate(i.createdAt), c.p.to);
      const old = !lu && i.createdAt < startOf(longFrom);
      return { i, since: since ?? (old ? "1년 넘음" : null), age, won: close.get(i.id)!.won, qty: close.get(i.id)!.qty };
    })
    .filter((x) => x.age > 90)
    .sort((x, y) => y.won - x.won);
  const staleWon = sum(stale, (x) => x.won);
  const counts = await c.db.select().from(stockCount).where(and(gte(stockCount.countedAt, tsRange(c.p).start), lte(stockCount.countedAt, tsRange(c.p).end)));
  return {
    kpis: [
      m("turns", "재고회전율", "회", round1(a.turns), round1(b.turns), { better: "up", note: "사용 금액 ÷ 평균 재고 금액" }),
      m("days", "재고 회전일수", "일", a.dayz ? Math.round(a.dayz) : null, b.dayz ? Math.round(b.dayz) : null, { better: "down", note: "가진 재고를 다 쓰는 데 걸리는 날 수" }),
      m("use", "사용 금액", "원", a.use, b.use),
      m("avg", "평균 재고 금액", "원", Math.round(a.avgInv), Math.round(b.avgInv), { note: "(기초 + 기말) ÷ 2" }),
      m("stale", "90일 넘게 안 쓴 재고", "원", staleWon, null, { better: "down", note: `${c.p.to} 끝 기준` }),
      m("loss", "재고감모·폐기 손실", "원", a.loss, b.loss, { better: "down", note: "실사 부족·폐기 금액(실사로 늘어난 것은 뺌)" }),
    ],
    tables: [
      {
        key: "turnItems",
        title: "품목별 회전",
        help: "rep.t.turnItems",
        cols: [{ label: "품목" }, { label: "구분" }, { label: "사용 금액", unit: "원", num: true }, { label: "평균 재고", unit: "원", num: true }, { label: "회전율", unit: "회", num: true }, { label: "회전일수", unit: "일", num: true }],
        rows: itemRows,
        total: ["합계", null, a.use, Math.round(a.avgInv), round1(a.turns), a.dayz ? Math.round(a.dayz) : null],
        empty: "이 기간 재고 기록이 없습니다.",
      },
      {
        key: "staleItems",
        title: "장기 재고(90일 넘게 안 씀)",
        help: "rep.t.staleItems",
        cols: [{ label: "품목" }, { label: "마지막 사용" }, { label: "안 쓴 날", unit: "일", num: true }, { label: "수량", num: true }, { label: "금액", unit: "원", num: true }],
        rows: stale.map((x) => ({ cells: [x.i.name, x.since ?? "쓴 적 없음", x.age, x.qty, x.won], href: `/stock/${x.i.id}`, tone: "warn" as const })),
        total: ["합계", null, null, null, staleWon],
        empty: "90일 넘게 안 쓴 재고가 없습니다.",
        note: "쓴 적 없는 품목은 등록일부터 셉니다. 반품·대체품 전환·사용 중지를 검토하세요.",
      },
      {
        key: "stockCounts",
        title: "실사 결과",
        help: "rep.t.stockCounts",
        cols: [{ label: "날짜" }, { label: "구분" }, { label: "장부 금액", unit: "원", num: true }, { label: "차이 금액", unit: "원", num: true }, { label: "차이율", unit: "%", num: true }],
        rows: counts.map((x) => ({ cells: [seoulDate(x.countedAt), COUNT_KINDS[x.kind as keyof typeof COUNT_KINDS] ?? x.kind, x.bookWon, x.diffWon, round1(pct(Math.abs(x.diffWon), x.bookWon))], href: "/stock/count", tone: x.ncId ? ("danger" as const) : undefined })),
        total: false,
        empty: "이 기간 실사가 없습니다.",
      },
    ],
    trends: [TREND_USE],
  };
};
