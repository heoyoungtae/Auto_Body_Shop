// 연간 예산(보고서 센터 5단계, 사용자 결정 2026-11-13: 대표가 연초에 달별로). 손익 묶음 6줄만 적는다.
// 입력을 줄이려고 한 해 금액만 적으면 고르게 또는 지난해 달별 비율로 나누고, 달별로 고칠 수 있다. 지난해 실적을 기본값으로 불러온다.
import { and, gte, lte } from "drizzle-orm";
import type { Db } from "@/db/client";
import { budgetLine } from "@/db/schema";
import { monthLocked } from "@/modules/money/lock";
import { writeAudit } from "@/modules/platform/audit";
import { buildJournal, type JEntry, sumBy } from "./journal";
import { ACCOUNTS, debitNormal } from "./accounts";
import { AcctError, canBooks } from "./service";
import type { Role } from "@/modules/auth/roles";

type Actor = { id: string; roles: Role[] };
type Sums = Map<string, { dr: number; cr: number }>;

/** 예산 줄: 손익계산서 묶음. sign 은 영업이익에 더하는(+) 빼는(−) 쪽 */
export const BUDGET_ROWS = [
  { key: "sales", label: "매출액", sign: 1, codes: ACCOUNTS.filter((a) => a.group === "sales").map((a) => a.code) },
  { key: "cogs", label: "매출원가(부품·도료·소모품·외주)", sign: -1, codes: ACCOUNTS.filter((a) => a.group === "cogs").map((a) => a.code) },
  { key: "labor", label: "인건비(급여·복리후생)", sign: -1, codes: ["801", "811"] },
  { key: "rent", label: "임차료", sign: -1, codes: ["819"] },
  { key: "sga_etc", label: "그 밖의 판관비", sign: -1, codes: ACCOUNTS.filter((a) => a.group === "sga" && !["801", "811", "819"].includes(a.code)).map((a) => a.code) },
  { key: "nonop", label: "영업외 순비용(이자 등 − 이자수익 등)", sign: -1, codes: [] as string[] },
] as const;
export type BudgetKey = (typeof BUDGET_ROWS)[number]["key"];
export const BUDGET_KEYS = BUDGET_ROWS.map((r) => r.key) as BudgetKey[];
export const isBudgetKey = (s: string): s is BudgetKey => (BUDGET_KEYS as string[]).includes(s);
export type BudgetVals = Record<BudgetKey, number>;
export const zeroVals = (): BudgetVals => ({ sales: 0, cogs: 0, labor: 0, rent: 0, sga_etc: 0, nonop: 0 });

const bal = (s: Sums, code: string) => {
  const x = s.get(code);
  if (!x) return 0;
  return debitNormal(code) ? x.dr - x.cr : x.cr - x.dr;
};
const groupOf = (g: string) => ACCOUNTS.filter((a) => a.group === g).map((a) => a.code);

/** 분개 합계 → 예산 줄 실적 */
export function actualVals(s: Sums): BudgetVals {
  const v = zeroVals();
  for (const r of BUDGET_ROWS) if (r.key !== "nonop") v[r.key] = r.codes.reduce((a, c) => a + bal(s, c), 0);
  v.nonop = groupOf("other_exp").reduce((a, c) => a + bal(s, c), 0) - groupOf("other_inc").reduce((a, c) => a + bal(s, c), 0);
  return v;
}
/** 매출총이익·영업이익·세전 이익 */
export const derived = (v: BudgetVals) => {
  const gross = v.sales - v.cogs;
  const op = gross - v.labor - v.rent - v.sga_etc;
  return { gross, op, net: op - v.nonop, fixed: v.labor + v.rent + v.sga_etc + v.nonop };
};

