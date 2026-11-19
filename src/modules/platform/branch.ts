// 본점·지점·작업장(대표 결정 2026-11-19, 1단계). 지점은 아직 본점 하나뿐이라 지점을 고르는 화면은 없다.
// 작업장은 같은 부지 안의 현장 위치(판금동·도장 부스·부품 창고 등). 설정 › 작업장에서 공장장·대표가 관리한다.
import { and, asc, eq, inArray, isNotNull, isNull, ne } from "drizzle-orm";
import type { Db } from "@/db/client";
import { appUser, branch, MAIN_BRANCH_ID, WORKPLACE_KINDS, workplace, workStep, type WorkplaceKind } from "@/db/schema";
import { can } from "@/modules/auth/permissions";
import type { Role } from "@/modules/auth/roles";
import { writeAudit } from "./audit";
import { UserError } from "./errors";

type Actor = { id: string; roles: readonly Role[] };

export const WORKPLACE_KIND_LABEL: Record<WorkplaceKind, string> = {
  panel: "판금",
  paint: "도장",
  dent: "덴트",
  polish: "광택·세차",
  inspect: "검사·출고",
  storage: "보관(창고)",
  waiting: "차량 대기",
  other: "기타",
};

/** 종류를 고르면 이름 칸에 먼저 보여 줄 이름(입력도우미) */
export const WORKPLACE_NAME_SUGGEST: Record<WorkplaceKind, string[]> = {
  panel: ["판금동", "판금 1번 베이"],
  paint: ["도장 부스", "조색실", "건조실"],
  dent: ["덴트실"],
  polish: ["광택장", "세차장"],
  inspect: ["검사장", "출고 대기장"],
  storage: ["부품 창고", "도료 창고", "폐기물 보관장"],
  waiting: ["입고 대기 주차장"],
  other: [],
};

/** 작업 자리가 없는 종류(자리 수를 0으로 둔다) */
const NO_BAYS: WorkplaceKind[] = ["storage", "waiting"];

export const isWorkplaceKind = (k: string): k is WorkplaceKind => (WORKPLACE_KINDS as readonly string[]).includes(k);

export async function listBranches(db: Db) {
  return db.select().from(branch).orderBy(asc(branch.sortOrder), asc(branch.createdAt));
}

/** 지점이 둘 이상일 때만 화면에 지점 칸을 보인다 */
export async function hasManyBranches(db: Db) {
  return (await db.select({ id: branch.id }).from(branch).limit(2)).length > 1;
}

export async function listWorkplaces(db: Db, opts: { branchId?: string; activeOnly?: boolean } = {}) {
  const conds = [eq(workplace.branchId, opts.branchId ?? MAIN_BRANCH_ID)];
  if (opts.activeOnly) conds.push(eq(workplace.active, true));
  return db
    .select({
      id: workplace.id,
      branchId: workplace.branchId,
      name: workplace.name,
      kind: workplace.kind,
      bays: workplace.bays,
      managerId: workplace.managerId,
      managerName: appUser.name,
      note: workplace.note,
      sortOrder: workplace.sortOrder,
      active: workplace.active,
    })
    .from(workplace)
    .leftJoin(appUser, eq(appUser.id, workplace.managerId))
    .where(and(...conds))
    .orderBy(asc(workplace.sortOrder), asc(workplace.name));
}

export type WorkplaceInput = { name: string; kind: string; bays: number | null; managerId: string | null; note: string; sortOrder?: number | null };

function clean(input: WorkplaceInput) {
  const name = input.name.trim().replace(/\s+/g, " ");
  if (!name) throw new UserError("작업장 이름을 적어 주세요");
  if (name.length > 30) throw new UserError("작업장 이름은 30자까지입니다");
  if (!isWorkplaceKind(input.kind)) throw new UserError("작업장 종류를 골라 주세요");
  const bays = NO_BAYS.includes(input.kind) ? 0 : Math.trunc(input.bays ?? 0);
  if (bays < 0 || bays > 50) throw new UserError("작업 자리 수는 0~50입니다");
  const note = input.note.trim().slice(0, 300);
  const sortOrder = Math.max(0, Math.min(999, Math.trunc(input.sortOrder ?? 0)));
  return { name, kind: input.kind, bays, managerId: input.managerId || null, note, sortOrder };
}

