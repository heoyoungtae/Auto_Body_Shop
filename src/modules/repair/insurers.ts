// 보험사 목록(AOS 보험사설정 참고, 대표 결정 2026-11-23): 보험사·공제조합·렌터카, 보험사별 시간당 공임(계약 단가)·부품 할인율·보상 담당자.
// 보험 청구의 보험사 칸이 이 목록을 쓰고, 보험 견적은 그 보험사의 시간당 공임으로 계산한다(비우면 공임 기준표 값).
// 'AOS 씀' 설정도 여기서 읽는다. AOS를 쓰지 않아도 앱의 어떤 일도 막지 않는다(대표 2026-11-24).
import { rolesFor } from "@/modules/auth/permissions";
import { asc, eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { appConfig, insurer, repairOrder, type InsurerContact } from "@/db/schema";
import type { Role } from "@/modules/auth/roles";
import { writeAudit } from "@/modules/platform/audit";
import { UserError } from "@/modules/platform/errors";
import { seoulDate } from "@/modules/platform/time";
import { loadLabor } from "./labor-store";
import type { LaborTable } from "./labor";

export class InsurerError extends UserError {}
type Actor = { id: string; roles: Role[] };

export const INSURER_KIND_LABEL = { insurer: "보험사", mutual: "공제조합", rental: "렌터카" } as const;
export const isInsurerKind = (s: string): s is keyof typeof INSURER_KIND_LABEL => s in INSURER_KIND_LABEL;

/** 0.1% 단위 정수 → 화면 글자(25 → '2.5') */
export const pctText = (x10: number | null | undefined) => (x10 == null ? "" : String(x10 / 10));
/** 화면 글자 → 0.1% 단위 정수('2.5' → 25). 빈 값은 null */
export function parsePct(s: string): number | null {
  const t = s.trim().replace("%", "");
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0 || n > 50) throw new InsurerError("부품 할인율은 0~50% 사이 숫자입니다(예: 2.5)");
  return Math.round(n * 10);
}

export async function listInsurers(db: Db, opts: { activeOnly?: boolean } = {}) {
  const rows = await db.select().from(insurer).orderBy(asc(insurer.kind), asc(insurer.name));
  return opts.activeOnly ? rows.filter((r) => r.active) : rows;
}

/** 이름으로 찾기(띄어쓰기·대소문자 무시) */
export async function insurerByName(db: Db, name: string | null | undefined) {
  const key = (name ?? "").replace(/\s/g, "").toLowerCase();
  if (!key) return null;
  return (await listInsurers(db)).find((r) => r.name.replace(/\s/g, "").toLowerCase() === key) ?? null;
}

export type InsurerInput = { id?: string; name: string; kind: string; rateWon: number | null; partsDiscount: string; note: string; active: boolean; contacts: InsurerContact[] };

/**
 * 저장. 이름·구분·담당자는 보험 접수하는 사람(상담원·공장장·대표)이, 계약 단가·할인율은 돈에 닿으므로 대표만 바꾼다.
 */
export async function saveInsurer(db: Db, actor: Actor, input: InsurerInput, now = new Date()) {
  const desk = actor.roles.some((r) => rolesFor("claim.desk").includes(r));
  const boss = actor.roles.some((r) => rolesFor("settings.edit").includes(r));
  if (!desk && !boss) throw new InsurerError("보험사 목록은 상담원·공장장·대표가 고칩니다");
  const name = input.name.trim();
  if (!name) throw new InsurerError("보험사 이름을 적어 주세요");
  if (name.length > 30) throw new InsurerError("보험사 이름은 30자까지입니다");
  if (!isInsurerKind(input.kind)) throw new InsurerError("구분(보험사·공제조합·렌터카)을 골라 주세요");
  if (input.rateWon != null && (input.rateWon < 10_000 || input.rateWon > 200_000)) throw new InsurerError("시간당 공임은 1만~20만 원 사이로 적어 주세요");
  const pct = parsePct(input.partsDiscount);
  const contacts = input.contacts
    .map((c) => ({ name: c.name.trim(), role: c.role?.trim() || undefined, phone: c.phone?.trim() || undefined, email: c.email?.trim() || undefined }))
    .filter((c) => c.name);
  const old = input.id ? (await db.select().from(insurer).where(eq(insurer.id, input.id)))[0] : null;
  if (input.id && !old) throw new InsurerError("없는 보험사입니다");
  const dup = await insurerByName(db, name);
  if (dup && dup.id !== old?.id) throw new InsurerError(`'${dup.name}'은 이미 목록에 있습니다`);
  const moneyChanged = old ? old.rateWon !== input.rateWon || old.partsDiscountX10 !== pct : input.rateWon != null || pct != null;
  if (moneyChanged && !boss) throw new InsurerError("시간당 공임·부품 할인율은 대표만 바꿉니다. 나머지 칸만 고쳐 저장해 주세요");
  const values = { name, kind: input.kind, rateWon: input.rateWon, partsDiscountX10: pct, contacts, note: input.note.trim() || null, active: input.active, updatedAt: now };
  let id = old?.id;
  if (old) await db.update(insurer).set(values).where(eq(insurer.id, old.id));
  else id = (await db.insert(insurer).values(values).returning({ id: insurer.id }))[0].id;
  await writeAudit(db, { actorId: actor.id, action: old ? "insurer.update" : "insurer.create", entityType: "insurer", entityId: name, before: old ? { rateWon: old.rateWon, partsDiscountX10: old.partsDiscountX10, active: old.active } : undefined, after: { rateWon: input.rateWon, partsDiscountX10: pct, active: input.active } });
  return id!;
}

/**
 * 수리 건의 공임 계산표. 보험 건이고 보험사 목록에 계약 시간당 공임이 있으면 그 값을 쓴다(AOS 보험사별 M/H).
 */
export async function laborForRo(db: Db, roId: string, now = new Date()): Promise<LaborTable & { _insurerRate?: number }> {
  const t = await loadLabor(db, seoulDate(now));
  const [r] = await db.select({ insurance: repairOrder.insurance, insurer: repairOrder.insurer }).from(repairOrder).where(eq(repairOrder.id, roId));
  if (!r || r.insurance === "self") return t;
  const ins = await insurerByName(db, r.insurer);
  return ins?.active && ins.rateWon ? { ...t, RATE: ins.rateWon, _insurerRate: ins.rateWon } : t;
}

// ── 'AOS 씀' 설정(설정 › 보험사·AOS). 꺼져 있으면 AOS 칸·AOS 할 일이 보이지 않는다
const AOS_KEY = "aos";
export async function aosEnabled(db: Db): Promise<boolean> {
  const [r] = await db.select({ data: appConfig.data }).from(appConfig).where(eq(appConfig.key, AOS_KEY));
  return !!(r?.data as { enabled?: boolean } | undefined)?.enabled;
}
export async function setAosEnabled(db: Db, actor: Actor, enabled: boolean, now = new Date()) {
  if (!actor.roles.some((r) => rolesFor("settings.edit").includes(r))) throw new InsurerError("AOS 사용 여부는 대표가 정합니다");
  await db
    .insert(appConfig)
    .values({ key: AOS_KEY, data: { enabled }, updatedBy: actor.id, updatedAt: now })
    .onConflictDoUpdate({ target: appConfig.key, set: { data: { enabled }, updatedBy: actor.id, updatedAt: now } });
  await writeAudit(db, { actorId: actor.id, action: "aos.setting", entityType: "app_config", entityId: AOS_KEY, after: { enabled } });
}
