// 출퇴근 기록(사용자 결정 2026-11-11: 공업사 와이파이에서만 버튼, 퇴근은 업무일지 마감과 함께).
// 기록은 고치지 않는다. 빠졌거나 틀리면 근태 신청서 '출퇴근 정정'(F-11-04, 공장장 승인)으로 바꾸고, 계산은 확정된 정정 값을 먼저 쓴다.
// 연장근무는 승인된 시각과 실제 출퇴근이 겹치는 부분만 인정한다(punch-rules.ts).
import { and, asc, desc, eq, gte, inArray, isNull, lt, lte, max, min, ne } from "drizzle-orm";
import type { Db } from "@/db/client";
import { appConfig, appUser, approvalDoc, auditLog, branch, MAIN_BRANCH_ID, staffDocument, staffProfile, workDay } from "@/db/schema";
import { can } from "@/modules/auth/permissions";
import type { Role } from "@/modules/auth/roles";
import { writeAudit } from "@/modules/platform/audit";
import { actorBranch } from "@/modules/platform/docno";
import { isBusinessDay, type ShopCalendar } from "@/modules/platform/business-days";
import { loadShopCalendar } from "@/modules/platform/calendar";
import { UserError } from "@/modules/platform/errors";
import { notifyRole } from "@/modules/platform/notify";
import { loadPolicy } from "@/modules/platform/policy";
import { addDays, seoulDate } from "@/modules/platform/time";
import { LEAVE_FORM, pendingOrders, type LeaveData } from "./attendance";
import type { ContractTerms } from "./contract-rules";
import { LEAVE_KINDS } from "./leave-rules";
import { durText, hm, hmText, ipAllowed, lateEarly, normalizeIp, recognizedMinutes, seoulHM, unapprovedMinutes, v6Prefix64, validIpRule, type Span } from "./punch-rules";

export class PunchError extends UserError {}
type Actor = { id: string; roles: readonly Role[] };
const CONFIG_KEY = "attendance";
const LIVE = ["in_progress", "confirmed", "checked"] as ("in_progress" | "confirmed" | "checked")[];
const DONE: string[] = ["confirmed", "checked"];
/** 기본 근무 시각(취업규칙 제14조). 근로계약서가 있으면 그 시각 */
export const DEFAULT_SCHEDULE = { start: 9 * 60, end: 18 * 60 };

// ── 공업사 인터넷 주소 ─────────────────────────────────────

/** sameAsServer: 서버(사업장 미니 PC)와 같은 인터넷이면 허용. 인터넷 회사가 주소를 바꿔도 저절로 따라간다
 *  sameAsTv: 공업사 TV 현황판(TV 링크로 띄운 화면)과 같은 인터넷이면 허용. 서버가 대표 자택 등 공업사 밖에 있을 때(대표 2026-11-19).
 *  tv: 현황판이 꾸준히 접속해 온 주소(IPv4·IPv6 따로)와 마지막으로 확인한 때 */
export type TvSeen = { v4: string; v6: string; at: string | null };
export type PunchConfig = { ips: string[]; sameAsServer: boolean; sameAsTv: boolean; tv: TvSeen };
const NO_TV: TvSeen = { v4: "", v6: "", at: null };
/** 지점마다 출퇴근 장소가 따로다(본점은 원래 키 그대로). 서버와 같은 인터넷은 본점만 */
const keyOf = (branchId?: string | null) => (!branchId || branchId === MAIN_BRANCH_ID ? CONFIG_KEY : `${CONFIG_KEY}:${branchId}`);
async function rawPunchConfig(db: Db, branchId?: string | null) {
  const [c] = await db.select().from(appConfig).where(eq(appConfig.key, keyOf(branchId)));
  return (c?.data ?? {}) as Partial<PunchConfig>;
}
export async function loadPunchConfig(db: Db, branchId?: string | null): Promise<PunchConfig> {
  const d = await rawPunchConfig(db, branchId);
  const tv = { ...NO_TV, ...(d.tv ?? {}) };
  const main = keyOf(branchId) === CONFIG_KEY;
  return { ips: Array.isArray(d.ips) ? d.ips : [], sameAsServer: main && d.sameAsServer === true && serverOnSite(), sameAsTv: d.sameAsTv === true, tv };
}