async function checkManager(db: Db, id: string | null) {
  if (!id) return;
  const [u] = await db.select({ active: appUser.active }).from(appUser).where(eq(appUser.id, id));
  if (!u?.active) throw new UserError("담당자는 지금 일하는 직원 중에서 골라 주세요");
}

async function checkName(db: Db, branchId: string, name: string, exceptId?: string) {
  const conds = [eq(workplace.branchId, branchId), eq(workplace.name, name)];
  if (exceptId) conds.push(ne(workplace.id, exceptId));
  const [dup] = await db.select({ id: workplace.id }).from(workplace).where(and(...conds));
  if (dup) throw new UserError(`'${name}' 작업장이 이미 있습니다. 다른 이름을 쓰거나 목록에서 그 줄을 고쳐 주세요`);
}

/** 새 작업장(1단계는 본점에만) */
export async function createWorkplace(db: Db, actor: Actor, input: WorkplaceInput) {
  if (!can(actor, "workplace.edit")) throw new UserError("작업장은 공장장·대표가 등록합니다");
  const v = clean(input);
  await checkManager(db, v.managerId);
  await checkName(db, MAIN_BRANCH_ID, v.name);
  const [row] = await db.insert(workplace).values({ ...v, branchId: MAIN_BRANCH_ID }).returning({ id: workplace.id });
  await writeAudit(db, { actorId: actor.id, action: "workplace.create", entityType: "workplace", entityId: row.id, after: v });
  return row.id;
}

export async function updateWorkplace(db: Db, actor: Actor, id: string, input: WorkplaceInput) {
  if (!can(actor, "workplace.edit")) throw new UserError("작업장은 공장장·대표가 고칩니다");
  const [before] = await db.select().from(workplace).where(eq(workplace.id, id));
  if (!before) throw new UserError("작업장을 찾을 수 없습니다");
  const v = clean(input);
  await checkManager(db, v.managerId);
  await checkName(db, before.branchId, v.name, id);
  await db.update(workplace).set(v).where(eq(workplace.id, id));
  await writeAudit(db, {
    actorId: actor.id,
    action: "workplace.update",
    entityType: "workplace",
    entityId: id,
    before: { name: before.name, kind: before.kind, bays: before.bays, managerId: before.managerId, note: before.note, sortOrder: before.sortOrder },
    after: v,
  });
}

/** 지우지 않고 사용 중지(이미 쓴 기록이 그 작업장을 가리킬 수 있음) */
export async function setWorkplaceActive(db: Db, actor: Actor, id: string, active: boolean) {
  if (!can(actor, "workplace.edit")) throw new UserError("작업장은 공장장·대표가 관리합니다");
  const [w] = await db.select({ name: workplace.name, active: workplace.active }).from(workplace).where(eq(workplace.id, id));
  if (!w) throw new UserError("작업장을 찾을 수 없습니다");
  if (w.active === active) return w.name;
  await db.update(workplace).set({ active }).where(eq(workplace.id, id));
  await writeAudit(db, { actorId: actor.id, action: active ? "workplace.activate" : "workplace.deactivate", entityType: "workplace", entityId: id, before: { active: w.active }, after: { active } });
  return w.name;
}

// ── 작업장 자동 채우기(대표 지시 2026-11-19: 매번 고르지 않게) ──
// 공정 종류로 알맞은 작업장 종류를 정하고, 그 종류가 하나면 그곳, 여럿이면 앞 공정과 같은 곳, 아니면 지금 덜 붐비는 곳.

/** 공정 → 작업장 종류(앞이 먼저). 비어 있으면 작업장을 두지 않음(외주) */
export const PROCESS_KINDS: Record<string, WorkplaceKind[]> = {
  detach: ["panel"],
  outsource: [],
  dent: ["dent", "panel"],
  sheet: ["panel"],
  putty: ["panel", "paint"],
  color: ["paint"],
  mask: ["paint", "panel"],
  paint: ["paint"],
  dry: ["paint"],
  polish: ["polish", "panel"],
  calibrate: ["inspect", "panel"],
  assemble: ["panel"],
  rework: ["panel", "paint"],
};

