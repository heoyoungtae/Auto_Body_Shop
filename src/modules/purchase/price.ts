// 업체별 단가표·단가 변동 이력(대표 요청 2026-11-20).
// 단가가 들어오는 곳(품목 등록·고치기, 견적서 일괄 등록, 입고 검수)은 모두 recordPrice 한 곳을 거친다.
import { and, asc, desc, eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { appUser, priceHistory, stockItem, supplier, supplierPrice } from "@/db/schema";
import { changePct } from "./quote-rules";

/** 트랜잭션 안에서도 쓴다 */
type Tx = Pick<Db, "select" | "insert" | "update">;

export const PRICE_SOURCES = { quote: "견적서", receive: "입고 검수", manual: "직접 입력" } as const;
export type PriceSource = keyof typeof PRICE_SOURCES;

export type PriceInput = {
  itemId: string;
  supplierId: string | null;
  /** 공급가 */
  unitWon: number;
  vatMode: string;
  source: PriceSource;
  ref?: string | null;
  quoteId?: string | null;
  supName?: string | null;
  supUnit?: string | null;
  /** 이 업체의 입수(1박스 = ?개). undefined 면 그대로 둔다 */
  packQty?: number | null;
  quotedOn?: string | null;
  validUntil?: string | null;
  /** 업체가 없을 때 비교할 전 단가(품목 단가) */
  before?: number | null;
  by: string;
  at: Date;
};

/**
 * 업체 단가표를 갱신하고, 단가가 바뀌었으면(처음 포함) 이력을 남긴다. 돌려주는 값: 전 단가·변동률
 */
export async function recordPrice(tx: Tx, p: PriceInput): Promise<{ before: number | null; changed: boolean; pct: number | null }> {
  let before: number | null = p.before ?? null;
  if (p.supplierId) {
    const [cur] = await tx.select().from(supplierPrice).where(and(eq(supplierPrice.itemId, p.itemId), eq(supplierPrice.supplierId, p.supplierId)));
    before = cur ? cur.unitWon : null;
    const v = {
      unitWon: p.unitWon,
      vatMode: p.vatMode,
      source: p.source,
      ref: p.ref ?? null,
      updatedBy: p.by,
      updatedAt: p.at,
      // 견적서 정보는 새로 들어온 것만 덮어쓴다(입고 단가는 업체 품명·견적일을 지우지 않음)
      ...(p.supName ? { supName: p.supName } : {}),
      ...(p.supUnit ? { supUnit: p.supUnit } : {}),
      ...(p.packQty !== undefined ? { packQty: p.packQty && p.packQty > 1 ? p.packQty : null } : {}),
      ...(p.quotedOn ? { quotedOn: p.quotedOn, validUntil: p.validUntil ?? null } : {}),
    };
    if (cur) await tx.update(supplierPrice).set(v).where(eq(supplierPrice.id, cur.id));
    else await tx.insert(supplierPrice).values({ itemId: p.itemId, supplierId: p.supplierId, ...v });
  }
  const changed = before !== p.unitWon;
  if (changed) await tx.insert(priceHistory).values({ itemId: p.itemId, supplierId: p.supplierId, beforeWon: before, afterWon: p.unitWon, source: p.source, ref: p.ref ?? null, quoteId: p.quoteId ?? null, by: p.by, at: p.at });
  return { before, changed, pct: changed ? changePct(before, p.unitWon) : null };
}

/** 품목 화면: 업체별 단가(싼 순)와 가장 싼 곳·주 거래 업체 표시 */
export async function itemPrices(db: Db, itemId: string, today: string) {
  const [it] = await db.select({ supplierId: stockItem.supplierId }).from(stockItem).where(eq(stockItem.id, itemId));
  const rows = await db
    .select({ p: supplierPrice, supplierName: supplier.name, supplierStatus: supplier.status })
    .from(supplierPrice)
    .innerJoin(supplier, eq(supplier.id, supplierPrice.supplierId))
    .where(eq(supplierPrice.itemId, itemId))
    .orderBy(asc(supplierPrice.unitWon));
  const usable = rows.filter((r) => r.supplierStatus !== "stopped" && r.supplierStatus !== "rejected");
  const min = usable.length ? usable[0].p.unitWon : null;
  return rows.map((r) => ({
    ...r.p,
    supplierName: r.supplierName,
    supplierStatus: r.supplierStatus,
    main: r.p.supplierId === it?.supplierId,
    cheapest: min != null && r.p.unitWon === min && usable.length > 1,
    expired: !!(r.p.validUntil && r.p.validUntil < today),
  }));
}

/** 품목 화면: 단가 변동 이력(최근 순) */
export async function itemPriceHistory(db: Db, itemId: string, limit = 60) {
  return db
    .select({ h: priceHistory, supplierName: supplier.name, byName: appUser.name })
    .from(priceHistory)
    .leftJoin(supplier, eq(supplier.id, priceHistory.supplierId))
    .leftJoin(appUser, eq(appUser.id, priceHistory.by))
    .where(eq(priceHistory.itemId, itemId))
    .orderBy(desc(priceHistory.at))
    .limit(limit);
}

/** 발주서 품목 줄: 품목별 업체 단가(거래하는 업체만) */
export async function priceBook(db: Db) {
  const rows = await db
    .select({ itemId: supplierPrice.itemId, supplierId: supplierPrice.supplierId, unitWon: supplierPrice.unitWon, validUntil: supplierPrice.validUntil, name: supplier.name, status: supplier.status })
    .from(supplierPrice)
    .innerJoin(supplier, eq(supplier.id, supplierPrice.supplierId));
  const by = new Map<string, { supplierId: string; name: string; unitWon: number; validUntil: string | null }[]>();
  for (const r of rows) {
    if (r.status === "stopped" || r.status === "rejected") continue;
    by.set(r.itemId, [...(by.get(r.itemId) ?? []), { supplierId: r.supplierId, name: r.name, unitWon: r.unitWon, validUntil: r.validUntil }]);
  }
  return by;
}
