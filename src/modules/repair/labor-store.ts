// 공임 기준표 읽기·바꾸기. 정책값과 같은 이력 표(policy_setting)에 'labor:코드' 키로 쌓는다(시행일·사유·근거 번호).
// 정비소가 더한 항목은 app_config 'labor_custom', 견적 고르기에서 숨긴 항목은 'labor_hidden' 에 둔다.
import { and, desc, eq, like, lte } from "drizzle-orm";
import type { Db } from "@/db/client";
import { appConfig, appUser, policySetting } from "@/db/schema";
import { writeAudit } from "@/modules/platform/audit";
import { UserError } from "@/modules/platform/errors";
import { seoulDate } from "@/modules/platform/time";
import { LABOR_CATS, LABOR_DEFAULTS, LABOR_LOCKED, type LaborCat, type LaborDef, type LaborTable } from "./labor";

const K = (code: string) => `labor:${code}`;

const CUSTOM = "labor_custom";
const HIDDEN = "labor_hidden";

async function cfg<T>(db: Db, key: string, fallback: T): Promise<T> {
  const [r] = await db.select({ data: appConfig.data }).from(appConfig).where(eq(appConfig.key, key));
  return (r?.data as T) ?? fallback;
}
async function putCfg(db: Db, key: string, data: unknown, actorId: string) {
  await db
    .insert(appConfig)
    .values({ key, data, updatedBy: actorId, updatedAt: new Date() })
    .onConflictDoUpdate({ target: appConfig.key, set: { data, updatedBy: actorId, updatedAt: new Date() } });
}

const customItems = (db: Db) => cfg<LaborDef[]>(db, CUSTOM, []);

/** 기준표 전체: 기본 항목 + 정비소가 더한 항목, 숨김 여부 */
export async function laborCatalog(db: Db): Promise<(LaborDef & { hidden: boolean })[]> {
  const [custom, hidden] = await Promise.all([customItems(db), cfg<string[]>(db, HIDDEN, [])]);
  return [...LABOR_DEFAULTS, ...custom.map((d) => ({ ...d, custom: true }))].map((d) => ({ ...d, hidden: hidden.includes(d.code) }));
}

export async function findLaborDef(db: Db, code: string): Promise<LaborDef | undefined> {
  return (await laborCatalog(db)).find((d) => d.code === code);
}

export async function loadLabor(db: Db, onDate = seoulDate()): Promise<LaborTable> {
  const rows = await db
    .select({ key: policySetting.key, value: policySetting.value })
    .from(policySetting)
    .where(and(like(policySetting.key, "labor:%"), lte(policySetting.effectiveFrom, onDate)))
    .orderBy(policySetting.effectiveFrom, policySetting.createdAt);
  const t: LaborTable = Object.fromEntries([...LABOR_DEFAULTS, ...(await customItems(db))].map((d) => [d.code, d.value]));
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
  const def = await findLaborDef(db, input.code);
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

export type NewLaborItem = { section: string; name: string; kind: string; cat: string; value: number; hint?: string };

/** 항목 더하기(대표). 코드는 U-001 순서로 붙인다. 처음 값이 곧 기준값이고, 바꾸면 이력이 남는다 */
export async function addLaborItem(db: Db, actorId: string, input: NewLaborItem): Promise<string> {
  const section = input.section.trim();
  const name = input.name.trim();
  if (!section) throw new UserError("구분(어느 묶음에 넣을지)을 적거나 골라 주세요");
  if (!name) throw new UserError("항목 이름을 적어 주세요");
  if (input.kind !== "hours" && input.kind !== "price") throw new UserError("값의 종류(표준 시간·고정 금액)를 골라 주세요");
  if (!LABOR_CATS.includes(input.cat as LaborCat)) throw new UserError("견적 줄 구분을 골라 주세요");
  if (!Number.isInteger(input.value) || input.value <= 0) throw new UserError("값은 1 이상의 정수로 적어 주세요");
  if (input.kind === "hours" && input.value > 6000) throw new UserError("표준 시간을 확인해 주세요(분 단위)");
  const all = await laborCatalog(db);
  if (all.some((d) => d.section === section && d.name === name)) throw new UserError(`'${section} › ${name}'은(는) 이미 있습니다. 값을 바꾸려면 그 항목의 '바꾸기'를 쓰세요`);
  const custom = await customItems(db);
  const n = custom.reduce((m, d) => Math.max(m, Number(d.code.slice(2)) || 0), 0) + 1;
  const item: LaborDef = { code: `U-${String(n).padStart(3, "0")}`, section, name, kind: input.kind, value: input.value, cat: input.cat as LaborCat, hint: input.hint?.trim() || undefined };
  await putCfg(db, CUSTOM, [...custom, item], actorId);
  await writeAudit(db, { actorId, action: "labor.add", entityType: "labor", entityId: item.code, after: item });
  return item.code;
}

/** 견적 고르기 목록에서 숨기기·다시 쓰기. 지우지 않으므로 이미 쓴 견적·이력은 그대로 */
export async function setLaborHidden(db: Db, actorId: string, code: string, hidden: boolean) {
  const def = await findLaborDef(db, code);
  if (!def) throw new UserError("없는 기준표 항목입니다");
  if (hidden && LABOR_LOCKED.has(code)) throw new UserError(`${def.name}은(는) 모든 견적 계산의 바탕이라 숨길 수 없습니다`);
  const list = await cfg<string[]>(db, HIDDEN, []);
  const next = hidden ? [...new Set([...list, code])] : list.filter((c) => c !== code);
  await putCfg(db, HIDDEN, next, actorId);
  await writeAudit(db, { actorId, action: hidden ? "labor.hide" : "labor.show", entityType: "labor", entityId: code });
}
