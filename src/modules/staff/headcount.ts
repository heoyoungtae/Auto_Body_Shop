// 상시 근로자 5명 이상 여부(근로기준법 제11조, 시행령 제7조의2). 대표 결정 2026-11-25: 등록 직원 수를 세어 자동으로 고른다.
// 정책값 hr.headcount_5plus: 2=자동(처음 값), 1=5명 이상으로 고정, 0=5명 미만으로 고정.
// 자동: 판단하는 날 전 1개월의 영업일마다 근로자 명부(입사~퇴사, 대표 제외)의 사람 수를 센다.
// 평균(연인원 ÷ 가동일수)이 5명 이상이어도 5명 미만인 날이 가동일수의 절반 이상이면 미만, 평균이 5명 미만이어도
// 미만인 날이 절반 미만이면 이상으로 본다(시행령 제7조의2 제2항) → 결국 '5명 미만인 날 × 2 < 가동일수'.
import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { staffProfile, userRole } from "@/db/schema";
import { closedReason, type ShopCalendar } from "@/modules/platform/business-days";
import { loadShopCalendar } from "@/modules/platform/calendar";
import { loadPolicy } from "@/modules/platform/policy";
import { seoulDate } from "@/modules/platform/time";

export type Member = { hiredOn: string | null; leftOn: string | null };
export type Headcount = {
  legal5: boolean;
  /** auto=명부로 계산, fixed=정책값으로 고정, none=아직 직원 등록 전(법정 기준으로 봄) */
  mode: "auto" | "fixed" | "none";
  avg: number;
  days: number;
  belowDays: number;
  from: string;
  to: string;
};

const D = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);

/** on 의 한 달 전 같은 날(없으면 그 달 말일) ~ on 전날 */
export function priorMonth(on: string) {
  const [y, m, d] = on.split("-").map(Number);
  const py = m === 1 ? y - 1 : y;
  const pm = m === 1 ? 12 : m - 1;
  const last = new Date(Date.UTC(py, pm, 0)).getUTCDate();
  const from = `${py}-${String(pm).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
  return { from, to: iso(D(on) - 864e5) };
}

/** 명부와 영업일 달력으로 계산(DB 없음, 시험용) */
export function countHeadcount(members: Member[], on: string, cal: ShopCalendar): Omit<Headcount, "mode"> & { registered: boolean } {
  const { from, to } = priorMonth(on);
  const registered = members.some((m) => m.hiredOn && m.hiredOn <= to);
  let days = 0;
  let total = 0;
  let belowDays = 0;
  for (let t = D(from); t <= D(to); t += 864e5) {
    const day = iso(t);
    if (closedReason(cal, day) != null) continue;
    const n = members.filter((m) => m.hiredOn && m.hiredOn <= day && (!m.leftOn || m.leftOn >= day)).length;
    days++;
    total += n;
    if (n < 5) belowDays++;
  }
  const avg = days ? Math.round((total / days) * 10) / 10 : 0;
  return { legal5: days > 0 && belowDays * 2 < days, avg, days, belowDays, from, to, registered };
}

export async function headcountOn(db: Db, on = seoulDate()): Promise<Headcount> {
  const pol = await loadPolicy(db, on);
  const v = pol["hr.headcount_5plus"];
  const { from, to } = priorMonth(on);
  if (v === 0 || v === 1) return { legal5: v === 1, mode: "fixed", avg: 0, days: 0, belowDays: 0, from, to };
  const [rows, owners, cal] = await Promise.all([
    db.select({ userId: staffProfile.userId, hiredOn: staffProfile.hiredOn, leftOn: staffProfile.leftOn }).from(staffProfile),
    db.select({ userId: userRole.userId }).from(userRole).where(eq(userRole.role, "owner")),
    loadShopCalendar(db),
  ]);
  const own = new Set(owners.map((o) => o.userId));
  const r = countHeadcount(rows.filter((x) => !own.has(x.userId)), on, cal);
  // 직원 등록 전(개업 준비 중)에는 법정 기준(5명 이상)으로 본다: 계약서·연차를 법보다 불리하게 만들지 않기 위해
  if (!r.registered) return { ...r, legal5: true, mode: "none" };
  return { legal5: r.legal5, mode: "auto", avg: r.avg, days: r.days, belowDays: r.belowDays, from: r.from, to: r.to };
}

export const isLegal5 = async (db: Db, on?: string) => (await headcountOn(db, on)).legal5;

export function headcountText(h: Headcount) {
  if (h.mode === "fixed") return `정책값으로 ${h.legal5 ? "5명 이상" : "5명 미만"} 고정`;
  if (h.mode === "none") return "직원 등록 전이라 5명 이상(법정 기준)으로 봅니다";
  return `${h.from}~${h.to} 영업일 ${h.days}일 평균 ${h.avg}명, 5명 미만인 날 ${h.belowDays}일 → ${h.legal5 ? "5명 이상" : "5명 미만"}`;
}
