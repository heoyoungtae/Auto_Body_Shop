// 개선 제안(STD-08 8.12, F-08-06 제안란)
// 15.1 누구나 제출(현재 문제·개선안·기대 효과·사진) → 15.2 공장장 14일 안에 채택·보류·불채택과 사유 회신
// → 15.3 채택안 실행, 효과 확인 뒤 표준서·지침서 개정(F-Q-05)으로 반영 → 15.4 12월 제안·채택 실적을 인사평가에 반영
import { and, desc, eq, gte, inArray, lt } from "drizzle-orm";
import type { Db } from "@/db/client";
import { appUser, suggestion } from "@/db/schema";
import { can } from "@/modules/auth/permissions";
import type { Role } from "@/modules/auth/roles";
import { writeAudit } from "@/modules/platform/audit";
import { nextDocNo } from "@/modules/platform/docno";
import { UserError } from "@/modules/platform/errors";
import { notifyRole, notifyUser } from "@/modules/platform/notify";
import { IMAGE_TYPES, MAX_IMAGE_BYTES, sniffImage, storeFile } from "@/modules/platform/storage";
import { addDays, seoulDate } from "@/modules/platform/time";
import { SG_DECISIONS, SG_REPLY_DAYS, type SgDecision } from "./rules";

export class SuggestionError extends UserError {}
type Actor = { id: string; roles: Role[] };
const clean = (s: string | null | undefined) => (s ?? "").trim() || null;

async function row(db: Db, id: string) {
  const [s] = await db.select().from(suggestion).where(eq(suggestion.id, id));
  if (!s) throw new SuggestionError("제안을 찾을 수 없습니다");
  return s;
}

export type SuggestionInput = { title: string; area: string; problem: string; proposal: string; effect: string };

function check(i: SuggestionInput) {
  if (!i.title.trim()) throw new SuggestionError("제목을 적어 주세요");
  if (!i.problem.trim()) throw new SuggestionError("지금 무엇이 문제인지 적어 주세요");
  if (!i.proposal.trim()) throw new SuggestionError("어떻게 바꾸면 좋을지 적어 주세요");
  return { title: i.title.trim(), area: clean(i.area), problem: i.problem.trim(), proposal: i.proposal.trim(), effect: clean(i.effect) };
}

/** 15.1 제출: 누구나. 공장장에게 알림, 회신 기한 14일 */
export async function submitSuggestion(db: Db, actor: Actor, input: SuggestionInput, now = new Date()) {
  const v = check(input);
  const docNo = await nextDocNo(db, "SG", now);
  const replyDue = addDays(seoulDate(now), SG_REPLY_DAYS);
  const [r] = await db.insert(suggestion).values({ ...v, docNo, proposerId: actor.id, replyDue, createdAt: now, updatedAt: now }).returning({ id: suggestion.id });
  await writeAudit(db, { actorId: actor.id, action: "suggestion.submit", entityType: "suggestion", entityId: docNo, after: { title: v.title } });
  await notifyRole(db, "plant_manager", `개선 제안: ${v.title} (${replyDue}까지 회신)`, `sg-new-${r.id}`, `/suggestions/${r.id}`);
  return { id: r.id, docNo };
}

/** 검토 전에는 제안자가 고칠 수 있다 */
export async function updateSuggestion(db: Db, actor: Actor, id: string, input: SuggestionInput, now = new Date()) {
  const s = await row(db, id);
  if (s.proposerId !== actor.id) throw new SuggestionError("제안한 사람만 고칩니다");
  if (s.status !== "submitted" && s.status !== "held") throw new SuggestionError("결정이 난 제안은 고칠 수 없습니다. 새로 제안해 주세요");
  await db.update(suggestion).set({ ...check(input), status: "submitted", updatedAt: now }).where(eq(suggestion.id, id));
}

export async function addSuggestionPhoto(db: Db, actor: Actor, id: string, bytes: Uint8Array) {
  const s = await row(db, id);
  if (s.proposerId !== actor.id && !can(actor, "suggest.decide")) throw new SuggestionError("제안자나 공장장이 사진을 올립니다");
  if (s.status === "rejected") throw new SuggestionError("불채택된 제안입니다");
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) throw new SuggestionError("사진이 비었거나 너무 큽니다(6MB까지)");
  const type = sniffImage(bytes);
  if (!type) throw new SuggestionError("사진 파일만 올릴 수 있습니다(JPG·PNG·WEBP)");
  if (s.photos.length >= 8) throw new SuggestionError("사진은 8장까지입니다");
  const path = await storeFile(`sg/${s.docNo}`, bytes, IMAGE_TYPES[type]);
  await db.update(suggestion).set({ photos: [...s.photos, path] }).where(eq(suggestion.id, id));
}

export async function removeSuggestionPhoto(db: Db, actor: Actor, id: string, path: string) {
  const s = await row(db, id);
  if (s.proposerId !== actor.id && !can(actor, "suggest.decide")) throw new SuggestionError("제안자나 공장장이 지웁니다");
  await db.update(suggestion).set({ photos: s.photos.filter((p) => p !== path) }).where(eq(suggestion.id, id));
}

