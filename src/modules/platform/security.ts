// 공격 대책(대표 2026-11-21 '443 을 열면서 빠진 차단막'): 2단계 로그인은 빼고 나머지.
// 1) 주소별 자동 차단: 로그인 실패가 몰리거나(여러 계정 번갈아), 1분에 요청이 폭주하거나, 취약점 찾기(없는 관리 화면·.env·.php 등)를 하면
//    그 주소를 정한 시간 동안 막는다. 앱(proxy.ts)이 403 으로 막고, 미니 PC(agent.sh)는 방화벽에서도 버린다.
// 2) 외국 접속 막기(설정에서 켜고 끔): 국내(KR) 주소 목록에 없는 주소는 화면을 열 수 없다. 인증서 갱신(TLS)은 영향 없음.
// 4) 차단되면 대표에게 알림(같은 주소는 하루 한 번), 서버 화면 '보안' 칸에서 보고 푼다.
import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { appConfig } from "@/db/schema";
import type { Role } from "@/modules/auth/roles";
import { writeAudit } from "./audit";
import { UserError } from "./errors";
import { notifyRole } from "./notify";
import { ipv4ToInt, isPrivateIp, isPublicIpv4, setSecState } from "./security-state";

const KEY = "security";
type Actor = { id: string; roles: readonly Role[] };

/** 차단 기준. 대표 화면 도움말에도 같은 숫자 */
export const RULES = {
  loginFails: 10, // 한 주소에서 10분 안에 로그인 실패 10번(여러 계정 합쳐)
  loginWindowMin: 10,
  loginBlockMin: 60,
  floodPerMin: 600, // 1분에 요청 600번(초당 10번)
  floodBlockMin: 60,
  scanPerMin: 20, // 1분에 없는 관리 화면·.env·.php 등 찾기 20번
  scanBlockMin: 24 * 60,
} as const;
const BLOCK_MAX = 500;
const LOG_MAX = 100;

export type Block = { ip: string; at: string; until: string; reason: string; by: string | null };
type Data = {
  geoOn?: boolean;
  kr?: { at: string; n: number; ranges: [number, number][] } | null;
  blocks?: Block[];
  log?: Block[];
  selfIp?: string;
};

async function load(db: Db): Promise<Data> {
  const [c] = await db.select().from(appConfig).where(eq(appConfig.key, KEY));
  return (c?.data ?? {}) as Data;
}
async function save(db: Db, data: Data, by: string | null = null) {
  await db
    .insert(appConfig)
    .values({ key: KEY, data, updatedBy: by, updatedAt: new Date() })
    .onConflictDoUpdate({ target: appConfig.key, set: { data, updatedBy: by, updatedAt: new Date() } });
  publish(data);
}
/** proxy.ts 가 보는 메모리 상태를 DB 값으로 채운다 */
function publish(d: Data) {
  // 풀리는 때는 proxy 가 요청마다 본다(지난 것은 저장할 때 걸러진다)
  const blocks = new Map<string, number>();
  for (const b of d.blocks ?? []) blocks.set(b.ip, Date.parse(b.until));
  const r = d.kr?.ranges ?? [];
  setSecState({
    blocks,
    geoOn: !!d.geoOn,
    kr: r.length ? { start: Uint32Array.from(r.map((x) => x[0])), end: Uint32Array.from(r.map((x) => x[1])) } : null,
    allow: new Set(d.selfIp ? [d.selfIp] : []),
  });
}
/** 앱이 켜진 뒤·1분마다(서버 상태 알림 때) 부른다 */
export async function refreshSecurity(db: Db) {
  publish(await load(db));
}

/** 지금 막고 있는 주소(미니 PC 방화벽용) */
export function activeBlocks(d: Data, now = Date.now()) {
  return (d.blocks ?? []).filter((b) => Date.parse(b.until) > now);
}

async function addBlock(db: Db, ip: string, minutes: number, reason: string, now: Date, by: string | null = null) {
  if (!isPublicIpv4(ip)) return false;
  const d = await load(db);
  if (d.selfIp === ip) return false; // 서버 자신(집 공유기) 주소는 막지 않는다
  const cur = activeBlocks(d, now.getTime()).find((b) => b.ip === ip);
  const until = new Date(now.getTime() + minutes * 60_000).toISOString();
  if (cur && cur.until >= until) return false;
  const b: Block = { ip, at: now.toISOString(), until, reason, by };
  const blocks = [b, ...activeBlocks(d, now.getTime()).filter((x) => x.ip !== ip)].slice(0, BLOCK_MAX);
  await save(db, { ...d, blocks, log: [b, ...(d.log ?? [])].slice(0, LOG_MAX) });
  await writeAudit(db, { actorId: by, action: "security.block", entityType: "ip", entityId: ip, after: b });
  const day = new Date(now.getTime() + 9 * 3600_000).toISOString().slice(0, 10);
  if (!by) await notifyRole(db, "owner", `공격 의심 주소를 막았습니다: ${ip} (${reason}, ${minutes >= 60 ? `${Math.round(minutes / 60)}시간` : `${minutes}분`})`, `sec-block:${day}:${ip}`, "/settings/server#security");
  return true;
}

// 로그인 실패: 앱 메모리에 주소별로 센다(앱이 다시 켜지면 처음부터)
const fails = new Map<string, number[]>();
export async function noteLoginFail(db: Db, ip: string | null, now = new Date()) {
  if (!ip || isPrivateIp(ip)) return;
  const since = now.getTime() - RULES.loginWindowMin * 60_000;
  const list = (fails.get(ip) ?? []).filter((t) => t > since);
  list.push(now.getTime());
  fails.set(ip, list);
  if (fails.size > 5000) for (const k of [...fails.keys()].slice(0, 1000)) fails.delete(k);
  if (list.length >= RULES.loginFails) {
    fails.delete(ip);
    await addBlock(db, ip, RULES.loginBlockMin, `로그인 실패 ${RULES.loginFails}번`, now);
  }
}
export function resetLoginFails() {
  fails.clear();
}

