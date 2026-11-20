// 동시 수정 막기(대표 결정 2026-11-20 "셋 다 만들기").
//
// 1) 저장할 때 확인: 화면을 그릴 때 그 양식이 고치는 칸들의 '지문'(fresh 표)을 숨은 칸 _fresh 로 같이 보낸다.
//    저장할 때 서버가 지금 값의 지문을 다시 만들어 다르면, 그사이 다른 사람이 같은 칸을 고친 것이므로
//    저장하지 않고 "○○님이 10:42에 먼저 고쳤습니다"로 돌려보낸다. 화면(_assist.tsx)은 달라진 칸을 보여 주고
//    내가 고치지 않은 칸은 그 사람 값으로, 내가 고친 칸은 내 값으로 맞춰 둔다. 다시 저장하면 그대로 들어간다.
//    양식이 고치는 칸만 지문에 넣으므로, 다른 사람이 같은 전표의 다른 곳(다른 줄, 사진 등)을 고친 것은 막지 않는다.
// 2) 단계 단추 틈 막기: 검토 요청·발급·승인·지급처럼 상태를 넘기는 단추는 그 전표 줄을 잠그고(SELECT … FOR UPDATE)
//    처리한다. 두 사람이 거의 같은 순간에 눌러도 늦은 쪽은 앞사람이 끝난 뒤의 상태를 보고 "이미 …" 로 막힌다.
import { createHash } from "node:crypto";
import { and, desc, eq, gt, inArray } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import type { Db } from "@/db/client";
import { appUser, auditLog, consultation, customer, estimate, estimateLine, insuranceClaim, purchaseLine, purchaseOrder, repairOrder, roDamage, stockItem, supplier, vehicle } from "@/db/schema";
import { UserError } from "./errors";

export class ConflictError extends UserError {}

type Row = Record<string, unknown>;
type IdTable = PgTable & { id: PgColumn };

type Entry = {
  table: IdTable;
  /** 이 양식이 고치는 칸(열 이름). 이 칸들이 바뀌었을 때만 '먼저 고침'으로 본다 */
  cols: string[];
  /** 감사 기록의 entity_type(누가 고쳤는지 찾을 때) */
  audit: string;
  /** 감사 기록의 entity_id 후보. 없으면 id·docNo·plateNo */
  auditIds?: (db: Db, row: Row) => Promise<string[]>;
  /** '고치는 중' 표시를 나눠 쓰는 전표 열쇠(같은 전표의 여러 양식이 한 열쇠) */
  doc: (row: Row) => string;
};

const parentDocNo = (table: IdTable, key: string) => async (db: Db, row: Row) => {
  const [p] = (await db.select().from(table as PgTable).where(eq(table.id, String(row[key])))) as Row[];
  return [String(row[key]), ...(p?.docNo ? [String(p.docNo)] : [])];
};

