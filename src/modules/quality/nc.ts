// 부적합·시정 조치(F-Q-10, STD-Q Q.9): 발행 → 원인 분석·시정 계획 → 조치 → 효과 확인 → 종결
// 누구나 발행한다. 검사 불합격·설비 고장·교정 불합격·5S 미달은 그 화면에서 저절로 발행되고 출처·관련 건이 채워진다.
import { and, asc, desc, eq, inArray, lt, ne } from "drizzle-orm";
import type { Db } from "@/db/client";
import { appUser, nonconformance } from "@/db/schema";
import { can } from "@/modules/auth/permissions";
import type { Role } from "@/modules/auth/roles";
import { writeAudit } from "@/modules/platform/audit";
import { nextDocNo } from "@/modules/platform/docno";
import { UserError } from "@/modules/platform/errors";
import { notifyRole, notifyUser } from "@/modules/platform/notify";
import { loadPolicy } from "@/modules/platform/policy";
import { IMAGE_TYPES, MAX_IMAGE_BYTES, removeStored, sniffImage, storeFile } from "@/modules/platform/storage";
import { addDays, seoulDate } from "@/modules/platform/time";
import { DEFAULT_DUE_DAYS, isNcSource, NC_SOURCES, planIssues, type NcSource } from "./rules";

export class NcError extends UserError {}
type Actor = { id: string; roles: Role[] };
const clean = (s: string | null | undefined) => (s ?? "").trim() || null;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

async function ncRow(db: Db, id: string) {
  const [n] = await db.select().from(nonconformance).where(eq(nonconformance.id, id));
  if (!n) throw new NcError("부적합 보고서를 찾을 수 없습니다");
  return n;
}
const handler = (a: Actor) => can(a, "nc.handle");

export type NcOpenInput = { source: string; refType?: string; refId?: string; refLabel?: string; content: string; immediate?: string; major?: boolean; occurredAt?: Date };

/** 발행. 누구나 */
export async function openNc(db: Db, actor: Actor, input: NcOpenInput, now = new Date()) {
  if (!isNcSource(input.source)) throw new NcError("출처를 골라 주세요");
  const content = clean(input.content);
  if (!content) throw new NcError("무엇이 기준에서 벗어났는지 내용을 적어 주세요");
  return insertNc(db, actor.id, { ...input, source: input.source, content }, now);
}

async function insertNc(db: Db, actorId: string, input: NcOpenInput & { source: NcSource; content: string }, now: Date) {
  const docNo = await nextDocNo(db, "NC", now);
  const days = DEFAULT_DUE_DAYS[input.source];
  const [n] = await db
    .insert(nonconformance)
    .values({
      docNo,
      source: input.source,
      refType: clean(input.refType),
      refId: clean(input.refId),
      refLabel: clean(input.refLabel),
      occurredAt: input.occurredAt ?? now,
      foundBy: actorId,
      content: input.content,
      immediate: clean(input.immediate),
      major: !!input.major,
      dueOn: days ? addDays(seoulDate(now), days) : null,
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: nonconformance.id });
  const pol = await loadPolicy(db);
  const title = `부적합 발행 ${docNo}(${NC_SOURCES[input.source]}): ${input.content.slice(0, 50)} — ${pol["nc.decision_hours"]}시간 안에 처리 결정`;
  await notifyRole(db, "quality", title, `nc-${docNo}`, `/nc/${n.id}`);
  await notifyRole(db, "plant_manager", title, `nc-${docNo}`, `/nc/${n.id}`);
  if (input.major) await notifyRole(db, "owner", `중대 부적합 ${docNo}: ${input.content.slice(0, 50)}`, `nc-${docNo}-major`, `/nc/${n.id}`);
  await writeAudit(db, { actorId, action: "nc.open", entityType: "nonconformance", entityId: docNo, after: { source: input.source, ref: input.refLabel } });
  return { id: n.id, docNo };
}

/** 다른 화면에서 저절로 발행(같은 관련 건에 아직 안 끝난 보고서가 있으면 그것을 돌려준다) */
export async function issueNc(db: Db, actorId: string, input: NcOpenInput & { source: NcSource; content: string }, now = new Date()) {
  if (input.refType && input.refId) {
    const [open] = await db
      .select({ id: nonconformance.id, docNo: nonconformance.docNo })
      .from(nonconformance)
      .where(and(eq(nonconformance.refType, input.refType), eq(nonconformance.refId, input.refId), eq(nonconformance.source, input.source), ne(nonconformance.status, "closed")));
    if (open) return { ...open, existed: true };
  }
  return { ...(await insertNc(db, actorId, input, now)), existed: false };
}

export type NcPlan = { immediate?: string; major?: boolean; whys: string[]; rootCause: string; corrective: string; assigneeId: string; dueOn: string; stdRevision: boolean; revisionRef: string };

