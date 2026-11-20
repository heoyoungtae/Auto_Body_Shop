// 설정 › 서버(대표 요청 2026-11-19): 서버가 대표 자택 등 멀리 있어도 앱에서 서버 상태를 보고 '지금 새 버전 올리기'를 누른다.
// 미니 PC 의 minipc/agent.sh 가 1분마다 /api/server-agent 로 상태를 알리고, 올리기 요청이 있으면 받아 간다.
// 앱(도커 안)은 서버를 직접 건드리지 않는다. 요청을 기록해 두면 미니 PC 가 가져가 update.sh 를 돌린다.
import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { appConfig } from "@/db/schema";
import type { Role } from "@/modules/auth/roles";
import { writeAudit } from "./audit";
import { UserError } from "./errors";
import { notifyRole } from "./notify";
import { recordErrorSafe } from "./error-log";

const KEY = "server_ops";
type Actor = { id: string; roles: readonly Role[] };

/** 미니 PC 가 알려 오는 값. 모두 글자로 받아 짧게 자른다 */
export type ServerStatus = {
  host: string; // 컴퓨터 이름
  place: string; // home | shop | cloud
  mode: string; // direct | tunnel
  version: string; // 지금 돌고 있는 커밋(7자)
  versionLabel: string; // 날짜 버전(26.11.20-7), 모르면 ""
  latestLabel: string;
  latest: string; // GitHub 최신 커밋(7자), 모르면 ""
  behind: number; // 새 커밋 수
  lastUpdate: string; // update.log 마지막 줄
  lastBackup: string; // backups.log 마지막 줄
  disk: string; // 예: "1.6T 남음 / 1.8T (12%)"
  backupDisk: string; // 백업 디스크, 없으면 ""
  memory: string;
  uptime: string;
  lanIp: string;
  publicIp: string;
  services: string; // "app running, db running(healthy), ..."
  ups: string; // UPS 상태, 없으면 ""
  pending: Change[]; // 아직 안 올라간 변경(병합 제목)
  // 상태 숫자(대표 2026-11-20). -1 = 모름
  cpuPct: number;
  cpuTemp: number; // ℃
  memPct: number;
  diskPct: number;
  ssdLife: number; // 남은 수명 %
  ssdTemp: number;
  ssdOk: boolean; // SSD 자체 진단
  rebootNeeded: boolean; // 보안 업데이트 뒤 다시 켜야 함
  bootAt: string; // 마지막으로 켠 때
  // 응답 속도·접속량·데이터 양(대표 2026-11-20). -1 = 모름
  appMs: number; // 미니 PC 안에서 앱 로그인 화면을 여는 데 걸린 시간
  reqs: number; // 최근 1분 실제 접속 요청 수(국내 직접 접속일 때 Caddy 기록)
  errors: number; // 그중 서버 오류(5xx)
  avgMs: number; // 화면·API 요청 평균 처리 시간(그림·스크립트 파일 뺌)
  p95Ms: number; // 느린 쪽(상위 5%)
  rxBytes: number; // 지난 알림 뒤 받은 양
  txBytes: number; // 보낸 양
  netSec: number; // 그 사이 초
};
/** 24시간 흐름(5분 칸). 미니 PC 가 1분마다 알려 온 값을 칸마다 모은다 */
export type Sample = { t: string; reqs: number; errors: number; msSum: number; msN: number; p95: number; rx: number; tx: number; sec: number; cpu: number; mem: number; app: number };
const SLOT_MS = 5 * 60_000;
const SERIES_MAX = 288;
export function addSample(series: Sample[], st: ServerStatus, now: Date): Sample[] {
  const t = new Date(Math.floor(now.getTime() / SLOT_MS) * SLOT_MS).toISOString();
  const keep = series.filter((x) => Date.parse(x.t) > now.getTime() - 24 * 3600_000 && x.t !== t);
  const cur: Sample = series.find((x) => x.t === t) ?? { t, reqs: -1, errors: 0, msSum: 0, msN: 0, p95: -1, rx: -1, tx: -1, sec: 0, cpu: -1, mem: -1, app: -1 };
  const n = { ...cur };
  if (st.reqs >= 0) {
    n.reqs = Math.max(0, n.reqs) + st.reqs;
    n.errors += Math.max(0, st.errors);
    if (st.avgMs >= 0 && st.reqs > 0) (n.msSum += st.avgMs * st.reqs), (n.msN += st.reqs);
  }
  if (st.p95Ms >= 0) n.p95 = Math.max(n.p95, st.p95Ms);
  if (st.rxBytes >= 0 && st.txBytes >= 0 && st.netSec > 0) (n.rx = Math.max(0, n.rx) + st.rxBytes), (n.tx = Math.max(0, n.tx) + st.txBytes), (n.sec += st.netSec);
  if (st.cpuPct >= 0) n.cpu = Math.max(n.cpu, st.cpuPct);
  if (st.memPct >= 0) n.mem = Math.max(n.mem, st.memPct);
  if (st.appMs >= 0) n.app = Math.max(n.app, st.appMs);
  return [...keep, n].sort((a, b) => a.t.localeCompare(b.t)).slice(-SERIES_MAX);
}
/** 오늘(서울) 합계와 지금 속도 */
export function trafficSummary(st: ServerStatus | null, series: Sample[], now = Date.now()) {
  const day = new Date(now + 9 * 3600_000).toISOString().slice(0, 10);
  const today = series.filter((x) => new Date(Date.parse(x.t) + 9 * 3600_000).toISOString().slice(0, 10) === day);
  const sum = (k: "reqs" | "errors" | "rx" | "tx") => (today.some((x) => x[k] >= 0) ? today.reduce((a, x) => a + Math.max(0, x[k]), 0) : -1);
  const bps = (b: number | undefined) => (st && b != null && b >= 0 && st.netSec > 0 ? Math.round((b * 8) / st.netSec) : -1);
  return { todayReqs: sum("reqs"), todayErrors: sum("errors"), todayRx: sum("rx"), todayTx: sum("tx"), rxBps: bps(st?.rxBytes), txBps: bps(st?.txBytes) };
}