// TV 현황판은 30초마다 값을 부른다. 한 주소에서 30분 안에 20번(약 10분 꾸준히) 오면 그 주소를 공업사 주소로 본다.
// 집이나 휴대폰에서 TV 링크를 잠깐 열어 본 것은 횟수가 모자라 공업사 주소로 잡히지 않는다.
const TV_HITS = 20;
const TV_WINDOW = 30 * 60_000;
let tvTally = new Map<string, { n: number; from: number }>();
/** 같은 회선인가: IPv4 는 같은 주소, IPv6 는 앞 64비트가 같으면 */
function sameLine(a: string, b: string) {
  if (!a || !b) return false;
  if (a === b) return true;
  const p = v6Prefix64(a);
  return !!(p && p === v6Prefix64(b));
}
/** TV 링크로 띄운 현황판이 값을 부를 때마다 부른다(api/tv). 주소가 바뀌었거나 1시간이 지났을 때만 저장한다 */
export async function noteTvIp(db: Db, rawIp: string | null | undefined, now = Date.now(), branchId?: string | null) {
  const ip = normalizeIp(rawIp);
  if (!ip || !validIpRule(ip) || privateIp(ip)) return;
  const t = tvTally.get(ip);
  const cur = t && now - t.from < TV_WINDOW ? { n: t.n + 1, from: t.from } : { n: 1, from: now };
  if (tvTally.size > 200) tvTally = new Map();
  tvTally.set(ip, cur);
  if (cur.n < TV_HITS) return;
  // 서버와 같은 인터넷(자택에 둔 서버 화면에 현황판을 띄운 경우 등)은 공업사 주소로 잡지 않는다
  const own = await ownPublicIps();
  if (sameLine(ip, own.v4) || sameLine(ip, own.v6)) return;
  const key = keyOf(branchId);
  const d = await rawPunchConfig(db, branchId);
  const tv = { ...NO_TV, ...(d.tv ?? {}) };
  const fam = ip.includes(":") ? "v6" : "v4";
  const changed = !sameLine(tv[fam], ip);
  if (!changed && tv.at && now - Date.parse(tv.at) < 60 * 60_000) return;
  const next = { ...tv, [fam]: ip, at: new Date(now).toISOString() };
  const data = { ...d, tv: next };
  await db
    .insert(appConfig)
    .values({ key, data, updatedAt: new Date(now) })
    .onConflictDoUpdate({ target: appConfig.key, set: { data, updatedAt: new Date(now) } });
  if (changed) await writeAudit(db, { actorId: null, action: "punch.tv_ip", entityType: "app_config", entityId: key, before: { [fam]: tv[fam] }, after: { [fam]: ip } });
}
/** 내부망·자기 자신 주소(공인 IP 가 아님) */
function privateIp(ip: string) {
  return ipAllowed(ip, ["10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16", "127.0.0.0/8", "100.64.0.0/10", "169.254.0.0/16"]) || /^(::1$|f[cd]|fe[89ab])/i.test(ip);
}
/** 테스트용: 현황판 접속 횟수·서버 주소 기억 비우기 */
export function resetPunchCaches() {
  tvTally = new Map();
  ipCache = null;
}
function sameNetAsTv(ip: string | null, tv: TvSeen) {
  const a = normalizeIp(ip);
  return !!a && (sameLine(a, tv.v4) || sameLine(a, tv.v6));
}

/** 서버가 공업사 안에 있는가(미니 PC .env 의 SERVER_ON_SITE=1). 클라우드 서버에서는 '서버와 같은 인터넷'을 쓰지 않는다 */
export function serverOnSite() {
  return process.env.SERVER_ON_SITE === "1";
}