/** 원인 분석·시정 계획(품질 담당·공장장). 담당에게 알림 */
export async function planNc(db: Db, actor: Actor, id: string, p: NcPlan, now = new Date()) {
  if (!handler(actor)) throw new NcError("원인 분석과 시정 조치 지정은 품질 담당·공장장이 합니다");
  const n = await ncRow(db, id);
  if (n.status === "closed") throw new NcError("종결한 보고서입니다");
  if (n.status === "done") throw new NcError("조치가 끝나 효과 확인 대기입니다. 효과가 없으면 '재발'로 확인해 다시 계획합니다");
  const issues = planIssues(p, seoulDate(now));
  if (issues.length) throw new NcError(issues.join(" / "));
  const [u] = await db.select({ id: appUser.id, active: appUser.active }).from(appUser).where(eq(appUser.id, p.assigneeId));
  if (!u?.active) throw new NcError("조치 담당을 찾을 수 없습니다");
  await db
    .update(nonconformance)
    .set({
      immediate: clean(p.immediate) ?? n.immediate,
      major: p.major ?? n.major,
      whys: p.whys.map((w) => w.trim()).filter(Boolean),
      rootCause: p.rootCause,
      corrective: clean(p.corrective),
      assigneeId: p.assigneeId,
      dueOn: p.dueOn,
      stdRevision: p.stdRevision,
      revisionRef: p.stdRevision ? clean(p.revisionRef) : null,
      plannedBy: actor.id,
      plannedAt: now,
      status: "planned",
      updatedAt: now,
    })
    .where(eq(nonconformance.id, id));
  if (p.assigneeId !== actor.id) await notifyUser(db, p.assigneeId, `시정 조치 담당 ${n.docNo}: ${clean(p.corrective)!.slice(0, 50)} (기한 ${p.dueOn})`, `nc-assign-${id}-${p.assigneeId}-${p.dueOn}`, `/nc/${id}`);
  await writeAudit(db, { actorId: actor.id, action: "nc.plan", entityType: "nonconformance", entityId: n.docNo, after: { rootCause: p.rootCause, dueOn: p.dueOn } });
}

/** 조치 끝(조치 담당 또는 품질 담당·공장장) */
export async function recordNcAction(db: Db, actor: Actor, id: string, actionDone: string, now = new Date()) {
  const n = await ncRow(db, id);
  if (n.status !== "planned") throw new NcError(n.status === "open" ? "먼저 원인 분석과 시정 조치를 정합니다" : "조치를 적을 단계가 아닙니다");
  if (n.assigneeId !== actor.id && !handler(actor)) throw new NcError("조치 담당(또는 품질 담당·공장장)만 적습니다");
  if (!clean(actionDone)) throw new NcError("한 조치를 적어 주세요");
  if (n.source === "five_s" && !n.actionPhotos.length) throw new NcError("5S 미달은 개선 후 사진을 올려야 조치를 끝낼 수 있습니다(STD-08 14.3)");
  await db.update(nonconformance).set({ actionDone: clean(actionDone), actionAt: now, status: "done", updatedAt: now }).where(eq(nonconformance.id, id));
  await notifyRole(db, "quality", `시정 조치 끝 ${n.docNo}: 효과를 확인하고 종결하세요`, `nc-done-${id}-${now.getTime()}`, `/nc/${id}`);
}

/** 효과 확인. 재발이면 다시 조치 중으로 돌려 계획을 고친다 */
export async function verifyNc(db: Db, actor: Actor, id: string, input: { effectOn: string; recurred: boolean; effectNote: string }, now = new Date()) {
  if (!handler(actor)) throw new NcError("효과 확인은 품질 담당·공장장이 합니다");
  const n = await ncRow(db, id);
  if (n.status !== "done") throw new NcError("조치가 끝난 뒤에 효과를 확인합니다");
  if (!DATE.test(input.effectOn) || input.effectOn > seoulDate(now)) throw new NcError("확인일을 확인해 주세요");
  if (!clean(input.effectNote)) throw new NcError("무엇을 보고 확인했는지 적어 주세요");
  await db
    .update(nonconformance)
    .set({ effectOn: input.effectOn, recurred: input.recurred, effectNote: clean(input.effectNote), effectBy: actor.id, status: input.recurred ? "planned" : "done", actionAt: input.recurred ? null : n.actionAt, updatedAt: now })
    .where(eq(nonconformance.id, id));
  if (input.recurred && n.assigneeId) await notifyUser(db, n.assigneeId, `${n.docNo} 효과 없음(재발): 시정 조치를 다시 합니다`, `nc-recur-${id}-${input.effectOn}`, `/nc/${id}`);
}

/** 종결: 효과 확인(재발 없음)이 있어야 한다. 중대 건은 대표 */
export async function closeNc(db: Db, actor: Actor, id: string, now = new Date()) {
  const n = await ncRow(db, id);
  if (!handler(actor)) throw new NcError("종결은 품질 담당·공장장이 합니다");
  if (n.status !== "done" || !n.effectOn || n.recurred !== false) throw new NcError("효과 확인 전에는 종결할 수 없습니다");
  if (n.major && !can(actor, "nc.approve")) throw new NcError("중대 부적합은 대표가 승인해 종결합니다");
  await db.update(nonconformance).set({ status: "closed", closedBy: actor.id, closedAt: now, updatedAt: now }).where(eq(nonconformance.id, id));
  await writeAudit(db, { actorId: actor.id, action: "nc.close", entityType: "nonconformance", entityId: n.docNo });
}

