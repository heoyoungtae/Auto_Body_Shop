// 다음 해 최저임금 자동 반영(사용자 지시 2026-11-09 "매년 8월 말일에 다음 해 최저임금 자동 갱신").
// 최저임금위원회 '연도별 최저임금 결정현황'에서 고시(매년 8월 5일)된 다음 해 시간급을 읽어
// 정책값 '최저임금(시급)'을 다음 해 1월 1일 시행으로 넣고 대표에게 알린다. 시행 전까지 대표가 정책값 화면에서 고칠 수 있다.
// 가져오지 못하면(사이트 바뀜·접속 안 됨·값이 이상함) 대표에게 직접 넣으라고 알린다(주 1회).
import { and, eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { policySetting } from "@/db/schema";
import { writeAudit } from "@/modules/platform/audit";
import { notifyRole } from "@/modules/platform/notify";
import { loadPolicy } from "@/modules/platform/policy";
import { seoulDate } from "@/modules/platform/time";

export const MIN_WAGE_SOURCE = "https://www.minimumwage.go.kr/minWage/policy/decisionMain.do";
const KEY = "wage.minimum_hourly";
/** 이 날(MM-DD)부터 그해 말까지 매일 확인한다(고시 8월 5일, 이의 제기 기간 뒤) */
export const MIN_WAGE_CHECK_FROM = "08-31";
/** 이 날(MM-DD)까지 다음 해 값이 없으면 대표 '내 할 일'에 올린다(사용자 지시 2026-11-09 "8월 중순까지") */
export const MIN_WAGE_TODO_FROM = "08-15";
/** 한 해 인상 폭이 이보다 크면 잘못 읽은 것으로 보고 반영하지 않는다 */
const MAX_RAISE = 0.25;

const decode = (s: string) =>
  s
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#0*39;|&apos;|&#x27;|&rsquo;|&lsquo;|[‘’`´]/gi, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ");

/** 결정현황 페이지 글에서 그 해(year) 행의 시간급과 고시일을 읽는다. 못 읽으면 null */
export function parseMinWage(html: string, year: number): { hourly: number; noticedOn: string | null } | null {
  const t = decode(html);
  const yy = String(year).slice(2);
  // 예: '27.01.01~'27.12.31 10,700 85,600 2,236,300 3.7 (380) 26.07.14 26.08.05
  const re = new RegExp(`'?(?:${year}|${yy})\\.0?1\\.0?1\\s*~\\s*'?(?:${year}|${yy})\\.12\\.31\\s+([\\d,]{4,7})(?:\\s*원)?([^']{0,160})`);
  const m = re.exec(t);
  if (!m) return null;
  const hourly = Number(m[1].replace(/,/g, ""));
  if (!Number.isInteger(hourly) || hourly < 1000) return null;
  const dates = [...m[2].matchAll(/(\d{2,4})[.-](\d{1,2})[.-](\d{1,2})/g)].map((d) => `${d[1].length === 2 ? `20${d[1]}` : d[1]}-${d[2].padStart(2, "0")}-${d[3].padStart(2, "0")}`);
  // 의결일 다음이 고시일이다. 고시일이 없으면 아직 고시 전
  return { hourly, noticedOn: dates.length >= 2 ? dates[dates.length - 1] : null };
}

/** 다음 해 1월 1일 시행으로 넣어 둔 최저임금(없으면 null) */
export async function nextMinWage(db: Db, today = seoulDate()) {
  const [r] = await db
    .select({ value: policySetting.value })
    .from(policySetting)
    .where(and(eq(policySetting.key, KEY), eq(policySetting.effectiveFrom, `${Number(today.slice(0, 4)) + 1}-01-01`)));
  return r ? Number(r.value) : null;
}

export type MinWageResult = { status: "skipped" | "exists" | "applied" | "failed"; message: string; hourly?: number };

/** 다음 해 최저임금이 정책값에 없으면 가져와 넣는다. force 는 대표가 화면에서 누를 때(날짜 조건 무시) */
export async function syncNextMinWage(db: Db, now = new Date(), opts: { force?: boolean; actorId?: string | null; f?: typeof fetch } = {}): Promise<MinWageResult> {
  const today = seoulDate(now);
  const year = Number(today.slice(0, 4)) + 1;
  const from = `${year}-01-01`;
  if (!opts.force && today.slice(5) < MIN_WAGE_CHECK_FROM) return { status: "skipped", message: "최저임금 확인 시기 아님" };
  const has = await nextMinWage(db, today);
  if (has != null) return { status: "exists", message: `${year}년 최저임금 이미 있음(${has.toLocaleString("ko-KR")}원)`, hourly: has };
  const current = (await loadPolicy(db, today))[KEY];
  const fail = async (why: string): Promise<MinWageResult> => {
    // 대표에게 주 1회(같은 주에는 한 번) 알린다
    const week = Math.floor(now.getTime() / (7 * 86_400_000));
    await notifyRole(db, "owner", `${year}년 최저임금을 자동으로 가져오지 못했습니다(${why}). 정책값 '최저임금(시급)'에 ${from} 시행으로 직접 넣어 주세요`, `minwage-fail-${year}-${week}`, `/settings/policies?key=${KEY}`);
    return { status: "failed", message: `${year}년 최저임금 가져오기 실패: ${why}` };
  };
  let html: string;
  try {
    const res = await (opts.f ?? fetch)(MIN_WAGE_SOURCE, { headers: { "User-Agent": "Mozilla/5.0 (auto-body-shop app)" }, signal: AbortSignal.timeout(20_000) });
    if (!res.ok) return fail(`최저임금위원회 사이트 응답 ${res.status}`);
    html = await res.text();
  } catch (e) {
    return fail(`최저임금위원회 사이트 접속 안 됨: ${e instanceof Error ? e.message : String(e)}`);
  }
  const p = parseMinWage(html, year);
  if (!p) return fail("사이트에서 다음 해 값을 찾지 못함(아직 결정 전이거나 화면이 바뀜)");
  if (!p.noticedOn) return fail(`의결 ${p.hourly.toLocaleString("ko-KR")}원은 있으나 아직 고시 전`);
  if (p.hourly < current || p.hourly > current * (1 + MAX_RAISE)) return fail(`읽은 값 ${p.hourly.toLocaleString("ko-KR")}원이 지금 값 ${current.toLocaleString("ko-KR")}원과 너무 다름`);
  const reason = `최저임금위원회 고시(${p.noticedOn}) ${year}년 시간급 자동 반영`;
  await db.insert(policySetting).values({ key: KEY, value: p.hourly, effectiveFrom: from, reason, changedBy: opts.actorId ?? null });
  await writeAudit(db, { actorId: opts.actorId ?? null, action: "policy.change", entityType: "policy", entityId: KEY, before: { value: current }, after: { value: p.hourly, effectiveFrom: from, source: MIN_WAGE_SOURCE } });
  await notifyRole(
    db,
    "owner",
    `${year}년 최저임금 ${p.hourly.toLocaleString("ko-KR")}원(지금 ${current.toLocaleString("ko-KR")}원)을 ${from} 시행으로 넣었습니다. 고시(${p.noticedOn})와 다르면 정책값에서 고치세요. 직원 계약서도 확인하세요`,
    `minwage-ok-${year}`,
    `/settings/policies?key=${KEY}`,
  );
  return { status: "applied", message: `${year}년 최저임금 ${p.hourly.toLocaleString("ko-KR")}원 반영(${from} 시행)`, hourly: p.hourly };
}