export type WpPick = { id: string; kind: WorkplaceKind; bays: number; sortOrder: number; name: string };

/** 이 공정에 맞는 작업장 후보(첫 번째로 맞는 종류의 작업장들) */
export function candidatesFor(process: string, wps: WpPick[]): WpPick[] {
  for (const k of PROCESS_KINDS[process] ?? []) {
    const xs = wps.filter((w) => w.kind === k);
    if (xs.length) return xs.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "ko"));
  }
  return [];
}

/** 순수 계산: 후보 중 하나 고르기. prev(앞 공정 작업장)가 후보면 그대로, 아니면 자리당 사용 중이 가장 적은 곳 */
export function chooseWorkplace(process: string, wps: WpPick[], inUse: Map<string, number>, prevId?: string | null): string | null {
  const c = candidatesFor(process, wps);
  if (!c.length) return null;
  if (prevId && c.some((w) => w.id === prevId)) return prevId;
  let best = c[0];
  const busy = (w: WpPick) => (inUse.get(w.id) ?? 0) / Math.max(1, w.bays);
  for (const w of c) if (busy(w) < busy(best)) best = w;
  return best.id;
}

/** 지점의 쓰는 작업장과 지금 사용 중(시작했고 안 끝난 공정) 수 */
export async function workplaceState(db: Db, branchId: string) {
  const wps = (await listWorkplaces(db, { branchId, activeOnly: true })).map((w) => ({ id: w.id, kind: w.kind, bays: w.bays, sortOrder: w.sortOrder, name: w.name }));
  const inUse = new Map<string, number>();
  if (wps.length) {
    const rows = await db
      .select({ wp: workStep.workplaceId })
      .from(workStep)
      .where(and(inArray(workStep.workplaceId, wps.map((w) => w.id)), isNotNull(workStep.startedAt), isNull(workStep.endedAt)));
    for (const r of rows) if (r.wp) inUse.set(r.wp, (inUse.get(r.wp) ?? 0) + 1);
  }
  return { wps, inUse };
}

/** 공정 여러 개에 차례로 작업장을 채운다(앞 공정 작업장을 이어받음) */
export function fillWorkplaces<T extends { process: string }>(steps: T[], st: { wps: WpPick[]; inUse: Map<string, number> }): (T & { workplaceId: string | null })[] {
  let prev: string | null = null;
  return steps.map((s) => {
    const id = chooseWorkplace(s.process, st.wps, st.inUse, prev);
    if (id) prev = id;
    return { ...s, workplaceId: id };
  });
}

/** 공장장이 바꿀 때: 그 지점의 쓰는 작업장인지 */
export async function checkWorkplace(db: Db, branchId: string, id: string) {
  const [w] = await db.select({ branchId: workplace.branchId, active: workplace.active }).from(workplace).where(eq(workplace.id, id));
  if (!w || w.branchId !== branchId) throw new UserError("이 지점의 작업장이 아닙니다");
  if (!w.active) throw new UserError("사용 중지한 작업장입니다. 다른 작업장을 고르세요");
}

/** 3정5S 구역(A~H) → 알맞은 작업장 종류. 구역 담당 화면에서 작업장을 먼저 채워 둔다 */
const ZONE_KIND: Record<string, WorkplaceKind | null> = { A: "panel", B: "paint", C: "paint", D: "paint", E: "storage", F: null, G: null, H: "waiting" };

/** 구역에 맞는 작업장 추천: 이름이 같은(겹치는) 작업장이 먼저, 없으면 종류가 맞는 첫 작업장 */
export function suggestZoneWorkplace(code: string, zoneName: string, wps: WpPick[]): string | null {
  const key = zoneName.replace(/\s/g, "");
  const byName = wps.find((w) => {
    const n = w.name.replace(/\s/g, "");
    return n === key || n.includes(key) || key.includes(n);
  });
  if (byName) return byName.id;
  const k = ZONE_KIND[code];
  return (k && [...wps].sort((a, b) => a.sortOrder - b.sortOrder).find((w) => w.kind === k)?.id) || null;
}
