// 통장·카드·홈택스 내역(STD-12): 연동 설정·문자 받기·엑셀 올리기·전표와 맞추기·할 일·현금흐름 자료.
// 원칙: 거래 줄은 고치지 않는다. 같은 거래는 한 줄로 합친다. 전표를 새로 만드는 일(수납·보험 입금 확인·지급 처리)은
// 사람이 단추를 눌러야 하고, 이미 있는 전표와 짝짓기·분류는 저절로 한다(틀리면 '연결 풀기').
// 유료 자동 연동(코드에프·팝빌 등)을 붙일 때는 그 결과를 insertTxs(db, rows, "api") 로 넣으면 아래가 그대로 돈다.
import { and, desc, eq, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { appConfig, bankImport, bankTx, insuranceClaim, payable, payment, repairOrder, supplier } from "@/db/schema";
import { decrypt, encrypt, randomToken, sha256 } from "@/modules/auth/crypto";
import { can } from "@/modules/auth/permissions";
import type { Role } from "@/modules/auth/roles";
import { listExpenses, payExpense } from "@/modules/money/expense";
import { customerReceivables } from "@/modules/money/receipts";
import { writeAudit } from "@/modules/platform/audit";
import { UserError } from "@/modules/platform/errors";
import { notifyRole } from "@/modules/platform/notify";
import { loadShopInfo } from "@/modules/platform/shop";
import { seoulDate } from "@/modules/platform/time";
import { recordPayment as recordClaimPayment } from "@/modules/repair/claims";
import { markPayrollPaid, payrollNetLines } from "@/modules/staff/payroll";
import {
  accountLabel,
  addDaysIso,
  autoClass,
  BANKS,
  bizDigits,
  CARDS,
  companyLabel,
  dayDiff,
  isBankCo,
  isCardCo,
  isHometax,
  isTxClass,
  nameLike,
  sameTx,
  TX_CLASSES,
  TX_KINDS,
  type FeedAccount,
  type TxKind,
} from "./rules";
import { mapSheet, MapError, type FileKind } from "./sheet-map";
import { readSheet, SheetError } from "./sheet-read";
import { parseBankSms } from "./sms-parse";

export class BankError extends UserError {}
type Actor = { id: string; roles: Role[] };
const KEY = "bankfeed";
const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;

// ── 설정 ──
export type FeedConfig = {
  accounts: FeedAccount[];
  tokenEnc: string | null;
  tokenHash: string | null;
  tokenAt: string | null;
  lastSmsAt: string | null;
  smsCount: number;
  /** 등록 안 된 계좌·카드 문자(내용은 버리고 회사·끝자리만) */
  unknown: { at: string; hint: string }[];
  /** 읽지 못한 문자(앞 120자만, 최근 10통) — 문자 꼴이 바뀌었는지 보려고 */
  failed: { at: string; reason: string; text: string }[];
};
const EMPTY: FeedConfig = { accounts: [], tokenEnc: null, tokenHash: null, tokenAt: null, lastSmsAt: null, smsCount: 0, unknown: [], failed: [] };

export async function loadFeed(db: Db): Promise<FeedConfig> {
  const [c] = await db.select().from(appConfig).where(eq(appConfig.key, KEY));
  return { ...EMPTY, ...((c?.data ?? {}) as Partial<FeedConfig>) };
}
async function saveFeed(db: Db, cfg: FeedConfig, by: string | null) {
  await db
    .insert(appConfig)
    .values({ key: KEY, data: cfg, updatedBy: by })
    .onConflictDoUpdate({ target: appConfig.key, set: { data: cfg, updatedBy: by, updatedAt: new Date() } });
}

const mustSetup = (a: Actor) => {
  if (!can(a, "bank.setup")) throw new BankError("통장·카드 연동 설정은 대표가 합니다");
};
const mustView = (a: Actor) => {
  if (!can(a, "bank.view")) throw new BankError("통장·카드 내역은 회계 담당·대표가 봅니다");
};

export type AccountInput = { id?: string; kind: string; company: string; name: string; digits: string; payDay: number | null; sms: boolean };

export async function saveAccount(db: Db, actor: Actor, i: AccountInput) {
  mustSetup(actor);
  const cfg = await loadFeed(db);
  if (i.kind !== "bank" && i.kind !== "card") throw new BankError("통장인지 카드인지 골라 주세요");
  if (i.kind === "bank" ? !isBankCo(i.company) : !isCardCo(i.company)) throw new BankError(i.kind === "bank" ? "은행을 골라 주세요" : "카드사를 골라 주세요");
  const digits = i.digits.replace(/\D/g, "").slice(-4);
  if (i.digits.trim() && digits.length < 3) throw new BankError("번호 끝자리는 숫자 3~4자리로 적어 주세요(문자에 보이는 그대로)");
  if (i.payDay != null && (i.payDay < 1 || i.payDay > 31)) throw new BankError("카드 대금 빠지는 날은 1~31 사이로 적어 주세요");
  const others = cfg.accounts.filter((a) => a.id !== i.id && a.company === i.company);
  if (others.length && (!digits || others.some((a) => !a.digits)))
    throw new BankError("같은 회사의 통장·카드가 둘 이상이면 모두 번호 끝자리를 적어야 문자를 가를 수 있습니다(먼저 등록한 것에도)");
  const same = others.find((a) => a.digits === digits);
  if (same) throw new BankError(`이미 등록한 통장·카드입니다: ${accountLabel(same)}`);
  const acc: FeedAccount = {
    id: i.id || randomToken(6),
    kind: i.kind,
    company: i.company as FeedAccount["company"],
    name: i.name.trim().slice(0, 30) || companyLabel(i.company),
    digits,
    payDay: i.kind === "card" ? i.payDay : null,
    sms: i.sms,
  };
  cfg.accounts = i.id ? cfg.accounts.map((a) => (a.id === i.id ? acc : a)) : [...cfg.accounts, acc];
  await saveFeed(db, cfg, actor.id);
  await writeAudit(db, { actorId: actor.id, action: i.id ? "bank.account_edit" : "bank.account_add", entityType: "bank_account", entityId: acc.id, after: { company: acc.company, digits: acc.digits, name: acc.name } });
  return acc;
}

export async function removeAccount(db: Db, actor: Actor, id: string) {
  mustSetup(actor);
  const cfg = await loadFeed(db);
  const a = cfg.accounts.find((x) => x.id === id);
  if (!a) throw new BankError("없는 계좌·카드입니다");
  cfg.accounts = cfg.accounts.filter((x) => x.id !== id);
  await saveFeed(db, cfg, actor.id);
  await writeAudit(db, { actorId: actor.id, action: "bank.account_remove", entityType: "bank_account", entityId: id, before: { company: a.company, digits: a.digits } });
}

/** 문자 받는 주소의 비밀 열쇠 새로 만들기(예전 주소는 바로 막힘) */
export async function issueToken(db: Db, actor: Actor, now = new Date()) {
  mustSetup(actor);
  const cfg = await loadFeed(db);
  const token = randomToken(24);
  cfg.tokenEnc = encrypt(token);
  cfg.tokenHash = sha256(token);
  cfg.tokenAt = now.toISOString();
  await saveFeed(db, cfg, actor.id);
  await writeAudit(db, { actorId: actor.id, action: "bank.token_issue", entityType: "bank_feed", entityId: "sms" });
  return token;
}

export async function feedView(db: Db, actor: Actor) {
  mustView(actor);
  const cfg = await loadFeed(db);
  const token = can(actor, "bank.setup") && cfg.tokenEnc ? decrypt(cfg.tokenEnc) : null;
  const counts = await db
    .select({ accountId: bankTx.accountId, source: bankTx.source, n: sql<number>`count(*)::int`, last: sql<string>`max(${bankTx.on})` })
    .from(bankTx)
    .groupBy(bankTx.accountId, bankTx.source);
  return { cfg, token, counts };
}

export async function tokenOk(db: Db, token: string) {
  if (!token || token.length < 20) return false;
  const cfg = await loadFeed(db);
  return !!cfg.tokenHash && cfg.tokenHash === sha256(token);
}

/** 문자 → 등록한 통장·카드 */
function accountFor(accounts: FeedAccount[], company: string | null, digits: string | null, card: boolean): FeedAccount | null {
  const pool = accounts.filter((a) => a.sms && (card ? a.kind === "card" : a.kind === "bank"));
  const byCo = company ? pool.filter((a) => a.company === company || (card && a.company.replace("_card", "") === company)) : [];
  const fit = (list: FeedAccount[]) => (digits ? list.filter((a) => a.digits && (a.digits.endsWith(digits.slice(-3)) || digits.endsWith(a.digits.slice(-3)))) : []);
  const d1 = fit(byCo);
  if (d1.length === 1) return d1[0];
  const loose = byCo.filter((a) => !a.digits);
  if (loose.length === 1 && !d1.length) return loose[0];
  // 회사 이름이 문자에 없지만 끝자리가 맞는 것이 하나뿐이면
  const d2 = fit(pool);
  if (!company && d2.length === 1) return d2[0];
  return null;
}

// ── 넣기(문자·엑셀·유료 연동 공통) ──
export type NewTx = {
  kind: TxKind;
  accountId: string | null;
  accountLabel: string | null;
  on: string;
  at: string | null;
  amountWon: number;
  balanceWon: number | null;
  party: string | null;
  partyBizNo: string | null;
  memo: string | null;
  approvalNo: string | null;
  supplyWon: number | null;
  vatWon: number | null;
  raw?: string | null;
};

/**
 * 같은 거래가 이미 있으면 넣지 않고(빈 칸만 채움), 없으면 넣는다.
 * 같은 파일 안에 똑같은 줄이 두 번 있으면(같은 날 같은 금액 두 번) 둘 다 넣는다: 이미 짝지은 기존 줄은 다시 쓰지 않는다.
 */
export async function insertTxs(db: Db, rows: NewTx[], source: "sms" | "file" | "api" | "manual", importId: string | null = null) {
  let added = 0;
  let dup = 0;
  const ids: string[] = [];
  const claimed = new Set<string>();
  for (const r of rows) {
    if (isHometax(r.kind) && r.approvalNo) {
      const key = `${r.kind}|${r.approvalNo.replace(/\D/g, "")}`;
      const [hit] = await db.select({ id: bankTx.id }).from(bankTx).where(eq(bankTx.dedupeKey, key));
      if (hit) {
        dup++;
        continue;
      }
      const [x] = await db.insert(bankTx).values({ ...r, source, importId, dedupeKey: key }).returning({ id: bankTx.id });
      ids.push(x.id);
      added++;
      continue;
    }
    const near = await db
      .select()
      .from(bankTx)
      .where(and(eq(bankTx.kind, r.kind), eq(bankTx.on, r.on), eq(bankTx.amountWon, r.amountWon)));
    const same = near.find((e) => !claimed.has(e.id) && sameTx(e, r));
    if (same) {
      claimed.add(same.id);
      dup++;
      const fill: Partial<typeof bankTx.$inferInsert> = {};
      if (same.balanceWon == null && r.balanceWon != null) fill.balanceWon = r.balanceWon;
      if (!same.at && r.at) fill.at = r.at;
      if (!same.approvalNo && r.approvalNo) fill.approvalNo = r.approvalNo;
      if (!same.accountId && r.accountId) Object.assign(fill, { accountId: r.accountId, accountLabel: r.accountLabel });
      // 문자는 이름을 잘라 보내므로 엑셀의 긴 이름이 더 낫다
      if (r.party && (!same.party || (source === "file" && r.party.length > same.party.length && nameLike(r.party, same.party)))) fill.party = r.party;
      if (!same.memo && r.memo) fill.memo = r.memo;
      if (Object.keys(fill).length) await db.update(bankTx).set(fill).where(eq(bankTx.id, same.id));
      continue;
    }
    const nth = near.length;
    const key = [r.kind, r.accountId ?? "-", r.on, r.at ?? "-", r.amountWon, r.balanceWon ?? "-", r.approvalNo ?? "-", nth, source === "sms" ? sha256(r.raw ?? "").slice(0, 8) : importId ?? "-"].join("|");
    const [x] = await db
      .insert(bankTx)
      .values({ ...r, source, importId, dedupeKey: key })
      .onConflictDoNothing()
      .returning({ id: bankTx.id });
    if (x) {
      ids.push(x.id);
      added++;
      claimed.add(x.id);
    } else dup++;
  }
  return { added, dup, ids };
}

export type SmsResult = { status: "added" | "dup" | "ignored" | "unknown" | "failed"; message: string; id?: string };

/** 문자 한 통 받기(수신 주소). 등록 안 된 계좌·카드 문자는 내용을 저장하지 않는다(대표 개인 거래 보호) */
export async function ingestSms(db: Db, text: string, now = new Date()): Promise<SmsResult> {
  const cfg = await loadFeed(db);
  const body = text.slice(0, 2000);
  cfg.lastSmsAt = now.toISOString();
  cfg.smsCount = (cfg.smsCount ?? 0) + 1;
  const p = parseBankSms(body, seoulDate(now));
  if (!p.ok) {
    const bankish = /원/.test(body) && [...Object.values(BANKS), ...Object.values(CARDS)].some((v) => v.keys.some((k) => k.length >= 2 && body.includes(k)));
    if (bankish) cfg.failed = [{ at: now.toISOString(), reason: p.reason, text: body.replace(/\s+/g, " ").slice(0, 120) }, ...cfg.failed].slice(0, 10);
    await saveFeed(db, cfg, null);
    return { status: bankish ? "failed" : "ignored", message: p.reason };
  }
  const t = p.tx;
  const card = t.kind === "card" || t.kind === "card_cancel";
  const acc = accountFor(cfg.accounts, t.company, t.digits, card);
  if (!acc) {
    const hint = `${t.company ? companyLabel(t.company) : "회사 모름"}${t.digits ? ` 끝자리 ${t.digits}` : ""}`;
    cfg.unknown = [{ at: now.toISOString(), hint }, ...cfg.unknown.filter((u) => u.hint !== hint)].slice(0, 10);
    await saveFeed(db, cfg, null);
    return { status: "unknown", message: `등록 안 된 통장·카드 문자라 넣지 않았습니다(${hint})` };
  }
  await saveFeed(db, cfg, null);
  const r = await insertTxs(db, [{ ...t, accountId: acc.id, accountLabel: accountLabel(acc), partyBizNo: null, supplyWon: null, vatWon: null, raw: body }], "sms");
  if (!r.added) return { status: "dup", message: "이미 받은 거래입니다" };
  await runMatching(db, now);
  return { status: "added", message: `${TX_KINDS[t.kind]} ${won(t.amountWon)} 넣음`, id: r.ids[0] };
}

/** 엑셀·CSV 올리기 */
export async function importFile(db: Db, actor: Actor, i: { bytes: Uint8Array; fileName: string; kind: string; accountId: string }, now = new Date()) {
  mustView(actor);
  if (!i.bytes.length) throw new BankError("파일을 골라 주세요");
  if (i.bytes.length > 15 * 1024 * 1024) throw new BankError("파일이 너무 큽니다(15MB 까지). 기간을 나눠 내려받아 주세요");
  const cfg = await loadFeed(db);
  const shop = await loadShopInfo(db);
  let res;
  try {
    res = mapSheet(readSheet(i.bytes, i.fileName), (i.kind || "auto") as FileKind, { shopBizNo: shop.bizNo });
  } catch (e) {
    if (e instanceof SheetError || e instanceof MapError) throw new BankError(e.message);
    throw new BankError("파일을 읽지 못했습니다. 은행·카드사에서 받은 원본(xlsx·xls·csv)인지 확인해 주세요");
  }
  const needAcc = res.kind === "bank" || res.kind === "card";
  let acc: FeedAccount | null = null;
  if (needAcc) {
    const pool = cfg.accounts.filter((a) => a.kind === res.kind);
    acc = pool.find((a) => a.id === i.accountId) ?? null;
    if (!acc && !i.accountId) {
      const byHead = pool.filter((a) => a.digits && res.headDigits.some((d) => d.endsWith(a.digits.slice(-3))));
      const byRow = pool.filter((a) => a.digits && res.rows.some((r) => r.digits && r.digits.endsWith(a.digits.slice(-3))));
      acc = byHead.length === 1 ? byHead[0] : byRow.length === 1 ? byRow[0] : pool.length === 1 ? pool[0] : null;
    }
    if (!acc)
      throw new BankError(
        pool.length
          ? `어느 ${res.kind === "bank" ? "통장" : "카드"} 내역인지 골라 주세요(파일에서 번호를 찾지 못함)`
          : `먼저 설정에서 ${res.kind === "bank" ? "통장" : "카드"}을 등록해 주세요(통장·카드 연동 › 내 통장·카드)`,
      );
  }
  const rows: NewTx[] = res.rows.map((r) => ({
    kind: r.kind,
    accountId: acc?.id ?? null,
    accountLabel: acc ? accountLabel(acc) : null,
    on: r.on,
    at: r.at,
    amountWon: r.amountWon,
    balanceWon: r.balanceWon,
    party: r.party?.slice(0, 80) ?? null,
    partyBizNo: r.partyBizNo,
    memo: r.memo?.slice(0, 120) ?? null,
    approvalNo: r.approvalNo,
    supplyWon: r.supplyWon,
    vatWon: r.vatWon,
  }));
  const ons = rows.map((r) => r.on).sort();
  const [imp] = await db
    .insert(bankImport)
    .values({ fileKind: res.kind, fileName: i.fileName.slice(0, 120), accountId: acc?.id ?? null, rowCount: res.rows.length + res.skipped.length, added: 0, dup: 0, skipped: res.skipped.length, columns: res.columns.join(" · "), firstOn: ons[0] ?? null, lastOn: ons[ons.length - 1] ?? null, by: actor.id, at: now })
    .returning();
  const r = await insertTxs(db, rows, "file", imp.id);
  await db.update(bankImport).set({ added: r.added, dup: r.dup }).where(eq(bankImport.id, imp.id));
  await writeAudit(db, { actorId: actor.id, action: "bank.import", entityType: "bank_import", entityId: imp.id, after: { file: i.fileName, kind: res.kind, added: r.added, dup: r.dup, skipped: res.skipped.length } });
  const m = await runMatching(db, now);
  return { importId: imp.id, kind: res.kind, account: acc ? accountLabel(acc) : null, added: r.added, dup: r.dup, skipped: res.skipped, columns: res.columns, matched: m.linked + m.classed, firstOn: ons[0] ?? null, lastOn: ons[ons.length - 1] ?? null };
}

/** 올리기 되돌리기: 이 번에 새로 들어간 줄 중 아직 사람이 맞추지 않은 것만 지운다 */
export async function undoImport(db: Db, actor: Actor, importId: string, now = new Date()) {
  mustView(actor);
  const [imp] = await db.select().from(bankImport).where(eq(bankImport.id, importId));
  if (!imp) throw new BankError("없는 올리기 기록입니다");
  if (imp.undoneAt) throw new BankError("이미 되돌렸습니다");
  const rows = await db.select().from(bankTx).where(eq(bankTx.importId, importId));
  const keep = rows.filter((r) => r.matchKind && !r.matchedAuto);
  const del = rows.filter((r) => !keep.includes(r)).map((r) => r.id);
  if (del.length) {
    // 지울 줄과 짝지은 카드 취소·홈택스 줄의 연결도 푼다
    await db.update(bankTx).set({ matchKind: null, matchId: null, matchNo: null, matchNote: null, matchedAuto: false, matchedAt: null }).where(and(eq(bankTx.matchKind, "tx"), inArray(bankTx.matchId, del)));
    await db.delete(bankTx).where(inArray(bankTx.id, del));
  }
  await db.update(bankImport).set({ undoneAt: now }).where(eq(bankImport.id, importId));
  await writeAudit(db, { actorId: actor.id, action: "bank.import_undo", entityType: "bank_import", entityId: importId, after: { removed: del.length, kept: keep.length } });
  return { removed: del.length, kept: keep.length };
}

export async function recentImports(db: Db, limit = 15) {
  return db.select().from(bankImport).orderBy(desc(bankImport.at)).limit(limit);
}

// ── 맞추기 ──
type Tx = typeof bankTx.$inferSelect;
export type Cand = {
  kind: "payment" | "expense" | "payroll" | "payable" | "tx" | "claim" | "receipt";
  id: string;
  no: string;
  label: string;
  /** 저절로 이어도 될 만큼 확실한가 */
  sure: boolean;
  /** 이 후보를 고르면 할 일: link 연결만 · claim 보험 입금 확인 · receipt 수납 적기(화면) · pay 지급 처리 · payroll 급여 지급 처리 */
  act: "link" | "claim" | "receipt" | "pay" | "payroll";
  note?: string;
  /** 보험 입금이 청구보다 적을 때 */
  cutWon?: number;
};

async function pools(db: Db, now: Date) {
  const today = seoulDate(now);
  const since = addDaysIso(today, -150);
  const used = new Set(
    (await db.select({ k: bankTx.matchKind, id: bankTx.matchId, note: bankTx.matchNote }).from(bankTx).where(and(sql`${bankTx.matchKind} is not null`, sql`${bankTx.matchKind} <> 'class'`))).map((u) =>
      u.k === "payroll" ? `payroll:${u.id}:${u.note ?? ""}` : `${u.k}:${u.id}`,
    ),
  );
  const pays = await db.select({ p: payment, roDocNo: repairOrder.docNo }).from(payment).innerJoin(repairOrder, eq(repairOrder.id, payment.repairOrderId)).where(gte(payment.receivedOn, since));
  const exps = (await listExpenses(db, "all")).filter((e) => e.status !== "cancelled" && e.status !== "rejected" && e.createdAt.toISOString().slice(0, 10) >= addDaysIso(since, -60));
  const claims = await db.select({ c: insuranceClaim, roDocNo: repairOrder.docNo }).from(insuranceClaim).innerJoin(repairOrder, eq(repairOrder.id, insuranceClaim.repairOrderId)).where(eq(insuranceClaim.status, "claimed"));
  const ar = await customerReceivables(db, now);
  const runs = await payrollNetLines(db, addDaysIso(today, -120).slice(0, 7));
  const pyb = await db.select({ p: payable, bizNo: supplier.bizNo }).from(payable).leftJoin(supplier, eq(supplier.id, payable.supplierId)).where(gte(payable.accruedOn, since));
  const sups = await db.select({ id: supplier.id, name: supplier.name, bizNo: supplier.bizNo }).from(supplier);
  return { used, pays, exps, claims, ar, runs, pyb, sups, today };
}
type Pools = Awaited<ReturnType<typeof pools>>;

const digitsEq = (a: string | null | undefined, b: string | null | undefined) => {
  const x = (a ?? "").replace(/\D/g, "");
  const y = (b ?? "").replace(/\D/g, "");
  return x.length >= 6 && x === y;
};
const near = (a: string | null | undefined, b: string, days: number) => !!a && Math.abs(dayDiff(a, b)) <= days;

/** 한 거래의 짝 후보. 확실한 것(sure)이 하나뿐이면 저절로 잇는다 */
export function candidatesFor(t: Tx, P: Pools, cardTxs: Tx[] = []): Cand[] {
  const out: Cand[] = [];
  const free = (k: string, id: string) => !P.used.has(`${k}:${id}`);
  if (t.kind === "in") {
    for (const { p, roDocNo } of P.pays)
      if (p.amountWon === t.amountWon && p.method === "transfer" && near(p.receivedOn, t.on, 3) && free("payment", p.id))
        out.push({ kind: "payment", id: p.id, no: p.docNo, label: `${p.docNo} ${roDocNo} ${p.payerName ?? ""} ${p.payer === "insurer" ? "보험사 입금" : "계좌 이체 수납"} ${p.receivedOn}`, sure: true, act: "link" });
    if (!out.length) {
      for (const { c, roDocNo } of P.claims) {
        const byName = nameLike(c.insurer, t.party);
        const claimed = c.claimedWon ?? 0;
        if ((byName && t.amountWon <= claimed) || t.amountWon === claimed)
          out.push({ kind: "claim", id: c.repairOrderId, no: c.docNo, label: `보험 청구 ${c.docNo} ${roDocNo} ${c.insurer} 청구 ${won(claimed)}`, sure: false, act: "claim", cutWon: claimed - t.amountWon });
      }
      for (const a of P.ar) {
        const who = a.who.split(" ")[0];
        if (a.remain === t.amountWon || (nameLike(who, t.party) && t.amountWon <= a.remain))
          out.push({ kind: "receipt", id: a.roId, no: a.docNo, label: `고객 미수 ${a.docNo} ${a.who} 남은 ${won(a.remain)}`, sure: false, act: "receipt" });
      }
    }
  }
  if (t.kind === "out") {
    for (const e of P.exps) {
      if (e.amountWon !== t.amountWon || !free("expense", e.id)) continue;
      if (e.status === "paid" && (e.payMethod === "transfer" || e.payMethod === "auto" || e.payMethod === "cash") && near(e.paidOn, t.on, 3))
        out.push({ kind: "expense", id: e.id, no: e.docNo, label: `${e.docNo} ${e.payeeName} 지급 ${e.paidOn}`, sure: true, act: "link" });
      else if (e.status === "approved" && e.payMethod !== "card")
        out.push({ kind: "expense", id: e.id, no: e.docNo, label: `${e.docNo} ${e.payeeName} 승인됨(지급 전)`, sure: false, act: "pay" });
    }
    for (const r of P.runs) {
      if (r.totalNet === t.amountWon && free("payroll", `${r.runId}:`))
        out.push({ kind: "payroll", id: r.runId, no: r.docNo, label: `${r.ym} 급여 합계 ${won(r.totalNet)}`, sure: r.status === "paid" && near(r.payDate, t.on, 5), act: r.status === "paid" ? "link" : "payroll" });
      for (const l of r.lines)
        if (l.net === t.amountWon && nameLike(l.name, t.party) && free("payroll", `${r.runId}:${l.name}`))
          out.push({ kind: "payroll", id: r.runId, no: r.docNo, note: l.name, label: `${r.ym} 급여 ${l.name} ${won(l.net)}`, sure: r.status === "paid" && near(r.payDate, t.on, 5), act: r.status === "paid" ? "link" : "payroll" });
    }
  }
  if (t.kind === "card") {
    for (const e of P.exps)
      if (e.amountWon === t.amountWon && e.payMethod === "card" && free("expense", e.id) && (digitsEq(e.evidenceNo, t.approvalNo) || near(e.evidenceOn ?? e.createdAt.toISOString().slice(0, 10), t.on, 3)))
        out.push({ kind: "expense", id: e.id, no: e.docNo, label: `${e.docNo} ${e.payeeName} 카드 결의`, sure: true, act: "link" });
  }
  if (t.kind === "card_cancel") {
    for (const c of cardTxs)
      if (c.kind === "card" && c.id !== t.id && (digitsEq(c.approvalNo, t.approvalNo) || (c.amountWon === t.amountWon && nameLike(c.party, t.party) && dayDiff(c.on, t.on) >= 0 && dayDiff(c.on, t.on) <= 40)) && (!c.accountId || !t.accountId || c.accountId === t.accountId) && (c.matchKind !== "tx"))
        out.push({ kind: "tx", id: c.id, no: c.approvalNo ?? c.on, label: `${c.on} ${c.party ?? ""} ${won(c.amountWon)} 승인`, sure: true, act: "link" });
  }
  if (t.kind === "tax_buy" || t.kind === "cash_buy") {
    for (const e of P.exps)
      if (free("expense", e.id) && digitsEq(e.evidenceNo, t.approvalNo)) out.push({ kind: "expense", id: e.id, no: e.docNo, label: `${e.docNo} ${e.payeeName}(증빙 번호 같음)`, sure: true, act: "link" });
    if (t.kind === "tax_buy")
      for (const { p } of P.pyb)
        if (free("payable", p.id) && digitsEq(p.invoiceNo, t.approvalNo)) out.push({ kind: "payable", id: p.id, no: p.sourceNo, label: `${p.sourceNo} ${p.payeeName} 외상(계산서 번호 같음)`, sure: true, act: "link" });
    if (!out.length) {
      const bz = bizDigits(t.partyBizNo);
      const supIds = new Set(P.sups.filter((s) => bz && bizDigits(s.bizNo) === bz).map((s) => s.id));
      for (const e of P.exps)
        if (free("expense", e.id) && e.amountWon === t.amountWon && ((e.supplierId && supIds.has(e.supplierId)) || nameLike(e.payeeName, t.party)) && near(e.evidenceOn ?? e.createdAt.toISOString().slice(0, 10), t.on, 15))
          out.push({ kind: "expense", id: e.id, no: e.docNo, label: `${e.docNo} ${e.payeeName} ${won(e.amountWon)}`, sure: true, act: "link" });
      if (t.kind === "tax_buy")
        for (const { p } of P.pyb)
          if (free("payable", p.id) && p.amountWon === t.amountWon && ((p.supplierId && supIds.has(p.supplierId)) || nameLike(p.payeeName, t.party)) && near(p.accruedOn, t.on, 15))
            out.push({ kind: "payable", id: p.id, no: p.sourceNo, label: `${p.sourceNo} ${p.payeeName} 외상 ${won(p.amountWon)}`, sure: true, act: "link" });
    }
  }
  if (t.kind === "tax_sale" || t.kind === "cash_sale") {
    for (const { p, roDocNo } of P.pays)
      if (free("payment", p.id) && digitsEq(p.receiptNo, t.approvalNo)) out.push({ kind: "payment", id: p.id, no: p.docNo, label: `${p.docNo} ${roDocNo}(증빙 번호 같음)`, sure: true, act: "link" });
    if (!out.length)
      for (const { p, roDocNo } of P.pays)
        if (free("payment", p.id) && p.amountWon === t.amountWon && near(p.receivedOn, t.on, 5) && (p.receiptKind === (t.kind === "tax_sale" ? "tax_invoice" : "cash_receipt")))
          out.push({ kind: "payment", id: p.id, no: p.docNo, label: `${p.docNo} ${roDocNo} ${p.payerName ?? ""} ${p.receivedOn}`, sure: true, act: "link" });
  }
  if (t.kind === "card_buy") {
    for (const c of cardTxs) if (c.kind === "card" && digitsEq(c.approvalNo, t.approvalNo)) out.push({ kind: "tx", id: c.id, no: c.approvalNo ?? "", label: `카드 승인 ${c.on} ${c.party ?? ""}`, sure: true, act: "link" });
    if (!out.length)
      for (const e of P.exps)
        if (free("expense", e.id) && e.payMethod === "card" && e.amountWon === t.amountWon && near(e.evidenceOn ?? e.createdAt.toISOString().slice(0, 10), t.on, 3))
          out.push({ kind: "expense", id: e.id, no: e.docNo, label: `${e.docNo} ${e.payeeName} 카드 결의`, sure: true, act: "link" });
  }
  return out;
}

async function setMatch(db: Db, txId: string, c: { kind: string; id: string; no: string; note?: string | null }, auto: boolean, by: string | null, now: Date) {
  await db.update(bankTx).set({ matchKind: c.kind, matchId: c.id, matchNo: c.no, matchNote: c.note ?? null, cls: null, matchedAuto: auto, matchedBy: by, matchedAt: now }).where(eq(bankTx.id, txId));
}

/** 안 맞춘 거래를 모두 훑어 확실한 짝은 잇고, 상대방 이름으로 분류되는 것은 분류한다 */
export async function runMatching(db: Db, now = new Date()) {
  const open = await db.select().from(bankTx).where(and(isNull(bankTx.matchKind), isNull(bankTx.cls), isNull(bankTx.matchedBy))).orderBy(bankTx.on);
  if (!open.length) return { linked: 0, classed: 0 };
  const P = await pools(db, now);
  const cardTxs = open.some((t) => t.kind === "card_cancel" || t.kind === "card_buy") ? await db.select().from(bankTx).where(eq(bankTx.kind, "card")) : [];
  let linked = 0;
  let classed = 0;
  for (const t of open) {
    const sure = candidatesFor(t, P, cardTxs).filter((c) => c.sure);
    if (sure.length === 1 || (sure.length > 1 && sure.every((c) => c.kind === "payroll" && c.id === sure[0].id))) {
      const c = sure[0];
      await setMatch(db, t.id, c, true, null, now);
      P.used.add(c.kind === "payroll" ? `payroll:${c.id}:${c.note ?? ""}` : `${c.kind}:${c.id}`);
      if (c.kind === "tx" && t.kind === "card_cancel") {
        await db.update(bankTx).set({ matchKind: "tx", matchId: t.id, matchNo: t.approvalNo ?? t.on, matchNote: "취소됨", matchedAuto: true, matchedAt: now }).where(and(eq(bankTx.id, c.id), isNull(bankTx.matchKind)));
        const ct = cardTxs.find((x) => x.id === c.id);
        if (ct) ct.matchKind = "tx";
      }
      linked++;
      continue;
    }
    if (sure.length === 0) {
      const cls = autoClass(t.kind, t.party, t.memo);
      if (cls) {
        await db.update(bankTx).set({ cls, matchKind: "class", matchedAuto: true, matchedAt: now }).where(eq(bankTx.id, t.id));
        classed++;
      }
    }
  }
  return { linked, classed };
}

// ── 목록·사람이 하는 맞추기 ──
export type TxFilter = "todo" | "done" | "all";
export async function listTx(db: Db, actor: Actor, f: { filter?: TxFilter; from?: string; to?: string; account?: string; kind?: string; q?: string }, now = new Date()) {
  mustView(actor);
  const today = seoulDate(now);
  const from = f.from || addDaysIso(today, -60);
  const to = f.to || today;
  const conds = [gte(bankTx.on, from), lte(bankTx.on, to)];
  if (f.account) conds.push(eq(bankTx.accountId, f.account));
  if (f.kind === "hometax") conds.push(inArray(bankTx.kind, ["tax_sale", "tax_buy", "cash_sale", "cash_buy", "card_buy"]));
  else if (f.kind === "bank") conds.push(inArray(bankTx.kind, ["in", "out"]));
  else if (f.kind === "card") conds.push(inArray(bankTx.kind, ["card", "card_cancel"]));
  if (f.filter === "todo") conds.push(isNull(bankTx.matchKind));
  if (f.filter === "done") conds.push(sql`${bankTx.matchKind} is not null`);
  if (f.q?.trim()) {
    const q = `%${f.q.trim()}%`;
    conds.push(or(sql`${bankTx.party} ilike ${q}`, sql`${bankTx.memo} ilike ${q}`, sql`${bankTx.amountWon}::text like ${q.replace(/,/g, "")}`, sql`${bankTx.matchNo} ilike ${q}`)!);
  }
  const rows = await db.select().from(bankTx).where(and(...conds)).orderBy(desc(bankTx.on), desc(bankTx.at), desc(bankTx.createdAt)).limit(500);
  const P = rows.some((r) => !r.matchKind) ? await pools(db, now) : null;
  const cardTxs = P && rows.some((r) => !r.matchKind && (r.kind === "card_cancel" || r.kind === "card_buy")) ? await db.select().from(bankTx).where(eq(bankTx.kind, "card")) : [];
  const sum = { in: 0, out: 0, card: 0, todo: 0 };
  const list = rows.map((t) => {
    if (t.kind === "in") sum.in += t.amountWon;
    if (t.kind === "out") sum.out += t.amountWon;
    if (t.kind === "card") sum.card += t.amountWon;
    if (t.kind === "card_cancel") sum.card -= t.amountWon;
    if (!t.matchKind) sum.todo++;
    return { t, cands: !t.matchKind && P ? candidatesFor(t, P, cardTxs) : [] };
  });
  return { list, sum, from, to };
}

export async function getTx(db: Db, id: string) {
  const [t] = await db.select().from(bankTx).where(eq(bankTx.id, id));
  if (!t) throw new BankError("없는 거래입니다");
  return t;
}

/** 후보를 골라 잇기(연결만) */
export async function linkTx(db: Db, actor: Actor, txId: string, kind: string, id: string, note = "", now = new Date()) {
  mustView(actor);
  const t = await getTx(db, txId);
  if (t.matchKind && t.matchKind !== "class") throw new BankError("이미 맞춘 거래입니다. 먼저 연결을 풀어 주세요");
  const P = await pools(db, now);
  const cardTxs = await db.select().from(bankTx).where(eq(bankTx.kind, "card"));
  const c = candidatesFor(t, P, cardTxs).find((x) => x.kind === kind && x.id === id && (x.note ?? "") === note && x.act === "link");
  if (!c) throw new BankError("고른 전표가 이 거래의 짝 후보가 아닙니다(금액·날짜를 확인해 주세요)");
  await setMatch(db, txId, c, false, actor.id, now);
  if (c.kind === "tx" && t.kind === "card_cancel") await db.update(bankTx).set({ matchKind: "tx", matchId: t.id, matchNo: t.approvalNo ?? t.on, matchNote: "취소됨", matchedAuto: false, matchedBy: actor.id, matchedAt: now }).where(eq(bankTx.id, c.id));
  await writeAudit(db, { actorId: actor.id, action: "bank.link", entityType: "bank_tx", entityId: txId, after: { kind, no: c.no } });
}

/** 수납 적기·결의서 쓰기 화면에서 저장한 뒤 그 전표를 잇는다(앞 화면에서 넘긴 tx) */
export async function linkCreated(db: Db, actor: Actor, txId: string, kind: "payment" | "expense", id: string, no: string, now = new Date()) {
  if (!can(actor, "bank.view") || !txId) return;
  const [t] = await db.select().from(bankTx).where(eq(bankTx.id, txId));
  if (!t || (t.matchKind && t.matchKind !== "class")) return;
  await setMatch(db, txId, { kind, id, no }, false, actor.id, now);
  await writeAudit(db, { actorId: actor.id, action: "bank.link", entityType: "bank_tx", entityId: txId, after: { kind, no, created: true } });
}

/** 분류(전표가 없는 돈) */
export async function classifyTx(db: Db, actor: Actor, txId: string, cls: string, note: string, now = new Date()) {
  mustView(actor);
  const t = await getTx(db, txId);
  if (!isTxClass(cls)) throw new BankError("분류를 골라 주세요");
  if (t.matchKind && t.matchKind !== "class") throw new BankError("이미 전표와 맞춘 거래입니다. 먼저 연결을 풀어 주세요");
  if ((cls === "other" || cls === "personal" || cls === "owner") && !note.trim()) throw new BankError(`'${TX_CLASSES[cls].label}'은(는) 메모에 사유를 적어 주세요`);
  await db.update(bankTx).set({ matchKind: "class", matchId: null, matchNo: null, cls, matchNote: note.trim() || null, matchedAuto: false, matchedBy: actor.id, matchedAt: now }).where(eq(bankTx.id, txId));
  await writeAudit(db, { actorId: actor.id, action: "bank.classify", entityType: "bank_tx", entityId: txId, after: { cls, note } });
}

export async function unlinkTx(db: Db, actor: Actor, txId: string) {
  mustView(actor);
  const t = await getTx(db, txId);
  if (!t.matchKind) return;
  // matchedBy 를 남겨 두면 자동 맞추기가 같은 짝을 다시 잇지 않는다(사람이 푼 것)
  await db.update(bankTx).set({ matchKind: null, matchId: null, matchNo: null, matchNote: null, cls: null, matchedAuto: false, matchedBy: actor.id, matchedAt: null }).where(eq(bankTx.id, txId));
  if (t.matchKind === "tx" && t.matchId) await db.update(bankTx).set({ matchKind: null, matchId: null, matchNo: null, matchNote: null, matchedAuto: false, matchedAt: null }).where(and(eq(bankTx.id, t.matchId), eq(bankTx.matchKind, "tx")));
  await writeAudit(db, { actorId: actor.id, action: "bank.unlink", entityType: "bank_tx", entityId: txId, before: { kind: t.matchKind, no: t.matchNo, cls: t.cls } });
}

/** 보험사 입금: 보험 청구 입금 확인(입금 전표 자동)까지 하고 잇는다 */
export async function confirmClaimFromTx(db: Db, actor: Actor, txId: string, roId: string, cutReason: string, now = new Date()) {
  mustView(actor);
  const t = await getTx(db, txId);
  if (t.kind !== "in") throw new BankError("입금 거래만 보험 입금으로 확인합니다");
  if (t.matchKind && t.matchKind !== "class") throw new BankError("이미 맞춘 거래입니다");
  const voucher = await recordClaimPayment(db, actor, roId, { paidOn: t.on, paidWon: t.amountWon, cutReason }, now);
  const [p] = await db.select().from(payment).where(eq(payment.docNo, voucher));
  await setMatch(db, txId, { kind: "payment", id: p.id, no: voucher }, false, actor.id, now);
  return voucher;
}

/** 승인된 결의서를 이 출금으로 지급 처리하고 잇는다 */
export async function payFromTx(db: Db, actor: Actor, txId: string, expenseId: string, now = new Date()) {
  mustView(actor);
  const t = await getTx(db, txId);
  if (t.kind !== "out") throw new BankError("출금 거래만 지급으로 잇습니다");
  const e = (await listExpenses(db, "unpaid")).find((x) => x.id === expenseId);
  if (!e) throw new BankError("승인됐고 아직 지급 안 한 결의서가 아닙니다");
  if (e.amountWon !== t.amountWon) throw new BankError(`결의 금액(${won(e.amountWon)})과 출금(${won(t.amountWon)})이 다릅니다`);
  await payExpense(db, actor, expenseId, { paidOn: t.on, note: `통장 출금 ${t.on}${t.at ? ` ${t.at}` : ""} ${t.party ?? ""}`.trim() }, now);
  await setMatch(db, txId, { kind: "expense", id: e.id, no: e.docNo }, false, actor.id, now);
  return e.docNo;
}

/** 승인된 급여대장을 이 출금(들)로 지급 처리하고 잇는다 */
export async function payrollFromTx(db: Db, actor: Actor, txId: string, runId: string, now = new Date()) {
  mustView(actor);
  const t = await getTx(db, txId);
  const P = await pools(db, now);
  const c = candidatesFor(t, P).find((x) => x.kind === "payroll" && x.id === runId);
  if (!c) throw new BankError("이 출금과 맞는 급여대장이 아닙니다");
  const run = P.runs.find((r) => r.runId === runId)!;
  if (run.status !== "paid") await markPayrollPaid(db, actor, runId, t.on, now);
  await setMatch(db, txId, c, false, actor.id, now);
  await runMatching(db, now); // 같은 달 다른 사람 급여 출금도 이어 준다
  return run.docNo;
}

// ── 할 일·현황 ──
type Todo = { key: string; when: "late" | "today" | "soon"; what: string; detail?: string; href: string; action: string };

export async function bankTodos(db: Db, actor: Actor, today: string): Promise<Todo[]> {
  if (!can(actor, "bank.view")) return [];
  const out: Todo[] = [];
  const cfg = await loadFeed(db);
  if (!cfg.accounts.length) {
    if (can(actor, "bank.setup")) out.push({ key: "bank-setup", when: "soon", what: "통장·카드 연동 설정", detail: "사업용 통장·카드를 등록하고 문자 전달 앱을 연결하면 입출금이 저절로 들어옵니다", href: "/money/bank/settings", action: "설정하기" });
    return out;
  }
  const smsOn = cfg.accounts.some((a) => a.sms);
  if (smsOn && can(actor, "bank.setup")) {
    const last = cfg.lastSmsAt ? seoulDate(new Date(cfg.lastSmsAt)) : null;
    if (!cfg.tokenHash) out.push({ key: "bank-token", when: "soon", what: "문자 받는 주소 만들기", detail: "주소를 만들어 휴대폰 문자 전달 앱에 넣어야 문자가 들어옵니다", href: "/money/bank/settings#sms", action: "주소 만들기" });
    else if (!last || dayDiff(last, today) >= 7)
      out.push({ key: `bank-sms-stale-${last ?? "none"}`, when: "today", what: last ? `통장 문자가 ${dayDiff(last, today)}일째 안 들어옵니다` : "통장 문자가 아직 한 통도 안 들어왔습니다", detail: "휴대폰의 문자 전달 앱이 꺼졌거나 배터리 절약에 막혔을 수 있습니다. 도움말의 '안 들어올 때'를 보세요", href: "/money/bank/guide#trouble", action: "확인하기" });
  }
  const open = await db.select().from(bankTx).where(isNull(bankTx.matchKind)).orderBy(bankTx.on);
  const cards = open.filter((t) => t.kind === "card");
  for (const t of cards.slice(0, 15))
    out.push({ key: `bank-card-${t.id}`, when: dayDiff(t.on, today) > 3 ? "late" : "today", what: `카드 사용 결의: ${t.party ?? "가맹점"} ${won(t.amountWon)}`, detail: `${t.on} ${t.accountLabel ?? ""} · 결의서가 없습니다. 영수증을 붙여 결의서를 쓰거나, 개인 사용이면 분류하세요`, href: `/money/expenses/new?tx=${t.id}`, action: "결의서 쓰기" });
  if (cards.length > 15) out.push({ key: "bank-card-more", when: "late", what: `카드 사용 결의 ${cards.length - 15}건 더`, href: "/money/bank?kind=card&f=todo", action: "모두 보기" });
  const bank = open.filter((t) => t.kind === "in" || t.kind === "out" || t.kind === "card_cancel");
  if (bank.length) {
    const old = bank.filter((t) => dayDiff(t.on, today) > 2).length;
    out.push({ key: `bank-match-${bank.length}`, when: old ? "late" : "today", what: `통장 거래 맞추기 ${bank.length}건`, detail: `입금 ${bank.filter((t) => t.kind === "in").length} · 출금 ${bank.filter((t) => t.kind === "out").length}. 짝 후보를 고르거나 분류하세요${old ? ` · 사흘 넘은 것 ${old}건` : ""}`, href: "/money/bank?kind=bank&f=todo", action: "맞추기" });
  }
  const ht = open.filter((t) => isHometax(t.kind));
  if (ht.length) out.push({ key: `bank-hometax-${ht.length}`, when: "soon", what: `홈택스 증빙 맞추기 ${ht.length}건`, detail: "앱에 없는 세금계산서·현금영수증입니다. 결의서·수납에 증빙 번호를 넣거나 분류하세요(부가세 신고 전에 끝내기)", href: "/money/bank?kind=hometax&f=todo", action: "맞추기" });
  return out;
}

/** 등록 안 된 통장 문자가 오거나 읽지 못한 문자가 쌓이면 대표에게 한 번 알림 */
export async function notifyFeedIssues(db: Db, r: SmsResult) {
  if (r.status === "failed") await notifyRole(db, "owner", "통장 문자를 읽지 못했습니다. 연동 설정에서 확인해 주세요", `bank-sms-failed-${seoulDate()}`, "/money/bank/settings#failed");
}

/** 현금흐름 자료(보고서 센터): 기간의 통장 입금·출금을 맞춘 곳·분류별로 */
export async function bankFlows(db: Db, from: string, to: string) {
  const rows = await db.select().from(bankTx).where(and(gte(bankTx.on, from), lte(bankTx.on, to), inArray(bankTx.kind, ["in", "out"])));
  const groups = new Map<string, { key: string; label: string; flow: string; inWon: number; outWon: number; n: number }>();
  const add = (key: string, label: string, flow: string, t: Tx) => {
    const g = groups.get(key) ?? { key, label, flow, inWon: 0, outWon: 0, n: 0 };
    if (t.kind === "in") g.inWon += t.amountWon;
    else g.outWon += t.amountWon;
    g.n++;
    groups.set(key, g);
  };
  for (const t of rows) {
    if (t.matchKind === "class" && t.cls && isTxClass(t.cls)) {
      if (t.cls === "personal" || t.cls === "self") continue;
      add(`cls:${t.cls}`, TX_CLASSES[t.cls].label, TX_CLASSES[t.cls].flow, t);
    } else if (t.matchKind === "payment") add("payment", "고객 수납·보험사 입금", "영업", t);
    else if (t.matchKind === "expense") add("expense", "지출 결의 지급", "영업", t);
    else if (t.matchKind === "payroll") add("payroll", "급여", "영업", t);
    else add("open", "아직 안 맞춘 거래", "미분류", t);
  }
  const balances = await db
    .select({ accountId: bankTx.accountId, label: bankTx.accountLabel, on: bankTx.on, at: bankTx.at, bal: bankTx.balanceWon })
    .from(bankTx)
    .where(and(lte(bankTx.on, to), inArray(bankTx.kind, ["in", "out"]), sql`${bankTx.balanceWon} is not null`))
    .orderBy(desc(bankTx.on), desc(bankTx.at), desc(bankTx.createdAt));
  const last = new Map<string, { label: string; on: string; bal: number }>();
  for (const b of balances) if (b.accountId && !last.has(b.accountId)) last.set(b.accountId, { label: b.label ?? "", on: b.on, bal: b.bal! });
  return {
    groups: [...groups.values()].sort((a, b) => b.inWon + b.outWon - (a.inWon + a.outWon)),
    inWon: rows.filter((t) => t.kind === "in" && t.cls !== "personal" && t.cls !== "self").reduce((s, t) => s + t.amountWon, 0),
    outWon: rows.filter((t) => t.kind === "out" && t.cls !== "personal" && t.cls !== "self").reduce((s, t) => s + t.amountWon, 0),
    balances: [...last.values()],
  };
}

/** 결의서 쓰기 화면에 채울 값(카드 사용·출금에서) */
export async function expensePrefill(db: Db, actor: Actor, txId: string) {
  if (!can(actor, "bank.view")) return null;
  const [t] = await db.select().from(bankTx).where(eq(bankTx.id, txId));
  if (!t || (t.matchKind && t.matchKind !== "class") || !["card", "out", "tax_buy", "cash_buy", "card_buy"].includes(t.kind)) return null;
  const supply = t.supplyWon ?? Math.round(t.amountWon / 1.1);
  const vat = t.vatWon ?? t.amountWon - supply;
  const bz = bizDigits(t.partyBizNo);
  const sup = bz ? (await db.select({ id: supplier.id, bizNo: supplier.bizNo }).from(supplier)).find((s) => bizDigits(s.bizNo) === bz) : undefined;
  return {
    t,
    supplierId: sup?.id ?? "",
    payee: t.party ?? "",
    payMethod: t.kind === "card" || t.kind === "card_buy" ? "card" : t.kind === "out" ? (/자동|CMS/i.test(`${t.memo ?? ""}${t.party ?? ""}`) ? "auto" : "transfer") : "transfer",
    supply,
    vat,
    evidenceKind: t.kind === "tax_buy" ? "tax_invoice" : t.kind === "cash_buy" ? "cash_receipt" : t.kind === "card" || t.kind === "card_buy" ? "card" : "",
    evidenceNo: t.approvalNo ?? "",
    evidenceOn: t.on,
    purpose: `${TX_KINDS[t.kind as TxKind]} ${t.on} ${t.party ?? ""}`.trim(),
    from: `${TX_KINDS[t.kind as TxKind]} ${t.on} ${won(t.amountWon)}`,
  };
}

/** 수납 적기 화면에 채울 값(입금에서) */
export async function receiptPrefill(db: Db, actor: Actor, txId: string) {
  if (!can(actor, "bank.view")) return null;
  const [t] = await db.select().from(bankTx).where(eq(bankTx.id, txId));
  if (!t || t.kind !== "in" || (t.matchKind && t.matchKind !== "class")) return null;
  return { t, amount: t.amountWon, on: t.on, payer: t.party ?? "", from: `통장 입금 ${t.on} ${won(t.amountWon)}` };
}
