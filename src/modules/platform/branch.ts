// 본점·지점·작업장(대표 결정 2026-11-19, 1단계). 지점은 아직 본점 하나뿐이라 지점을 고르는 화면은 없다.
// 작업장은 같은 부지 안의 현장 위치(판금동·도장 부스·부품 창고 등). 설정 › 작업장에서 공장장·대표가 관리한다.
import { and, asc, eq, ne } from "drizzle-orm";
import type { Db } from "@/db/client";
import { appUser, branch, MAIN_BRANCH_ID, WORKPLACE_KINDS, workplace, type WorkplaceKind } from "@/db/schema";
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
