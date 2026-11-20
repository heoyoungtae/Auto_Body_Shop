// 업체 견적서(단가표)로 재고 품목 일괄 등록(대표 결정 2026-11-20: 엑셀·붙여넣기 먼저, 사진 읽기는 나중).
// 1) 읽기: 엑셀·CSV 파일이나 붙여 넣은 표 → 견적 줄, 사업자번호로 업체 찾기, 같은 품목 판정 → 견적서(작성 중) 저장
// 2) 확인: 표에서 줄마다 '단가만 갱신 / 새 품목 / 건너뜀'을 고르고 고친다
// 3) 등록: 새 품목 만들기 + 업체 단가표·단가 이력 갱신, 크게 오른 단가는 대표에게 알림
import { and, desc, eq, inArray } from "drizzle-orm";
import type { Db } from "@/db/client";
import { branch, MAIN_BRANCH_ID, priceQuote, stockItem, supplier, supplierPrice, type QuoteLine } from "@/db/schema";
import { can } from "@/modules/auth/permissions";
import type { Role } from "@/modules/auth/roles";
import { readSheet, SheetError } from "@/modules/bank/sheet-read";
import { writeAudit } from "@/modules/platform/audit";
import { nextDocNo } from "@/modules/platform/docno";
import { UserError } from "@/modules/platform/errors";
import { notifyRole } from "@/modules/platform/notify";
import { storeFile } from "@/modules/platform/storage";
import { addDays, seoulDate } from "@/modules/platform/time";
import { recordPrice } from "./price";
import { guessKind, matchLines, pasteToGrid, PRICE_RISE_ALERT_PCT, readQuoteGrid, suggestUnit, type RawQuoteLine } from "./quote-rules";
import { isPackUnit, isStockKind, type SupplierKind, isTrackMode, isVatMode, recommendTrack, splitVat, STOCK_UNITS, type VatMode } from "./rules";
import { loadPolicy } from "@/modules/platform/policy";
import { lastVatMode, saveItem } from "./stock";
import { createSupplier } from "./supplier";

export class QuoteError extends UserError {}
type Actor = { id: string; roles: Role[]; branchId?: string };
const DATE = /^\d{4}-\d{2}-\d{2}$/;
export const MAX_QUOTE_BYTES = 15 * 1024 * 1024;
export const MAX_QUOTE_LINES = 500;

function mustManage(actor: Actor) {
  if (!can(actor, "stock.manage")) throw new QuoteError("견적서로 품목을 등록하는 일은 공장장·대표가 합니다");
}

export type ReadInput = {
  supplierId?: string;
  quotedOn?: string;
  validDays?: number | null;
  vatMode?: string;
  file?: { name: string; bytes: Uint8Array } | null;
  text?: string;
};

