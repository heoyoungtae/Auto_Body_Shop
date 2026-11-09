// 공휴일 자동 갱신(사용자 질문 2026-11-09 "2027 이후의 공휴일은 어떻게 갱신되나?").
// 공공데이터포털 '한국천문연구원 특일 정보'(getRestDeInfo)에서 올해·내년 공휴일을 매달 1일에 가져와 그 해의 정답으로 저장한다(임시공휴일·선거일 포함).
// 받은 해는 받은 목록만 쓰고, 못 받은 해만 앱 예비 목록(KR_PUBLIC_HOLIDAYS)을 쓴다(사용자 지시 2026-11-09 "하드코딩 공휴일은 제거해야").
// 대표가 직접 넣은 날(휴무·특별 영업·공휴일 추가)은 따로 두고 건드리지 않는다. 인증키는 대표가 설정 화면에서 넣고 암호화해 둔다.
// 가져오지 못하거나 9월이 지나도 내년 공휴일이 없으면 대표 '내 할 일'과 알림으로 알린다.
import { and, eq, gte, isNull, lte } from "drizzle-orm";
import type { Db } from "@/db/client";
import { appConfig, shopDay } from "@/db/schema";
import { decrypt, encrypt } from "@/modules/auth/crypto";
import { writeAudit } from "./audit";
import { HOLIDAY_DATA_LAST_YEAR, KR_PUBLIC_HOLIDAYS } from "./business-days";
import { UserError } from "./errors";
import { notifyRole } from "./notify";
import { seoulDate } from "./time";
import { loadOfficialHolidays, OFFICIAL_KEY } from "./calendar";

export const HOLIDAY_API = "https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo";
export const HOLIDAY_API_GUIDE = "https://www.data.go.kr/data/15012690/openapi.do";
/** 이 날(MM-DD)부터 내년 공휴일이 하나도 없으면 매일 다시 가져오고, 대표 할 일에 올린다 */
export const HOLIDAY_CHECK_FROM = "09-01";
const CFG = "holiday.sync";

type Cfg = { keyEnc?: string | null; lastAt?: string | null; lastStatus?: string | null; lastMessage?: string | null };

async function loadCfg(db: Db): Promise<Cfg> {
  const [r] = await db.select({ data: appConfig.data }).from(appConfig).where(eq(appConfig.key, CFG));
  return (r?.data ?? {}) as Cfg;
}

async function saveCfg(db: Db, data: Cfg, actorId: string | null) {
  await db
    .insert(appConfig)
    .values({ key: CFG, data, updatedBy: actorId, updatedAt: new Date() })
    .onConflictDoUpdate({ target: appConfig.key, set: { data, updatedBy: actorId, updatedAt: new Date() } });
}

/** 설정 화면용 상태(키 자체는 보여 주지 않는다) */
export async function holidaySyncStatus(db: Db) {
  const c = await loadCfg(db);
  return { hasKey: !!c.keyEnc, lastAt: c.lastAt ?? null, lastStatus: c.lastStatus ?? null, lastMessage: c.lastMessage ?? null };
}

export async function saveHolidayKey(db: Db, actorId: string, key: string) {
  const k = key.trim();
  if (k && (k.length < 20 || /\s/.test(k))) throw new UserError("인증키 형식이 아닙니다. 공공데이터포털 마이페이지의 '일반 인증키(Decoding)'를 그대로 붙여 넣으세요");
  const c = await loadCfg(db);
  await saveCfg(db, { ...c, keyEnc: k ? encrypt(k) : null }, actorId);
  await writeAudit(db, { actorId, action: k ? "holiday.key.set" : "holiday.key.clear", entityType: "config", entityId: CFG });
}

/** 그 해에 앱이 아는 공휴일 수(내장 + 설정에서 넣은 공휴일) */
export async function holidaysKnown(db: Db, year: number) {
  const off = (await loadOfficialHolidays(db))[String(year)];
  const builtIn = off ? Object.keys(off).length : Object.keys(KR_PUBLIC_HOLIDAYS).filter((d) => d.startsWith(`${year}-`)).length;
  const added = await db
    .select({ d: shopDay.date })
    .from(shopDay)
    .where(and(eq(shopDay.kind, "holiday"), gte(shopDay.date, `${year}-01-01`), lte(shopDay.date, `${year}-12-31`)));
  return builtIn + added.length;
}

type Item = { locdate?: number | string; dateName?: string; isHoliday?: string };