let ipCache: { v4: string; v6: string; at: number } | null = null;
async function trace(url: string) {
  try {
    const text = await (await fetch(url, { signal: AbortSignal.timeout(4000), cache: "no-store" })).text();
    const ip = normalizeIp(/^ip=(.+)$/m.exec(text)?.[1] ?? text.trim());
    return validIpRule(ip) ? ip : "";
  } catch {
    return "";
  }
}
/** 서버가 밖으로 나갈 때 쓰는 공인 IP = 공업사 인터넷 주소(IPv4, 회선에 IPv6 가 있으면 그것도). 5분 동안 기억한다 */
export async function serverPublicIps(): Promise<{ v4: string; v6: string }> {
  if (!serverOnSite()) return { v4: "", v6: "" };
  return ownPublicIps();
}
/** 서버 자신의 공인 IP(위치와 상관없이). 서버가 자택에 있으면 자택 주소 */
async function ownPublicIps(): Promise<{ v4: string; v6: string }> {
  if (ipCache && Date.now() - ipCache.at < 5 * 60_000) return ipCache;
  const [a, b, c] = await Promise.all([trace("https://1.1.1.1/cdn-cgi/trace"), trace("https://[2606:4700:4700::1111]/cdn-cgi/trace"), trace("https://api.ipify.org")]);
  const v4 = a || (c.includes(".") ? c : "");
  if (v4 || b) ipCache = { v4, v6: b, at: Date.now() };
  return ipCache ?? { v4: "", v6: "" };
}
/** 화면에 보일 서버 주소(IPv4 우선) */
export async function serverPublicIp() {
  const { v4, v6 } = await serverPublicIps();
  return v4 || v6;
}
/** 접속 주소가 서버와 같은 회선인가: IPv4 는 같은 주소, IPv6 는 앞 64비트가 같으면 */
async function sameNetAsServer(ip: string | null) {
  const { v4, v6 } = await serverPublicIps();
  const a = normalizeIp(ip);
  if (!a) return false;
  // '국내 직접 접속'이면 공업사 와이파이 기기가 내부 주소(예: 172.30.1.23)로 들어올 수 있다. 서버가 있는 내부망이면 공업사 안
  const lan = process.env.SERVER_LAN_CIDR?.trim();
  if (lan && validIpRule(lan) && ipAllowed(a, [lan])) return true;
  if (v4 && a === v4) return true;
  const p = v6Prefix64(a);
  return !!(p && v6 && p === v6Prefix64(v6));
}

/** 대표만. 한 줄에 하나(IPv4, 1.2.3.0/24, IPv6). 비우면(서버·TV 와 같은 인터넷도 끄면) 어디서나 누를 수 있다 */
export async function savePunchConfig(db: Db, actor: Actor, raw: string, sameAsServerRaw = false, sameAsTv = false, branchId?: string | null) {
  if (branchId && branchId !== MAIN_BRANCH_ID) {
    const [b] = await db.select({ id: branch.id }).from(branch).where(eq(branch.id, branchId));
    if (!b) throw new PunchError("없는 지점입니다");
  }
  const key = keyOf(branchId);
  const sameAsServer = sameAsServerRaw && serverOnSite() && key === CONFIG_KEY;
  if (!actor.roles.includes("owner")) throw new PunchError("공업사 인터넷 주소는 대표가 넣습니다");
  const ips = [...new Set(raw.split(/[\s,]+/).map((x) => x.trim()).filter(Boolean))];
  const bad = ips.find((x) => !validIpRule(x));
  if (bad) throw new PunchError(`'${bad}' 은(는) 인터넷 주소 형식이 아닙니다. 예: 211.234.10.5 또는 211.234.10.0/24`);
  if (ips.length > 10) throw new PunchError("주소는 10개까지 넣습니다");
  const before = await loadPunchConfig(db, branchId);
  const data = { ips, sameAsServer, sameAsTv, tv: before.tv };
  await db
    .insert(appConfig)
    .values({ key, data, updatedBy: actor.id, updatedAt: new Date() })
    .onConflictDoUpdate({ target: appConfig.key, set: { data, updatedBy: actor.id, updatedAt: new Date() } });
  await writeAudit(db, { actorId: actor.id, action: "punch.config", entityType: "app_config", entityId: key, before, after: { ips, sameAsServer, sameAsTv } });
  return { ips, sameAsServer, sameAsTv };
}