/** 견적서 읽기 → 작성 중 견적서(id) */
export async function readQuote(db: Db, actor: Actor, input: ReadInput, now = new Date()): Promise<string> {
  mustManage(actor);
  const hasFile = !!input.file && input.file.bytes.length > 0;
  const txt = (input.text ?? "").trim();
  if (!hasFile && !txt) throw new QuoteError("엑셀 파일을 고르거나 표를 붙여 넣어 주세요");
  if (hasFile && input.file!.bytes.length > MAX_QUOTE_BYTES) throw new QuoteError("파일은 15MB 까지입니다");
  if (hasFile && /\.(jpe?g|png|webp|heic|gif|bmp)$/i.test(input.file!.name)) throw new QuoteError("사진은 아직 읽지 못합니다. 엑셀 양식에 옮겨 적어 올리거나, 표를 복사해 붙여 넣어 주세요");
  let grid;
  try {
    grid = hasFile ? readSheet(input.file!.bytes, input.file!.name) : pasteToGrid(txt);
  } catch (e) {
    throw new QuoteError(e instanceof SheetError ? e.message : "파일을 읽지 못했습니다. 엑셀(xlsx·xls)이나 CSV 인지 확인해 주세요");
  }
  // 우리 사업자번호는 견적서의 '수신'에 있을 수 있으니 업체 번호에서 뺀다
  const [main] = await db.select({ bizNo: branch.bizNo }).from(branch).where(eq(branch.id, MAIN_BRANCH_ID));
  const r = readQuoteGrid(grid, main?.bizNo || null);
  if (!r.lines.length) throw new QuoteError("품목 줄을 찾지 못했습니다. 첫 줄에 '품명·단위·수량·단가' 머리줄이 있는지 보거나, 앱의 엑셀 양식을 내려받아 옮겨 주세요");
  if (r.lines.length > MAX_QUOTE_LINES) throw new QuoteError(`한 번에 ${MAX_QUOTE_LINES}줄까지 올립니다. 나눠서 올려 주세요`);
  // 부가세: 고른 값 > 견적서에 적힌 값 > 최근 품목
  const vatMode: VatMode = input.vatMode && isVatMode(input.vatMode) ? input.vatMode : (r.vatMode ?? (await lastVatMode(db)));

  // 업체: 고른 업체 > 견적서의 사업자번호 > 견적서의 상호
  let supplierId = input.supplierId || null;
  if (!supplierId && r.bizNos.length) {
    const [s] = await db.select({ id: supplier.id }).from(supplier).where(inArray(supplier.bizNo, r.bizNos)).limit(1);
    supplierId = s?.id ?? null;
  }
  if (!supplierId && r.supplierName) {
    const [s] = await db.select({ id: supplier.id }).from(supplier).where(eq(supplier.name, r.supplierName)).limit(1);
    supplierId = s?.id ?? null;
  }
  if (supplierId) {
    const [s] = await db.select({ id: supplier.id }).from(supplier).where(eq(supplier.id, supplierId));
    if (!s) throw new QuoteError("업체를 찾을 수 없습니다");
  }
  const docNo = await nextDocNo(db, "QT", now);
  // 대장에 없는 업체: 상호·사업자번호가 다 있으면 후보 업체로 등록(평가·서류·계좌는 협력업체 화면에서)
  let newSupplier = false;
  if (!supplierId && r.bizNos.length && r.supplierName && can(actor, "supplier.manage")) {
    const kinds = [...new Set(r.lines.map((l): SupplierKind => {
      const k = l.kind ?? guessKind(l.supName);
      return k === "paint" ? "paint" : k === "part" ? "parts" : "consumable";
    }))];
    const memo = [r.ceo && `대표자 ${r.ceo}`, r.address && `주소 ${r.address}`, `견적서 ${docNo}을(를) 올릴 때 후보로 자동 등록`].filter(Boolean).join(" · ");
    try {
      supplierId = await createSupplier(db, actor, { name: r.supplierName, bizNo: r.bizNos[0], kinds, items: r.lines.slice(0, 5).map((l) => l.supName).join(", ") + (r.lines.length > 5 ? ` 외 ${r.lines.length - 5}개` : ""), contactName: r.contactName ?? "", phone: r.phone ?? "", email: "", leadDays: null, returnTerms: "", docs: [], note: memo }, now);
      newSupplier = true;
    } catch {
      supplierId = null; // 등록 못 하면 확인 화면에서 고르거나 '+ 새 업체'
    }
  }
  const quotedOn = input.quotedOn && DATE.test(input.quotedOn) ? input.quotedOn : (r.quotedOn ?? seoulDate(now));
  const days = input.validDays ?? r.validDays;
  const lines = await judge(db, supplierId, r.lines, vatMode, now);
  const path = hasFile ? await storeFile(`quotes/${docNo}`, input.file!.bytes, (/\.([a-z0-9]{2,5})$/i.exec(input.file!.name)?.[1] ?? "bin").toLowerCase()) : null;
  const [q] = await db
    .insert(priceQuote)
    .values({
      docNo,
      supplierId,
      readBizNo: r.bizNos[0] ?? null,
      readName: r.supplierName,
      quotedOn,
      validUntil: days && days > 0 ? addDays(quotedOn, days) : null,
      vatMode,
      source: hasFile ? "file" : "paste",
      fileName: hasFile ? input.file!.name.slice(0, 200) : null,
      path,
      lines,
      readTotalWon: r.readTotalWon,
      totalWon: lines.reduce((a, l) => a + l.qty * l.unitWon, 0),
      createdBy: actor.id,
      createdAt: now,
    })
    .returning({ id: priceQuote.id });
  await writeAudit(db, { actorId: actor.id, action: "stock.quote_read", entityType: "price_quote", entityId: docNo, after: { lines: lines.length, supplierId, newSupplier } });
  return q.id;
}

