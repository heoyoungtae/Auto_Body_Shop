// 세무 한도·급여 정책값 점검 기록(2026-11-22 대표 결정): 1월·7월에 '세무 한도'·'급여·4대보험' 분류를 점검하고,
// 12월에는 내년 4대보험·산재 요율(고시)을 확인한다. 점검 완료를 누르면 날짜·사람·세무사 확인 여부가 남는다.
import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { appConfig, appUser } from "@/db/schema";
import { writeAudit } from "./audit";
import { UserError } from "./errors";
import { POLICY_GROUPS, type PolicyGroup } from "./policy-meta";

const CFG = "policy.check";
export type GroupCheck = { on: string; by: string; byName: string; agent: boolean; note?: string };
type Cfg = Partial<Record<PolicyGroup, GroupCheck[]>>;

async function load(db: Db): Promise<Cfg> {
  const [r] = await db.select({ data: appConfig.data }).from(appConfig).where(eq(appConfig.key, CFG));
  return (r?.data ?? {}) as Cfg;
}

/** 분류별 마지막 점검 */
export async function lastChecks(db: Db) {
  const c = await load(db);
  return Object.fromEntries(Object.keys(POLICY_GROUPS).map((g) => [g, c[g as PolicyGroup]?.[0] ?? null])) as Record<PolicyGroup, GroupCheck | null>;
}

/** 점검 완료 기록(대표·회계) */
export async function recordCheck(db: Db, actor: { id: string; roles: string[] }, group: PolicyGroup, agent: boolean, note: string, today: string) {
  if (!actor.roles.includes("owner") && !actor.roles.includes("accounting")) throw new UserError("정책값 점검은 대표·회계 담당이 기록합니다");
  const c = await load(db);
  const [u] = await db.select({ name: appUser.name }).from(appUser).where(eq(appUser.id, actor.id));
  const row: GroupCheck = { on: today, by: actor.id, byName: u?.name ?? "", agent, ...(note.trim() ? { note: note.trim().slice(0, 200) } : {}) };
  const data = { ...c, [group]: [row, ...(c[group] ?? [])].slice(0, 20) };
  await db
    .insert(appConfig)
    .values({ key: CFG, data, updatedBy: actor.id, updatedAt: new Date() })
    .onConflictDoUpdate({ target: appConfig.key, set: { data, updatedBy: actor.id, updatedAt: new Date() } });
  await writeAudit(db, { actorId: actor.id, action: "policy.check", entityType: "policy", entityId: group, after: row });
}

/** 이번 점검 주기 시작일: 세무·급여는 반기(1/1·7/1), 12월은 내년 요율 확인 */
export function periodStart(today: string) {
  return `${today.slice(0, 4)}-${today.slice(5, 7) >= "07" ? "07" : "01"}-01`;
}

/** 대표·회계 할 일: 1월·7월 점검(그 반기에 기록이 없으면 그 달 안), 12월 내년 요율 확인 */
export async function policyCheckTodos(db: Db, actor: { roles: string[] }, today: string) {
  const out: { key: string; when: "today" | "soon"; what: string; detail: string; href: string; action: string }[] = [];
  if (!actor.roles.includes("owner") && !actor.roles.includes("accounting")) return out;
  const last = await lastChecks(db);
  const m = today.slice(5, 7);
  const half = m >= "07" ? "하반기" : "상반기";
  const start = periodStart(today);
  for (const g of ["tax", "payroll"] as const) {
    if ((m === "01" || m === "07") && !(last[g] && last[g]!.on >= start))
      out.push({
        key: `policy-check-${g}-${start}`,
        when: today.slice(8) >= "15" ? "today" : "soon",
        what: `${today.slice(0, 4)} ${half} ${POLICY_GROUPS[g]} 점검`,
        detail: "법정 값이 지금 법령과 맞는지 보고 '점검 완료'를 누릅니다(세무사 확인이면 표시)",
        href: `/settings/policies?g=${g}`,
        action: "점검",
      });
  }
  if (m === "12" && !(last.payroll && last.payroll.on >= `${today.slice(0, 4)}-12-01`))
    out.push({
      key: `policy-rates-${today.slice(0, 4)}`,
      when: today.slice(8) >= "20" ? "today" : "soon",
      what: `내년(${Number(today.slice(0, 4)) + 1}년) 4대보험·산재 요율 확인`,
      detail: "요율은 고시로 정해져 법령 연결로 잡히지 않습니다. 새 요율을 시행일 1월 1일로 넣고 '점검 완료'를 누릅니다",
      href: "/settings/policies?g=payroll",
      action: "확인",
    });
  return out;
}