/** API 응답(JSON)에서 공휴일(isHoliday=Y)만 뽑는다. 형식이 다르면 null */
export function parseHolidayJson(body: unknown): { date: string; name: string }[] | null {
  const b = (body as { response?: { header?: { resultCode?: string }; body?: { items?: { item?: Item | Item[] } | "" } } })?.response;
  if (!b?.header || (b.header.resultCode !== "00" && b.header.resultCode !== "0000")) return null;
  const items = b.body?.items;
  if (!items) return [];
  const list = Array.isArray(items.item) ? items.item : items.item ? [items.item] : [];
  const out: { date: string; name: string }[] = [];
  for (const it of list) {
    const s = String(it.locdate ?? "");
    if (!/^\d{8}$/.test(s) || it.isHoliday !== "Y") continue;
    out.push({ date: `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`, name: (it.dateName ?? "공휴일").trim() || "공휴일" });
  }
  return out;
}

/** 공공데이터포털이 보내는 오류 이유(XML·HTML·글)를 짧게 뽑는다 */
export function apiReason(text: string): string {
  const code = /<returnAuthMsg>([^<]+)<\/returnAuthMsg>/i.exec(text)?.[1] ?? /<resultMsg>([^<]+)<\/resultMsg>/i.exec(text)?.[1] ?? /"resultMsg"\s*:\s*"([^"]+)"/.exec(text)?.[1];
  const raw = (code ?? text.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim().slice(0, 120);
  if (/SERVICE_KEY_IS_NOT_REGISTERED|등록되지 않은/i.test(raw)) return "인증키가 등록되지 않음(신청 직후면 1~2시간 뒤 다시, 아니면 Decoding 키인지 확인)";
  if (/LIMITED_NUMBER_OF_SERVICE_REQUESTS/i.test(raw)) return "하루 호출 한도 초과";
  if (/SERVICE_ACCESS_DENIED|접근.*거부|forbidden/i.test(raw)) return `접근 거부(${raw})`;
  return raw || "내용 없음";
}

/** 인증키는 Decoding 키를 그대로 보낸다. Encoding 키(%2B 등)를 넣었으면 풀어서 한 번만 인코딩되게 */
export function normalizeKey(k: string) {
  if (/%[0-9a-f]{2}/i.test(k)) {
    try {
      return decodeURIComponent(k);
    } catch {
      return k;
    }
  }
  return k;
}

const UA = "Mozilla/5.0 (compatible; auto-body-shop/1.0)";

/** 한 해 공휴일. https 가 막히면 http 로 한 번 더(공공데이터포털 안내 주소가 http) */
async function fetchYear(key: string, y: number, f: typeof fetch): Promise<{ ok: true; list: { date: string; name: string }[] } | { ok: false; why: string }> {
  const qs = new URLSearchParams({ serviceKey: normalizeKey(key), solYear: String(y), numOfRows: "100", _type: "json" }).toString();
  const tries: string[] = [];
  for (const base of [HOLIDAY_API, HOLIDAY_API.replace("https://", "http://")]) {
    let text: string;
    let status: number;
    try {
      const res = await f(`${base}?${qs}`, { headers: { "User-Agent": UA, Accept: "application/json, application/xml;q=0.9, */*;q=0.8" }, signal: AbortSignal.timeout(20_000) });
      status = res.status;
      text = await res.text();
    } catch (e) {
      tries.push(`${base.slice(0, 5)} 접속 안 됨(${e instanceof Error ? e.message : String(e)})`);
      continue;
    }
    if (status >= 200 && status < 300) {
      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch {
        return { ok: false, why: `특일 정보 오류: ${apiReason(text)}` };
      }
      const list = parseHolidayJson(json);
      if (!list) return { ok: false, why: `특일 정보 오류: ${apiReason(text)}` };
      return { ok: true, list };
    }
    tries.push(`${base.startsWith("https") ? "https" : "http"} ${status} ${apiReason(text)}`);
    if (status !== 403 && status < 500) break;
  }
  return { ok: false, why: `특일 정보 응답 ${tries.join(" / ")}` };
}

export type HolidaySyncResult = { status: "skipped" | "nokey" | "done" | "failed"; message: string; added?: number };

