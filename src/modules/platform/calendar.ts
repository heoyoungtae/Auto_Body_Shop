// 영업일·휴무일 설정 읽기·바꾸기. 계산은 business-days.ts(화면과 같은 함수).
import { asc, eq, gte } from "drizzle-orm";
import type { Db } from "@/db/client";
import { appConfig, shopDay } from "@/db/schema";
import { writeAudit } from "./audit";
import { UserError } from "./errors";
import { DEFAULT_CALENDAR, type DayKind, type ShopCalendar } from "./business-days";

const KEY = "calendar";
const KINDS: DayKind[] = ["holiday", "closed", "open"];

export async function loadShopCalendar(db: Db): Promise<ShopCalendar> {
  const [cfg] = await db.select().from(appConfig).where(eq(appConfig.key, KEY));
  const data = (cfg?.data ?? {}) as Partial<ShopCalendar>;
  const rows = await db.select().from(shopDay);
  return {
    workdays: Array.isArray(data.workdays) ? data.workdays : DEFAULT_CALENDAR.workdays,
    excludeHolidays: typeof data.excludeHolidays === "boolean" ? data.excludeHolidays : DEFAULT_CALENDAR.excludeHolidays,
    days: Object.fromEntries(rows.map((r) => [r.date, { kind: r.kind as DayKind, name: r.name }])),
  };
}

export async function calendarMeta(db: Db) {
  const [cfg] = await db.select({ updatedAt: appConfig.updatedAt }).from(appConfig).where(eq(appConfig.key, KEY));
  return { updatedAt: cfg?.updatedAt ?? null };
}

export async function saveCalendarRules(db: Db, actorId: string, input: { workdays: number[]; excludeHolidays: boolean }) {
  const workdays = [...new Set(input.workdays.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort();
  if (!workdays.length) throw new UserError("문 여는 요일을 하나 이상 골라 주세요");
  const before = await loadShopCalendar(db);
  const data = { workdays, excludeHolidays: input.excludeHolidays };
  await db
    .insert(appConfig)
    .values({ key: KEY, data, updatedBy: actorId, updatedAt: new Date() })
    .onConflictDoUpdate({ target: appConfig.key, set: { data, updatedBy: actorId, updatedAt: new Date() } });
  await writeAudit(db, { actorId, action: "calendar.rules", entityType: "app_config", entityId: KEY, before: { workdays: before.workdays, excludeHolidays: before.excludeHolidays }, after: data });
}

export async function addShopDay(db: Db, actorId: string, input: { date: string; kind: string; name: string }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new UserError("날짜를 골라 주세요");
  if (!KINDS.includes(input.kind as DayKind)) throw new UserError("종류를 골라 주세요");
  const name = input.name.trim();
  if (input.kind !== "open" && !name) throw new UserError("이름이나 사유를 적어 주세요(예: 여름 휴가, 임시공휴일)");
  await db
    .insert(shopDay)
    .values({ date: input.date, kind: input.kind, name, createdBy: actorId })
    .onConflictDoUpdate({ target: shopDay.date, set: { kind: input.kind, name, createdBy: actorId } });
  await writeAudit(db, { actorId, action: "calendar.day.add", entityType: "shop_day", entityId: input.date, after: { kind: input.kind, name } });
}

export async function removeShopDay(db: Db, actorId: string, date: string) {
  const [row] = await db.delete(shopDay).where(eq(shopDay.date, date)).returning();
  if (row) await writeAudit(db, { actorId, action: "calendar.day.remove", entityType: "shop_day", entityId: date, before: { kind: row.kind, name: row.name } });
}

export async function listShopDays(db: Db, fromDate: string) {
  return db.select().from(shopDay).where(gte(shopDay.date, fromDate)).orderBy(asc(shopDay.date));
}