/** 어느 지점의 인터넷인가. 맞는 지점 id, 제한 없는 지점이 있으면 null, 어디에도 안 맞으면 막는다.
 *  사람이 어느 지점에 있든 그 지점 와이파이에서 누르면 되고, 출퇴근 기록은 그 지점으로 남는다 */
async function checkPlace(db: Db, ip: string | null): Promise<string | null> {
  const open = await db.select({ id: branch.id }).from(branch).where(isNull(branch.closedOn)).orderBy(asc(branch.sortOrder));
  let free = false;
  for (const b of open.length ? open : [{ id: MAIN_BRANCH_ID }]) {
    const { ips, sameAsServer, sameAsTv, tv } = await loadPunchConfig(db, b.id);
    const tvKnown = sameAsTv && !!(tv.v4 || tv.v6);
    if (!ips.length && !sameAsServer && !tvKnown) {
      free = true;
      continue;
    }
    if (ipAllowed(ip, ips)) return b.id;
    if (tvKnown && sameNetAsTv(ip, tv)) return b.id;
    if (sameAsServer && (await sameNetAsServer(ip))) return b.id;
  }
  if (free) return null;
  throw new PunchError(`공업사 인터넷(와이파이)에 연결된 기기에서만 누를 수 있습니다. 지금 주소는 ${normalizeIp(ip) || "알 수 없음"} 입니다. 와이파이를 켜고 다시 누르거나, 못 누른 날은 '출퇴근 정정'을 올리세요`);
}

// ── 근무 시각(근로계약서) ─────────────────────────────────

/** 그날 유효한 서명 근로계약서의 시업·종업 시각(분). 없으면 09:00~18:00 */
export async function scheduleOf(db: Db, userId: string, day: string) {
  const rows = await db
    .select({ terms: staffDocument.terms })
    .from(staffDocument)
    .where(and(eq(staffDocument.userId, userId), eq(staffDocument.kind, "contract"), eq(staffDocument.status, "signed")))
    .orderBy(desc(staffDocument.signedAt));
  const t = rows.map((r) => r.terms as unknown as ContractTerms).find((t) => t?.startOn <= day && (!t.endOn || t.endOn >= day));
  const s = hm(t?.workStart);
  const e = hm(t?.workEnd);
  return s != null && e != null && e > s ? { start: s, end: e, fromContract: true } : { ...DEFAULT_SCHEDULE, fromContract: false };
}

// ── 그날의 근태 문서 ──────────────────────────────────────

async function docsOn(db: Db, userIds: string[], from: string, to: string) {
  if (!userIds.length) return [];
  const rows = await db
    .select()
    .from(approvalDoc)
    .where(and(eq(approvalDoc.formCode, LEAVE_FORM), isNull(approvalDoc.cancelsId), inArray(approvalDoc.drafterId, userIds), inArray(approvalDoc.status, LIVE)));
  return rows
    .map((d) => ({ doc: d, data: d.data as LeaveData, done: DONE.includes(d.status) }))
    .filter((r) => r.data.toDate >= from && r.data.fromDate <= to);
}
type DocOn = Awaited<ReturnType<typeof docsOn>>[number];