export type Health = { level: "ok" | "warn" | "danger"; reasons: string[] };
/** 한눈 상태: 위험(빨강)·주의(노랑)·정상(초록)과 이유. 팬 없는 미니 PC 라 온도를 특히 본다 */
export function serverHealth(st: (ServerStatus & { at?: string }) | null, silentMin: number | null): Health {
  const danger: string[] = [];
  const warn: string[] = [];
  if (!st) return { level: "danger", reasons: ["서버가 아직 상태를 알려 오지 않았습니다"] };
  if (silentMin != null && silentMin > SILENT_MIN) danger.push(`서버 소식이 ${silentMin}분째 없습니다`);
  const svc = st.services || "";
  for (const name of ["app", "db"]) if (svc && !new RegExp(`\\b${name} running(?!\\(unhealthy)`).test(svc)) danger.push(name === "app" ? "앱 프로그램이 멈췄습니다" : "DB 프로그램이 멈췄습니다");
  if (/ONBATT/i.test(st.ups)) danger.push("정전: UPS 배터리로 돌고 있습니다");
  const n = (x: unknown) => (typeof x === "number" && x >= 0 ? x : null);
  const t = n(st.cpuTemp);
  if (t != null && t >= 90) danger.push(`CPU 온도 ${t}℃(너무 뜨거움)`);
  else if (t != null && t >= 80) warn.push(`CPU 온도 ${t}℃(높음)`);
  if (st.ssdOk === false) danger.push("SSD 자체 진단 실패: 곧 고장 날 수 있습니다");
  const life = n(st.ssdLife);
  if (life != null && life <= 10) danger.push(`SSD 수명 ${life}% 남음`);
  else if (life != null && life <= 30) warn.push(`SSD 수명 ${life}% 남음`);
  const st2 = n(st.ssdTemp);
  if (st2 != null && st2 >= 70) warn.push(`SSD 온도 ${st2}℃(높음)`);
  const dp = n(st.diskPct);
  if (dp != null && dp >= 95) danger.push(`SSD 공간 ${dp}% 사용(거의 꽉 참)`);
  else if (dp != null && dp >= 85) warn.push(`SSD 공간 ${dp}% 사용`);
  const mp = n(st.memPct);
  if (mp != null && mp >= 95) warn.push(`메모리 ${mp}% 사용`);
  const cp = n(st.cpuPct);
  if (cp != null && cp >= 90) warn.push(`CPU ${cp}% 사용(바쁨)`);
  // 응답 속도(대표 2026-11-20): 실제 접속의 느린 쪽이 3초 넘거나, 서버 오류가 잦으면 주의
  const p95 = n(st.p95Ms);
  if (p95 != null && p95 >= 3000) warn.push(`화면 열기 느림(느린 쪽 ${(p95 / 1000).toFixed(1)}초)`);
  const app = n(st.appMs);
  if (app != null && app >= 3000) warn.push(`앱 응답 느림(${(app / 1000).toFixed(1)}초)`);
  const er = n(st.errors), rq = n(st.reqs);
  if (er != null && rq != null && er >= 5 && er * 20 >= rq) warn.push(`서버 오류 잦음(최근 1분 ${er}건)`);
  if (st.rebootNeeded) warn.push("보안 업데이트 뒤 다시 켜야 합니다(새벽 4시에 저절로)");
  if (danger.length) return { level: "danger", reasons: [...danger, ...warn] };
  if (warn.length) return { level: "warn", reasons: warn };
  return { level: "ok", reasons: [] };
}
/** 병합된 변경 하나(PR 번호·제목) */
export type Change = { pr: number | null; title: string; label?: string };
/** 업데이트 이력 한 줄. how: nightly 예약 자동 · button 앱의 '지금 올리기' · terminal 미니 PC 터미널 */
export type UpdateEvent = { at: string; how: string; ok: boolean; from: string; to: string; fromLabel?: string; toLabel?: string; message: string; changes: Change[] };
/** 날짜 버전(대표 2026-11-20): 26.11.20-7 = 그날 7번째 병합. 미니 PC 가 git 병합 순서로 매긴다 */
const cleanLabel = (x: unknown) => (/^\d{2}\.\d{2}\.\d{2}-\d{1,4}$/.test(String(x ?? "")) ? String(x) : "");
export const HOW_LABEL: Record<string, string> = { nightly: "예약 자동", button: "앱에서 지금 올리기", terminal: "미니 PC 터미널" };
const HISTORY_MAX = 200;
export type UpdateRequest = { at: string; by: string | null; taken: string | null; fromVersion?: string };
export type UpdateResult = { at: string; ok: boolean; message: string };
/** 자동 올리기(대표 2026-11-20): 켜면 매일 정한 시각에 새 버전을 올린다. 기본 켬·21:30 */
export type AutoUpdate = { on: boolean; time: string };
export const AUTO_DEFAULT: AutoUpdate = { on: true, time: "21:30" };
const autoText = (a: AutoUpdate) => (a.on ? `매일 ${a.time}에 저절로 올라갑니다` : "자동 올리기는 꺼져 있습니다");
/** 새 버전 올리기 진행 단계(대표 2026-11-20 '진행 바'). 미니 PC 가 지금 도는 프로그램으로 알아내 알려 준다 */
export const STAGES = ["새 버전 받기", "올리기 전 백업", "새 버전 만들기", "바꿔 끼우기", "열리는지 확인", "정리"] as const;
const STAGE_START = [0, 5, 15, 85, 93, 98];
const STAGE_WIDTH = [5, 10, 70, 8, 5, 2];
const STAGE_SEC = [20, 30, 300, 20, 30, 10];
export type Progress = { stage: number; stageAt: string };
/** 진행률(%): 단계 시작점 + 그 단계에서 지난 시간/보통 걸리는 시간(만들기는 지난번 걸린 시간). 단계 안에서는 95%에서 멈춘다 */
export function progressPct(stage: number, stageSec: number, lastBuildSec?: number | null) {
  const i = Math.max(0, Math.min(STAGES.length - 1, stage));
  const expect = i === 2 && lastBuildSec && lastBuildSec > 30 ? lastBuildSec : STAGE_SEC[i];
  return Math.round(STAGE_START[i] + STAGE_WIDTH[i] * Math.min(0.95, Math.max(0, stageSec) / expect));
}
type Data = {
  progress?: Progress | null;
  series?: Sample[];
  lastBuildSec?: number | null;
  auto?: AutoUpdate; status?: ServerStatus & { at: string }; request?: UpdateRequest | null; result?: UpdateResult | null; history?: UpdateEvent[] };

