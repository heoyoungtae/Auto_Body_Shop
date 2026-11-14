// 세부 부위 더하기(설정 › 차 부위·세부 부위): 기본 목록(SUB_PARTS)에 없는 부품을 부위별로 더한다.
// 진단 화면의 '세부 부위' 칸 목록에 기본 목록 뒤로 붙는다. 공장장·대표가 바꾸고 감사 로그에 남는다.
import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { appConfig } from "@/db/schema";
import { can } from "@/modules/auth/permissions";
import type { Role } from "@/modules/auth/roles";
import { writeAudit } from "@/modules/platform/audit";
import { UserError } from "@/modules/platform/errors";
import { isPart, partLabel, SUB_PARTS } from "./body-map";

const KEY = "body.sub_parts";
export const SUB_PART_MAX = 30;
export type SubPartExtras = Record<string, string[]>;

/** 한 줄·쉼표로 나눈 글 → 이름 목록(기본 목록과 겹치는 것·같은 것은 뺀다) */
export function parseSubParts(part: string, raw: string): string[] {
  const base = new Set((SUB_PARTS[part] ?? []).map((s) => s.replace(/\s/g, "")));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of raw.split(/[\n,]+/)) {
    const v = x.trim().replace(/\s+/g, " ").slice(0, 40);
    const k = v.replace(/\s/g, "");
    if (!v || base.has(k) || seen.has(k)) continue;
    seen.add(k);
    out.push(v);
  }
  return out;
}

export async function loadSubParts(db: Db): Promise<SubPartExtras> {
  const [c] = await db.select().from(appConfig).where(eq(appConfig.key, KEY));
  const d = (c?.data ?? {}) as Record<string, unknown>;
  const out: SubPartExtras = {};
  for (const [k, v] of Object.entries(d)) if (isPart(k) && Array.isArray(v)) out[k] = v.filter((x): x is string => typeof x === "string");
  return out;
}

/** 기본 목록 + 더한 것 */
export const subPartsOf = (extras: SubPartExtras, part: string) => [...(SUB_PARTS[part] ?? []), ...(extras[part] ?? [])];

export async function saveSubParts(db: Db, actor: { id: string; roles: readonly Role[] }, part: string, raw: string) {
  if (!can(actor, "diag.confirm")) throw new UserError("세부 부위 목록은 공장장·대표가 바꿉니다");
  if (!isPart(part)) throw new UserError("부위를 골라 주세요");
  const list = parseSubParts(part, raw);
  if (list.length > SUB_PART_MAX) throw new UserError(`한 부위에 ${SUB_PART_MAX}개까지 더합니다`);
  const before = await loadSubParts(db);
  const data: SubPartExtras = { ...before };
  if (list.length) data[part] = list;
  else delete data[part];
  await db
    .insert(appConfig)
    .values({ key: KEY, data, updatedBy: actor.id, updatedAt: new Date() })
    .onConflictDoUpdate({ target: appConfig.key, set: { data, updatedBy: actor.id, updatedAt: new Date() } });
  await writeAudit(db, { actorId: actor.id, action: "repair.sub_parts", entityType: "app_config", entityId: KEY, before: { [part]: before[part] ?? [] }, after: { [part]: list } });
  return { label: partLabel(part), list };
}
