// 공휴일 자동 갱신(사용자 질문 2026-11-09 "2027 이후의 공휴일은 어떻게 갱신되나?").
// 공공데이터포털 '한국천문연구원 특일 정보'(getRestDeInfo)에서 올해·내년 공휴일을 매달 1일에 가져와,
// 앱에 내장된 목록(KR_PUBLIC_HOLIDAYS)에 없는 날을 설정 › 영업일·휴무일의 '공휴일 추가'로 넣는다(임시공휴일·선거일 포함).
// 대표가 직접 넣은 날(휴무·특별 영업 등)은 덮어쓰지 않는다. 인증키는 대표가 설정 화면에서 넣고 암호화해 둔다.
// 가져오지 못하거나 9월이 지나도 내년 공휴일이 없으면 대표 '내 할 일'과 알림으로 알린다.
import { and, eq, gte, lte } from "drizzle-orm";
import type { Db } from "@/db/client";
import { appConfig, shopDay } from "@/db/schema";
import { decrypt, encrypt } from "@/modules/auth/crypto";
import { writeAudit } from "./audit";
import { HOLIDAY_DATA_LAST_YEAR, KR_PUBLIC_HOLIDAYS } from "./business-days";
import { UserError } from "./errors";
import { notifyRole } from "./notify";
import { seoulDate } from "./time";

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
  const builtIn = Object.keys(KR_PUBLIC_HOLIDAYS).filter((d) => d.startsWith(`${year}-`)).length;
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
    const qs = new URLSearchParams({ serviceKey: key, solYear: String(y), numOfRows: "100", _type: "json" });
    try {
      const res = await (opts.f ?? fetch)(`${HOLIDAY_API}?${qs.toString()}`, { headers: { "User-Agent": "auto-body-shop app" }, signal: AbortSignal.timeout(20_000) });
      if (!res.ok) return finish({ status: "failed", message: `특일 정보 응답 ${res.status}` });
      const text = await res.text();
      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch {
        return finish({ status: "failed", message: /SERVICE_KEY|등록되지 않은/i.test(text) ? "인증키가 맞지 않거나 아직 승인 전" : "특일 정보 응답 형식이 다름" });
      }
      const list = parseHolidayJson(json);
      if (!list) return finish({ status: "failed", message: "특일 정보 응답 오류(인증키·사용 신청 확인)" });
      found.push(...list);
    } catch (e) {
      return finish({ status: "failed", message: `특일 정보 접속 안 됨: ${e instanceof Error ? e.message : String(e)}` });
    }
  }
  // 내장 목록에 없고, 대표가 넣은 날도 아닌 것만 '공휴일 추가'로 넣는다
  const fresh = found.filter((h) => !KR_PUBLIC_HOLIDAYS[h.date]);
  let added = 0;
  for (const h of fresh) {
    const r = await db.insert(shopDay).values({ date: h.date, kind: "holiday", name: h.name, createdBy: opts.actorId ?? null }).onConflictDoNothing().returning({ d: shopDay.date });
    added += r.length;
  }
  if (added) {
    await writeAudit(db, { actorId: opts.actorId ?? null, action: "holiday.sync", entityType: "shop_day", entityId: `${year}-${year + 1}`, after: { added: fresh.map((h) => `${h.date} ${h.name}`) } });
    await notifyRole(db, "owner", `공휴일 ${added}일을 새로 넣었습니다(특일 정보). 설정 › 영업일·휴무일에서 확인하세요`, `holiday-added-${today}`, "/settings/calendar");
  }
  const nextCount = found.filter((h) => h.date.startsWith(`${year + 1}-`)).length;
  return finish({ status: "done", added, message: `공휴일 ${found.length}일 확인, 새로 ${added}일 넣음${nextCount ? "" : ` · ${year + 1}년 발표 전`}` });
}

/** 대표 할 일: 9월부터 내년 공휴일이 하나도 없을 때 */
export async function holidayTodo(db: Db, today: string) {
  if (today.slice(5) < HOLIDAY_CHECK_FROM) return null;
  const next = Number(today.slice(0, 4)) + 1;
  if (next <= HOLIDAY_DATA_LAST_YEAR || (await holidaysKnown(db, next)) > 0) return null;
  const s = await holidaySyncStatus(db);
  return { next, hasKey: s.hasKey, lastMessage: s.lastMessage };
}