async function load(db: Db): Promise<Data> {
  const [c] = await db.select().from(appConfig).where(eq(appConfig.key, KEY));
  return (c?.data ?? {}) as Data;
}
async function save(db: Db, data: Data, by: string | null = null) {
  await db
    .insert(appConfig)
    .values({ key: KEY, data, updatedBy: by, updatedAt: new Date() })
    .onConflictDoUpdate({ target: appConfig.key, set: { data, updatedBy: by, updatedAt: new Date() } });
}

/** 30분 넘게 소식이 없으면 끊긴 것으로 본다(미니 PC 꺼짐·자택 인터넷 끊김·agent 미설치) */
export const SILENT_MIN = 30;
export async function serverOpsView(db: Db, now = Date.now()) {
  const d = await load(db);
  const at = d.status?.at ? Date.parse(d.status.at) : 0;
  const silentMin = at ? Math.floor((now - at) / 60_000) : null;
  const req = d.request ?? null;
  // 요청했는데 15분이 지나도 안 가져갔으면 막지 않고 다시 누를 수 있게
  const pending = !!req && !req.taken && now - Date.parse(req.at) < 15 * 60_000;
  const running = !!req?.taken && (!d.result || Date.parse(d.result.at) < Date.parse(req.taken)) && now - Date.parse(req.taken) < 30 * 60_000;
  const pg = running && d.progress ? d.progress : null;
  const progress = pg
    ? { stage: pg.stage, label: STAGES[pg.stage] ?? "", pct: progressPct(pg.stage, (now - Date.parse(pg.stageAt)) / 1000, d.lastBuildSec), sinceMin: Math.floor((now - Date.parse(req!.taken!)) / 60_000) }
    : null;
  const series = d.series ?? [];
  // 새 버전이 없으면 올릴 것이 없다(대표 2026-11-20). 미니 PC 가 1분마다 GitHub 끝 번호를 보므로 최신인지 바로 안다
  const upToDate = !!d.status?.latest && d.status.behind === 0;
  return { upToDate, series, traffic: trafficSummary(d.status ?? null, series, now), progress, health: serverHealth(d.status ?? null, silentMin), auto: d.auto ?? AUTO_DEFAULT, history: d.history ?? [], status: d.status ?? null, silentMin, silent: silentMin == null || silentMin > SILENT_MIN, request: req, pending, running, result: d.result ?? null };
}