/** 줄마다 같은 품목 판정 + 새 품목 추천값(구분·단위·용량·입수·관리 방식) */
async function judge(db: Db, supplierId: string | null, raw: RawQuoteLine[], vatMode: VatMode, now: Date): Promise<QuoteLine[]> {
  const items = await db.select({ id: stockItem.id, name: stockItem.name, spec: stockItem.spec, active: stockItem.active }).from(stockItem);
  const prices = supplierId ? await db.select({ itemId: supplierPrice.itemId, supName: supplierPrice.supName }).from(supplierPrice).where(eq(supplierPrice.supplierId, supplierId)) : [];
  const p = await loadPolicy(db, seoulDate(now));
  const m = matchLines(raw, items, prices);
  return raw.map((l, i) => {
    const u = suggestUnit(l.supUnit);
    const packUnit = l.packUnit && isPackUnit(l.packUnit) ? l.packUnit : u.packUnit;
    const kind = l.kind ?? guessKind(l.supName);
    const baseUnit = l.buyQty && l.baseUnit && (STOCK_UNITS as readonly string[]).includes(l.baseUnit) ? l.baseUnit : null;
    const rec = recommendTrack({ kind, unitWon: splitVat(l.unitWon, vatMode).supply, buyQty: baseUnit ? l.buyQty : null, expiryTracked: kind === "paint" }, { low: p["stock.track_low"], high: p["stock.track_high"] });
    return {
      supName: l.supName,
      spec: l.spec,
      supUnit: l.supUnit,
      qty: l.qty,
      unitWon: l.unitWon,
      amountWon: l.amountWon,
      match: m[i].match,
      itemId: m[i].itemId,
      candidates: m[i].candidates,
      name: l.supName,
      kind,
      unit: u.unit,
      packAmount: l.packAmount ?? u.packAmount,
      packUnit: l.packAmount ? packUnit : u.packUnit,
      buyQty: baseUnit ? l.buyQty : null,
      baseUnit,
      track: l.track ?? rec.mode,
      trackReason: l.track ? "양식에 적은 값" : rec.reason,
      note: [m[i].note, u.note, l.note].filter(Boolean).join(" · ") || null,
    };
  });
}

/** 업체를 바꾸면(또는 새로 등록하면) 그 업체 품명 기억으로 다시 판정한다 */
export async function setQuoteSupplier(db: Db, actor: Actor, id: string, supplierId: string) {
  mustManage(actor);
  const q = await quoteRow(db, id);
  if (q.status !== "draft") throw new QuoteError("이미 등록을 마친 견적서입니다");
  if (supplierId) {
    const [s] = await db.select({ id: supplier.id }).from(supplier).where(eq(supplier.id, supplierId));
    if (!s) throw new QuoteError("업체를 찾을 수 없습니다");
  }
  const lines = await judge(
    db,
    supplierId || null,
    q.lines.map((l) => ({ supName: l.supName, spec: l.spec, supUnit: l.supUnit, qty: l.qty, unitWon: l.unitWon, amountWon: l.amountWon, kind: l.kind, packAmount: l.packAmount, packUnit: l.packUnit, buyQty: l.buyQty ?? null, baseUnit: l.baseUnit ?? null, track: null, note: null })),
    isVatMode(q.vatMode) ? q.vatMode : "excluded",
    new Date(),
  );
  await db.update(priceQuote).set({ supplierId: supplierId || null, lines }).where(eq(priceQuote.id, id));
}

