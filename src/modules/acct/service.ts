// 회계 장부 입력(보고서 센터 4단계): 개업일 기초 잔액(한 번)과 자금 전표. 나머지 분개는 journal.ts 가 기존 전표에서 만든다.
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { acctOpening, appUser, bankTx, fundSlip } from "@/db/schema";
import { can } from "@/modules/auth/permissions";
import type { Role } from "@/modules/auth/roles";
import { assertOpenMonth } from "@/modules/money/lock";
import { writeAudit } from "@/modules/platform/audit";
import { nextDocNo } from "@/modules/platform/docno";
import { UserError } from "@/modules/platform/errors";
import { seoulDate } from "@/modules/platform/time";
import { ACCT, CLS_FUND, FUND_KINDS, isFundKind, OPENING_CODES } from "./accounts";

export class AcctError extends UserError {}
type Actor = { id: string; roles: Role[] };
const ISO = /^\d{4}-\d{2}-\d{2}$/;
/** 회계 장부(기초 잔액·자금 전표)는 월 마감 정리하는 사람(회계 담당·대표)이 적는다 */
export const canBooks = (a: { roles: readonly Role[] }) => can(a, "money.close_month");

export async function getOpening(db: Db) {
  const rows = await db.select().from(acctOpening);
  return { on: rows[0]?.on ?? null, rows, byCode: new Map(rows.map((r) => [r.code, r.won])) };
}

/** 기초 잔액 저장(통째로 바꿈). 0인 계정은 지운다. 자본금은 저장하지 않고 보고서에서 자산 − 부채로 맞춘다 */
export async function saveOpening(db: Db, actor: Actor, input: { on: string; lines: { code: string; won: number }[] }, now = new Date()) {
  if (!canBooks(actor)) throw new AcctError("기초 잔액은 회계 담당·대표가 적습니다");
  if (!ISO.test(input.on) || input.on > seoulDate(now)) throw new AcctError("기초 잔액 날짜(개업일)를 확인해 주세요(오늘이나 그 전)");
  const allowed = new Set<string>(OPENING_CODES);
  for (const l of input.lines) {
    if (!allowed.has(l.code)) throw new AcctError(`기초 잔액에 적지 않는 계정입니다: ${l.code}`);
    if (!Number.isInteger(l.won) || l.won < 0) throw new AcctError(`${ACCT.get(l.code)?.name ?? l.code}: 금액을 확인해 주세요`);
  }
  const before = await getOpening(db);
  await assertOpenMonth(db, input.on);
  const keep = input.lines.filter((l) => l.won > 0);
  await db.transaction(async (tx) => {
    await tx.delete(acctOpening);
    if (keep.length) await tx.insert(acctOpening).values(keep.map((l) => ({ on: input.on, code: l.code, won: l.won, by: actor.id, at: now })));
  });
  await writeAudit(db, { actorId: actor.id, action: "acct.opening", entityType: "acct_opening", entityId: input.on, before: Object.fromEntries(before.byCode), after: Object.fromEntries(keep.map((l) => [l.code, l.won])) });
}

export type FundInput = { on: string; kind: string; amountWon: number; memo: string; drCode?: string; crCode?: string; bankTxId?: string | null };

/** 자금 전표 쓰기. 종류를 고르면 계정이 정해지고, 기타는 차변·대변을 직접 고른다 */
export async function createFundSlip(db: Db, actor: Actor, input: FundInput, now = new Date()) {
  if (!canBooks(actor)) throw new AcctError("자금 전표는 회계 담당·대표가 적습니다");
  if (!isFundKind(input.kind)) throw new AcctError("종류를 골라 주세요");
  if (!ISO.test(input.on) || input.on > seoulDate(now)) throw new AcctError("날짜를 확인해 주세요(오늘이나 그 전)");
  if (!Number.isInteger(input.amountWon) || input.amountWon <= 0) throw new AcctError("금액을 적어 주세요");
  const k = FUND_KINDS[input.kind];
  const drCode = input.kind === "other" ? (input.drCode ?? "") : k.dr;
  const crCode = input.kind === "other" ? (input.crCode ?? "") : k.cr;
  const manual = (c: string) => !!ACCT.get(c)?.manual;
  if (!manual(drCode) || !manual(crCode)) throw new AcctError("차변·대변 계정을 골라 주세요(앱이 만드는 계정은 고를 수 없습니다)");
  if (drCode === crCode) throw new AcctError("차변과 대변이 같은 계정입니다");
  if (input.kind === "other" && !input.memo.trim()) throw new AcctError("기타 전표는 무슨 돈인지 적어 주세요");
  await assertOpenMonth(db, input.on);
  let tx: typeof bankTx.$inferSelect | undefined;
  if (input.bankTxId) {
    [tx] = await db.select().from(bankTx).where(eq(bankTx.id, input.bankTxId));
    if (!tx) throw new AcctError("통장 거래를 찾을 수 없습니다");
    if (tx.matchKind === "fund") throw new AcctError(`이 통장 거래는 이미 자금 전표 ${tx.matchNo}로 적었습니다`);
  }
  const docNo = await nextDocNo(db, "FS", now);
  const [r] = await db
    .insert(fundSlip)
    .values({ docNo, on: input.on, kind: input.kind, drCode, crCode, amountWon: input.amountWon, memo: input.memo.trim() || k.label, bankTxId: tx?.id ?? null, createdBy: actor.id, createdAt: now })
    .returning({ id: fundSlip.id });
  // 통장 거래와 맞춤(분류는 그대로 두고 맞춘 곳만 자금 전표로)
  if (tx) await db.update(bankTx).set({ matchKind: "fund", matchId: r.id, matchNo: docNo, matchedAuto: false, matchedBy: actor.id, matchedAt: now }).where(eq(bankTx.id, tx.id));
  await writeAudit(db, { actorId: actor.id, action: "acct.fund", entityType: "fund_slip", entityId: docNo, after: { kind: input.kind, drCode, crCode, amount: input.amountWon } });
  return { id: r.id, docNo };
}