/** 올해·내년 공휴일을 가져와 빠진 날을 넣는다. force 는 대표가 '지금 가져오기'를 누를 때 */
export async function syncHolidays(db: Db, now = new Date(), opts: { force?: boolean; actorId?: string | null; f?: typeof fetch } = {}): Promise<HolidaySyncResult> {
  const today = seoulDate(now);
  const year = Number(today.slice(0, 4));
  const nextKnown = await holidaysKnown(db, year + 1);
  const due = today.slice(8) === "01" || (today.slice(5) >= HOLIDAY_CHECK_FROM && nextKnown === 0);
  if (!opts.force && !due) return { status: "skipped", message: "공휴일 확인 시기 아님" };
  const cfg = await loadCfg(db);
  const finish = async (r: HolidaySyncResult) => {
    await saveCfg(db, { ...cfg, lastAt: now.toISOString(), lastStatus: r.status, lastMessage: r.message }, opts.actorId ?? null);
    if (r.status !== "done" && today.slice(5) >= HOLIDAY_CHECK_FROM && nextKnown === 0) {
      const week = Math.floor(now.getTime() / (7 * 86_400_000));
      await notifyRole(db, "owner", `${year + 1}년 공휴일이 아직 없습니다(${r.message}). 설정 › 영업일·휴무일에서 가져오거나 직접 넣어 주세요`, `holiday-missing-${year + 1}-${week}`, "/settings/calendar");
    }
    return r;
  };
  if (!cfg.keyEnc) return finish({ status: "nokey", message: "공공데이터포털 인증키가 없음" });
  let key: string;
  try {
    key = decrypt(cfg.keyEnc);
  } catch {
    return finish({ status: "failed", message: "저장된 인증키를 읽지 못함(다시 넣어 주세요)" });
  }
  const found: { date: string; name: string }[] = [];
  for (const y of [year, year + 1]) {
    const got = await fetchYear(key, y, opts.f ?? fetch);
    if (!got.ok) return finish({ status: "failed", message: got.why });
    found.push(...got.list);
  }
  // 받은 해마다 그 해 목록을 통째로 바꾼다(빈 해 = 아직 발표 전이라 저장하지 않음)
  const official = await loadOfficialHolidays(db);
  const changes: string[] = [];
  const years: Record<string, Record<string, string>> = { ...official };
  for (const y of [year, year + 1]) {
    const list = found.filter((h) => h.date.startsWith(`${y}-`));
    if (!list.length) continue;
    const next = Object.fromEntries(list.map((h) => [h.date, h.name]));
    const before = official[String(y)] ?? Object.fromEntries(Object.entries(KR_PUBLIC_HOLIDAYS).filter(([d]) => d.startsWith(`${y}-`)));
    for (const [d, n] of Object.entries(next)) if (!before[d]) changes.push(`+${d.slice(5)} ${n}`);
    for (const [d, n] of Object.entries(before)) if (!next[d]) changes.push(`-${d.slice(5)} ${n}`);
    years[String(y)] = next;
  }
  await db
    .insert(appConfig)
    .values({ key: OFFICIAL_KEY, data: { years, fetchedAt: now.toISOString() }, updatedBy: opts.actorId ?? null, updatedAt: now })
    .onConflictDoUpdate({ target: appConfig.key, set: { data: { years, fetchedAt: now.toISOString() }, updatedBy: opts.actorId ?? null, updatedAt: now } });
  // 앞 버전이 '공휴일 추가'로 넣었던 자동 항목(직접 넣은 것 아님)은 정리
  await db.delete(shopDay).where(and(eq(shopDay.kind, "holiday"), isNull(shopDay.createdBy)));
  if (changes.length) {
    await writeAudit(db, { actorId: opts.actorId ?? null, action: "holiday.sync", entityType: "config", entityId: OFFICIAL_KEY, after: { changes } });
    await notifyRole(db, "owner", `공휴일이 바뀌었습니다(특일 정보): ${changes.slice(0, 4).join(", ")}${changes.length > 4 ? " 등" : ""}. 설정 › 영업일·휴무일에서 확인하세요`, `holiday-changed-${today}`, "/settings/calendar");
  }
  const counts = [year, year + 1].map((y) => `${y}년 ${found.filter((h) => h.date.startsWith(`${y}-`)).length}일`).join(", ");
  const nextCount = found.filter((h) => h.date.startsWith(`${year + 1}-`)).length;
  return finish({ status: "done", added: changes.length, message: `공휴일 받음(${counts})${changes.length ? ` · 바뀐 날: ${changes.slice(0, 5).join(", ")}${changes.length > 5 ? " 등" : ""}` : " · 앱 목록과 같음"}${nextCount ? "" : ` · ${year + 1}년 발표 전`}` });
}

/** 대표 할 일: 9월부터 내년 공휴일이 하나도 없을 때 */
export async function holidayTodo(db: Db, today: string) {
  if (today.slice(5) < HOLIDAY_CHECK_FROM) return null;
  const next = Number(today.slice(0, 4)) + 1;
  if (next <= HOLIDAY_DATA_LAST_YEAR || (await holidaysKnown(db, next)) > 0) return null;
  const s = await holidaySyncStatus(db);
  return { next, hasKey: s.hasKey, lastMessage: s.lastMessage };
}
