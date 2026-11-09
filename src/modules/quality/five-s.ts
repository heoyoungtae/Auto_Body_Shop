// 3정5S(STD-08 11~14절, F-08-05): 구역 담당, 일일 점검(사진), 월간 100점 평가, 80점 미만은 부적합(F-Q-10)
import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";
import type { Db } from "@/db/client";
import { appUser, fiveSDaily, fiveSMonthly, fiveSZone } from "@/db/schema";
import { can } from "@/modules/auth/permissions";
import type { Role } from "@/modules/auth/roles";
import { isBusinessDay } from "@/modules/platform/business-days";
import { loadShopCalendar } from "@/modules/platform/calendar";
import { writeAudit } from "@/modules/platform/audit";
import { UserError } from "@/modules/platform/errors";
import { notifyUser } from "@/modules/platform/notify";
import { loadPolicy } from "@/modules/platform/policy";
import { IMAGE_TYPES, MAX_IMAGE_BYTES, removeStored, sniffImage, storeFile } from "@/modules/platform/storage";
import { seoulDate } from "@/modules/platform/time";
import { issueNc } from "./nc";
import { DAILY_ITEMS, dailyRate, FIVE_S, FIVE_S_ZONES, isZone, scoreIssues, scoreTotal } from "./rules";

export class FiveSError extends UserError {}
type Actor = { id: string; roles: Role[] };
const clean = (s: string | null | undefined) => (s ?? "").trim() || null;
const boss = (a: Actor) => can(a, "five_s.audit");

/** 구역이 없으면 표준 구역(A~H)을 만든다 */
export async function ensureZones(db: Db) {
  await db
    .insert(fiveSZone)
    .values(Object.entries(FIVE_S_ZONES).map(([code, name]) => ({ code, name })))
    .onConflictDoNothing();
}

export async function listZones(db: Db) {
  await ensureZones(db);
  const zones = await db.select().from(fiveSZone).where(eq(fiveSZone.active, true)).orderBy(asc(fiveSZone.code));
  const names = new Map((await db.select({ id: appUser.id, name: appUser.name }).from(appUser)).map((u) => [u.id, u.name]));
  return zones.map((z) => ({ ...z, ownerName: z.ownerId ? names.get(z.ownerId) : undefined, deputyName: z.deputyId ? names.get(z.deputyId) : undefined }));
}

export async function setZone(db: Db, actor: Actor, code: string, input: { ownerId: string; deputyId: string }, now = new Date()) {
  if (!boss(actor)) throw new FiveSError("구역 담당은 공장장(또는 대표)이 정합니다");
  if (!isZone(code)) throw new FiveSError("구역을 찾을 수 없습니다");
  if (input.ownerId && input.ownerId === input.deputyId) throw new FiveSError("담당과 대행자는 다른 사람이어야 합니다");
  await ensureZones(db);
  await db.update(fiveSZone).set({ ownerId: clean(input.ownerId), deputyId: clean(input.deputyId), updatedAt: now }).where(eq(fiveSZone.code, code));
  if (input.ownerId) await notifyUser(db, input.ownerId, `3정5S ${code} ${FIVE_S_ZONES[code]} 구역 담당이 되었습니다. 매일 작업 끝에 일일 점검을 합니다`, `5s-owner-${code}-${input.ownerId}`, "/five-s");
  await writeAudit(db, { actorId: actor.id, action: "five_s.zone", entityType: "five_s_zone", entityId: code, after: input });
}

async function zoneRow(db: Db, code: string) {
  await ensureZones(db);
  const [z] = await db.select().from(fiveSZone).where(eq(fiveSZone.code, code));
  if (!z) throw new FiveSError("구역을 찾을 수 없습니다");
  return z;
}
const mayDaily = (a: Actor, z: { ownerId: string | null; deputyId: string | null }) => z.ownerId === a.id || z.deputyId === a.id || boss(a);