/** 대표만. 자동 올리기 켜기·끄기와 시각 */
export async function setAutoUpdate(db: Db, actor: Actor, input: { on: boolean; time: string }) {
  if (!actor.roles.includes("owner")) throw new UserError("자동 올리기 설정은 대표만 합니다");
  const time = input.time.trim();
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new UserError("시각을 00:00~23:59 사이로 넣어 주세요");
  const d = await load(db);
  const auto: AutoUpdate = { on: input.on, time };
  await save(db, { ...d, auto }, actor.id);
  await writeAudit(db, { actorId: actor.id, action: "server.auto_set", entityType: "app_config", entityId: KEY, before: d.auto ?? AUTO_DEFAULT, after: auto });
  return auto;
}

/** 대표만. '지금 새 버전 올리기' */
export async function requestUpdate(db: Db, actor: Actor, now = new Date()) {
  if (!actor.roles.includes("owner")) throw new UserError("새 버전 올리기는 대표만 합니다");
  const v = await serverOpsView(db, now.getTime());
  if (v.pending) throw new UserError("이미 요청했습니다. 서버가 몇 초 안에 가져갑니다");
  if (v.running) throw new UserError("지금 새 버전을 올리는 중입니다. 끝나면 이 화면에 저절로 뜹니다");
  if (v.upToDate) throw new UserError("이미 최신 버전이라 올릴 것이 없습니다");
  const d = await load(db);
  const request: UpdateRequest = { at: now.toISOString(), by: actor.id, taken: null };
  await save(db, { ...d, request }, actor.id);
  await writeAudit(db, { actorId: actor.id, action: "server.update_request", entityType: "app_config", entityId: KEY, after: request });
  return request;
}