/** 하루 종일 쉬는 근태(연차·병가·경조·결근)가 있는지 */
const fullDayOff = (docs: DocOn[], day: string) => docs.some((r) => LEAVE_KINDS[r.data.leaveKind as keyof typeof LEAVE_KINDS]?.unit === "day" && r.data.fromDate <= day && r.data.toDate >= day);

// ── 실제 출퇴근(정정 반영) ─────────────────────────────────

export type ActualDay = { userId: string; day: string; span: Span | null; inAt: Date | null; outAt: Date | null; fixed: boolean; open: boolean };

/** 기간 안 출퇴근: 확정된 '출퇴근 정정'이 있으면 그 값을, 없으면 버튼 기록을 쓴다. 퇴근이 없으면 span 은 null */
export async function actualDays(db: Db, from: string, to: string, userIds?: string[]) {
  const rows = await db
    .select()
    .from(workDay)
    .where(and(gte(workDay.day, from), lte(workDay.day, to), userIds ? inArray(workDay.userId, userIds) : undefined));
  const fixes = await db
    .select()
    .from(approvalDoc)
    .where(and(eq(approvalDoc.formCode, LEAVE_FORM), isNull(approvalDoc.cancelsId), inArray(approvalDoc.status, ["confirmed", "checked"]), userIds ? inArray(approvalDoc.drafterId, userIds) : undefined));
  const out = new Map<string, ActualDay>();
  for (const r of rows) {
    const a = hm(seoulHM(r.inAt))!;
    let b = r.outAt ? hm(seoulHM(r.outAt))! : null;
    if (b != null && r.outAt && seoulDate(r.outAt) > r.day) b += 1440; // 자정 넘김
    out.set(`${r.userId}|${r.day}`, { userId: r.userId, day: r.day, span: b != null ? { from: a, to: b } : null, inAt: r.inAt, outAt: r.outAt, fixed: false, open: b == null });
  }
  for (const f of fixes) {
    const d = f.data as LeaveData;
    if (!f.drafterId || d.leaveKind !== "punch_fix" || d.fromDate < from || d.fromDate > to) continue;
    const k = `${f.drafterId}|${d.fromDate}`;
    const prev = out.get(k);
    out.set(k, { userId: f.drafterId, day: d.fromDate, span: { from: hm(d.fromTime)!, to: hm(d.toTime)! }, inAt: prev?.inAt ?? null, outAt: prev?.outAt ?? null, fixed: true, open: false });
  }
  return out;
}

/** 승인된 연장 시각과 실제 근무가 겹치는 시간(분) — 급여·화면이 같이 쓴다 */
export function recognizeOvertime(d: Pick<LeaveData, "fromTime" | "toTime">, actual: ActualDay | undefined) {
  return recognizedMinutes(d, actual?.span ?? null);
}

// ── 출근·퇴근 ─────────────────────────────────────────────

export async function todayRow(db: Db, userId: string, day: string) {
  const [r] = await db.select().from(workDay).where(and(eq(workDay.userId, userId), eq(workDay.day, day)));
  return r ?? null;
}

/** 출근. 쉬는 날·늦은 출근이면 알림 문구를 돌려준다(막지는 않음) */
export async function punchIn(db: Db, actor: Actor, ip: string | null, now = new Date()) {
  const day = seoulDate(now);
  const at = await checkPlace(db, ip);
  const [p] = await db.select({ leftOn: staffProfile.leftOn }).from(staffProfile).where(eq(staffProfile.userId, actor.id));
  if (p?.leftOn && p.leftOn < day) throw new PunchError("퇴직 처리된 직원입니다");
  const cur = await todayRow(db, actor.id, day);
  if (cur) throw new PunchError(`오늘은 이미 ${seoulHM(cur.inAt)}에 출근했습니다`);
  await db.insert(workDay).values({ userId: actor.id, branchId: at ?? actorBranch(actor), day, inAt: now, inIp: normalizeIp(ip) || null }).onConflictDoNothing();
  await writeAudit(db, { actorId: actor.id, action: "punch.in", entityType: "work_day", entityId: day, after: { at: seoulHM(now) }, ip });
  return dayStatus(db, actor.id, day, now);
}

