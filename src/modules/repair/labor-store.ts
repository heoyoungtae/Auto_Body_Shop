// 공임 기준표 읽기·바꾸기. 정책값과 같은 이력 표(policy_setting)에 'labor:코드' 키로 쌓는다(시행일·사유·근거 번호).
import { and, desc, eq, like, lte } from "drizzle-orm";
import type { Db } from "@/db/client";
import { appUser, policySetting } from "@/db/schema";
import { writeAudit } from "@/modules/platform/audit";
import { UserError } from "@/modules/platform/errors";
import { seoulDate } from "@/modules/platform/time";
import { defaultLaborTable, laborDef, type LaborTable } from "./labor";

const K = (code: string) => `labor:${code}`;

export async function loadLabor(db: Db, onDate = seoulDate()): Promise<LaborTable> {
  const rows = await db
    .select({ key: policySetting.key, value: policySetting.value })
    .from(policySetting)
    .where(and(like(policySetting.key, "labor:%"), lte(policySetting.effectiveFrom, onDate)))
    .orderBy(policySetting.effectiveFrom, policySetting.createdAt);
  const t = defaultLaborTable();
  for (const r of rows) {
    const code = r.key.slice(6);
    if (code in t && typeof r.value === "number") t[code] = r.value;
  }
  return t;
}

/** 바꾼 적이 있는 항목의 마지막 변경(표에 '바꿈' 표시) */
export async function laborChanges(db: Db) {
  return db
    .select({ key: policySetting.key, value: policySetting.value, effectiveFrom: policySetting.effectiveFrom, reason: policySetting.reason, by: appUser.name, at: policySetting.createdAt })
    .from(policySetting)
    .leftJoin(appUser, eq(appUser.id, policySetting.changedBy))
    .where(like(policySetting.key, "labor:%"))
    .orderBy(desc(policySetting.createdAt))
    .limit(100);
}

export async function changeLabor(db: Db, actorId: string, input: { code: string; value: number; effectiveFrom: string; reason: string; revisionRequestNo?: string }, today = seoulDate()) {
  const def = laborDef(input.code);
  if (!def) throw new UserError("없는 기준표 항목입니다");
  if (!Number.isInteger(input.value) || input.value < 0) throw new UserError(`${def.name}: 0 이상의 정수로 적어 주세요`);
  if (def.kind === "pct" && (input.value < 50 || input.value > 300)) throw new UserError(`${def.name}: 계수는 50~300% 사이로 적어 주세요`);
  if (def.kind === "hours" && input.value > 6000) throw new UserError(`${def.name}: 표준 시간을 확인해 주세요(분 단위)`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.effectiveFrom) || input.effectiveFrom < today) throw new UserError("시행일은 오늘 이후 날짜여야 합니다");
  if (!input.reason.trim()) throw new UserError("바꾸는 사유를 적어 주세요(예: 실제 작업 시간 반영)");
  const before = (await loadLabor(db, input.effectiveFrom))[input.code];
  if (before === input.value) throw new UserError("지금 값과 같습니다");
  await db.insert(policySetting).values({ key: K(input.code), value: input.value, effectiveFrom: input.effectiveFrom, reason: input.reason.trim(), revisionRequestNo: input.revisionRequestNo?.trim() || null, changedBy: actorId });
  await writeAudit(db, { actorId, action: "labor.change", entityType: "labor", entityId: input.code, before: { value: before }, after: { value: input.value, effectiveFrom: input.effectiveFrom } });
}