const s = (x: unknown, n = 200) => String(x ?? "").replace(/[\u0000-\u001f]/g, " ").slice(0, n);
function cleanStatus(b: Record<string, unknown>): ServerStatus {
  return {
    host: s(b.host, 60),
    place: s(b.place, 10),
    mode: s(b.mode, 10),
    version: s(b.version, 12),
    versionLabel: cleanLabel(b.versionLabel),
    latestLabel: cleanLabel(b.latestLabel),
    latest: s(b.latest, 12),
    behind: Math.max(0, Math.min(9999, Number(b.behind) || 0)),
    lastUpdate: s(b.lastUpdate),
    lastBackup: s(b.lastBackup),
    disk: s(b.disk, 80),
    backupDisk: s(b.backupDisk, 80),
    memory: s(b.memory, 80),
    uptime: s(b.uptime, 80),
    lanIp: s(b.lanIp, 60),
    publicIp: s(b.publicIp, 60),
    services: s(b.services, 300),
    ups: s(b.ups, 80),
    pending: cleanChanges(b.pending),
    cpuPct: num(b.cpuPct, 100),
    cpuTemp: num(b.cpuTemp, 150),
    memPct: num(b.memPct, 100),
    diskPct: num(b.diskPct, 100),
    ssdLife: num(b.ssdLife, 100),
    ssdTemp: num(b.ssdTemp, 150),
    ssdOk: b.ssdOk !== false,
    rebootNeeded: b.rebootNeeded === true,
    bootAt: s(b.bootAt, 20),
    appMs: num(b.appMs, 600_000),
    reqs: num(b.reqs, 10_000_000),
    errors: num(b.errors, 10_000_000),
    avgMs: num(b.avgMs, 600_000),
    p95Ms: num(b.p95Ms, 600_000),
    rxBytes: num(b.rxBytes, 1e13),
    txBytes: num(b.txBytes, 1e13),
    netSec: num(b.netSec, 3600),
  };
}
function num(x: unknown, max: number) {
  const v = Number(x);
  return Number.isFinite(v) && v >= 0 && v <= max ? Math.round(v) : -1;
}
function cleanChanges(x: unknown): Change[] {
  return (Array.isArray(x) ? x : []).slice(0, 40).map((c) => {
    const o = (c ?? {}) as Record<string, unknown>;
    const pr = Number(o.pr);
    return { pr: Number.isInteger(pr) && pr > 0 ? pr : null, title: s(o.title, 200), label: cleanLabel(o.label) };
  }).filter((c) => c.title);
}
function cleanEvent(x: unknown): UpdateEvent | null {
  const o = (x ?? {}) as Record<string, unknown>;
  const at = s(o.at, 20);
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(at)) return null;
  return { at, how: ["nightly", "button", "terminal"].includes(String(o.how)) ? String(o.how) : "nightly", ok: o.ok === true, from: s(o.from, 12), to: s(o.to, 12), fromLabel: cleanLabel(o.fromLabel), toLabel: cleanLabel(o.toLabel), message: s(o.message, 300), changes: cleanChanges(o.changes) };
}

/** 미니 PC agent 가 1분마다 부른다(그 사이 5초마다 poll 로 요청만 묻는다). status 가 있으면 저장, result 가 있으면 올리기 결과 저장.
 *  돌려주는 update=true 면 agent 가 update.sh 를 돌린다(요청은 가져간 것으로 표시) */