async function quoteRow(db: Db, id: string) {
  const [q] = await db.select().from(priceQuote).where(eq(priceQuote.id, id));
  if (!q) throw new QuoteError("견적서를 찾을 수 없습니다");
  return q;
}

/** 확인 화면: 견적서 + 줄마다 같은 품목의 지금 단가(이 업체 단가 → 없으면 품목 단가) */
export async function getQuote(db: Db, id: string) {
  const q = await quoteRow(db, id);
  const [sup] = q.supplierId ? await db.select({ id: supplier.id, name: supplier.name, status: supplier.status, bizNo: supplier.bizNo }).from(supplier).where(eq(supplier.id, q.supplierId)) : [];
  const items = await db.select({ id: stockItem.id, name: stockItem.name, spec: stockItem.spec, unit: stockItem.unit, unitWon: stockItem.unitWon, kind: stockItem.kind, supplierId: stockItem.supplierId }).from(stockItem).where(eq(stockItem.active, true)).orderBy(stockItem.name);
  const sp = q.supplierId ? await db.select({ itemId: supplierPrice.itemId, unitWon: supplierPrice.unitWon }).from(supplierPrice).where(eq(supplierPrice.supplierId, q.supplierId)) : [];
  const supPrice = new Map(sp.map((p) => [p.itemId, p.unitWon]));
  const nowPrice = Object.fromEntries(items.map((i) => [i.id, supPrice.get(i.id) ?? (i.supplierId === q.supplierId || !i.supplierId ? i.unitWon : null)]));
  return { q, supplier: sup ?? null, items, nowPrice };
}

export async function listQuotes(db: Db, max = 30) {
  return db
    .select({ q: priceQuote, supplierName: supplier.name })
    .from(priceQuote)
    .leftJoin(supplier, eq(supplier.id, priceQuote.supplierId))
    .orderBy(desc(priceQuote.createdAt))
    .limit(max);
}

export type CommitRow = {
  idx: number;
  action: "update" | "new" | "skip";
  itemId?: string;
  name: string;
  kind: string;
  spec: string;
  unit: string;
  packAmount: number | null;
  packUnit: string;
  /** 견적서 단가(부가세 방식은 견적서 전체). 묶음이면 사는 단위(박스) 1개 값 */
  unitWon: number;
  /** 관리 방식(새 품목) */
  trackMode?: string;
  /** 묶음 입수와 낱개 단위. unit 이 사는 단위(박스)가 된다 */
  buyQty?: number | null;
  baseUnit?: string;
};

export type CommitInput = { supplierId: string; quotedOn: string; validUntil: string; vatMode: string; rows: CommitRow[] };

