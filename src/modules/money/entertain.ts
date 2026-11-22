// 접대비(기업업무추진비) 한도 현황(2026-11-22 대표 결정): 올해 쓴 접대비와 한도, 한도의 몇 %면 대표 할 일.
// 한도 = 기본 한도(정책값, 중소기업 3,600만원) × 올해 사업 달수/12 + 수입금액(매출) × 비율(100억 이하 0.3%, 500억 이하 0.2%, 그 위 0.03%).
// 금액은 어림이며 최종 판단은 세무사가 한다. 매출은 올해 발급한 정비명세서 공급가 합계로 본다.
import { and, gte, lte, ne, eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { acctOpening, repairOrder, repairStatement } from "@/db/schema";
import { can } from "@/modules/auth/permissions";
import type { Role } from "@/modules/auth/roles";
import { loadPolicy } from "@/modules/platform/policy";
import { listExpenses } from "./expense";

/** 수입금액에 따른 한도 가산액(법인세법 제25조 제4항 제2호 표) */
export function salesAllowance(sales: number) {
  const a = Math.min(sales, 10_000_000_000) * 0.003;
  const b = Math.max(0, Math.min(sales, 50_000_000_000) - 10_000_000_000) * 0.002;
  const c = Math.max(0, sales - 50_000_000_000) * 0.0003;
  return Math.round(a + b + c);
}

export function entertainLimit(base: number, months: number, sales: number) {
  return Math.round((base * Math.min(12, Math.max(0, months))) / 12) + salesAllowance(sales);
}

/** 올해(today 의 해) 접대비 사용액·한도. 승인·지급된 결의만(접대비는 부가세까지 비용) */
export async function entertainStatus(db: Db, today: string) {
  const year = today.slice(0, 4);
  const from = `${year}-01-01`;
  const p = await loadPolicy(db, today);
  let used = 0;
  let count = 0;
  for (const e of await listExpenses(db, "all")) {
    if (e.status !== "approved" && e.status !== "paid") continue;
    const on = e.evidenceOn ?? e.createdAt.toISOString().slice(0, 10);
    if (on < from || on > today) continue;
    const part = e.split?.length ? e.split.filter((x) => x.category === "entertain").reduce((a, x) => a + x.won, 0) : e.category === "entertain" ? e.amountWon : 0;
    if (part) {
      used += part;
      count++;
    }
  }
  const st = await db
    .select({ parts: repairStatement.partsWon, labor: repairStatement.laborWon })
    .from(repairStatement)
    .innerJoin(repairOrder, eq(repairOrder.id, repairStatement.repairOrderId))
    .where(and(gte(repairStatement.issuedOn, from), lte(repairStatement.issuedOn, today), ne(repairOrder.status, "cancelled")));
  const sales = st.reduce((a, r) => a + r.parts + r.labor, 0);
  // 개업한 해면 개업 달부터(기초 잔액 날짜) 달수로 나눈다
  const [op] = await db.select({ on: acctOpening.on }).from(acctOpening).limit(1);
  const months = op?.on && op.on.slice(0, 4) === year ? 13 - Number(op.on.slice(5, 7)) : 12;
  const limit = entertainLimit(p["money.entertain_base"], months, sales);
  const pct = limit > 0 ? Math.round((used / limit) * 100) : 0;
  return { year, used, count, sales, months, base: p["money.entertain_base"], limit, pct, alertPct: p["money.entertain_alert_pct"] };
}

type Actor = { id: string; roles: Role[] };

/** 대표·회계 할 일: 올해 접대비가 한도의 알림 비율을 넘으면 */
export async function entertainTodos(db: Db, actor: Actor, today: string) {
  const out: { key: string; when: "today" | "soon"; what: string; detail: string; href: string; action: string }[] = [];
  if (!can(actor, "payroll.view")) return out;
  const s = await entertainStatus(db, today);
  if (!s.used || s.pct < s.alertPct) return out;
  out.push({
    key: `entertain-${s.year}-${s.pct >= 100 ? "over" : "near"}`,
    when: s.pct >= 100 ? "today" : "soon",
    what: s.pct >= 100 ? `접대비가 올해 한도를 넘었습니다(${s.pct}%)` : `접대비가 올해 한도의 ${s.pct}%입니다`,
    detail: `사용 ${s.used.toLocaleString("ko-KR")}원 / 한도(어림) ${s.limit.toLocaleString("ko-KR")}원. 넘는 금액은 비용으로 인정되지 않습니다`,
    href: "/money/tax#entertain",
    action: "보기",
  });
  return out;
}
