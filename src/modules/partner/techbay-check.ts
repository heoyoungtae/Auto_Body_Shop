// 테크베이 작업 내용 확인(입고로 넘길 때). 대표 결정 2026-11-22.
// 테크베이에서 불러온 상담을 입고하면 먼저 작업 항목을 줄마다 풀어 보여 주고(techbay-items), 직원이 △·✕ 줄을 모두 정리해야 입고된다.
// 확인한 결과는 portal_order.checked 에 남고(누가·언제·줄마다), 상담의 손상 부위 글·그림·손상 유형·예비 판단을 채운다.
// 입고 도면의 수리 대상(O)은 상담 그림에서 넘어가고, 진단 줄은 요청 한 줄마다 따로 만든다(seedFromCheck).
import { and, eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { appConfig, consultation, portalOrder, vehicle } from "@/db/schema";
import { can } from "@/modules/auth/permissions";
import type { Role } from "@/modules/auth/roles";
import { writeAudit } from "@/modules/platform/audit";
import { UserError } from "@/modules/platform/errors";
import { carOf, type CarLook } from "@/modules/repair/body-map";
import {
  type CheckedLine,
  checkCount,
  checkText,
  cleanWords,
  KIND_CONSULT,
  type LineDecision,
  parseOrderItems,
  REQ_METHOD_CONSULT,
  resolveCheck,
  type Word,
  wordFrom,
  zonesOfCheck,
} from "./techbay-items";

export class TechbayCheckError extends UserError {}
type Actor = { id: string; roles: readonly Role[] };
const WORDS = "techbay.words";
const WORD_MAX = 200;

export async function loadWords(db: Db): Promise<Word[]> {
  const [c] = await db.select().from(appConfig).where(eq(appConfig.key, WORDS));
  return cleanWords((c?.data as { list?: unknown } | undefined)?.list);
}
async function saveWords(db: Db, list: Word[], by: string) {
  const data = { list: list.slice(-WORD_MAX) };
  await db.insert(appConfig).values({ key: WORDS, data, updatedBy: by, updatedAt: new Date() }).onConflictDoUpdate({ target: appConfig.key, set: { data, updatedBy: by, updatedAt: new Date() } });
}

/** 설정 › 차 부위에서 기억한 말 지우기(공장장·대표) */
export async function removeWord(db: Db, actor: Actor, word: string) {
  if (!can(actor, "diag.confirm")) throw new TechbayCheckError("기억한 말은 공장장·대표가 지웁니다");
  const before = await loadWords(db);
  const list = before.filter((w) => w.word !== word);
  if (list.length === before.length) throw new TechbayCheckError("없는 말입니다");
  await saveWords(db, list, actor.id);
  await writeAudit(db, { actorId: actor.id, action: "techbay.word_remove", entityType: "app_config", entityId: WORDS, before: before.find((w) => w.word === word) });
}

type Items = { type: string; content: string }[];
const itemsOf = (payload: unknown): Items => {
  const it = (payload as { items?: unknown } | null)?.items;
  return Array.isArray(it) ? it.filter((x): x is Items[number] => typeof x?.content === "string" && !!x.content.trim()).map((x) => ({ type: String(x.type ?? ""), content: x.content.trim() })) : [];
};
async function orderOf(db: Db, consultationId: string) {
  const [o] = await db.select().from(portalOrder).where(and(eq(portalOrder.consultationId, consultationId), eq(portalOrder.platform, "techbay")));
  return o ?? null;
}

/** 입고 전에 작업 내용 확인이 필요한가(테크베이 주문이고, 작업 항목이 있고, 아직 확인 안 함) */
export async function needsTechbayCheck(db: Db, consultationId: string) {
  const o = await orderOf(db, consultationId);
  return !!o && !o.checked && itemsOf(o.payload).length > 0;
}

/** 확인 화면 값: 줄마다 풀이, 차 모양, 기억한 말 */
export async function techbayCheckView(db: Db, consultationId: string) {
  const o = await orderOf(db, consultationId);
  if (!o) return null;
  const [c] = await db.select().from(consultation).where(eq(consultation.id, consultationId));
  if (!c) return null;
  const [v] = c.vehicleId ? await db.select().from(vehicle).where(eq(vehicle.id, c.vehicleId)) : [];
  const car: CarLook = carOf(v);
  const words = await loadWords(db);
  const items = itemsOf(o.payload);
  return { order: o, consult: c, plateNo: v?.plateNo ?? o.plateNo ?? "", car, words, items, lines: parseOrderItems(items, words, car.body), checked: o.checked as { at: string; by: string; lines: CheckedLine[] } | null };
}

/**
 * 확인 마치기: 줄마다 고른 것을 서버에서 다시 풀어 보고, 남은 줄이 있으면 막는다.
 * remember: 고쳐 적어 알아본 줄 가운데 '다음부터 이렇게 알아듣기'를 고른 줄 번호.
 */
export async function confirmTechbayCheck(db: Db, actor: Actor, consultationId: string, decisions: Record<number, LineDecision>, remember: number[] = [], now = new Date()) {
  if (!can(actor, "consult.write") && !can(actor, "repair.write")) throw new TechbayCheckError("상담·입고를 하는 사람만 확인합니다");
  const view = await techbayCheckView(db, consultationId);
  if (!view) throw new TechbayCheckError("테크베이 주문과 이어진 상담이 아닙니다");
  if (view.consult.result === "converted") throw new TechbayCheckError("이미 입고한 상담입니다");
  const r = resolveCheck(view.items, decisions, view.words, view.car.body);
  if (r.open.length) throw new TechbayCheckError(`아직 정리하지 않은 줄이 있습니다: ${r.open.map((o) => `${o.no}번(${o.why})`).join(", ")}`);
  // 다음부터 알아듣기: 고쳐 적어서 알아본 줄만
  const learned: Word[] = [];
  for (const no of remember) {
    const l = r.lines.find((x) => x.no === no);
    if (!l || l.skip || !l.items.length || l.read === l.text) continue;
    const w = wordFrom(l.text, l.items);
    if (w) learned.push(w);
  }
  if (learned.length) await saveWords(db, cleanWords([...view.words.filter((w) => !learned.some((x) => x.word === w.word)), ...learned]), actor.id);
  const zones = zonesOfCheck(r.lines, view.car.body);
  const text = checkText(r.lines);
  const c = view.consult;
  const types = [...new Set([...c.damageTypes, ...zones.map((z) => KIND_CONSULT[z.kind])])];
  const methods = [...new Set([...c.methods, ...r.lines.flatMap((l) => (l.method ? [REQ_METHOD_CONSULT[l.method]] : []))])];
  await db
    .update(consultation)
    .set({ damageZones: zones, damageParts: text || c.damageParts, damageTypes: types, methods, updatedAt: now })
    .where(eq(consultation.id, consultationId));
  const checked = { at: now.toISOString(), by: actor.id, lines: r.lines };
  await db.update(portalOrder).set({ checked }).where(eq(portalOrder.id, view.order.id));
  const n = checkCount(r.lines);
  await writeAudit(db, { actorId: actor.id, action: "techbay.check", entityType: "consultation", entityId: c.docNo, after: { ...n, learned: learned.map((w) => w.word) } });
  return { ...n, learned: learned.length };
}

/** 진단 줄 미리 만들기용: 확인한 줄(입고 전 확인을 마친 테크베이 주문만) */
export async function checkedLines(db: Db, consultationId: string): Promise<CheckedLine[] | null> {
  const o = await orderOf(db, consultationId);
  const lines = (o?.checked as { lines?: CheckedLine[] } | null)?.lines;
  return Array.isArray(lines) ? lines : null;
}