/** 일일 점검(14.1). 같은 날 다시 하면 고쳐 쓴다. × 항목은 내용 필수 */
export async function recordDaily(db: Db, actor: Actor, zone: string, input: { date?: string; results: boolean[]; note?: string }, now = new Date()) {
  const z = await zoneRow(db, zone);
  if (!mayDaily(actor, z)) throw new FiveSError("일일 점검은 그 구역 담당(또는 대행자·공장장)이 합니다");
  const date = input.date || seoulDate(now);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > seoulDate(now)) throw new FiveSError("점검일을 확인해 주세요");
  if (input.results.length !== DAILY_ITEMS.length) throw new FiveSError("체크 항목을 모두 골라 주세요");
  if (input.results.some((r) => !r) && !clean(input.note)) throw new FiveSError("× 항목이 있으면 무엇이 어긋났고 어떻게 했는지 적어 주세요");
  const values = { results: input.results, items: [...DAILY_ITEMS], note: clean(input.note), checkedBy: actor.id };
  const [row] = await db
    .insert(fiveSDaily)
    .values({ zone, checkDate: date, ...values, createdAt: now })
    .onConflictDoUpdate({ target: [fiveSDaily.zone, fiveSDaily.checkDate], set: values })
    .returning({ id: fiveSDaily.id });
  return row.id;
}

async function dailyRow(db: Db, id: string) {
  const [d] = await db.select().from(fiveSDaily).where(eq(fiveSDaily.id, id));
  if (!d) throw new FiveSError("점검 기록을 찾을 수 없습니다");
  return d;
}

export async function addDailyPhoto(db: Db, actor: Actor, id: string, bytes: Uint8Array) {
  const d = await dailyRow(db, id);
  if (!mayDaily(actor, await zoneRow(db, d.zone))) throw new FiveSError("그 구역 담당만 사진을 올립니다");
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) throw new FiveSError("사진이 비었거나 너무 큽니다(6MB까지)");
  const type = sniffImage(bytes);
  if (!type) throw new FiveSError("사진 파일만 올릴 수 있습니다(JPG·PNG·WEBP)");
  if (d.photos.length >= 4) throw new FiveSError("사진은 4장까지입니다");
  const path = await storeFile(`5s/${d.zone}`, bytes, IMAGE_TYPES[type]);
  await db.update(fiveSDaily).set({ photos: [...d.photos, path] }).where(eq(fiveSDaily.id, id));
}

export async function removeDailyPhoto(db: Db, actor: Actor, id: string, path: string) {
  const d = await dailyRow(db, id);
  if (!mayDaily(actor, await zoneRow(db, d.zone))) throw new FiveSError("그 구역 담당만 사진을 지웁니다");
  if (!d.photos.includes(path)) return;
  await db.update(fiveSDaily).set({ photos: d.photos.filter((p) => p !== path) }).where(eq(fiveSDaily.id, id));
  await removeStored(path);
}

/** 구역 기준 사진('이 상태가 정상')은 한 장. 새로 올리면 바꾼다 */
export async function setZonePhoto(db: Db, actor: Actor, code: string, bytes: Uint8Array | null) {
  if (!boss(actor)) throw new FiveSError("기준 사진은 공장장이 정합니다");
  const z = await zoneRow(db, code);
  let path: string | null = null;
  if (bytes) {
    const type = sniffImage(bytes);
    if (!type || bytes.length > MAX_IMAGE_BYTES) throw new FiveSError("사진 파일만 올릴 수 있습니다(6MB까지)");
    path = await storeFile(`5s/ref`, bytes, IMAGE_TYPES[type]);
  }
  await db.update(fiveSZone).set({ refPhoto: path }).where(eq(fiveSZone.code, code));
  if (z.refPhoto) await removeStored(z.refPhoto);
}