/** 미니 PC 가 접속 기록에서 센 주소별 최근 1분(요청 수·취약점 찾기 수). 기준을 넘으면 막는다 */
export async function noteHotIps(db: Db, hot: unknown, now = new Date()) {
  if (!Array.isArray(hot)) return;
  for (const x of hot.slice(0, 50)) {
    const o = (x ?? {}) as Record<string, unknown>;
    const ip = String(o.ip ?? "");
    const reqs = Number(o.reqs) || 0;
    const scan = Number(o.scan) || 0;
    if (scan >= RULES.scanPerMin) await addBlock(db, ip, RULES.scanBlockMin, `취약점 찾기 1분 ${scan}번`, now);
    else if (reqs >= RULES.floodPerMin) await addBlock(db, ip, RULES.floodBlockMin, `요청 폭주 1분 ${reqs}번`, now);
  }
}

/** 서버 자신의 인터넷 주소(막지 않음). 서버 상태 알림 때 */
export async function setSelfIp(db: Db, ip: string) {
  if (!isPublicIpv4(ip)) return;
  const d = await load(db);
  if (d.selfIp !== ip) await save(db, { ...d, selfIp: ip });
}

/** 국내 주소 목록(APNIC 공개 배정표의 KR IPv4). 미니 PC 가 한 주에 한 번 받아 보낸다: [[시작 주소, 개수]] */
export async function saveKrRanges(db: Db, raw: unknown, now = new Date()) {
  if (!Array.isArray(raw)) return false;
  const r: [number, number][] = [];
  for (const x of raw.slice(0, 20000)) {
    if (!Array.isArray(x)) continue;
    const s = ipv4ToInt(String(x[0]));
    const n = Number(x[1]);
    if (s == null || !Number.isInteger(n) || n < 1 || n > 2 ** 24) continue;
    r.push([s, s + n - 1]);
  }
  if (r.length < 100) return false; // 엉뚱한 목록으로 국내 접속까지 막지 않게
  r.sort((a, b) => a[0] - b[0]);
  // 붙은 범위는 합친다
  const m: [number, number][] = [];
  for (const x of r) {
    const last = m[m.length - 1];
    if (last && x[0] <= last[1] + 1) last[1] = Math.max(last[1], x[1]);
    else m.push([x[0], x[1]]);
  }
  const d = await load(db);
  await save(db, { ...d, kr: { at: now.toISOString(), n: m.length, ranges: m } });
  return true;
}
/** 목록이 없거나 8일 넘었으면 미니 PC 에 다시 받아 달라고 한다 */
export async function needKr(db: Db, now = new Date()) {
  const d = await load(db);
  return !d.kr || now.getTime() - Date.parse(d.kr.at) > 8 * 86400_000;
}

export async function securityView(db: Db, now = Date.now()) {
  const d = await load(db);
  const day = new Date(now + 9 * 3600_000).toISOString().slice(0, 10);
  const log = d.log ?? [];
  return {
    geoOn: !!d.geoOn,
    kr: d.kr ? { at: d.kr.at, n: d.kr.n } : null,
    blocks: activeBlocks(d, now),
    log,
    todayBlocks: log.filter((b) => new Date(Date.parse(b.at) + 9 * 3600_000).toISOString().slice(0, 10) === day).length,
    selfIp: d.selfIp ?? "",
  };
}
export async function blockedIps(db: Db, now = Date.now()) {
  return activeBlocks(await load(db), now).map((b) => b.ip);
}

/** 대표만. 외국 접속 막기 켜기·끄기 */
export async function setGeoBlock(db: Db, actor: Actor, on: boolean) {
  if (!actor.roles.includes("owner")) throw new UserError("외국 접속 막기는 대표만 바꿉니다");
  const d = await load(db);
  if (on && !d.kr) throw new UserError("국내 주소 목록을 아직 받지 못했습니다. 서버가 받아 오면(보통 몇 분 안) 켤 수 있습니다");
  await save(db, { ...d, geoOn: on }, actor.id);
  await writeAudit(db, { actorId: actor.id, action: "security.geo", entityType: "app_config", entityId: KEY, before: { on: !!d.geoOn }, after: { on } });
}
/** 대표만. 차단 풀기 */
export async function unblockIp(db: Db, actor: Actor, ip: string, now = new Date()) {
  if (!actor.roles.includes("owner")) throw new UserError("차단 풀기는 대표만 합니다");
  const d = await load(db);
  const blocks = activeBlocks(d, now.getTime()).filter((b) => b.ip !== ip);
  await save(db, { ...d, blocks }, actor.id);
  await writeAudit(db, { actorId: actor.id, action: "security.unblock", entityType: "ip", entityId: ip });
}
/** 대표만. 직접 막기(예: 오류 기록·접속 기록에서 수상한 주소) */
export async function blockIpManually(db: Db, actor: Actor, ip: string, hours: number, now = new Date()) {
  if (!actor.roles.includes("owner")) throw new UserError("주소 막기는 대표만 합니다");
  if (!isPublicIpv4(ip.trim())) throw new UserError("인터넷 IPv4 주소(예: 203.0.113.5)를 넣어 주세요. 공유기 안 주소는 막을 수 없습니다");
  const d = await load(db);
  if (d.selfIp === ip.trim()) throw new UserError("서버 자신의 인터넷 주소는 막을 수 없습니다");
  await addBlock(db, ip.trim(), Math.max(1, Math.min(24 * 365, hours)) * 60, "대표가 직접 막음", now, actor.id);
}