/** 취소 전표: 차변·대변을 뒤집어 오늘 날짜로 적는다(원래 전표는 그대로) */
export async function cancelFundSlip(db: Db, actor: Actor, id: string, reason: string, now = new Date()) {
  if (!canBooks(actor)) throw new AcctError("자금 전표는 회계 담당·대표가 적습니다");
  const [f] = await db.select().from(fundSlip).where(eq(fundSlip.id, id));
  if (!f) throw new AcctError("자금 전표를 찾을 수 없습니다");
  if (f.reversalOf) throw new AcctError("취소 전표는 다시 취소하지 않습니다. 새로 적으세요");
  const [done] = await db.select({ id: fundSlip.id }).from(fundSlip).where(eq(fundSlip.reversalOf, id));
  if (done) throw new AcctError("이미 취소한 전표입니다");
  if (!reason.trim()) throw new AcctError("취소 이유를 적어 주세요");
  const today = seoulDate(now);
  await assertOpenMonth(db, today);
  const docNo = await nextDocNo(db, "FS", now);
  await db.insert(fundSlip).values({ docNo, on: today, kind: f.kind, drCode: f.crCode, crCode: f.drCode, amountWon: f.amountWon, memo: `${f.docNo} 취소: ${reason.trim()}`, reversalOf: f.id, createdBy: actor.id, createdAt: now });
  // 통장 거래는 분류만 한 상태로 되돌린다(다시 자금 전표로 적을 수 있게)
  if (f.bankTxId) await db.update(bankTx).set({ matchKind: sql`case when ${bankTx.cls} is null then null else 'class' end`, matchId: null, matchNo: null, matchedAt: now }).where(and(eq(bankTx.id, f.bankTxId), eq(bankTx.matchKind, "fund")));
  await writeAudit(db, { actorId: actor.id, action: "acct.fund_cancel", entityType: "fund_slip", entityId: f.docNo, after: { reversal: docNo, reason: reason.trim() } });
  return docNo;
}

export async function listFundSlips(db: Db, limit = 500) {
  const rows = await db.select({ f: fundSlip, by: appUser.name }).from(fundSlip).leftJoin(appUser, eq(appUser.id, fundSlip.createdBy)).orderBy(desc(fundSlip.on), desc(fundSlip.createdAt)).limit(limit);
  const cancelled = new Set(rows.map((r) => r.f.reversalOf).filter(Boolean));
  return rows.map((r) => ({ ...r.f, byName: r.by ?? "", cancelled: cancelled.has(r.f.id) }));
}

/** 통장 거래 → 자금 전표 기본값(분류·입출금으로 종류, 날짜·금액·상대방). 중복 입력 없이 바로 적게 */
export async function fundSeedFromTx(db: Db, txId: string) {
  const [t] = await db.select().from(bankTx).where(eq(bankTx.id, txId));
  if (!t || (t.kind !== "in" && t.kind !== "out")) return null;
  const dir = t.kind === "in" ? "in" : "out";
  const kind = (t.cls && CLS_FUND[t.cls]?.[dir]) || "other";
  return { txId: t.id, on: t.on, kind, amountWon: Math.abs(t.amountWon), memo: [t.party, t.memo].filter(Boolean).join(" · "), matched: t.matchKind === "fund" ? t.matchNo : null };
}

/** 분류는 했는데 아직 자금 전표로 안 적은 통장 거래(대출·이자·수수료·세금·4대보험·대표 입출금) — 할 일·장부 화면 안내 */
export async function txNeedingFund(db: Db) {
  const rows = await db.select().from(bankTx).where(isNull(bankTx.matchId));
  return rows.filter((t) => t.cls && CLS_FUND[t.cls] && (t.kind === "in" || t.kind === "out") && CLS_FUND[t.cls][t.kind === "in" ? "in" : "out"]);
}