export const FRESH = {
  "repair.intake": {
    table: repairOrder,
    cols: ["mileage", "fuelPct", "bodyNotes", "warningLights", "marks", "valuables", "valuablesNone", "devices", "keyCount", "keyTag", "coversOn", "parkSpot", "delivered", "driverName", "intakeNote", "agreeChecked", "agreeMove", "signerName", "signedAt"],
    audit: "repair_order",
    doc: (r) => `repair:${r.id}`,
  },
  "repair.damage": {
    table: roDamage,
    cols: ["part", "view", "cells", "subPart", "kind", "sizeCm", "depthMm", "paintLayer", "crease", "broken", "structural", "filmPanel", "filmAdjacent", "method", "methodReason", "calibrate", "note"],
    audit: "repair_order",
    auditIds: parentDocNo(repairOrder, "repairOrderId"),
    doc: (r) => `repair:${r.repairOrderId}`,
  },
  "estimate.header": {
    table: estimate,
    cols: ["kind", "paintGrade", "dueDate", "note"],
    audit: "estimate",
    doc: (r) => `estimate:${r.id}`,
  },
  "estimate.line": {
    table: estimateLine,
    cols: ["payer", "category", "laborCode", "name", "partCode", "partNo", "qty", "unitWon", "laborMinutes", "laborWon", "note"],
    audit: "estimate",
    auditIds: parentDocNo(estimate, "estimateId"),
    doc: (r) => `estimate:${r.estimateId}`,
  },
  customer: {
    table: customer,
    cols: ["name", "phoneHash", "memo"],
    audit: "customer",
    doc: (r) => `customer:${r.id}`,
  },
  "customer.biz": {
    table: customer,
    cols: ["bizNo", "contactName", "taxEmail", "payTerm", "payDay", "creditLimitWon", "invoiceMode", "portal", "portalUrl", "portalNote"],
    audit: "customer",
    doc: (r) => `customer:${r.id}`,
  },
  vehicle: {
    table: vehicle,
    cols: ["plateNo", "vin", "maker", "model", "year", "generation", "trim", "colorCode", "options", "bodyType", "mileage", "registeredOn"],
    audit: "vehicle",
    doc: (r) => `customer:${r.customerId}`,
  },
  consult: {
    table: consultation,
    cols: ["vehicleId", "damageTypes", "damageParts", "damageZones", "cause", "photoCount", "mileage", "methods", "structural", "insurance", "insurer", "claimNo", "wantDate", "partsPref", "rental", "needs", "estMin", "estMax", "estNoticed", "reservedAt"],
    audit: "consultation",
    doc: (r) => `consult:${r.id}`,
  },
  supplier: {
    table: supplier,
    cols: ["name", "bizNo", "kinds", "items", "contactName", "phone", "email", "leadDays", "returnTerms", "docs", "note"],
    audit: "supplier",
    doc: (r) => `supplier:${r.id}`,
  },
  "po.header": {
    table: purchaseOrder,
    cols: ["supplierId", "dueOn", "note", "payTerm", "payDay"],
    audit: "purchase_order",
    doc: (r) => `po:${r.id}`,
  },
  "po.line": {
    table: purchaseLine,
    cols: ["name", "partNo", "spec", "partCode", "qty", "unitWon", "note"],
    audit: "purchase_order",
    auditIds: parentDocNo(purchaseOrder, "orderId"),
    doc: (r) => `po:${r.orderId}`,
  },
  "stock.item": {
    table: stockItem,
    cols: ["name", "kind", "spec", "unit", "location", "safetyQty", "expiryTracked", "supplierId", "vatMode", "packAmount", "packUnit", "expCategory", "chemicalId", "trackMode", "buyUnit", "buyQty"],
    audit: "stock_item",
    doc: (r) => `stock:${r.id}`,
  },
  "claim.info": {
    table: insuranceClaim,
    cols: ["insurer", "claimNo", "coverage", "faultPct", "deductibleWon", "adjusterName", "adjusterPhone"],
    audit: "insurance_claim",
    doc: (r) => `claim:${r.id}`,
  },
} satisfies Record<string, Entry>;

export type FreshKey = keyof typeof FRESH;

const norm = (v: unknown): unknown => (v instanceof Date ? v.toISOString() : v === undefined ? null : v);

/** 고치는 칸들의 지문(짧은 해시) */
export function fingerprint(key: FreshKey, row: Row): string {
  const e: Entry = FRESH[key];
  const body = JSON.stringify(e.cols.map((c) => norm(row[c])));
  return createHash("sha256").update(body).digest("base64url").slice(0, 16);
}

/**
 * 화면에서 양식에 붙일 표(AssistForm 의 fresh). 형식: 열쇠|id|지문|그린 시각(ms)|전표 열쇠
 * 그린 시각은 '누가 먼저 고쳤는지' 감사 기록에서 찾을 때 쓴다.
 */
export function freshToken(key: FreshKey, row: Row, now = new Date()): string {
  const e: Entry = FRESH[key];
  return [key, String(row.id), fingerprint(key, row), String(now.getTime()), e.doc(row)].join("|");
}

export function parseToken(token: string) {
  const [key, id, hash, at, doc] = token.split("|");
  if (!key || !id || !hash || !(key in FRESH)) return null;
  return { key: key as FreshKey, id, hash, at: Number(at) || 0, doc: doc ?? "" };
}

