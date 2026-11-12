// 앱 개별 교육(대표 결정 2026-11-12, STD-11 5절):
// 교육 계획 → 자료(사내 교재·표준서·영상 링크·외부 링크·파일)·확인 문제 → 대상 배정(사람마다 시한) → 내 할 일 D-n·3일 전 알림
// → 자료 보기(실제 본 시간 기록) → 확인 문제(합격 점수) 또는 외부 수료증 → 교육훈련기록부(F-11-03) 이수란 자동·본인 서명 겸함
// → 대상자 모두 이수하면 교육 '실시', 직무 교육은 한 달 뒤 효과 확인.
// 사내 교재(TM-)는 우리만의 내용만 만들고(대표 승인·개정 이력), 공공 자료는 링크만 건다. 링크는 매달 1일 살아 있는지 본다.
import { and, asc, desc, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import type { Db } from "@/db/client";
import { appUser, docRegister, staffProfile, training, trainingAttendee, trainingManual, trainingMaterial, trainingQuestion } from "@/db/schema";
import { can } from "@/modules/auth/permissions";
import type { Role } from "@/modules/auth/roles";
import { writeAudit } from "@/modules/platform/audit";
import { UserError } from "@/modules/platform/errors";
import { notifyRole, notifyUser } from "@/modules/platform/notify";
import { DOC_TYPES, MAX_DOC_BYTES, sniffDoc, storeFile } from "@/modules/platform/storage";
import { addDays, seoulDate } from "@/modules/platform/time";
import {
  creditSec,
  DEFAULT_PASS_SCORE,
  dueWhen,
  EFFECT_DAYS,
  HIRE_DUE_DAYS,
  isMaterialKind,
  isTrMode,
  MATERIAL_KINDS,
  MAX_VIDEO_BYTES,
  monthEnd,
  quizScore,
  REMIND_DAYS,
  TR_KINDS,
  type TrKind,
} from "./training-rules";

export class LearnError extends UserError {}
type Actor = { id: string; roles: Role[] };
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const clean = (s: string | null | undefined) => (s ?? "").trim() || null;
const must = (a: Actor) => {
  if (!can(a, "training.manage")) throw new LearnError("교육 자료·대상은 대표·공장장·안전환경 담당이 관리합니다");
};

async function tr(db: Db, id: string) {
  const [x] = await db.select().from(training).where(eq(training.id, id));
  if (!x) throw new LearnError("교육을 찾을 수 없습니다");
  return x;
}

/** 파일 형식: 그림·PDF 는 sniffDoc, 영상은 MP4(ftyp) 만 */
function sniffMedia(b: Uint8Array): { ext: string; video: boolean } | null {
  const d = sniffDoc(b);
  if (d) return { ext: DOC_TYPES[d], video: false };
  if (b.length > 12 && b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) return { ext: "mp4", video: true };
  return null;
}

// ── 설정·자료·문제(관리자) ──

export async function saveLearnSettings(db: Db, actor: Actor, id: string, input: { mode: string; passScore: number | null; allowCert: boolean }, now = new Date()) {
  must(actor);
  const x = await tr(db, id);
  if (x.status === "cancelled") throw new LearnError("취소한 교육입니다");
  if (!isTrMode(input.mode)) throw new LearnError("진행 방식을 골라 주세요");
  const pass = input.passScore ?? DEFAULT_PASS_SCORE;
  if (!Number.isInteger(pass) || pass < 50 || pass > 100) throw new LearnError("합격 점수는 50~100 사이로 적어 주세요");
  if (input.mode === "class") {
    const [a] = await db.select({ id: trainingAttendee.id }).from(trainingAttendee).where(and(eq(trainingAttendee.trainingId, id), isNotNull(trainingAttendee.dueOn)));
    if (a) throw new LearnError("이미 앱 학습 대상이 있어 '모여서 하는 교육'으로만 바꿀 수 없습니다. '둘 다'를 고르세요");
  }
  await db.update(training).set({ mode: input.mode, passScore: pass, allowCert: input.allowCert, updatedAt: now }).where(eq(training.id, id));
  await writeAudit(db, { actorId: actor.id, action: "training.learn_settings", entityType: "training", entityId: x.docNo, after: { mode: input.mode, pass, cert: input.allowCert } });
}

export type MaterialInput = { kind: string; title: string; url: string; manualId: string; docId: string; minutes: number | null; file?: { name: string; bytes: Uint8Array } | null };

export async function addMaterial(db: Db, actor: Actor, id: string, input: MaterialInput, now = new Date()) {
  must(actor);
  const x = await tr(db, id);
  if (x.status === "cancelled") throw new LearnError("취소한 교육입니다");
  if (!isMaterialKind(input.kind)) throw new LearnError("자료 종류를 골라 주세요");
  if (input.minutes != null && !(Number.isInteger(input.minutes) && input.minutes > 0 && input.minutes <= 600)) throw new LearnError("보는 시간은 1~600분입니다");
  const v: typeof trainingMaterial.$inferInsert = { trainingId: id, kind: input.kind, title: input.title.trim(), minutes: input.minutes, createdBy: actor.id, createdAt: now };
  if (input.kind === "video" || input.kind === "link") {
    const url = input.url.trim();
    if (!/^https:\/\/[^\s]+\.[^\s]+/.test(url)) throw new LearnError("https:// 로 시작하는 주소를 넣어 주세요");
    v.url = url;
    if (!v.title) v.title = input.kind === "video" ? "영상" : url.replace(/^https:\/\//, "").split("/")[0];
  } else if (input.kind === "manual") {
    const [m] = await db.select().from(trainingManual).where(eq(trainingManual.id, input.manualId));
    if (!m) throw new LearnError("사내 교재를 골라 주세요");
    if (m.status !== "approved") throw new LearnError(`${m.no}은(는) 아직 대표 승인 전입니다. 승인된 교재만 교육에 씁니다`);
    v.manualId = m.id;
    v.title = v.title || `${m.no} ${m.title}`;
  } else if (input.kind === "std") {
    const [d] = await db.select().from(docRegister).where(eq(docRegister.id, input.docId));
    if (!d) throw new LearnError("표준서를 골라 주세요");
    v.docId = d.id;
    v.title = v.title || `${d.no} ${d.name} (${d.rev})`;
  } else {
    const f = input.file;
    if (!f || !f.bytes.length) throw new LearnError("파일을 골라 주세요");
    const t = sniffMedia(f.bytes);
    if (!t) throw new LearnError("PDF·그림(JPG·PNG·WEBP) 또는 MP4 영상만 올립니다");
    if (!t.video && f.bytes.length > MAX_DOC_BYTES) throw new LearnError("PDF·그림은 8MB까지입니다");
    if (t.video && f.bytes.length > MAX_VIDEO_BYTES) throw new LearnError("영상 파일은 25MB까지입니다. 긴 영상은 유튜브 '일부 공개'로 올리고 '영상 링크'로 거세요");
    v.filePath = await storeFile(`training/${id}`, f.bytes, t.ext);
    v.fileName = f.name.slice(0, 120);
    v.title = v.title || f.name.replace(/\.[^.]+$/, "");
  }
  if (!v.title) throw new LearnError("자료 이름을 적어 주세요");
  const [last] = await db.select({ ord: trainingMaterial.ord }).from(trainingMaterial).where(eq(trainingMaterial.trainingId, id)).orderBy(desc(trainingMaterial.ord)).limit(1);
  v.ord = (last?.ord ?? 0) + 1;
  await db.insert(trainingMaterial).values(v);
  await writeAudit(db, { actorId: actor.id, action: "training.material", entityType: "training", entityId: x.docNo, after: { kind: input.kind, title: v.title } });
}

export async function removeMaterial(db: Db, actor: Actor, id: string, materialId: string) {
  must(actor);
  const [a] = await db.select({ id: trainingAttendee.id }).from(trainingAttendee).where(and(eq(trainingAttendee.trainingId, id), isNotNull(trainingAttendee.signedAt), isNotNull(trainingAttendee.dueOn)));
  if (a) throw new LearnError("이미 앱으로 이수한 사람이 있어 자료를 뺄 수 없습니다(기록 근거)");
  await db.delete(trainingMaterial).where(and(eq(trainingMaterial.id, materialId), eq(trainingMaterial.trainingId, id)));
}

export async function addQuestion(db: Db, actor: Actor, id: string, input: { question: string; choices: string[]; answer: number }) {
  must(actor);
  await tr(db, id);
  const choices = input.choices.map((c) => c.trim()).filter(Boolean);
  if (!input.question.trim()) throw new LearnError("문제를 적어 주세요");
  if (choices.length < 2 || choices.length > 5) throw new LearnError("보기는 2~5개입니다(한 줄에 하나)");
  if (!(input.answer >= 0 && input.answer < choices.length)) throw new LearnError("정답 번호를 보기 안에서 골라 주세요");
  const n = (await db.select({ id: trainingQuestion.id }).from(trainingQuestion).where(eq(trainingQuestion.trainingId, id))).length;
  if (n >= 10) throw new LearnError("문제는 10개까지입니다(3~5개 권장)");
  await db.insert(trainingQuestion).values({ trainingId: id, ord: n + 1, question: input.question.trim(), choices, answer: input.answer });
}

export async function removeQuestion(db: Db, actor: Actor, id: string, qid: string) {
  must(actor);
  await db.delete(trainingQuestion).where(and(eq(trainingQuestion.id, qid), eq(trainingQuestion.trainingId, id)));
}

// ── 대상 배정 ──

/**
 * 대상 배정: 사람마다 시한. 시한을 비우면 계획 달 말일(수시면 오늘 + 14일).
 * 채용 시 교육은 입사일 + 14일(입사일이 있을 때).
 */
export async function assignLearners(db: Db, actor: Actor, id: string, input: { userIds: string[]; dueOn: string }, now = new Date()) {
  must(actor);
  const x = await tr(db, id);
  if (x.status === "cancelled") throw new LearnError("취소한 교육입니다");
  if (x.mode === "class") throw new LearnError("진행 방식을 '앱에서 개별 학습' 또는 '둘 다'로 먼저 바꿔 주세요");
  const mats = await db.select({ id: trainingMaterial.id }).from(trainingMaterial).where(eq(trainingMaterial.trainingId, id));
  if (!mats.length) throw new LearnError("자료를 하나 이상 넣은 뒤 대상을 배정합니다");
  const today = seoulDate(now);
  if (input.dueOn && (!DATE.test(input.dueOn) || input.dueOn < today)) throw new LearnError("시한은 오늘이나 그 뒤로 골라 주세요");
  const ids = [...new Set(input.userIds.filter(Boolean))];
  if (!ids.length) throw new LearnError("대상을 한 명 이상 골라 주세요");
  const base = input.dueOn || (x.plannedMonth ? monthEnd(x.plannedMonth) : addDays(today, HIRE_DUE_DAYS));
  const hires = new Map(
    x.kind === "safety_hire"
      ? (await db.select({ id: staffProfile.userId, on: staffProfile.hiredOn }).from(staffProfile).where(inArray(staffProfile.userId, ids))).map((r) => [r.id, r.on])
      : [],
  );
  const have = await db.select().from(trainingAttendee).where(eq(trainingAttendee.trainingId, id));
  let added = 0;
  for (const u of ids) {
    const hired = hires.get(u);
    let due = !input.dueOn && hired ? addDays(hired, HIRE_DUE_DAYS) : base;
    if (due < today) due = base < today ? addDays(today, REMIND_DAYS) : base;
    const old = have.find((a) => a.userId === u);
    if (old?.signedAt) continue;
    if (old) await db.update(trainingAttendee).set({ dueOn: due }).where(eq(trainingAttendee.id, old.id));
    else {
      await db.insert(trainingAttendee).values({ trainingId: id, userId: u, hours: 0, dueOn: due });
      added++;
    }
    await notifyUser(db, u, `교육 배정: ${x.title} — ${due}까지 앱에서 학습`, `tr-assign-${id}-${u}`, `/training/learn/${id}`);
  }
  await writeAudit(db, { actorId: actor.id, action: "training.assign", entityType: "training", entityId: x.docNo, after: { people: ids.length, due: base } });
  return { added, due: base };
}

/** 확인 문제(정답 포함) — 관리자 화면 */
export const questionsOf = (db: Db, id: string) => db.select().from(trainingQuestion).where(eq(trainingQuestion.trainingId, id)).orderBy(asc(trainingQuestion.ord));

// ── 학습(본인) ──

export async function learnView(db: Db, actor: Actor, id: string) {
  const x = await tr(db, id);
  const mats = await db.select().from(trainingMaterial).where(eq(trainingMaterial.trainingId, id)).orderBy(asc(trainingMaterial.ord));
  const qs = await db.select().from(trainingQuestion).where(eq(trainingQuestion.trainingId, id)).orderBy(asc(trainingQuestion.ord));
  const [me] = await db.select().from(trainingAttendee).where(and(eq(trainingAttendee.trainingId, id), eq(trainingAttendee.userId, actor.id)));
  const manualIds = mats.map((m) => m.manualId).filter((v): v is string => !!v);
  const manuals = manualIds.length ? await db.select().from(trainingManual).where(inArray(trainingManual.id, manualIds)) : [];
  const docIds = mats.map((m) => m.docId).filter((v): v is string => !!v);
  const docs = docIds.length ? await db.select({ id: docRegister.id, no: docRegister.no, name: docRegister.name, rev: docRegister.rev }).from(docRegister).where(inArray(docRegister.id, docIds)) : [];
  return {
    t: x,
    materials: mats.map((m) => ({ ...m, manual: manuals.find((v) => v.id === m.manualId) ?? null, doc: docs.find((d) => d.id === m.docId) ?? null })),
    // 정답은 보내지 않는다
    questions: qs.map((q) => ({ id: q.id, question: q.question, choices: q.choices })),
    me: me ?? null,
  };
}

async function myRow(db: Db, actor: Actor, id: string) {
  const [a] = await db.select().from(trainingAttendee).where(and(eq(trainingAttendee.trainingId, id), eq(trainingAttendee.userId, actor.id)));
  if (!a || !a.dueOn) throw new LearnError("이 교육의 앱 학습 대상이 아닙니다");
  return a;
}

/** 자료 하나를 다 봄: 연 뒤 지난 시간(초)을 학습 시간으로 더한다(자료 보는 시간·계획 시간 상한) */
export async function markViewed(db: Db, actor: Actor, id: string, materialId: string, spentSec: number) {
  const x = await tr(db, id);
  const a = await myRow(db, actor, id);
  if (a.signedAt) return a;
  const [m] = await db.select().from(trainingMaterial).where(and(eq(trainingMaterial.id, materialId), eq(trainingMaterial.trainingId, id)));
  if (!m) throw new LearnError("없는 자료입니다");
  const add = creditSec(Number.isFinite(spentSec) ? spentSec : 0, m.minutes ?? 0, x.plannedHours);
  const cap = x.plannedHours ? x.plannedHours * 3600 : Infinity;
  const viewed = a.viewed.includes(m.id) ? a.viewed : [...a.viewed, m.id];
  const studied = Math.min(cap, a.studiedSec + add);
  await db.update(trainingAttendee).set({ viewed, studiedSec: studied }).where(eq(trainingAttendee.id, a.id));
  return { ...a, viewed, studiedSec: studied };
}

/** 확인 문제 제출(문제가 없으면 '다 봤음'). 자료를 다 봐야 낼 수 있다 */
export async function submitQuiz(db: Db, actor: Actor, id: string, answers: (number | null)[], now = new Date()) {
  const x = await tr(db, id);
  const a = await myRow(db, actor, id);
  if (a.signedAt) throw new LearnError("이미 이수했습니다");
  const mats = await db.select({ id: trainingMaterial.id }).from(trainingMaterial).where(eq(trainingMaterial.trainingId, id));
  const left = mats.filter((m) => !a.viewed.includes(m.id)).length;
  if (left) throw new LearnError(`아직 안 본 자료가 ${left}개 있습니다. 모두 본 뒤에 확인합니다`);
  const qs = await db.select().from(trainingQuestion).where(eq(trainingQuestion.trainingId, id)).orderBy(asc(trainingQuestion.ord));
  if (qs.length && answers.length !== qs.length) throw new LearnError("모든 문제에 답해 주세요");
  if (answers.some((v) => v == null) && qs.length) throw new LearnError("모든 문제에 답해 주세요");
  const score = quizScore(answers, qs.map((q) => q.answer));
  const passed = score >= x.passScore;
  await db.update(trainingAttendee).set({ score, attempts: a.attempts + 1 }).where(eq(trainingAttendee.id, a.id));
  if (!passed) {
    // 다시 볼 수 있게 본 자료를 비운다(학습 시간은 그대로)
    await db.update(trainingAttendee).set({ viewed: [] }).where(eq(trainingAttendee.id, a.id));
    return { score, passed, pass: x.passScore };
  }
  await complete(db, actor, x, a, "online", now);
  return { score, passed, pass: x.passScore };
}

/** 외부 기관 수료증으로 이수(법정 교육 등 '수료증 허용'일 때) */
export async function uploadCert(db: Db, actor: Actor, id: string, file: { name: string; bytes: Uint8Array }, now = new Date()) {
  const x = await tr(db, id);
  if (!x.allowCert) throw new LearnError("이 교육은 수료증 이수를 받지 않습니다");
  const a = await myRow(db, actor, id);
  if (a.signedAt) throw new LearnError("이미 이수했습니다");
  const t = sniffDoc(file.bytes);
  if (!t) throw new LearnError("수료증은 PDF나 사진으로 올려 주세요");
  if (file.bytes.length > MAX_DOC_BYTES) throw new LearnError("8MB까지 올립니다");
  const path = await storeFile(`training/${id}/cert`, file.bytes, DOC_TYPES[t]);
  await db.update(trainingAttendee).set({ certFile: { path, name: file.name.slice(0, 120) } }).where(eq(trainingAttendee.id, a.id));
  await complete(db, actor, x, { ...a, certFile: { path, name: file.name } }, "cert", now);
  await notifyRole(db, "plant_manager", `교육 수료증 제출: ${x.title}`, `tr-cert-${id}-${actor.id}`, `/training/${id}`);
}

/** 이수: 기록부 이수란(시간·방법)과 본인 서명. 대상자가 모두 이수하면 교육을 '실시'로 */
async function complete(db: Db, actor: Actor, x: typeof training.$inferSelect, a: typeof trainingAttendee.$inferSelect, how: "online" | "cert", now: Date) {
  const planned = x.plannedHours ?? null;
  const studiedH = Math.max(0.5, Math.round(a.studiedSec / 1800) / 2);
  const hours = how === "cert" ? (planned ?? studiedH) : Math.min(planned ?? studiedH, studiedH);
  await db.update(trainingAttendee).set({ signedAt: now, hours, how }).where(eq(trainingAttendee.id, a.id));
  await writeAudit(db, { actorId: actor.id, action: "training.complete", entityType: "training", entityId: x.docNo, after: { how, hours, score: a.score } });
  const all = await db.select().from(trainingAttendee).where(eq(trainingAttendee.trainingId, x.id));
  if (x.status === "planned" && x.mode === "online" && all.every((r) => r.signedAt)) {
    const effect = TR_KINDS[x.kind as TrKind]?.effect;
    const today = seoulDate(now);
    const mats = await db.select({ title: trainingMaterial.title }).from(trainingMaterial).where(eq(trainingMaterial.trainingId, x.id)).orderBy(asc(trainingMaterial.ord));
    await db
      .update(training)
      .set({ status: "done", heldOn: today, hours: planned ?? Math.max(...all.map((r) => r.hours)), instructor: "앱 개별 학습", content: clean(x.content) ?? `자료: ${mats.map((m) => m.title).join(", ")}`, effectDue: effect ? addDays(today, EFFECT_DAYS) : null, updatedAt: now })
      .where(eq(training.id, x.id));
    await writeAudit(db, { actorId: actor.id, action: "training.held", entityType: "training", entityId: x.docNo, after: { heldOn: today, attendees: all.length, online: true } });
  }
}

// ── 현황 ──

/** 교육 한 건의 앱 학습 현황(관리자 화면) */
export async function learnProgress(db: Db, id: string) {
  const mats = await db.select({ id: trainingMaterial.id }).from(trainingMaterial).where(eq(trainingMaterial.trainingId, id));
  const rows = await db
    .select({ a: trainingAttendee, name: appUser.name })
    .from(trainingAttendee)
    .innerJoin(appUser, eq(appUser.id, trainingAttendee.userId))
    .where(and(eq(trainingAttendee.trainingId, id), isNotNull(trainingAttendee.dueOn)))
    .orderBy(asc(appUser.name));
  return rows.map(({ a, name }) => ({ ...a, name, seen: a.viewed.filter((v) => mats.some((m) => m.id === v)).length, total: mats.length }));
}

/** 사람별 미이수(앱 학습 배정분): 재직자, 시한 순 */
export async function pendingLearners(db: Db, year: number) {
  return db
    .select({ userId: trainingAttendee.userId, name: appUser.name, trainingId: training.id, title: training.title, dueOn: trainingAttendee.dueOn })
    .from(trainingAttendee)
    .innerJoin(training, eq(training.id, trainingAttendee.trainingId))
    .innerJoin(appUser, eq(appUser.id, trainingAttendee.userId))
    .where(and(eq(training.year, year), isNotNull(trainingAttendee.dueOn), isNull(trainingAttendee.signedAt), eq(appUser.active, true)))
    .orderBy(asc(trainingAttendee.dueOn), asc(appUser.name));
}

// ── 할 일·알림 ──

type Todo = { key: string; when: "late" | "today" | "soon"; what: string; detail?: string; href: string; action: string };

export async function learnTodos(db: Db, actor: Actor, today: string): Promise<Todo[]> {
  const out: Todo[] = [];
  const mine = await db
    .select({ id: training.id, title: training.title, dueOn: trainingAttendee.dueOn })
    .from(trainingAttendee)
    .innerJoin(training, eq(training.id, trainingAttendee.trainingId))
    .where(and(eq(trainingAttendee.userId, actor.id), isNotNull(trainingAttendee.dueOn), isNull(trainingAttendee.signedAt)));
  for (const m of mine) {
    const d = Math.round((Date.parse(m.dueOn!) - Date.parse(today)) / 86_400_000);
    out.push({ key: `tr-learn-${m.id}`, when: dueWhen(m.dueOn!, today), what: `교육: ${m.title} (${d < 0 ? `${-d}일 지남` : d === 0 ? "오늘까지" : `D-${d}`})`, detail: `${m.dueOn}까지 앱에서 자료를 보고 확인`, href: `/training/learn/${m.id}`, action: "학습하기" });
  }
  if (can(actor, "training.manage")) {
    const late = (await pendingLearners(db, Number(today.slice(0, 4)))).filter((p) => p.dueOn! < today);
    const byTr = new Map<string, { title: string; names: string[] }>();
    for (const p of late) byTr.set(p.trainingId, { title: p.title, names: [...(byTr.get(p.trainingId)?.names ?? []), p.name] });
    for (const [tid, v] of byTr) out.push({ key: `tr-late-${tid}`, when: "late", what: `교육 시한 지남: ${v.title} ${v.names.length}명`, detail: v.names.slice(0, 5).join(", "), href: `/training/${tid}`, action: "독려하기" });
    for (const m of await manualsNeedingRevision(db)) out.push({ key: `tm-rev-${m.id}-${m.changed.map((c) => c.rev).join("")}`, when: "soon", what: `사내 교재 개정 필요: ${m.no} ${m.title}`, detail: `근거 표준서 개정: ${m.changed.map((c) => `${c.no} ${c.was}→${c.rev}`).join(", ")}`, href: `/training/manuals/${m.id}`, action: "고치기" });
    const broken = await db.select({ id: trainingMaterial.id, title: trainingMaterial.title, trainingId: trainingMaterial.trainingId }).from(trainingMaterial).where(eq(trainingMaterial.linkOk, false));
    for (const b of broken) out.push({ key: `tr-link-${b.id}`, when: "soon", what: `교육 자료 링크 끊김: ${b.title}`, detail: "주소를 새로 찾아 바꿔 주세요", href: `/training/${b.trainingId}`, action: "바꾸기" });
  }
  return out;
}

/** 매일: 시한 3일 전 본인 알림, 시한 지나면 공장장 알림(한 번), 매달 1일 링크 점검 */
export async function trainingDailyAlerts(db: Db, now = new Date(), fetcher: typeof fetch = fetch) {
  const today = seoulDate(now);
  const rows = await db
    .select({ id: training.id, title: training.title, userId: trainingAttendee.userId, dueOn: trainingAttendee.dueOn, name: appUser.name })
    .from(trainingAttendee)
    .innerJoin(training, eq(training.id, trainingAttendee.trainingId))
    .innerJoin(appUser, eq(appUser.id, trainingAttendee.userId))
    .where(and(isNotNull(trainingAttendee.dueOn), isNull(trainingAttendee.signedAt), eq(appUser.active, true)));
  let soon = 0;
  let late = 0;
  for (const r of rows) {
    if (r.dueOn! >= today && r.dueOn! <= addDays(today, REMIND_DAYS)) {
      await notifyUser(db, r.userId, `교육 시한 ${r.dueOn}: ${r.title} — 앱에서 학습해 주세요`, `tr-remind-${r.id}-${r.userId}`, `/training/learn/${r.id}`);
      soon++;
    } else if (r.dueOn! < today) {
      await notifyRole(db, "plant_manager", `교육 시한 지남: ${r.name} · ${r.title}(${r.dueOn})`, `tr-overdue-${r.id}-${r.userId}`, `/training/${r.id}`);
      late++;
    }
  }
  const links = today.endsWith("-01") ? await checkLinks(db, now, fetcher) : null;
  return `교육 시한 알림 ${soon}건·지남 ${late}건${links ? ` · 링크 점검 ${links.checked}건(끊김 ${links.broken})` : ""}`;
}

/** 링크가 살아 있는지(HEAD, 안 되면 GET). 끊긴 것은 관리자 할 일로 */
export async function checkLinks(db: Db, now = new Date(), fetcher: typeof fetch = fetch) {
  const rows = await db.select().from(trainingMaterial).where(isNotNull(trainingMaterial.url));
  let broken = 0;
  for (const r of rows) {
    let ok = false;
    for (const method of ["HEAD", "GET"]) {
      try {
        const res = await fetcher(r.url!, { method, redirect: "follow", signal: AbortSignal.timeout(10_000) });
        if (res.status < 400) {
          ok = true;
          break;
        }
      } catch {
        /* 다음 방법으로 */
      }
    }
    if (!ok) broken++;
    await db.update(trainingMaterial).set({ linkOk: ok, linkCheckedAt: now }).where(eq(trainingMaterial.id, r.id));
  }
  return { checked: rows.length, broken };
}

/** 링크 주소 바꾸기(끊긴 링크 고침) */
export async function updateMaterialUrl(db: Db, actor: Actor, id: string, materialId: string, url: string) {
  must(actor);
  if (!/^https:\/\/[^\s]+\.[^\s]+/.test(url.trim())) throw new LearnError("https:// 로 시작하는 주소를 넣어 주세요");
  await db.update(trainingMaterial).set({ url: url.trim(), linkOk: null, linkCheckedAt: null }).where(and(eq(trainingMaterial.id, materialId), eq(trainingMaterial.trainingId, id)));
}

// ── 사내 교재(TM-) ──

const nextManualNo = (nos: string[]) => `TM-${String(nos.reduce((mx, n) => Math.max(mx, Number(n.slice(3)) || 0), 0) + 1).padStart(3, "0")}`;
export { nextManualNo };

export type ManualInput = { title: string; body: string; videoUrl: string; docIds: string[]; changeNote: string };

export async function saveManual(db: Db, actor: Actor, id: string | null, input: ManualInput, files: { name: string; bytes: Uint8Array }[] = [], now = new Date()) {
  must(actor);
  if (!input.title.trim()) throw new LearnError("교재 이름을 적어 주세요");
  if (!input.body.trim()) throw new LearnError("내용을 적어 주세요(표준서 조항을 불러와 고쳐 쓰면 됩니다)");
  const video = clean(input.videoUrl);
  if (video && !/^https:\/\//.test(video)) throw new LearnError("영상 주소는 https:// 로 시작합니다");
  const docIds = [...new Set(input.docIds.filter(Boolean))];
  const docs = docIds.length ? await db.select().from(docRegister).where(inArray(docRegister.id, docIds)) : [];
  const stdRevs = docs.map((d) => ({ docId: d.id, no: d.no, rev: d.rev }));
  const saved: { path: string; name: string }[] = [];
  for (const f of files.filter((f) => f.bytes.length)) {
    const t = sniffDoc(f.bytes);
    if (!t) throw new LearnError(`${f.name}: 그림이나 PDF만 붙입니다`);
    if (f.bytes.length > MAX_DOC_BYTES) throw new LearnError(`${f.name}: 8MB까지입니다`);
    saved.push({ path: await storeFile("training/manual", f.bytes, DOC_TYPES[t]), name: f.name.slice(0, 120) });
  }
  if (!id) {
    const no = nextManualNo((await db.select({ no: trainingManual.no }).from(trainingManual)).map((r) => r.no));
    const [r] = await db
      .insert(trainingManual)
      .values({ no, title: input.title.trim(), body: input.body.trim(), videoUrl: video, stdRevs, files: saved, changeNote: clean(input.changeNote) ?? "최초 작성", createdBy: actor.id, createdAt: now, updatedAt: now })
      .returning({ id: trainingManual.id });
    await writeAudit(db, { actorId: actor.id, action: "manual.create", entityType: "training_manual", entityId: no, after: { title: input.title.trim() } });
    await notifyRole(db, "owner", `사내 교재 승인 요청: ${no} ${input.title.trim()}`, `tm-approve-${r.id}-0`, `/training/manuals/${r.id}`);
    return { id: r.id, no };
  }
  const [m] = await db.select().from(trainingManual).where(eq(trainingManual.id, id));
  if (!m) throw new LearnError("없는 교재입니다");
  if (m.status === "retired") throw new LearnError("폐기한 교재입니다");
  if (m.status === "approved" && !input.changeNote.trim()) throw new LearnError("승인된 교재를 고치면 개정이 됩니다. 무엇을 왜 바꾸는지 '개정 내용'에 적어 주세요");
  // 승인된 교재를 고치면 '승인 대기'(개정안)로 돌아가 다시 대표 승인을 받는다. 이미 교육에 걸린 교재는 고친 내용으로 보인다(판 번호는 승인 때 올라감)
  await db
    .update(trainingManual)
    .set({ title: input.title.trim(), body: input.body.trim(), videoUrl: video, stdRevs, files: [...m.files, ...saved], changeNote: clean(input.changeNote), status: "draft", updatedAt: now })
    .where(eq(trainingManual.id, id));
  await writeAudit(db, { actorId: actor.id, action: "manual.edit", entityType: "training_manual", entityId: m.no, after: { note: clean(input.changeNote) } });
  await notifyRole(db, "owner", `사내 교재 ${m.rev ? "개정" : ""} 승인 요청: ${m.no} ${input.title.trim()}`, `tm-approve-${id}-${m.rev + 1}`, `/training/manuals/${id}`);
  return { id, no: m.no };
}

/** 대표 승인: 판 +1, 근거 표준서의 지금 판을 적어 둔다 */
export async function approveManual(db: Db, actor: Actor, id: string, now = new Date()) {
  if (!can(actor, "training.plan")) throw new LearnError("사내 교재는 대표가 승인합니다");
  const [m] = await db.select().from(trainingManual).where(eq(trainingManual.id, id));
  if (!m) throw new LearnError("없는 교재입니다");
  if (m.status !== "draft") throw new LearnError("승인할 개정안이 없습니다");
  const docs = m.stdRevs.length ? await db.select().from(docRegister).where(inArray(docRegister.id, m.stdRevs.map((s) => s.docId))) : [];
  const stdRevs = docs.map((d) => ({ docId: d.id, no: d.no, rev: d.rev }));
  const rev = m.rev + 1;
  await db
    .update(trainingManual)
    .set({ status: "approved", rev, stdRevs, approvedBy: actor.id, approvedAt: now, history: [...m.history, { rev, approvedAt: seoulDate(now), by: actor.id, note: m.changeNote ?? "" }], updatedAt: now })
    .where(eq(trainingManual.id, id));
  await writeAudit(db, { actorId: actor.id, action: "manual.approve", entityType: "training_manual", entityId: m.no, after: { rev } });
  if (m.createdBy && m.createdBy !== actor.id) await notifyUser(db, m.createdBy, `사내 교재 승인: ${m.no} ${m.title} ${rev}판`, `tm-approved-${id}-${rev}`, `/training/manuals/${id}`);
  return rev;
}

export async function listManuals(db: Db) {
  const rows = await db.select().from(trainingManual).orderBy(asc(trainingManual.no));
  const stale = new Map((await manualsNeedingRevision(db)).map((m) => [m.id, m.changed]));
  return rows.map((m) => ({ m, changed: stale.get(m.id) ?? [] }));
}

export async function getManual(db: Db, id: string) {
  const [m] = await db.select().from(trainingManual).where(eq(trainingManual.id, id));
  if (!m) throw new LearnError("없는 교재입니다");
  const uses = await db.select({ id: training.id, title: training.title, year: training.year }).from(trainingMaterial).innerJoin(training, eq(training.id, trainingMaterial.trainingId)).where(eq(trainingMaterial.manualId, id));
  const names = new Map((await db.select({ id: appUser.id, name: appUser.name }).from(appUser)).map((u) => [u.id, u.name]));
  const changed = (await manualsNeedingRevision(db)).find((x) => x.id === id)?.changed ?? [];
  return { m, uses, names, changed };
}

/** 승인된 교재 중 근거 표준서의 판이 바뀐 것 */
export async function manualsNeedingRevision(db: Db) {
  const ms = await db.select().from(trainingManual).where(eq(trainingManual.status, "approved"));
  const ids = [...new Set(ms.flatMap((m) => m.stdRevs.map((s) => s.docId)))];
  if (!ids.length) return [];
  const docs = new Map((await db.select({ id: docRegister.id, rev: docRegister.rev }).from(docRegister).where(inArray(docRegister.id, ids))).map((d) => [d.id, d.rev]));
  return ms
    .map((m) => ({ id: m.id, no: m.no, title: m.title, changed: m.stdRevs.filter((s) => docs.get(s.docId) && docs.get(s.docId) !== s.rev).map((s) => ({ no: s.no, was: s.rev, rev: docs.get(s.docId)! })) }))
    .filter((m) => m.changed.length);
}

/** 표준서 고르기 목록(최근 개정한 것 먼저) */
export async function stdOptions(db: Db) {
  const rows = await db.select({ id: docRegister.id, no: docRegister.no, name: docRegister.name, rev: docRegister.rev, effectiveOn: docRegister.effectiveOn, status: docRegister.status }).from(docRegister).where(eq(docRegister.status, "current"));
  return rows.sort((a, b) => (b.effectiveOn ?? "").localeCompare(a.effectiveOn ?? "") || a.no.localeCompare(b.no));
}

export const MATERIAL_LABEL = MATERIAL_KINDS;