/** 퇴근. 어제 출근하고 자정을 넘겼으면 어제 기록에 붙인다 */
export async function punchOut(db: Db, actor: Actor, ip: string | null, now = new Date()) {
  await checkPlace(db, ip);
  const today = seoulDate(now);
  let row = await todayRow(db, actor.id, today);
  if (!row) {
    const y = await todayRow(db, actor.id, addDays(today, -1));
    if (y && !y.outAt && now.getTime() - y.inAt.getTime() < 20 * 3600_000) row = y;
  }
  if (!row) throw new PunchError("오늘 출근 기록이 없습니다. 먼저 출근을 누르거나, 못 눌렀으면 '출퇴근 정정'을 올리세요");
  if (row.outAt) throw new PunchError(`이미 ${seoulHM(row.outAt)}에 퇴근했습니다. 틀렸으면 '출퇴근 정정'을 올리세요`);
  await db.update(workDay).set({ outAt: now, outIp: normalizeIp(ip) || null }).where(eq(workDay.id, row.id));
  await writeAudit(db, { actorId: actor.id, action: "punch.out", entityType: "work_day", entityId: row.day, after: { at: seoulHM(now) }, ip });
  const st = await dayStatus(db, actor.id, row.day, now);
  if (st.overstay) {
    const [u] = await db.select({ name: appUser.name }).from(appUser).where(eq(appUser.id, actor.id));
    const role = actor.roles.includes("plant_manager") ? "owner" : "plant_manager";
    if (!actor.roles.includes("owner"))
      await notifyRole(db, role, `승인 없이 늦게 남음: ${u?.name ?? ""} ${row.day} ${durText(st.unapproved)} (퇴근 ${st.outText})`, `overstay-${row.id}`, `/attendance?d=${row.day}`);
  }
  return st;
}

// ── 하루 현황(본인 카드·팀 현황·내 할 일 공통) ─────────────────

export async function dayStatus(db: Db, userId: string, day: string, now = new Date(), ctx?: { cal?: ShopCalendar; overstayMin?: number }) {
  const cal = ctx?.cal ?? (await loadShopCalendar(db));
  const overstayMin = ctx?.overstayMin ?? (await loadPolicy(db, day))["work.overstay_minutes"];
  const [sch, actual, docs, row] = await Promise.all([scheduleOf(db, userId, day), actualDays(db, day, day, [userId]), docsOn(db, [userId], day, day), todayRow(db, userId, day)]);
  const a = actual.get(`${userId}|${day}`);
  const business = isBusinessDay(cal, day);
  const ots = docs.filter((r) => r.data.leaveKind === "overtime" && r.data.fromDate === day);
  const approved = ots.filter((r) => r.done);
  const spans = ots.map((r) => ({ from: hm(r.data.fromTime)!, to: hm(r.data.toTime)! }));
  const nowMin = day === seoulDate(now) ? hm(seoulHM(now))! : day < seoulDate(now) ? 24 * 60 : 0;
  // 아직 퇴근 전이면 지금까지로 본다
  const span: Span | null = a?.span ?? (a?.open && a.inAt ? { from: hm(seoulHM(a.inAt))!, to: Math.max(nowMin, hm(seoulHM(a.inAt))!) } : null);
  const unapproved = unapprovedMinutes(span, sch.end, business, spans);
  const recognized = approved.reduce((s, r) => s + recognizeOvertime(r.data, a), 0);
  const le = span && business ? lateEarly(span, sch.start, sch.end) : { late: 0, early: 0 };
  const has = (kinds: string[]) => docs.some((r) => kinds.includes(r.data.leaveKind) && r.data.fromDate <= day && r.data.toDate >= day);
  const off = fullDayOff(docs, day);
  const pendingFix = docs.some((r) => r.data.leaveKind === "punch_fix" && r.data.fromDate === day && !r.done);
  return {
    day,
    business,
    schedule: { start: hmText(sch.start), end: hmText(sch.end), fromContract: sch.fromContract },
    inText: span ? hmText(span.from) : null,
    outText: a?.span ? hmText(a.span.to) : null,
    open: !!a?.open,
    fixed: !!a?.fixed,
    punched: !!row,
    off,
    /** 늦게 왔는데 지각·반차 신고가 없음 */
    late: le.late > 0 && !has(["late", "half_am", "punch_fix"]) ? le.late : 0,
    /** 일찍 갔는데 조퇴·반차 신고가 없음(퇴근한 뒤에만) */
    early: a?.span && le.early > 0 && !has(["early", "half_pm", "punch_fix"]) ? le.early : 0,
    overtime: ots.map((r) => ({ id: r.doc.id, docNo: r.doc.docNo, from: r.data.fromTime, to: r.data.toTime, done: r.done, after: !!r.data.after, recognized: r.done ? recognizeOvertime(r.data, a) : 0 })),
    recognized,
    unapproved,
    /** 정한 분보다 늦게 남았는데 승인(결재 중 포함)이 없음 */
    overstay: unapproved > overstayMin,
    /** 사후 연장 신청 칸에 미리 채울 값 */
    afterFrom: hmText(business ? Math.max(sch.end, ...spans.map((s) => s.to)) : (span?.from ?? sch.start)),
    afterTo: a?.span ? hmText(a.span.to % 1440) : null,
    holidayWork: !business && !!span && !ots.length,
    pendingFix,
  };
}
export type DayStatus = Awaited<ReturnType<typeof dayStatus>>;