/** 일괄 등록 */
export async function commitQuote(db: Db, actor: Actor, id: string, input: CommitInput, now = new Date()) {
  mustManage(actor);
  const q = await quoteRow(db, id);
  if (q.status !== "draft") throw new QuoteError("이미 등록을 마친 견적서입니다");
  if (!input.supplierId) throw new QuoteError("견적 업체를 골라 주세요. 목록에 없으면 '+ 새 업체'로 등록합니다");
  const [sup] = await db.select({ id: supplier.id, name: supplier.name, status: supplier.status }).from(supplier).where(eq(supplier.id, input.supplierId));
  if (!sup) throw new QuoteError("업체를 찾을 수 없습니다");
  if (sup.status === "stopped" || sup.status === "rejected") throw new QuoteError(`${sup.name}은(는) 거래하지 않는 업체입니다`);
  if (!DATE.test(input.quotedOn)) throw new QuoteError("견적일을 적어 주세요");
  if (input.validUntil && (!DATE.test(input.validUntil) || input.validUntil < input.quotedOn)) throw new QuoteError("유효기간은 견적일 뒤 날짜입니다");
  const vatMode: VatMode = isVatMode(input.vatMode) ? input.vatMode : "excluded";
  const rows = input.rows.filter((r) => r.action !== "skip");
  if (!rows.length) throw new QuoteError("등록하거나 갱신할 줄이 없습니다");
  // 줄 검사: 몇 번째 줄이 틀렸는지 알려 준다
  const used = new Map<string, number>();
  const itemIds = rows.filter((r) => r.action === "update").map((r) => r.itemId ?? "");
  const existing = new Map((itemIds.length ? await db.select().from(stockItem).where(inArray(stockItem.id, itemIds.filter(Boolean).concat(["00000000-0000-0000-0000-000000000000"]))) : []).map((i) => [i.id, i]));
  const allNames = new Set((await db.select({ name: stockItem.name, spec: stockItem.spec }).from(stockItem).where(eq(stockItem.active, true))).map((i) => `${i.name}|${i.spec ?? ""}`));
  for (const r of rows) {
    const at = `${r.idx + 1}번째 줄(${r.name || q.lines[r.idx]?.supName || ""})`;
    if (!q.lines[r.idx]) throw new QuoteError(`${at}: 견적서에 없는 줄입니다`);
    if (!Number.isInteger(r.unitWon) || r.unitWon < 0) throw new QuoteError(`${at}: 단가를 확인해 주세요`);
    if (r.action === "update") {
      const it = existing.get(r.itemId ?? "");
      if (!it) throw new QuoteError(`${at}: 단가를 갱신할 우리 품목을 골라 주세요`);
      if (!it.active) throw new QuoteError(`${at}: ${it.name}은(는) 사용 중지 품목입니다`);
      if (used.has(it.id)) throw new QuoteError(`${at}: ${used.get(it.id)! + 1}번째 줄과 같은 품목(${it.name})을 골랐습니다. 하나는 건너뛰세요`);
      used.set(it.id, r.idx);
    } else {
      if (!r.name.trim()) throw new QuoteError(`${at}: 품명을 적어 주세요`);
      if (!isStockKind(r.kind)) throw new QuoteError(`${at}: 구분을 골라 주세요`);
      if (!(STOCK_UNITS as readonly string[]).includes(r.unit)) throw new QuoteError(`${at}: 단위를 골라 주세요`);
      if (r.trackMode && !isTrackMode(r.trackMode)) throw new QuoteError(`${at}: 관리 방식을 골라 주세요`);
      if (r.buyQty && r.buyQty > 1) {
        if (!Number.isInteger(r.buyQty)) throw new QuoteError(`${at}: 입수는 정수입니다`);
        if (!r.baseUnit || !(STOCK_UNITS as readonly string[]).includes(r.baseUnit)) throw new QuoteError(`${at}: 입수를 적었으면 낱개 단위(롤·장·개 등)를 골라 주세요`);
        if (r.baseUnit === r.unit) throw new QuoteError(`${at}: 사는 단위(${r.unit})와 낱개 단위가 같습니다`);
      }
      if (allNames.has(`${r.name.trim()}|${r.spec.trim()}`)) throw new QuoteError(`${at}: 같은 이름·규격의 품목이 이미 있습니다. '단가만 갱신'으로 그 품목을 고르세요`);
      allNames.add(`${r.name.trim()}|${r.spec.trim()}`);
    }
  }

  const ref = q.docNo;
  const rises: string[] = [];
  let added = 0;
  let updated = 0;
  const lines = [...q.lines];
  for (const r of rows) {
    const l = q.lines[r.idx];
    const supply = splitVat(r.unitWon, vatMode).supply;
    const price = { source: "quote" as const, ref, quoteId: q.id, supName: l.supName + (l.spec ? ` ${l.spec}` : ""), supUnit: l.supUnit, quotedOn: input.quotedOn, validUntil: input.validUntil || null };
    if (r.action === "new") {
      const kind = r.kind;
      const newId = await saveItem(
        db,
        actor,
        null,
        {
          name: r.name.trim(),
          kind,
          spec: r.spec,
          // 묶음이면 재고는 낱개 단위, 사는 단위는 견적서 단위(박스)
          unit: r.buyQty && r.buyQty > 1 ? r.baseUnit! : r.unit,
          buyUnit: r.buyQty && r.buyQty > 1 ? r.unit : "",
          buyQty: r.buyQty && r.buyQty > 1 ? r.buyQty : null,
          trackMode: r.trackMode || undefined,
          location: "",
          safetyQty: 0,
          unitWon: r.unitWon,
          vatMode,
          packAmount: r.packAmount,
          packUnit: r.packUnit,
          expiryTracked: kind === "paint",
          supplierId: sup.id,
          openingQty: 0,
          price,
        },
        now,
      );
      lines[r.idx] = { ...l, itemId: newId };
      added++;
    } else {
      const it = existing.get(r.itemId!)!;
      const res = await db.transaction(async (tx) => {
        // 이 업체 입수를 적었으면 업체 단가표에 남긴다(업체마다 입수가 다를 수 있음)
        const res = await recordPrice(tx, { itemId: it.id, supplierId: sup.id, unitWon: supply, vatMode, before: it.unitWon, by: actor.id, at: now, ...price, ...(r.buyQty && r.buyQty > 1 ? { packQty: r.buyQty } : {}) });
        // 주 거래 업체(또는 업체 미정) 품목이면 품목 단가(최근 매입 단가)도 바꾼다
        if (!it.supplierId || it.supplierId === sup.id) await tx.update(stockItem).set({ unitWon: supply, vatMode, supplierId: sup.id, updatedAt: now }).where(eq(stockItem.id, it.id));
        return res;
      });
      if (res.pct != null && res.pct >= PRICE_RISE_ALERT_PCT) rises.push(`${it.name} ${res.before!.toLocaleString("ko-KR")}→${supply.toLocaleString("ko-KR")}원(+${res.pct}%)`);
      lines[r.idx] = { ...l, itemId: it.id };
      updated++;
    }
  }
  const skipped = q.lines.length - rows.length;
  await db
    .update(priceQuote)
    .set({ status: "done", supplierId: sup.id, quotedOn: input.quotedOn, validUntil: input.validUntil || null, vatMode, lines, added, updated, skipped, doneAt: now })
    .where(and(eq(priceQuote.id, id), eq(priceQuote.status, "draft")));
  if (rises.length) await notifyRole(db, "owner", `견적 단가 ${PRICE_RISE_ALERT_PCT}% 넘게 오름(${sup.name} ${q.docNo}): ${rises.slice(0, 5).join(", ")}${rises.length > 5 ? ` 외 ${rises.length - 5}개` : ""}`, `quote-rise-${q.id}`, `/stock/import/${q.id}`);
  await writeAudit(db, { actorId: actor.id, action: "stock.quote_commit", entityType: "price_quote", entityId: q.docNo, after: { supplier: sup.name, added, updated, skipped, rises: rises.length } });
  return { added, updated, skipped, rises: rises.length };
}

/** 작성 중 견적서 버리기 */
export async function discardQuote(db: Db, actor: Actor, id: string) {
  mustManage(actor);
  const q = await quoteRow(db, id);
  if (q.status !== "draft") throw new QuoteError("등록을 마친 견적서는 버리지 않습니다(단가 이력의 근거)");
  await db.update(priceQuote).set({ status: "cancelled" }).where(eq(priceQuote.id, id));
}