export async function agentReport(
  db: Db,
  body: { status?: Record<string, unknown>; result?: { ok?: unknown; message?: unknown }; events?: unknown[]; progress?: { stage?: unknown }; labels?: Record<string, unknown>; poll?: unknown; serverErrors?: unknown[] },
  now = new Date(),
) {
  // 짧은 확인(대표 2026-11-20 "1분 기다림이 왜 필요한가"): 미니 PC 가 1분 사이사이 5초마다 올리기 요청만 묻는다.
  // 요청이 없으면 아무것도 저장하지 않고 바로 답한다
  if (body.poll) {
    const p = await load(db);
    const r = p.request;
    if (!r || r.taken || now.getTime() - Date.parse(r.at) >= 60 * 60_000) return { update: false, auto: p.auto ?? AUTO_DEFAULT };
    body = {};
  }
  // 서버 오류(대표 2026-11-20 '오류 기록'): 미니 PC 가 앱·DB·관문·시스템 출력에서 고른 오류 줄. 한 번에 50줄까지
  if (Array.isArray(body.serverErrors))
    for (const x of body.serverErrors.slice(0, 50)) {
      const o = (x ?? {}) as Record<string, unknown>;
      const at = Date.parse(String(o.at ?? ""));
      await recordErrorSafe(db, { kind: ["server", "db", "caddy", "system"].includes(String(o.kind)) ? String(o.kind) : "system", message: String(o.message ?? ""), detail: String(o.detail ?? "") }, Number.isFinite(at) && Math.abs(at - now.getTime()) < 86400_000 ? new Date(at) : now);
    }
  const d = await load(db);
  const next: Data = { ...d };
  if (Array.isArray(body.events) && body.events.length) {
    // 같은 때·같은 결과는 한 번만(미니 PC 가 처음에 기록 파일 전체를 보내거나 다시 보내도 겹치지 않게). 최근 것이 앞
    const key = (e: UpdateEvent) => `${e.at}|${e.how}|${e.ok}|${e.to}|${e.message}`;
    const all = [...(d.history ?? [])];
    const seen = new Set(all.map(key));
    const fresh: UpdateEvent[] = [];
    for (const e of body.events.slice(0, 500).map(cleanEvent)) if (e && !seen.has(key(e))) (seen.add(key(e)), all.push(e), fresh.push(e));
    // 예약 자동 올리기가 실패하면 대표에게 알린다(단추로 올린 실패는 결과에서 알림). 처음 받는 옛 기록은 하루 안 것만
    for (const e of fresh)
      if (e.how === "nightly" && !e.ok && Date.parse(`${e.at.replace(" ", "T")}:00+09:00`) > now.getTime() - 24 * 3600_000)
        await notifyRole(db, "owner", `예약 자동 새 버전 올리기 실패: ${e.message}`, `server-auto:${e.at}`, "/settings/server");
    next.history = all.sort((a, b) => b.at.localeCompare(a.at)).slice(0, HISTORY_MAX);
  }
  if (body.status) {
    next.status = { ...cleanStatus(body.status), at: now.toISOString() };
    next.series = addSample(d.series ?? [], next.status, now);
    // 위험이 되면 대표에게 알린다(같은 이유는 하루 한 번)
    const h = serverHealth(next.status, 0);
    if (h.level === "danger" && d.status && serverHealth(d.status, 0).level !== "danger")
      await notifyRole(db, "owner", `서버 위험: ${h.reasons.join(", ")}`, `server-danger:${now.toISOString().slice(0, 10)}:${h.reasons[0]}`, "/settings/server");
    // 새 버전이 생기면 대표에게 바로 알린다(같은 버전은 한 번만). 미니 PC 가 1분마다 GitHub 끝 번호를 본다
    const st = next.status;
    if (st.behind > 0 && st.latest && st.latest !== d.status?.latest) {
      const first = st.pending[0];
      const what = first ? `${first.title}${first.pr ? ` (#${first.pr})` : ""}${st.pending.length > 1 ? ` 외 ${st.pending.length - 1}개` : ""}` : `${st.behind}개 변경`;
      await notifyRole(db, "owner", `새 버전${st.latestLabel ? ` ${st.latestLabel}` : ""} 있음: ${what} — 지금 올리거나, ${autoText(d.auto ?? AUTO_DEFAULT)}`, `server-new:${st.latest}`, "/settings/server");
    }
  }
  // 올리는 중인데 결과가 안 왔어도, 이력에 단추로 올린 줄이 오거나 돌고 있는 버전이 바뀌면 끝난 것으로 본다
  // (예전 agent.sh 는 새 버전으로 바뀌는 도중 결과를 못 보낼 수 있었다)
  const taken = d.request?.taken ? Date.parse(d.request.taken) : 0;
  // 진행 단계: 앞으로만 간다. 만들기 단계를 마치면 걸린 시간을 기억해 다음 진행 바에 쓴다
  if (body.progress && taken && !(d.result && Date.parse(d.result.at) >= taken)) {
    const st = Math.max(0, Math.min(STAGES.length - 1, Math.floor(Number(body.progress.stage) || 0)));
    const prev = d.progress ?? null;
    if (!prev || st > prev.stage) {
      if (prev?.stage === 2) next.lastBuildSec = Math.round((now.getTime() - Date.parse(prev.stageAt)) / 1000);
      next.progress = { stage: st, stageAt: now.toISOString() };
    }
  }
  const open = taken && !(d.result && Date.parse(d.result.at) >= taken);
  if (open && !body.result) {
    const takenMin = new Date(taken + 9 * 3600_000).toISOString().slice(0, 16).replace("T", " ");
    const ev = (next.history ?? []).find((e) => e.how === "button" && e.at >= takenMin);
    const from = d.request?.fromVersion ?? "";
    const ver = next.status?.version ?? "";
    if (ev) body = { ...body, result: { ok: ev.ok, message: ev.ok ? `새 버전 올림 ${ev.from} → ${ev.to}` : ev.message } };
    else if (body.status && from && ver && ver !== from) body = { ...body, result: { ok: true, message: `새 버전 올림 ${from} → ${ver}` } };
  }
  if (body.result) {
    const result: UpdateResult = { at: now.toISOString(), ok: body.result.ok === true, message: s(body.result.message, 300) };
    next.result = result;
    // 올린 버전을 서버 정보에도 바로 반영한다(다음 상태 알림을 기다리지 않게, 대표 2026-11-20)
    const to = result.ok ? /→\s*([0-9a-f]{7,40})/.exec(result.message)?.[1]?.slice(0, 7) : undefined;
    if (to && next.status) {
      const done = !!next.status.latest && next.status.latest.startsWith(to);
      next.status = { ...next.status, version: to, versionLabel: done ? next.status.latestLabel : "", ...(done ? { behind: 0, pending: [] } : {}) };
    }
    await writeAudit(db, { actorId: null, action: result.ok ? "server.update_ok" : "server.update_failed", entityType: "app_config", entityId: KEY, after: result });
    if (!result.ok) await notifyRole(db, "owner", `새 버전 올리기 실패: ${result.message}`, `server-update:${result.at.slice(0, 16)}`, "/settings/server");
  }
  let update = false;
  const req = d.request;
  if (req && !req.taken && now.getTime() - Date.parse(req.at) < 60 * 60_000) {
    next.request = { ...req, taken: now.toISOString(), fromVersion: next.status?.version ?? d.status?.version ?? "" };
    next.progress = { stage: 0, stageAt: now.toISOString() };
    update = true;
  }
  // 예전 이력에 날짜 버전 채우기(대표 2026-11-20): 미니 PC 가 기록 번호별 날짜 버전을 보내 오면 채운다
  if (body.labels && typeof body.labels === "object") {
    const map = new Map(Object.entries(body.labels).map(([k, v]) => [k.slice(0, 12), cleanLabel(v)]));
    // 계산 못 한 번호(오래되어 기록이 없는 등)는 번호 그대로 두어 다시 묻지 않는다
    const fill = (cur: string | undefined, sha: string) => cur || (sha && map.has(sha) ? map.get(sha) || sha : "");
    next.history = (next.history ?? []).map((e) => ({ ...e, fromLabel: fill(e.fromLabel, e.from), toLabel: fill(e.toLabel, e.to) }));
  }
  await save(db, next);
  // 아직 날짜 버전이 없는 이력의 기록 번호(미니 PC 가 계산해 보낸다)
  const labelsFor = [...new Set((next.history ?? []).flatMap((e) => [!e.fromLabel && e.from, !e.toLabel && e.to]).filter((x): x is string => !!x && /^[0-9a-f]{7,12}$/.test(x)))].slice(0, 50);
  return { update, auto: d.auto ?? AUTO_DEFAULT, ...(labelsFor.length && !body.labels ? { labelsFor } : {}) };
}