/** 월간 평가(14.2). 기준 미만이면 부적합을 발행해 구역 담당에게 맡긴다(14.3) */
export async function rateMonthly(db: Db, actor: Actor, input: { ym: string; zone: string; scores: number[]; remarks?: string }, now = new Date()) {
  if (!boss(actor)) throw new FiveSError("월간 평가는 공장장이 합니다");
  if (!/^\d{4}-\d{2}$/.test(input.ym) || input.ym > seoulDate(now).slice(0, 7)) throw new FiveSError("평가 연월을 확인해 주세요");
  const z = await zoneRow(db, input.zone);
  const issues = scoreIssues(input.scores);
  if (issues.length) throw new FiveSError(issues.join(" / "));
  const [dup] = await db.select({ id: fiveSMonthly.id }).from(fiveSMonthly).where(and(eq(fiveSMonthly.ym, input.ym), eq(fiveSMonthly.zone, input.zone)));
  if (dup) throw new FiveSError(`${input.ym} ${input.zone} 구역은 이미 평가했습니다`);
  const total = scoreTotal(input.scores);
  const pol = await loadPolicy(db);
  const threshold = pol["five_s.nc_threshold"];
  if (total < threshold && !clean(input.remarks)) throw new FiveSError(`${threshold}점 미만이면 지적 사항을 적어 주세요(부적합 보고서 내용이 됩니다)`);
  let nc: { id: string; docNo: string } | null = null;
  if (total < threshold) {
    const low = FIVE_S.flatMap((f, i) => (input.scores[i] < 20 ? [`${f.label} ${input.scores[i]}`] : []));
    nc = await issueNc(
      db,
      actor.id,
      { source: "five_s", refType: "five_s_zone", refId: `${input.zone}-${input.ym}`, refLabel: `${input.zone} ${z.name} 구역 ${input.ym}`, content: `3정5S 월간 ${total}점(기준 ${threshold}점): ${clean(input.remarks)} [${low.join(", ")}]` },
      now,
    );
  }
  await db.insert(fiveSMonthly).values({ ym: input.ym, zone: input.zone, scores: input.scores, total, remarks: clean(input.remarks), ncId: nc?.id ?? null, ratedBy: actor.id, createdAt: now });
  if (z.ownerId) await notifyUser(db, z.ownerId, `${input.zone} ${z.name} 구역 ${input.ym} 5S ${total}점${nc ? ` — 부적합 ${nc.docNo}: 14일 안에 개선하고 전후 사진을 올리세요` : ""}`, `5s-rate-${input.zone}-${input.ym}`, nc ? `/nc/${nc.id}` : "/five-s");
  await writeAudit(db, { actorId: actor.id, action: "five_s.rate", entityType: "five_s_zone", entityId: input.zone, after: { ym: input.ym, total } });
  return { total, nc };
}

const pad = (n: number) => String(n).padStart(2, "0");
const monthsBack = (ym: string, n: number) =>
  Array.from({ length: n }, (_, i) => {
    const m = +ym.slice(5, 7) - 1 - (n - 1 - i);
    const y = +ym.slice(0, 4) + Math.floor(m / 12);
    return `${y}-${pad((((m % 12) + 12) % 12) + 1)}`;
  });

/** 3정5S 화면: 구역별 오늘 점검, 이달 점검률, 월간 점수와 6개월 추이 */
export async function fiveSBoard(db: Db, today = seoulDate()) {
  const zones = await listZones(db);
  const ym = today.slice(0, 7);
  const cal = await loadShopCalendar(db);
  const days = Array.from({ length: +today.slice(8, 10) }, (_, i) => `${ym}-${pad(i + 1)}`).filter((d) => isBusinessDay(cal, d));
  const daily = await db.select().from(fiveSDaily).where(and(gte(fiveSDaily.checkDate, `${ym}-01`), lte(fiveSDaily.checkDate, today)));
  const months = monthsBack(ym, 6);
  const monthly = await db.select().from(fiveSMonthly).where(inArray(fiveSMonthly.ym, months));
  const pol = await loadPolicy(db);
  return {
    ym,
    months,
    threshold: pol["five_s.nc_threshold"],
    cleanupMinutes: pol["five_s.cleanup_minutes"],
    zones: zones.map((z) => {
      const mine = daily.filter((d) => d.zone === z.code);
      return {
        ...z,
        today: mine.find((d) => d.checkDate === today) ?? null,
        rate: dailyRate(mine.filter((d) => days.includes(d.checkDate)).length, days.length),
        scores: Object.fromEntries(monthly.filter((m) => m.zone === z.code).map((m) => [m.ym, m])),
      };
    }),
  };
}

/** 구역 담당 할 일: 오늘 점검 안 한 내 구역 */
export async function myZonesToday(db: Db, userId: string, today = seoulDate()) {
  const zones = (await listZones(db)).filter((z) => z.ownerId === userId || z.deputyId === userId);
  if (!zones.length) return [];
  const done = new Set((await db.select({ z: fiveSDaily.zone }).from(fiveSDaily).where(eq(fiveSDaily.checkDate, today))).map((r) => r.z));
  return zones.filter((z) => !done.has(z.code));
}