export const monthsOf = (year: number) => Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`);
const ymEnd = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return `${ym}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`;
};

/** 한 해 달별 예산(없는 달은 빈 값) */
export async function getBudget(db: Db, year: number) {
  const rows = await db
    .select()
    .from(budgetLine)
    .where(and(gte(budgetLine.ym, `${year}-01`), lte(budgetLine.ym, `${year}-12`)));
  const byYm = new Map<string, BudgetVals>();
  for (const r of rows) {
    if (!isBudgetKey(r.key)) continue;
    const v = byYm.get(r.ym) ?? (byYm.set(r.ym, zeroVals()), byYm.get(r.ym)!);
    v[r.key] = r.won;
  }
  const total = zeroVals();
  for (const v of byYm.values()) for (const k of BUDGET_KEYS) total[k] += v[k];
  return { byYm, total, has: rows.length > 0 };
}

/** 여러 해에 걸친 달별 예산(보고서용) */
export async function budgetRange(db: Db, fromYm: string, toYm: string) {
  const rows = await db
    .select()
    .from(budgetLine)
    .where(and(gte(budgetLine.ym, fromYm), lte(budgetLine.ym, toYm)));
  const byYm = new Map<string, BudgetVals>();
  for (const r of rows) {
    if (!isBudgetKey(r.key)) continue;
    const v = byYm.get(r.ym) ?? (byYm.set(r.ym, zeroVals()), byYm.get(r.ym)!);
    v[r.key] = r.won;
  }
  return byYm;
}

/** 지난해 달별 실적(예산 기본값·나누는 비율). js 를 주면 다시 만들지 않는다 */
export async function lastYearActual(db: Db, year: number, now = new Date(), js?: JEntry[]) {
  const j = js ?? (await buildJournal(db, `${year - 1}-12-31`, now));
  const byYm = new Map<string, BudgetVals>();
  const total = zeroVals();
  for (const ym of monthsOf(year - 1)) {
    const v = actualVals(sumBy(j.filter((e) => e.src !== "opening"), `${ym}-01`, ymEnd(ym)));
    byYm.set(ym, v);
    for (const k of BUDGET_KEYS) total[k] += v[k];
  }
  return { byYm, total, has: BUDGET_KEYS.some((k) => total[k] !== 0) };
}

/** 한 해 금액을 12달로 나눈다. weights 가 있으면 그 비율로(합이 0이면 고르게). 원 단위 끝수는 마지막 달에 */
export function spread(annual: number, weights?: number[]) {
  const w = weights && weights.some((x) => x > 0) ? weights.map((x) => Math.max(0, x)) : Array(12).fill(1);
  const tot = w.reduce((a, x) => a + x, 0);
  const out = w.map((x) => Math.round((annual * x) / tot / 1000) * 1000);
  out[11] += annual - out.reduce((a, x) => a + x, 0);
  return out;
}

export const canBudget = canBooks;

async function upsert(db: Db, actor: Actor, ym: string, v: Partial<BudgetVals>, now: Date) {
  for (const [k, won] of Object.entries(v)) {
    await db
      .insert(budgetLine)
      .values({ ym, key: k, won: won!, by: actor.id, at: now })
      .onConflictDoUpdate({ target: [budgetLine.ym, budgetLine.key], set: { won: won!, by: actor.id, at: now } });
  }
}

/** 한 해 예산 저장: 줄마다 한 해 금액 → 12달로 나눔(고르게 / 지난해 달별 비율) */
export async function saveAnnualBudget(db: Db, actor: Actor, year: number, input: { annual: Partial<BudgetVals>; method: "even" | "last" }, now = new Date()) {
  if (!canBudget(actor)) throw new AcctError("예산은 대표(또는 회계 담당)가 적습니다");
  if (!Number.isInteger(year) || year < 2000 || year > 2100) throw new AcctError("연도를 확인해 주세요");
  for (const k of BUDGET_KEYS) {
    const v = input.annual[k];
    if (v == null) continue;
    if (!Number.isInteger(v) || (k !== "nonop" && v < 0)) throw new AcctError(`${BUDGET_ROWS.find((r) => r.key === k)!.label}: 금액을 확인해 주세요`);
  }
  if (!BUDGET_KEYS.some((k) => input.annual[k])) throw new AcctError("한 줄 이상 금액을 적어 주세요");
  const last = input.method === "last" ? await lastYearActual(db, year, now) : null;
  const months = monthsOf(year);
  const per = new Map<string, Partial<BudgetVals>>(months.map((ym) => [ym, {}]));
  for (const k of BUDGET_KEYS) {
    const a = input.annual[k] ?? 0;
    const w = last ? months.map((ym) => last.byYm.get(`${year - 1}${ym.slice(4)}`)?.[k] ?? 0) : undefined;
    // 매출이 아닌 줄은 지난해 매출 비율로 나누면 어긋나므로 그 줄의 지난해 비율을 쓰되, 없으면 고르게
    spread(a, w).forEach((won, i) => (per.get(months[i])![k] = won));
  }
  const skipped: string[] = [];
  for (const ym of months) {
    // 월 마감이 끝난 달은 그대로 둔다(마감 때 본 예산이 바뀌지 않게)
    if (!(await monthLocked(db, ym))) await upsert(db, actor, ym, per.get(ym)!, now);
    else skipped.push(ym);
  }
  await writeAudit(db, { actorId: actor.id, action: "acct.budget", entityType: "budget", entityId: String(year), after: { method: input.method, ...input.annual, skipped } });
  return { skipped };
}

/** 한 달 예산 고치기 */
export async function saveMonthBudget(db: Db, actor: Actor, ym: string, v: Partial<BudgetVals>, now = new Date()) {
  if (!canBudget(actor)) throw new AcctError("예산은 대표(또는 회계 담당)가 적습니다");
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(ym)) throw new AcctError("달을 골라 주세요");
  for (const k of BUDGET_KEYS) {
    const x = v[k];
    if (x == null) continue;
    if (!Number.isInteger(x) || (k !== "nonop" && x < 0)) throw new AcctError(`${BUDGET_ROWS.find((r) => r.key === k)!.label}: 금액을 확인해 주세요`);
  }
  if (await monthLocked(db, ym)) throw new AcctError(`${ym}은 월 마감을 올린 달이라 예산을 고칠 수 없습니다`);
  await upsert(db, actor, ym, v, now);
  await writeAudit(db, { actorId: actor.id, action: "acct.budget_month", entityType: "budget", entityId: ym, after: v });
}