/** 사진: 발행 사진(내용)은 발견자·담당자가, 개선 후 사진(조치)은 조치 담당이 */
export async function addNcPhoto(db: Db, actor: Actor, id: string, kind: "issue" | "action", bytes: Uint8Array) {
  const n = await ncRow(db, id);
  if (n.status === "closed") throw new NcError("종결한 보고서입니다");
  const mine = n.foundBy === actor.id || n.assigneeId === actor.id || handler(actor);
  if (!mine) throw new NcError("발견자·조치 담당·품질 담당만 사진을 올립니다");
  if (kind === "action" && n.status !== "planned") throw new NcError("개선 후 사진은 조치 중에 올립니다");
  if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) throw new NcError("사진이 비었거나 너무 큽니다(6MB까지)");
  const type = sniffImage(bytes);
  if (!type) throw new NcError("사진 파일만 올릴 수 있습니다(JPG·PNG·WEBP)");
  const list = kind === "action" ? n.actionPhotos : n.photos;
  if (list.length >= 8) throw new NcError("사진은 8장까지입니다");
  const path = await storeFile(`nc/${n.docNo}`, bytes, IMAGE_TYPES[type]);
  await db
    .update(nonconformance)
    .set(kind === "action" ? { actionPhotos: [...list, path] } : { photos: [...list, path] })
    .where(eq(nonconformance.id, id));
}

export async function removeNcPhoto(db: Db, actor: Actor, id: string, path: string) {
  const n = await ncRow(db, id);
  if (n.status === "closed") throw new NcError("종결한 보고서입니다");
  if (!(n.foundBy === actor.id || n.assigneeId === actor.id || handler(actor))) throw new NcError("발견자·조치 담당·품질 담당만 사진을 지웁니다");
  if (n.photos.includes(path)) await db.update(nonconformance).set({ photos: n.photos.filter((p) => p !== path) }).where(eq(nonconformance.id, id));
  else if (n.actionPhotos.includes(path)) await db.update(nonconformance).set({ actionPhotos: n.actionPhotos.filter((p) => p !== path) }).where(eq(nonconformance.id, id));
  else return;
  await removeStored(path);
}

export async function getNc(db: Db, id: string) {
  const n = await ncRow(db, id);
  const names = new Map((await db.select({ id: appUser.id, name: appUser.name }).from(appUser)).map((u) => [u.id, u.name]));
  return { n, names };
}

export async function listNc(db: Db, opts: { status?: "openish" | "closed" | "all"; source?: string } = {}) {
  const where = [] as ReturnType<typeof eq>[];
  if (opts.status === "closed") where.push(eq(nonconformance.status, "closed"));
  else if (opts.status !== "all") where.push(ne(nonconformance.status, "closed"));
  if (opts.source && isNcSource(opts.source)) where.push(eq(nonconformance.source, opts.source));
  return db
    .select({ n: nonconformance, assigneeName: appUser.name })
    .from(nonconformance)
    .leftJoin(appUser, eq(appUser.id, nonconformance.assigneeId))
    .where(where.length ? and(...where) : undefined)
    .orderBy(opts.status === "closed" ? desc(nonconformance.closedAt) : asc(nonconformance.createdAt))
    .limit(200);
}

/** 관련 건(수리 건·설비 등)에 걸린 보고서 */
export async function ncFor(db: Db, refType: string, refIds: string[]) {
  if (!refIds.length) return [];
  return db
    .select({ id: nonconformance.id, docNo: nonconformance.docNo, status: nonconformance.status, refId: nonconformance.refId })
    .from(nonconformance)
    .where(and(eq(nonconformance.refType, refType), inArray(nonconformance.refId, refIds)));
}

/** 매일 알림: 처리 결정 시간이 지난 발행 건, 기한 지난 조치 */
export async function ncDailyAlerts(db: Db, now = new Date()) {
  const pol = await loadPolicy(db);
  const late = await db
    .select()
    .from(nonconformance)
    .where(and(eq(nonconformance.status, "open"), lt(nonconformance.createdAt, new Date(now.getTime() - pol["nc.decision_hours"] * 3_600_000))));
  for (const n of late) await notifyRole(db, "quality", `처리 결정이 늦은 부적합 ${n.docNo}: 원인 분석·시정 조치를 정하세요`, `nc-late-${n.id}-${seoulDate(now)}`, `/nc/${n.id}`);
  const today = seoulDate(now);
  const over = (await db.select().from(nonconformance).where(eq(nonconformance.status, "planned"))).filter((n) => n.dueOn && n.dueOn < today);
  for (const n of over) {
    if (n.assigneeId) await notifyUser(db, n.assigneeId, `시정 조치 기한 지남 ${n.docNo}(${n.dueOn})`, `nc-over-${n.id}-${today}`, `/nc/${n.id}`);
    await notifyRole(db, "quality", `시정 조치 기한 지남 ${n.docNo}(${n.dueOn})`, `nc-over-${n.id}-${today}`, `/nc/${n.id}`);
  }
  return `부적합 알림 ${late.length + over.length}건`;
}
