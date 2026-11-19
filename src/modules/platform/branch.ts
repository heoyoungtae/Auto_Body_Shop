// 본점·지점·작업장(대표 결정 2026-11-19, 1단계). 지점은 아직 본점 하나뿐이라 지점을 고르는 화면은 없다.
// 작업장은 같은 부지 안의 현장 위치(판금동·도장 부스·부품 창고 등). 설정 › 작업장에서 공장장·대표가 관리한다.
import { and, asc, eq, inArray, isNotNull, isNull, ne, notInArray, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { appUser, branch, MAIN_BRANCH_ID, repairOrder, ROLE_VALUES, staffProfile, userBranch, userBranchPref, WORKPLACE_KINDS, workplace, workStep, type WorkplaceKind } from "@/db/schema";
import { can } from "@/modules/auth/permissions";
import type { Role } from "@/modules/auth/roles";
import { writeAudit } from "./audit";
import { UserError } from "./errors";
import { formatBizNo, loadShopInfo, validBizNo, type ShopInfo } from "./shop";

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

// ── 지금 지점(2단계, 대표 지시 2026-11-19: 원격 어디서든 같게 — 접속 장소가 아니라 사람 기준) ──

/** 대표·회계는 줄 없이 모든 지점을 본다 */
const ALL_BRANCH_ROLES: Role[] = ["owner", "accounting"];

export type BranchCtx = {
  /** 새 기록이 들어갈 지점(늘 하나) */
  branchId: string;
  /** 목록을 거를 지점. null = 전체(대표·회계가 '전체'를 고른 때) */
  viewBranchId: string | null;
  /** 이 사람이 고를 수 있는 지점(문 닫은 지점 제외) */
  branches: { id: string; name: string; code: string }[];
  allBranches: boolean;
  /** 지금 지점에서의 역할 */
  roles: Role[];
};

/** 지점이 하나뿐이면 아무것도 바뀌지 않는다(본점, 원래 역할) */
export async function branchContext(db: Db, userId: string, globalRoles: Role[]): Promise<BranchCtx> {
  const all = (await listBranches(db)).filter((b) => !b.closedOn);
  if (all.length <= 1) return { branchId: all[0]?.id ?? MAIN_BRANCH_ID, viewBranchId: all[0]?.id ?? MAIN_BRANCH_ID, branches: all.map((b) => ({ id: b.id, name: b.name, code: b.code })), allBranches: true, roles: globalRoles };
  const [[home], rows, [pref]] = await Promise.all([
    db.select({ b: staffProfile.homeBranchId }).from(staffProfile).where(eq(staffProfile.userId, userId)),
    db.select().from(userBranch).where(eq(userBranch.userId, userId)),
    db.select({ b: userBranchPref.branchId }).from(userBranchPref).where(eq(userBranchPref.userId, userId)),
  ]);
  const homeId = home?.b ?? MAIN_BRANCH_ID;
  const allBranches = globalRoles.some((r) => ALL_BRANCH_ROLES.includes(r));
  const ok = new Set(allBranches ? all.map((b) => b.id) : [homeId, ...rows.map((r) => r.branchId)]);
  const branches = all.filter((b) => ok.has(b.id)).map((b) => ({ id: b.id, name: b.name, code: b.code }));
  // 마지막으로 고른 지점. 대표·회계가 null 이면 전체 보기
  let view: string | null = pref ? (pref.b && ok.has(pref.b) ? pref.b : allBranches && pref.b === null ? null : homeId) : allBranches ? null : homeId;
  if (view && !ok.has(view)) view = branches[0]?.id ?? homeId;
  const branchId = view ?? (ok.has(homeId) ? homeId : (branches[0]?.id ?? MAIN_BRANCH_ID));
  const row = rows.find((r) => r.branchId === branchId);
  const local = (row?.roles ?? []).filter((r): r is Role => (ROLE_VALUES as readonly string[]).includes(r));
  // 그 지점 역할이 따로 있으면 그것(대표·회계 역할은 어디서나 유지), 없으면 원래 역할
  const roles = local.length ? [...new Set([...local, ...globalRoles.filter((r) => ALL_BRANCH_ROLES.includes(r))])] : globalRoles;
  return { branchId, viewBranchId: view, branches, allBranches, roles };
}

/** 화면 위 '지금 지점' 바꾸기. id 가 '' 이면 전체(대표·회계만) */
export async function setViewBranch(db: Db, actor: { id: string; roles: readonly Role[] }, id: string, now = new Date()) {
  const all = (await listBranches(db)).filter((b) => !b.closedOn);
  const allBranches = actor.roles.some((r) => ALL_BRANCH_ROLES.includes(r));
  if (!id) {
    if (!allBranches) throw new UserError("전체 보기는 대표·회계 담당만 합니다");
  } else {
    const b = all.find((x) => x.id === id);
    if (!b) throw new UserError("없는 지점이거나 문을 닫은 지점입니다");
    if (!allBranches) {
      const [[home], rows] = await Promise.all([
        db.select({ b: staffProfile.homeBranchId }).from(staffProfile).where(eq(staffProfile.userId, actor.id)),
        db.select({ b: userBranch.branchId }).from(userBranch).where(eq(userBranch.userId, actor.id)),
      ]);
      if ((home?.b ?? MAIN_BRANCH_ID) !== id && !rows.some((r) => r.b === id)) throw new UserError(`${b.name}에서 일할 권한이 없습니다. 대표에게 지점 권한을 부탁하세요`);
    }
  }
  await db
    .insert(userBranchPref)
    .values({ userId: actor.id, branchId: id || null, updatedAt: now })
    .onConflictDoUpdate({ target: userBranchPref.userId, set: { branchId: id || null, updatedAt: now } });
}

/** 목록 거르기: 보는 지점이 있으면 그 지점 줄만 */
export function inView<T extends { branchId?: string | null }>(rows: T[], viewBranchId: string | null | undefined): T[] {
  if (!viewBranchId) return rows;
  return rows.filter((r) => !r.branchId || r.branchId === viewBranchId);
}

// ── 설정 › 본점·지점(2단계): 지점 등록·수정·문 닫기, 직원 소속·지점별 역할 ──

export type BranchInput = {
  name: string;
  code: string;
  bizNo: string;
  subBizNo: string;
  repairRegNo: string;
  zip: string;
  address: string;
  addressDetail: string;
  phone: string;
  openedOn: string;
  closedOn: string;
};

function cleanBranch(i: BranchInput) {
  const name = i.name.trim().replace(/\s+/g, " ");
  if (!name) throw new UserError("지점 이름을 적어 주세요(예: 서구점)");
  if (name.length > 20) throw new UserError("지점 이름은 20자까지입니다");
  const code = i.code.trim().toUpperCase();
  if (code && !/^[A-Z]{1,2}$/.test(code)) throw new UserError("지점 코드는 영문 1~2자입니다(예: S)");
  const subBizNo = i.subBizNo.replace(/\D/g, "");
  if (subBizNo && subBizNo.length !== 4) throw new UserError("종사업장 번호는 4자리 숫자입니다(예: 0001)");
  const bizNo = i.bizNo.trim() ? formatBizNo(i.bizNo.trim()) : "";
  if (bizNo && !validBizNo(bizNo)) throw new UserError("사업자등록번호 10자리를 다시 확인해 주세요");
  const d = (v: string) => (v.trim() && /^\d{4}-\d{2}-\d{2}$/.test(v.trim()) ? v.trim() : null);
  return {
    name,
    code,
    bizNo,
    subBizNo,
    repairRegNo: i.repairRegNo.trim(),
    zip: i.zip.trim(),
    address: i.address.trim(),
    addressDetail: i.addressDetail.trim(),
    phone: i.phone.trim(),
    openedOn: d(i.openedOn),
    closedOn: d(i.closedOn),
  };
}

async function checkBranchUnique(db: Db, v: { name: string; code: string }, exceptId?: string) {
  const rows = await db.select({ id: branch.id, name: branch.name, code: branch.code }).from(branch);
  for (const r of rows) {
    if (r.id === exceptId) continue;
    if (r.name === v.name) throw new UserError(`'${v.name}' 지점이 이미 있습니다`);
    if (v.code && r.code === v.code) throw new UserError(`지점 코드 '${v.code}'는 ${r.name}이(가) 씁니다. 다른 글자를 고르세요`);
  }
}

export async function createBranch(db: Db, actor: Actor, input: BranchInput) {
  if (!can(actor, "settings.edit")) throw new UserError("지점은 대표가 등록합니다");
  const v = cleanBranch(input);
  if (!v.code) throw new UserError("지점 코드(영문 1~2자)를 정해 주세요. 이 지점 서류 번호에 붙습니다(예: RO-S2611-0001)");
  if (v.closedOn) throw new UserError("새 지점에는 문 닫은 날을 넣지 않습니다");
  await checkBranchUnique(db, v);
  const n = (await db.select({ id: branch.id }).from(branch)).length;
  const [row] = await db.insert(branch).values({ ...v, sortOrder: n * 10 }).returning({ id: branch.id });
  await writeAudit(db, { actorId: actor.id, action: "branch.create", entityType: "branch", entityId: row.id, after: v });
  return row.id;
}

export async function updateBranch(db: Db, actor: Actor, id: string, input: BranchInput) {
  if (!can(actor, "settings.edit")) throw new UserError("지점은 대표가 고칩니다");
  const [before] = await db.select().from(branch).where(eq(branch.id, id));
  if (!before) throw new UserError("지점을 찾을 수 없습니다");
  const v = cleanBranch(input);
  if (before.isMain) {
    // 본점의 사업장 정보는 설정 › 사업장 정보가 원본이다(법정 서식). 여기서는 이름만
    if (v.closedOn) throw new UserError("본점은 문을 닫을 수 없습니다");
    await checkBranchUnique(db, { name: v.name, code: "" }, id);
    await db.update(branch).set({ name: v.name }).where(eq(branch.id, id));
  } else {
    if (!v.code) throw new UserError("지점 코드는 비울 수 없습니다");
    await checkBranchUnique(db, v, id);
    if (v.closedOn && !before.closedOn) {
      const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(repairOrder).where(and(eq(repairOrder.branchId, id), notInArray(repairOrder.status, ["delivered", "cancelled"])));
      if (n > 0) throw new UserError(`이 지점에 아직 출고하지 않은 수리 건이 ${n}건 있습니다. 출고하거나 다른 지점으로 옮긴 뒤 문을 닫습니다`);
    }
    await db.update(branch).set(v).where(eq(branch.id, id));
  }
  await writeAudit(db, { actorId: actor.id, action: "branch.update", entityType: "branch", entityId: id, before: { name: before.name, code: before.code, closedOn: before.closedOn }, after: v });
}

/** 지점 서류에 찍는 사업장 정보: 본점은 설정 › 사업장 정보, 지점은 지점 값(빈 칸은 본점 값) */
export async function branchShopInfo(db: Db, branchId: string | null | undefined): Promise<ShopInfo & { branchName: string | null }> {
  const shop = await loadShopInfo(db);
  if (!branchId || branchId === MAIN_BRANCH_ID) return { ...shop, branchName: null };
  const [b] = await db.select().from(branch).where(eq(branch.id, branchId));
  if (!b || b.isMain) return { ...shop, branchName: null };
  return {
    ...shop,
    name: `${shop.name} ${b.name}`,
    bizNo: b.bizNo || shop.bizNo,
    repairRegNo: b.repairRegNo || shop.repairRegNo,
    zip: b.address ? b.zip : shop.zip,
    address: b.address || shop.address,
    addressDetail: b.address ? b.addressDetail : shop.addressDetail,
    phone: b.phone || shop.phone,
    sealPath: b.sealPath || shop.sealPath,
    branchName: b.name,
  };
}

/** 직원 소속 지점과 다른 지점에서의 역할. access 값: 'same' = 원래 역할 그대로, 역할 목록 = 그 지점에서는 이 역할, 없음 = 못 들어감 */
export async function setUserBranches(db: Db, actor: Actor, userId: string, input: { homeBranchId: string; access: Record<string, "same" | string[]> }) {
  if (!can(actor, "settings.edit")) throw new UserError("직원 지점은 대표가 정합니다");
  const all = await listBranches(db);
  if (!all.some((b) => b.id === input.homeBranchId && !b.closedOn)) throw new UserError("소속 지점을 골라 주세요");
  const rows: { userId: string; branchId: string; roles: string[] }[] = [];
  for (const [bid, v] of Object.entries(input.access)) {
    if (bid === input.homeBranchId || !all.some((b) => b.id === bid)) continue;
    const roles = v === "same" ? [] : v.filter((r) => (ROLE_VALUES as readonly string[]).includes(r) && r !== "owner");
    if (v !== "same" && !roles.length) continue;
    rows.push({ userId, branchId: bid, roles });
  }
  await db.transaction(async (tx) => {
    await tx.insert(staffProfile).values({ userId, homeBranchId: input.homeBranchId }).onConflictDoUpdate({ target: staffProfile.userId, set: { homeBranchId: input.homeBranchId } });
    await tx.delete(userBranch).where(eq(userBranch.userId, userId));
    if (rows.length) await tx.insert(userBranch).values(rows);
    await writeAudit(tx, { actorId: actor.id, action: "branch.staff", entityType: "branch", entityId: userId, after: { home: input.homeBranchId, access: rows.map((r) => ({ b: r.branchId, roles: r.roles })) } });
  });
}

/** 설정 화면용: 직원마다 소속·다른 지점 역할 */
export async function staffBranches(db: Db) {
  const users = await db.select({ id: appUser.id, name: appUser.name }).from(appUser).where(eq(appUser.active, true)).orderBy(asc(appUser.name));
  const [profiles, rows] = await Promise.all([db.select({ userId: staffProfile.userId, home: staffProfile.homeBranchId }).from(staffProfile), db.select().from(userBranch)]);
  return users.map((u) => ({
    ...u,
    home: profiles.find((p) => p.userId === u.id)?.home ?? MAIN_BRANCH_ID,
    access: rows.filter((r) => r.userId === u.id).map((r) => ({ branchId: r.branchId, roles: r.roles })),
  }));
}