const hhmm = (d: Date) => d.toLocaleTimeString("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hour12: false });

/** 그사이 고친 사람과 시각(감사 기록에서). 못 찾으면 null */
export async function whoChanged(db: Db, key: FreshKey, row: Row, since: Date): Promise<{ userId: string | null; name: string | null; at: Date } | null> {
  const e: Entry = FRESH[key];
  const ids = e.auditIds ? await e.auditIds(db, row) : (["id", "docNo", "plateNo"].map((k) => row[k]).filter((v) => typeof v === "string" && v) as string[]);
  if (!ids.length) return null;
  const [a] = await db
    .select({ userId: auditLog.actorId, name: appUser.name, at: auditLog.at })
    .from(auditLog)
    .leftJoin(appUser, eq(appUser.id, auditLog.actorId))
    .where(and(eq(auditLog.entityType, e.audit), inArray(auditLog.entityId, ids), gt(auditLog.at, since)))
    .orderBy(desc(auditLog.at))
    .limit(1);
  return a ?? null;
}

export function conflictMessage(who: { userId: string | null; name: string | null; at: Date } | null, meId: string): string {
  const tail = "아래 '달라진 칸'을 보고 맞으면 다시 저장해 주세요";
  if (!who) return `화면을 연 뒤 다른 사람이 이 내용을 먼저 고쳤습니다. ${tail}`;
  if (who.userId === meId) return `${hhmm(who.at)}에 다른 창(또는 다른 기기)에서 이 내용을 먼저 고치셨습니다. ${tail}`;
  return `${who.name ?? "다른 사람"}님이 ${hhmm(who.at)}에 이 내용을 먼저 고쳤습니다. ${tail}`;
}

/** 줄 하나를 이 거래가 끝날 때까지 잠근다(다른 사람의 같은 줄 처리는 기다린다) */
async function lockRow(tx: Db, table: IdTable, id: string): Promise<Row | undefined> {
  const [row] = (await tx
    .select()
    .from(table as PgTable)
    .where(eq(table.id, id))
    .for("update")) as Row[];
  return row;
}

/**
 * 고치기 저장: 양식의 _fresh 표가 있으면 그 줄을 잠그고 지문을 견준 뒤 fn 을 같은 거래 안에서 부른다.
 * 표가 없으면(새로 만들기 등) 그냥 fn(db).
 */
export async function guardEdit<T>(db: Db, actor: { id: string }, form: FormData | string | null, fn: (tx: Db) => Promise<T>): Promise<T> {
  const raw = typeof form === "string" || form === null ? form : form.get("_fresh");
  const t = typeof raw === "string" ? parseToken(raw) : null;
  if (!t) return fn(db);
  const e: Entry = FRESH[t.key];
  return db.transaction(async (tx) => {
    const row = await lockRow(tx, e.table, t.id);
    if (row && fingerprint(t.key, row) !== t.hash) {
      const who = await whoChanged(tx, t.key, row, new Date(t.at || 0));
      throw new ConflictError(conflictMessage(who, actor.id));
    }
    return fn(tx);
  });
}

/** 단계 단추: 그 전표 줄을 잠그고 처리한다. 동시에 누른 늦은 쪽은 앞사람 처리 뒤 상태로 다시 검사된다 */
export async function withLock<T>(db: Db, table: IdTable, id: string, fn: (tx: Db) => Promise<T>): Promise<T> {
  if (!id) return fn(db);
  return db.transaction(async (tx) => {
    await lockRow(tx, table, id);
    return fn(tx);
  });
}

/** 화면에서: 저장된 그대로의 줄을 읽어 표를 만든다(화면용으로 다듬은 값으로 만들면 지문이 달라진다) */
export async function freshFor(db: Db, key: FreshKey, id: string, now = new Date()): Promise<string | undefined> {
  const e: Entry = FRESH[key];
  const [row] = (await db.select().from(e.table as PgTable).where(eq(e.table.id, id))) as Row[];
  return row ? freshToken(key, row, now) : undefined;
}

/** 여러 줄(견적 항목·발주 품목 등)의 표를 한 번에. id → 표 */
export async function freshForMany(db: Db, key: FreshKey, ids: string[], now = new Date()): Promise<Record<string, string>> {
  if (!ids.length) return {};
  const e: Entry = FRESH[key];
  const rows = (await db.select().from(e.table as PgTable).where(inArray(e.table.id, ids))) as Row[];
  return Object.fromEntries(rows.map((r) => [String(r.id), freshToken(key, r, now)]));
}