/** 활동 기록(로그인·작업 기록)의 처음·마지막 시각 — 정정 신청에 미리 채운다 */
export async function activitySpan(db: Db, userId: string, day: string) {
  const from = new Date(`${day}T00:00:00+09:00`);
  const to = new Date(`${addDays(day, 1)}T00:00:00+09:00`);
  const [r] = await db
    .select({ first: min(auditLog.at), last: max(auditLog.at) })
    .from(auditLog)
    .where(and(eq(auditLog.actorId, userId), gte(auditLog.at, from), lt(auditLog.at, to), ne(auditLog.action, "punch.config")));
  return r?.first ? { first: seoulHM(new Date(r.first)), last: seoulHM(new Date(r.last!)) } : null;
}

/**
 * 출퇴근이 빠진 날(최근 14일, 영업일): 처음 출근을 누른 날 뒤부터만 본다(도입 전 날짜는 묻지 않음).
 * 종일 휴가가 있거나 정정을 올린 날은 뺀다. 활동 기록의 처음·마지막 시각을 함께 준다.
 */
export async function missingDays(db: Db, userId: string, now = new Date()) {
  const today = seoulDate(now);
  const [first] = await db.select({ day: min(workDay.day) }).from(workDay).where(eq(workDay.userId, userId));
  if (!first?.day) return [];
  const from = [addDays(today, -14), first.day].sort()[1];
  const cal = await loadShopCalendar(db);
  const [actual, docs, rows] = await Promise.all([actualDays(db, from, today, [userId]), docsOn(db, [userId], from, today), db.select().from(workDay).where(and(eq(workDay.userId, userId), gte(workDay.day, from)))]);
  const pendingFix = new Set(docs.filter((r) => r.data.leaveKind === "punch_fix").map((r) => r.data.fromDate));
  const out: { day: string; kind: "none" | "noOut"; inText: string | null; activity: { first: string; last: string } | null }[] = [];
  for (let d = from; d < today; d = addDays(d, 1)) {
    if (pendingFix.has(d) || fullDayOff(docs, d)) continue;
    const a = actual.get(`${userId}|${d}`);
    const row = rows.find((r) => r.day === d);
    if (a?.span) continue;
    if (!row && !isBusinessDay(cal, d)) continue;
    out.push({ day: d, kind: row ? "noOut" : "none", inText: row ? seoulHM(row.inAt) : null, activity: await activitySpan(db, userId, d) });
  }
  return out;
}

