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

const KEY = "server_ops";
type Actor = { id: string; roles: readonly Role[] };

/** 미니 PC 가 알려 오는 값. 모두 글자로 받아 짧게 자른다 */
export type ServerStatus = {
  host: string; // 컴퓨터 이름
  place: string; // home | shop | cloud
  mode: string; // direct | tunnel
  version: string; // 지금 돌고 있는 커밋(7자)
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
};
/** 병합된 변경 하나(PR 번호·제목) */
export type Change = { pr: number | null; title: string };
/** 업데이트 이력 한 줄. how: nightly 예약 자동 · button 앱의 '지금 올리기' · terminal 미니 PC 터미널 */
export type UpdateEvent = { at: string; how: string; ok: boolean; from: string; to: string; message: string; changes: Change[] };
export const HOW_LABEL: Record<string, string> = { nightly: "예약 자동", button: "앱에서 지금 올리기", terminal: "미니 PC 터미널" };
const HISTORY_MAX = 200;
export type UpdateRequest = { at: string; by: string | null; taken: string | null; fromVersion?: string };
export type UpdateResult = { at: string; ok: boolean; message: string };
/** 자동 올리기(대표 2026-11-20): 켜면 매일 정한 시각에 새 버전을 올린다. 기본 켬·21:30 */
export type AutoUpdate = { on: boolean; time: string };
export const AUTO_DEFAULT: AutoUpdate = { on: true, time: "21:30" };
const autoText = (a: AutoUpdate) => (a.on ? `매일 ${a.time}에 저절로 올라갑니다` : "자동 올리기는 꺼져 있습니다");
type Data = {
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
  return { auto: d.auto ?? AUTO_DEFAULT, history: d.history ?? [], status: d.status ?? null, silentMin, silent: silentMin == null || silentMin > SILENT_MIN, request: req, pending, running, result: d.result ?? null };
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
  if (v.pending) throw new UserError("이미 요청했습니다. 서버가 1분 안에 가져갑니다");
  if (v.running) throw new UserError("지금 새 버전을 올리는 중입니다. 끝나면 이 화면에 저절로 뜹니다");
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
  };
}
function cleanChanges(x: unknown): Change[] {
  return (Array.isArray(x) ? x : []).slice(0, 40).map((c) => {
    const o = (c ?? {}) as Record<string, unknown>;
    const pr = Number(o.pr);
    return { pr: Number.isInteger(pr) && pr > 0 ? pr : null, title: s(o.title, 200) };
  }).filter((c) => c.title);
}
function cleanEvent(x: unknown): UpdateEvent | null {
  const o = (x ?? {}) as Record<string, unknown>;
  const at = s(o.at, 20);
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(at)) return null;
  return { at, how: ["nightly", "button", "terminal"].includes(String(o.how)) ? String(o.how) : "nightly", ok: o.ok === true, from: s(o.from, 12), to: s(o.to, 12), message: s(o.message, 300), changes: cleanChanges(o.changes) };
}

/** 미니 PC agent 가 1분마다 부른다. status 가 있으면 저장, result 가 있으면 올리기 결과 저장.
 *  돌려주는 update=true 면 agent 가 update.sh 를 돌린다(요청은 가져간 것으로 표시) */
export async function agentReport(db: Db, body: { status?: Record<string, unknown>; result?: { ok?: unknown; message?: unknown }; events?: unknown[] }, now = new Date()) {
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
    // 새 버전이 생기면 대표에게 바로 알린다(같은 버전은 한 번만). 미니 PC 가 1분마다 GitHub 끝 번호를 본다
    const st = next.status;
    if (st.behind > 0 && st.latest && st.latest !== d.status?.latest) {
      const first = st.pending[0];
      const what = first ? `${first.title}${first.pr ? ` (#${first.pr})` : ""}${st.pending.length > 1 ? ` 외 ${st.pending.length - 1}개` : ""}` : `${st.behind}개 변경`;
      await notifyRole(db, "owner", `새 버전 있음: ${what} — 지금 올리거나, ${autoText(d.auto ?? AUTO_DEFAULT)}`, `server-new:${st.latest}`, "/settings/server");
    }
  }
  // 올리는 중인데 결과가 안 왔어도, 이력에 단추로 올린 줄이 오거나 돌고 있는 버전이 바뀌면 끝난 것으로 본다
  // (예전 agent.sh 는 새 버전으로 바뀌는 도중 결과를 못 보낼 수 있었다)
  const taken = d.request?.taken ? Date.parse(d.request.taken) : 0;
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
    await writeAudit(db, { actorId: null, action: result.ok ? "server.update_ok" : "server.update_failed", entityType: "app_config", entityId: KEY, after: result });
    if (!result.ok) await notifyRole(db, "owner", `새 버전 올리기 실패: ${result.message}`, `server-update:${result.at.slice(0, 16)}`, "/settings/server");
  }
  let update = false;
  const req = d.request;
  if (req && !req.taken && now.getTime() - Date.parse(req.at) < 60 * 60_000) {
    next.request = { ...req, taken: now.toISOString(), fromVersion: next.status?.version ?? d.status?.version ?? "" };
    update = true;
  }
  await save(db, next);
  return { update, auto: d.auto ?? AUTO_DEFAULT };
}