/** 15.2 결정과 사유 회신(공장장). 제안자에게 알림 */
export async function decideSuggestion(db: Db, actor: Actor, id: string, input: { decision: string; reply: string }, now = new Date()) {
  if (!can(actor, "suggest.decide")) throw new SuggestionError("채택 여부는 공장장이 정합니다");
  const s = await row(db, id);
  if (s.status !== "submitted" && s.status !== "held") throw new SuggestionError("이미 결정한 제안입니다");
  if (!(input.decision in SG_DECISIONS)) throw new SuggestionError("채택·보류·불채택 중 하나를 골라 주세요");
  if (!input.reply.trim()) throw new SuggestionError("제안자에게 보낼 사유를 적어 주세요");
  const decision = input.decision as SgDecision;
  await db.update(suggestion).set({ status: decision, reply: input.reply.trim(), decidedBy: actor.id, decidedAt: now, updatedAt: now }).where(eq(suggestion.id, id));
  await writeAudit(db, { actorId: actor.id, action: `suggestion.${decision}`, entityType: "suggestion", entityId: s.docNo, after: { reply: input.reply.trim() } });
  await notifyUser(db, s.proposerId, `개선 제안 ${SG_DECISIONS[decision]}: ${s.title} — ${input.reply.trim()}`, `sg-decide-${id}-${now.getTime()}`, `/suggestions/${id}`);
}

/** 15.3 실행·효과 확인. 표준서·지침서를 바꿔야 하면 개정 요청(F-Q-05) 번호를 남긴다 */
export async function completeSuggestion(db: Db, actor: Actor, id: string, input: { doneNote: string; effectNote: string; revisionRef: string }, now = new Date()) {
  if (!can(actor, "suggest.decide")) throw new SuggestionError("실행·효과 확인은 공장장이 합니다");
  const s = await row(db, id);
  if (s.status !== "adopted") throw new SuggestionError("채택한 제안만 실행 완료로 바꿉니다");
  if (!input.doneNote.trim()) throw new SuggestionError("무엇을 어떻게 실행했는지 적어 주세요");
  if (!input.effectNote.trim()) throw new SuggestionError("효과를 확인한 결과를 적어 주세요(전후 비교)");
  await db
    .update(suggestion)
    .set({ status: "done", doneNote: input.doneNote.trim(), effectNote: input.effectNote.trim(), revisionRef: clean(input.revisionRef), doneBy: actor.id, doneAt: now, updatedAt: now })
    .where(eq(suggestion.id, id));
  await writeAudit(db, { actorId: actor.id, action: "suggestion.done", entityType: "suggestion", entityId: s.docNo, after: { revisionRef: clean(input.revisionRef) } });
  await notifyUser(db, s.proposerId, `개선 제안 실행 끝: ${s.title} — ${input.effectNote.trim()}`, `sg-done-${id}`, `/suggestions/${id}`);
}

export type SuggestionFilter = "open" | "mine" | "adopted" | "closed" | "all";

export async function listSuggestions(db: Db, actor: Actor, filter: SuggestionFilter = "open") {
  const rows = await db.select({ s: suggestion, proposer: appUser.name }).from(suggestion).innerJoin(appUser, eq(appUser.id, suggestion.proposerId)).orderBy(desc(suggestion.createdAt));
  return rows.filter(({ s }) =>
    filter === "all" ? true : filter === "mine" ? s.proposerId === actor.id : filter === "open" ? s.status === "submitted" || s.status === "held" : filter === "adopted" ? s.status === "adopted" : s.status === "done" || s.status === "rejected",
  );
}

export async function getSuggestion(db: Db, id: string) {
  const s = await row(db, id);
  const ids = [s.proposerId, s.decidedBy, s.doneBy].filter((x): x is string => !!x);
  const names = new Map((await db.select({ id: appUser.id, name: appUser.name }).from(appUser).where(inArray(appUser.id, ids))).map((u) => [u.id, u.name]));
  return { s, names };
}

/** 15.4 한 해의 사람별 제안·채택 실적(인사평가 F-11-06 에 반영) */
export async function suggestionStats(db: Db, year: number) {
  const from = new Date(`${year}-01-01T00:00:00+09:00`);
  const to = new Date(`${year + 1}-01-01T00:00:00+09:00`);
  const rows = await db.select({ s: suggestion, name: appUser.name }).from(suggestion).innerJoin(appUser, eq(appUser.id, suggestion.proposerId)).where(and(gte(suggestion.createdAt, from), lt(suggestion.createdAt, to)));
  const by = new Map<string, { name: string; total: number; adopted: number; done: number }>();
  for (const { s, name } of rows) {
    const x = by.get(s.proposerId) ?? { name, total: 0, adopted: 0, done: 0 };
    x.total++;
    if (s.status === "adopted" || s.status === "done") x.adopted++;
    if (s.status === "done") x.done++;
    by.set(s.proposerId, x);
  }
  return [...by.entries()].map(([id, v]) => ({ id, ...v })).sort((a, b) => b.adopted - a.adopted || b.total - a.total);
}

/** 내 할 일: 공장장 회신(14일 기한)·채택안 실행 */
export async function suggestionTodos(db: Db, actor: Actor, today: string) {
  const out: { key: string; when: "late" | "today" | "soon"; what: string; detail?: string; href: string; action: string }[] = [];
  if (!can(actor, "suggest.decide") || actor.roles.includes("owner")) return out;
  const rows = await db.select().from(suggestion).where(inArray(suggestion.status, ["submitted", "adopted"]));
  for (const s of rows.filter((x) => x.status === "submitted"))
    out.push({ key: `sg-reply-${s.id}`, when: s.replyDue < today ? "late" : s.replyDue <= addDays(today, 3) ? "today" : "soon", what: `개선 제안 회신: ${s.title}`, detail: `${s.replyDue}까지 채택·보류·불채택`, href: `/suggestions/${s.id}`, action: "회신하기" });
  const adopted = rows.filter((x) => x.status === "adopted");
  if (adopted.length) out.push({ key: "sg-exec", when: "soon", what: `채택한 개선 제안 실행 ${adopted.length}건`, detail: adopted.slice(0, 3).map((s) => s.title).join(", "), href: "/suggestions?f=adopted", action: "보기" });
  return out;
}