/** 오늘 팀 현황(대표·공장장·회계): 출근·퇴근·휴가·승인 없이 남음 */
export async function teamToday(db: Db, actor: Actor, day: string, now = new Date()) {
  if (!can(actor, "leave.team")) return [];
  const users = await db
    .select({ id: appUser.id, name: appUser.name, leftOn: staffProfile.leftOn, hiredOn: staffProfile.hiredOn })
    .from(appUser)
    .leftJoin(staffProfile, eq(staffProfile.userId, appUser.id))
    .where(eq(appUser.active, true))
    .orderBy(appUser.name);
  const cal = await loadShopCalendar(db);
  const overstayMin = (await loadPolicy(db, day))["work.overstay_minutes"];
  const out: { id: string; name: string; st: DayStatus }[] = [];
  for (const u of users) {
    if ((u.leftOn && u.leftOn < day) || (u.hiredOn && u.hiredOn > day)) continue;
    out.push({ id: u.id, name: u.name, st: await dayStatus(db, u.id, day, now, { cal, overstayMin }) });
  }
  return out;
}

/** 내 할 일: 오늘 출근, 출퇴근 빠진 날, 승인 없이 남은 시간, 늦은 출근·이른 퇴근 신고, 받은 연장 지시 */
export async function punchTodos(db: Db, actor: Actor, now = new Date()) {
  const today = seoulDate(now);
  const out: { key: string; when: "late" | "today" | "soon"; what: string; detail?: string; href: string; action: string }[] = [];
  const st = await dayStatus(db, actor.id, today, now);
  const nowMin = hm(seoulHM(now))!;
  if (st.business && !st.punched && !st.off && nowMin >= hm(st.schedule.start)! - 60 && nowMin < hm(st.schedule.end)!)
    out.push({ key: "punch-in", when: "today", what: "출근 누르기", detail: `정해진 출근 ${st.schedule.start}`, href: "/attendance", action: "출근" });
  if (st.late) out.push({ key: "punch-late", when: "today", what: `지각 신고: 오늘 ${st.inText} 출근(${durText(st.late)} 늦음)`, href: "/attendance#today", action: "신고하기" });
  if (st.overstay && st.outText) out.push({ key: "punch-over", when: "today", what: `승인 없는 연장 ${durText(st.unapproved)}: 사후 신청`, detail: "신청하지 않으면 수당에 들어가지 않습니다", href: "/attendance#today", action: "사후 신청" });
  const y = addDays(today, -1);
  const ys = await dayStatus(db, actor.id, y, now);
  if (ys.overstay && ys.outText) out.push({ key: "punch-over-y", when: "late", what: `어제 승인 없는 연장 ${durText(ys.unapproved)}: 사후 신청`, href: `/attendance?d=${y}#today`, action: "사후 신청" });
  for (const m of await missingDays(db, actor.id, now))
    out.push({ key: `punch-miss-${m.day}`, when: "late", what: `출퇴근 정정: ${m.day} ${m.kind === "noOut" ? "퇴근 기록 없음" : "출근 기록 없음"}`, detail: m.activity ? `앱 기록 ${m.activity.first}~${m.activity.last}` : undefined, href: `/attendance?fix=${m.day}#fix`, action: "정정 신청" });
  for (const o of await pendingOrders(db, actor.id)) out.push({ key: `ot-order-${o.doc.id}`, when: "soon", what: `연장근무 지시: ${o.data.fromDate} ${o.data.fromTime}~${o.data.toTime}`, detail: `${o.data.orderedByName ?? ""} 지시. 동의 또는 거절`, href: "/attendance#orders", action: "답하기" });
  return out;
}
