// 오류 기록(대표 요청 2026-11-20 "서버나 앱의 오류 로그는 있는가?").
// - 앱: 화면을 열거나 저장하다 난 오류(instrumentation.ts onRequestError)와 브라우저에서 화면을 그리다 난 오류(/api/errors)
// - 서버: 미니 PC agent.sh 가 1분마다 앱·DB·관문(Caddy) 출력과 시스템 기록에서 오류 줄만 골라 보낸다(/api/server-agent)
// 같은 오류는 숫자·번호를 지운 내용(fingerprint)으로 묶는다. 처음 보는 오류면 대표에게 알림(같은 오류는 하루 한 번). 90일 보관.
import { and, desc, eq, gte, lt, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { errorLog } from "@/db/schema";
import { notifyRole } from "./notify";

export const ERROR_KINDS = ["app", "browser", "server", "db", "caddy", "system"] as const;
export type ErrorKind = (typeof ERROR_KINDS)[number];
export const ERROR_KIND_LABEL: Record<ErrorKind, string> = {
  app: "앱(화면·저장)",
  browser: "브라우저",
  server: "앱 프로그램",
  db: "DB",
  caddy: "관문(Caddy)",
  system: "미니 PC",
};
export const KEEP_DAYS = 90;
const FLOOD_PER_HOUR = 200; // 같은 오류가 한 시간에 이보다 많으면 더 쌓지 않는다(기록이 넘치지 않게)

const clip = (x: unknown, n: number) => String(x ?? "").replace(/\u0000/g, "").slice(0, n);
/** 같은 오류 묶기: 숫자·긴 16진수·UUID·따옴표 안 값을 지운다 */
export function fingerprintOf(kind: string, message: string) {
  const m = message
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "#")
    .replace(/\b[0-9a-f]{7,}\b/gi, "#")
    .replace(/"[^"]{0,200}"|'[^']{0,200}'/g, "'…'")
    .replace(/\d+/g, "#")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
  return `${kind}:${m}`;
}

export type ErrorInput = { kind: string; message: string; detail?: string; path?: string; userId?: string | null; code?: string };

let lastPrune = 0;
/** 오류 한 건을 남긴다. 기록이 실패해도 앱을 멈추지 않는다 */
export async function recordError(db: Db, input: ErrorInput, now = new Date()) {
  const kind = (ERROR_KINDS as readonly string[]).includes(input.kind) ? input.kind : "server";
  const message = clip(input.message, 500).trim() || "(내용 없음)";
  const fingerprint = fingerprintOf(kind, message);
  const [{ n, seen }] = await db
    .select({
      n: sql<number>`count(*) filter (where ${errorLog.at} >= ${new Date(now.getTime() - 3600_000).toISOString()}::timestamptz)`.mapWith(Number),
      seen: sql<number>`count(*)`.mapWith(Number),
    })
    .from(errorLog)
    .where(and(eq(errorLog.fingerprint, fingerprint), gte(errorLog.at, new Date(now.getTime() - KEEP_DAYS * 86400_000))));
  if (n >= FLOOD_PER_HOUR) return null;
  const [row] = await db
    .insert(errorLog)
    .values({ at: now, kind, fingerprint, message, detail: clip(input.detail, 4000), path: clip(input.path, 300), userId: input.userId ?? null, code: clip(input.code, 40) })
    .returning({ id: errorLog.id });
  // 처음 보는 오류면 대표에게(같은 오류는 하루 한 번)
  if (seen === 0) {
    const day = new Date(now.getTime() + 9 * 3600_000).toISOString().slice(0, 10);
    await notifyRole(db, "owner", `새 오류(${ERROR_KIND_LABEL[kind as ErrorKind]}): ${message.slice(0, 80)}`, `error-new:${day}:${fingerprint.slice(0, 120)}`, `/settings/server/errors?fp=${encodeURIComponent(fingerprint)}`);
  }
  if (now.getTime() - lastPrune > 3600_000) {
    lastPrune = now.getTime();
    await db.delete(errorLog).where(lt(errorLog.at, new Date(now.getTime() - KEEP_DAYS * 86400_000)));
  }
  return row?.id ?? null;
}

/** 실패해도 조용히(오류 기록 때문에 또 오류가 나지 않게) */
export async function recordErrorSafe(db: Db, input: ErrorInput, now = new Date()) {
  try {
    return await recordError(db, input, now);
  } catch {
    return null;
  }
}

export type ErrorGroup = { fingerprint: string; kind: string; n: number; firstAt: Date; lastAt: Date; message: string; path: string; code: string; userId: string | null };
/** 묶어 보기: 기간·종류·찾기(오류 번호 또는 내용) */
export async function errorGroups(db: Db, opt: { days: number; kind?: string; q?: string; fp?: string }, now = new Date()): Promise<ErrorGroup[]> {
  const since = new Date(now.getTime() - Math.max(1, Math.min(KEEP_DAYS, opt.days)) * 86400_000);
  const conds = [gte(errorLog.at, since)];
  if (opt.kind && (ERROR_KINDS as readonly string[]).includes(opt.kind)) conds.push(eq(errorLog.kind, opt.kind));
  if (opt.fp) conds.push(eq(errorLog.fingerprint, opt.fp));
  const q = opt.q?.trim();
  // 찾으면 그 오류가 든 묶음 전체를 보여 준다(오류 번호로 찾아도 횟수는 묶음 전체)
  if (q) {
    const like = `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
    conds.push(sql`${errorLog.fingerprint} in (select fingerprint from error_log where at >= ${since.toISOString()}::timestamptz and (code = ${q} or message ilike ${like} or path ilike ${like}))`);
  }
  const rows = await db
    .select({
      fingerprint: errorLog.fingerprint,
      kind: errorLog.kind,
      n: sql<number>`count(*)`.mapWith(Number),
      firstAt: sql<string>`min(${errorLog.at})`,
      lastAt: sql<string>`max(${errorLog.at})`,
      message: sql<string>`(array_agg(${errorLog.message} order by ${errorLog.at} desc))[1]`,
      path: sql<string>`(array_agg(${errorLog.path} order by ${errorLog.at} desc))[1]`,
      code: sql<string>`(array_agg(${errorLog.code} order by ${errorLog.at} desc))[1]`,
      userId: sql<string | null>`(array_agg(${errorLog.userId} order by ${errorLog.at} desc))[1]`,
    })
    .from(errorLog)
    .where(and(...conds))
    .groupBy(errorLog.fingerprint, errorLog.kind)
    .orderBy(sql`max(${errorLog.at}) desc`)
    .limit(200);
  return rows.map((r) => ({ ...r, firstAt: new Date(r.firstAt), lastAt: new Date(r.lastAt) }));
}

/** 한 묶음의 최근 기록(자세한 내용 포함) */
export async function errorRecent(db: Db, fingerprint: string, limit = 5) {
  return db.select().from(errorLog).where(eq(errorLog.fingerprint, fingerprint)).orderBy(desc(errorLog.at)).limit(limit);
}

/** 오늘(서울) 오류 수: 서버 정보 화면용 */
export async function errorCountToday(db: Db, now = new Date()) {
  const start = new Date(Date.parse(`${new Date(now.getTime() + 9 * 3600_000).toISOString().slice(0, 10)}T00:00:00+09:00`));
  const [r] = await db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(errorLog).where(gte(errorLog.at, start));
  return r?.n ?? 0;
}
