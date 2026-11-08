// 전결 규정 — 사내 표준서 부록 B. 표는 데이터이고, 업무와 금액(또는 비율)으로 최종 승인 역할을 찾는다(앱 설계서 8.3).
// 기본값은 표준서의 제안값이다. 대표가 설정에서 업무별 구간을 통째로 바꾸면 delegation_rule 에 새 시행분이 쌓인다.
import { UserError } from "@/modules/platform/errors";
import { and, desc, eq, lte } from "drizzle-orm";
import type { Db } from "@/db/client";
import { delegationRule } from "@/db/schema";
import { ROLE_LABEL, type Role } from "../auth/roles";
import { writeAudit } from "./audit";
import { seoulDate } from "./time";

export type Band = { upTo: number | null; role: Role };
type TaskDef = { label: string; unit: "원" | "%" | null; bands: Band[]; note?: string };

/** 금액은 부가세 포함 원, 할인은 % */
export const DEFAULT_DELEGATION = {
  estimate: { label: "견적 승인(내부)", unit: "원", bands: [{ upTo: 2_000_000, role: "plant_manager" }, { upTo: null, role: "owner" }] },
  discount: { label: "할인", unit: "%", bands: [{ upTo: 5, role: "advisor" }, { upTo: 10, role: "plant_manager" }, { upTo: null, role: "owner" }] },
  purchase: { label: "발주·외주", unit: "원", bands: [{ upTo: 500_000, role: "plant_manager" }, { upTo: null, role: "owner" }] },
  expense: { label: "일반 지출", unit: "원", bands: [{ upTo: 100_000, role: "advisor" }, { upTo: 300_000, role: "plant_manager" }, { upTo: null, role: "owner" }] },
  compensation: { label: "불만 보상·환불", unit: null, bands: [{ upTo: null, role: "owner" }] },
  supplier: { label: "협력업체 등록·중단", unit: null, bands: [{ upTo: null, role: "owner" }], note: "공장장 제안" },
  revision: { label: "표준서·정책값 개정", unit: null, bands: [{ upTo: null, role: "owner" }], note: "공장장 제안" },
  overtime: { label: "연장·휴일 근로·휴가", unit: null, bands: [{ upTo: null, role: "plant_manager" }], note: "공장장 본인 건은 대표" },
  payroll: { label: "급여·퇴직금 지급, 임금 조정", unit: null, bands: [{ upTo: null, role: "owner" }], note: "회계 담당 기안" },
} satisfies Record<string, TaskDef>;

export type DelegationTask = keyof typeof DEFAULT_DELEGATION;
export const DELEGATION_TASKS = Object.keys(DEFAULT_DELEGATION) as DelegationTask[];
export const isDelegationTask = (t: string): t is DelegationTask => t in DEFAULT_DELEGATION;

/** 역할 서열: 본인 건을 위로 올릴 때 쓴다 */
const RANK: Role[] = ["advisor", "technician", "quality", "safety", "accounting", "plant_manager", "owner"];

export async function loadBands(db: Db, task: DelegationTask, onDate = seoulDate()): Promise<Band[]> {
  const [latest] = await db
    .select({ effectiveFrom: delegationRule.effectiveFrom, createdAt: delegationRule.createdAt })
    .from(delegationRule)
    .where(and(eq(delegationRule.task, task), lte(delegationRule.effectiveFrom, onDate)))
    .orderBy(desc(delegationRule.effectiveFrom), desc(delegationRule.createdAt))
    .limit(1);
  if (!latest) return DEFAULT_DELEGATION[task].bands as Band[];
  const rows = await db
    .select()
    .from(delegationRule)
    .where(and(eq(delegationRule.task, task), eq(delegationRule.effectiveFrom, latest.effectiveFrom), eq(delegationRule.createdAt, latest.createdAt)))
    .orderBy(delegationRule.seq);
  return rows.map((r) => ({ upTo: r.upTo, role: r.approverRole }));
}

/**
 * 최종 승인 역할. amount 가 구간 상한 이하인 첫 줄. 기안자 본인이 그 역할이면(대표 제외) 한 단계 위 역할로 올린다
 * (부록 B "공장장 본인 건은 대표").
 */
export function pickApprover(bands: Band[], amount: number | null, drafterRoles: Role[] = []): Role {
  const band = bands.find((b) => b.upTo == null || (amount ?? 0) <= b.upTo) ?? bands[bands.length - 1];
  let role = band.role;
  while (role !== "owner" && drafterRoles.includes(role)) {
    const higher = bands.find((b) => RANK.indexOf(b.role) > RANK.indexOf(role));
    role = higher ? higher.role : "owner";
  }
  return role;
}

export async function resolveApprover(db: Db, task: DelegationTask, amount: number | null, drafterRoles: Role[] = [], onDate = seoulDate()) {
  return pickApprover(await loadBands(db, task, onDate), amount, drafterRoles);
}

export class DelegationError extends UserError {}

export function validateBands(bands: Band[]): void {
  if (!bands.length) throw new DelegationError("구간이 없습니다");
  bands.forEach((b, i) => {
    const last = i === bands.length - 1;
    if (last && b.upTo != null) throw new DelegationError("마지막 구간은 상한이 없어야 합니다");
    if (!last && (b.upTo == null || !Number.isInteger(b.upTo) || b.upTo < 0)) throw new DelegationError("구간 상한을 확인해 주세요");
    if (i > 0 && !last && (b.upTo as number) <= (bands[i - 1].upTo as number)) throw new DelegationError("구간 상한은 커지는 순서여야 합니다");
    if (i > 0 && RANK.indexOf(b.role) <= RANK.indexOf(bands[i - 1].role)) throw new DelegationError(`${ROLE_LABEL[b.role]}: 아래 구간보다 높은 역할이어야 합니다`);
  });
}

export async function changeBands(
  db: Db,
  actorId: string,
  task: DelegationTask,
  bands: Band[],
  effectiveFrom: string,
  revisionRequestNo: string | null,
  today = seoulDate(),
) {
  validateBands(bands);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom) || effectiveFrom < today) throw new DelegationError("시행일은 오늘 이후 날짜여야 합니다");
  const before = await loadBands(db, task, effectiveFrom);
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx.insert(delegationRule).values(
      bands.map((b, i) => ({ task, upTo: b.upTo, approverRole: b.role, seq: i, effectiveFrom, revisionRequestNo, changedBy: actorId, createdAt: now })),
    );
    await writeAudit(tx, { actorId, action: "delegation.change", entityType: "delegation", entityId: task, before, after: { bands, effectiveFrom, revisionRequestNo } });
  });
}
