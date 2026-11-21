// 사내 표준서 본문(2026-11-19 대표 결정 '제안대로 전부'): 앱이 원본이다.
// 보기는 전 직원(제한 걸린 절은 그 역할·대표만), 본문 변경은 문서 개정 요청서(F-Q-05) 결재로만, 열람 제한은 품질 담당·대표가 정한다.
import { and, asc, count, eq, gte, inArray } from "drizzle-orm";
import type { Db } from "@/db/client";
import { docRegister, stdSection, training } from "@/db/schema";
import type { DocRow } from "@/modules/approval/service";
import { can } from "@/modules/auth/permissions";
import { isRole, type Role } from "@/modules/auth/roles";
import { writeAudit } from "@/modules/platform/audit";
import { UserError } from "@/modules/platform/errors";
import { notifyRole } from "@/modules/platform/notify";
import { seoulDate } from "@/modules/platform/time";
import { chOf, STD_APPENDICES, STD_CHAPTERS, stdKeyHref } from "./std-ref";
import SEED from "./std-seed.json";

export class StdError extends UserError {}
type Actor = { id: string; roles: readonly Role[] };
export type StdRow = typeof stdSection.$inferSelect;

type SeedRow = {
  key: string;
  part: string;
  ch: string;
  docNo: string;
  no: string;
  title: string;
  body: string;
  grp?: string;
  chapter?: boolean;
  sort: number;
};

/** 처음 열 때 한 번: 표준서 본문을 넣는다. 처음부터 열람을 좁혀 둘 절(회계 상세 절차)은 여기서 정한다 */
export const SEED_LIMITS: { match: (s: SeedRow) => boolean; roles: Role[] }[] = [
  {
    match: (s) => s.part === "procedure" && s.docNo === "STD-12" && !s.chapter,
    roles: ["accounting", "plant_manager"],
  },
];

export async function seedStd(db: Db) {
  const [{ n }] = await db.select({ n: count() }).from(stdSection);
  if (n > 0) return 0;
  const rows = (SEED as SeedRow[]).map((s) => ({
    key: s.key,
    part: s.part,
    ch: s.ch,
    docNo: s.docNo,
    no: s.no,
    title: s.title,
    body: s.body,
    grp: s.grp ?? null,
    chapter: !!s.chapter,
    sort: s.sort,
    roles: SEED_LIMITS.find((l) => l.match(s))?.roles ?? [],
  }));
  for (let i = 0; i < rows.length; i += 100)
    await db.insert(stdSection).values(rows.slice(i, i + 100)).onConflictDoNothing();
  return rows.length;
}

/** 본문 표시값(손대지 않은 초안인지 볼 때 쓴다) */
export function bodyMark(t: string) {
  let h = 5381;
  for (const ch of t) h = ((h * 33) ^ ch.codePointAt(0)!) >>> 0;
  return h.toString(16);
}

/**
 * 확정판 공표 전(초안 v0.x)에는 개정 결재 없이 본문을 바로 고친다(대표 지시 2026-11-21).
 * 이미 들어간 서버는 여기 적은 절이 예전 초안 그대로(표시값 같음)일 때만 std-seed.json 새 본문으로 바꾼다. 앱에서 고친 절은 건드리지 않는다.
 */
export const DRAFT_PATCHES: Record<string, string[]> = {
  // 내 차 수첩(고객용 차계부) 반영 2026-11-21
  "o:13.1": ["df0b9024"],
  "o:13.2": ["5a1a34e"],
  "o:13.4": ["8ea2fb1d"],
  "p:STD-13:4": ["89a79ab8"],
  "p:STD-13:5": ["f199ddaa"],
  "p:STD-13:6": ["974bb978"],
  "p:STD-13:7": ["c98e9d04"],
  "p:STD-13:10": ["b79b1a82"],
  "f:F-13-01": ["88a9d01e"],
  // 문서·기록관리 개선(공문·수발신 대장 F-Q-11·F-Q-12) 2026-11-21
  "o:Q.5": ["dee70768"],
  "p:STD-Q:7": ["9eb0bfb4"],
  "a:A": ["e9096a0d"],
  "f:intro": ["5b05e7c5"],
  // 법규 대장 보강(새 법규 4개·자동 개정 감지·사본 첨부), 보존·파기 2026-11-21
  "a:C": ["5c35e13d"],
  "p:STD-Q:6": ["4f1045f"],
  "p:STD-Q:8": ["c4776d9c"],
};

/** 초안에 새로 생긴 절: 이미 들어간 서버에 없으면 std-seed.json 에서 넣는다 */
export const DRAFT_ADDS: string[] = ["f:F-Q-11", "f:F-Q-12"];

export async function patchDraftStd(db: Db) {
  const seed = new Map((SEED as SeedRow[]).map((s) => [s.key, s.body]));
  let n = 0;
  for (const key of DRAFT_ADDS) {
    const s = (SEED as SeedRow[]).find((x) => x.key === key);
    if (!s) continue;
    const r = await db
      .insert(stdSection)
      .values({ key: s.key, part: s.part, ch: s.ch, docNo: s.docNo, no: s.no, title: s.title, body: s.body, grp: s.grp ?? null, chapter: !!s.chapter, sort: s.sort, roles: [] })
      .onConflictDoNothing()
      .returning({ key: stdSection.key });
    n += r.length;
  }
  for (const [key, olds] of Object.entries(DRAFT_PATCHES)) {
    const body = seed.get(key);
    if (body == null) continue;
    const [row] = await db.select({ body: stdSection.body }).from(stdSection).where(eq(stdSection.key, key));
    if (!row || row.body === body || !olds.includes(bodyMark(row.body))) continue;
    await db.update(stdSection).set({ body, updatedAt: new Date() }).where(eq(stdSection.key, key));
    n++;
  }
  return n;
}

/** 이 사람이 이 절을 볼 수 있나(대표는 늘 봄) */
export const canSee = (a: { roles: readonly Role[] }, s: { roles: string[] }) =>
  !s.roles.length || a.roles.includes("owner") || s.roles.some((r) => a.roles.includes(r as Role));

/** 장 이름표(차례): 총람 장 제목 + 절차서 제목 */
export async function stdToc(db: Db) {
  const rows = await db
    .select({
      key: stdSection.key,
      part: stdSection.part,
      ch: stdSection.ch,
      no: stdSection.no,
      title: stdSection.title,
      chapter: stdSection.chapter,
      revisedOn: stdSection.revisedOn,
      rev: stdSection.rev,
      docNo: stdSection.docNo,
      grp: stdSection.grp,
      roles: stdSection.roles,
    })
    .from(stdSection)
    .orderBy(asc(stdSection.sort), asc(stdSection.key));
  const chapters = STD_CHAPTERS.map((ch) => {
    const o = rows.find((r) => r.part === "overview" && r.chapter && r.ch === ch);
    const p = rows.find((r) => r.part === "procedure" && r.chapter && r.ch === ch);
    const secs = rows.filter((r) => r.ch === ch && !r.chapter && r.part !== "form" && r.key !== "o:info" && r.key !== "p:intro");
    return {
      ch,
      title: o?.title ?? (ch === "00" ? "총칙" : ch),
      no: o?.no ?? (ch === "Q" ? "Q장" : `${Number(ch)}장`),
      procTitle: p?.title ?? null,
      docNo: p?.docNo ?? `STD-${ch}`,
      overview: secs.filter((s) => s.part === "overview"),
      procedure: secs.filter((s) => s.part === "procedure"),
      forms: rows.filter((r) => r.part === "form" && r.ch === ch && r.key !== "f:intro"),
      revised: secs.filter((s) => s.revisedOn).length,
    };
  });
  const appendices = STD_APPENDICES.map((a) => rows.find((r) => r.key === `a:${a}`)).filter((x) => !!x);
  const forms = rows.filter((r) => r.part === "form" && r.key !== "f:intro");
  return { chapters, appendices, forms };
}

/** 장 한 개(총람 절 + 절차서 절 + 관련 양식 목록). 볼 수 없는 절은 제목만 남기고 본문을 비운다 */
export async function getStdChapter(db: Db, actor: Actor, ch: string) {
  const rows = await db.select().from(stdSection).where(eq(stdSection.ch, ch)).orderBy(asc(stdSection.sort), asc(stdSection.key));
  if (!rows.length) throw new StdError("없는 장입니다");
  const mask = (r: StdRow) => (canSee(actor, r) ? { ...r, hidden: false } : { ...r, body: "", history: [], hidden: true });
  return {
    overview: rows.filter((r) => r.part === "overview" || r.part === "appendix").map(mask),
    procedure: rows.filter((r) => r.part === "procedure").map(mask),
    forms: rows.filter((r) => r.part === "form" && r.key !== "f:intro").map(mask),
  };
}

export async function getStdSection(db: Db, actor: Actor, key: string) {
  const [r] = await db.select().from(stdSection).where(eq(stdSection.key, key));
  if (!r) throw new StdError("없는 조항입니다");
  if (!canSee(actor, r)) throw new StdError(`이 조항은 ${roleText(r.roles)}만 볼 수 있습니다`);
  return r;
}

const ROLE_KO: Record<string, string> = {
  owner: "대표",
  plant_manager: "공장장",
  advisor: "상담원",
  technician: "기술자",
  quality: "품질 담당",
  safety: "안전환경 담당",
  accounting: "회계 담당",
};
export const roleText = (roles: string[]) => ["대표", ...roles.filter((r) => r !== "owner").map((r) => ROLE_KO[r] ?? r)].join("·");

/** 절 이름(화면·개정 요청서에 쓰는 한 줄) */
export function sectionLabel(s: Pick<StdRow, "part" | "docNo" | "no" | "title">) {
  if (s.part === "procedure") return `${s.docNo}${s.no && s.no !== s.docNo ? ` ${s.no}` : ""} ${s.title}`;
  if (s.part === "form") return `${s.no} ${s.title}`;
  if (s.part === "appendix") return `총람 ${s.no} ${s.title}`;
  return `총람 ${s.no ? `${s.no} ` : ""}${s.title}`;
}

// ── 찾기: 제목·번호는 초성으로도, 본문은 글자 그대로 찾는다

const CHO = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ";
export function chosung(s: string) {
  let o = "";
  for (const c of s) {
    const code = c.charCodeAt(0) - 0xac00;
    o += code >= 0 && code < 11172 ? CHO[Math.floor(code / 588)] : c;
  }
  return o;
}
const isCho = (q: string) => /^[ㄱ-ㅎ\s]+$/.test(q);
const norm = (s: string) => s.replace(/\s+/g, "").toLowerCase();

export type StdHit = { key: string; label: string; href: string; snippet: string; where: "title" | "body"; hidden: boolean };

export async function searchStd(db: Db, actor: Actor, q: string, limit = 60): Promise<StdHit[]> {
  const query = q.trim();
  if (!query) return [];
  const rows = await db.select().from(stdSection).orderBy(asc(stdSection.sort), asc(stdSection.key));
  const nq = norm(query);
  const cho = isCho(query);
  const hits: StdHit[] = [];
  for (const r of rows) {
    const label = sectionLabel(r);
    const see = canSee(actor, r);
    const inTitle = cho ? norm(chosung(label)).includes(nq) : norm(label).includes(nq);
    let snippet = "";
    let inBody = false;
    if (!cho && see) {
      const i = r.body.toLowerCase().indexOf(query.toLowerCase());
      if (i >= 0) {
        inBody = true;
        const s = Math.max(0, i - 40);
        snippet = `${s > 0 ? "…" : ""}${r.body.slice(s, i + query.length + 60).replace(/[|*#]/g, " ").replace(/\s+/g, " ")}…`;
      }
    }
    if (inTitle || inBody)
      hits.push({ key: r.key, label, href: stdKeyHref(r.key), snippet, where: inTitle ? "title" : "body", hidden: !see });
  }
  hits.sort((a, b) => (a.where === b.where ? 0 : a.where === "title" ? -1 : 1));
  return hits.slice(0, limit);
}

// ── 열람 제한(내용이 아니라 보는 사람을 정하는 것이라 결재 없이 품질 담당·대표가 바꾼다. 기록은 남김)

export async function setSectionRoles(db: Db, actor: Actor, key: string, roles: string[], now = new Date()) {
  if (!can(actor, "qms.docs")) throw new StdError("열람 제한은 품질 담당·대표가 정합니다");
  const clean = [...new Set(roles.filter((r) => isRole(r) && r !== "owner"))];
  const [old] = await db.select().from(stdSection).where(eq(stdSection.key, key));
  if (!old) throw new StdError("없는 조항입니다");
  await db.update(stdSection).set({ roles: clean, updatedBy: actor.id, updatedAt: now }).where(eq(stdSection.key, key));
  await writeAudit(db, { actorId: actor.id, action: "std.roles", entityType: "std_section", entityId: key, before: { roles: old.roles }, after: { roles: clean } });
}

// ── 개정: 개정 요청서(F-Q-05)에 절 키(secKey)와 바꿀 본문(proposed)이 있으면, 승인 때 본문을 바꾼다

/** 개정 요청서를 열 때 채울 값(현재 본문을 그대로 불러와 고칠 곳만 고치게) */
export async function revisionPrefill(db: Db, actor: Actor, key: string) {
  const s = await getStdSection(db, actor, key);
  const [d] = await db.select({ id: docRegister.id, rev: docRegister.rev, effectiveOn: docRegister.effectiveOn }).from(docRegister).where(and(eq(docRegister.no, s.docNo), eq(docRegister.status, "current")));
  return { s, label: sectionLabel(s), docId: d?.id ?? null, rev: d?.rev ?? null, effectiveOn: d?.effectiveOn ?? null };
}

export async function applyStdRevisionOnConfirm(tx: Db, doc: DocRow) {
  const data = doc.data as { secKey?: string; proposed?: string; docId?: string };
  if (!data.secKey || doc.cancelsId || !data.proposed) return;
  const [s] = await tx.select().from(stdSection).where(eq(stdSection.key, data.secKey));
  if (!s) return;
  const today = seoulDate(doc.confirmedAt ?? new Date());
  // 판은 문서 목록 쪽 훅(bumpRevisionOnConfirm)이 먼저 올린다. 그 판을 읽어 절에 적는다
  const [d] = data.docId ? await tx.select({ rev: docRegister.rev }).from(docRegister).where(eq(docRegister.id, data.docId)) : [];
  await tx
    .update(stdSection)
    .set({
      body: data.proposed.trim(),
      rev: d?.rev ?? s.rev,
      revisedOn: today,
      revisedRef: doc.docNo,
      history: [...s.history, { rev: s.rev, title: s.title, body: s.body, until: today, ref: doc.docNo }],
      updatedAt: new Date(),
    })
    .where(eq(stdSection.key, s.key));
  await notifyRole(tx, "plant_manager", `표준서 개정 시행: ${sectionLabel(s)} — 개정 교육을 계획하세요`, `std-rev-${s.key}-${doc.docNo}`, stdKeyHref(s.key));
}

/** 최근 고친 절(차례 화면 '최근 개정', 교육 화면 기본값) */
export async function recentRevisions(db: Db, since?: string) {
  const rows = await db
    .select({ key: stdSection.key, part: stdSection.part, docNo: stdSection.docNo, no: stdSection.no, title: stdSection.title, rev: stdSection.rev, revisedOn: stdSection.revisedOn, revisedRef: stdSection.revisedRef })
    .from(stdSection)
    .where(since ? gte(stdSection.revisedOn, since) : gte(stdSection.revisedOn, "0000"));
  return rows.sort((a, b) => (b.revisedOn ?? "").localeCompare(a.revisedOn ?? ""));
}

/** 개정됐는데 그 뒤로 '표준서 개정 교육'을 아직 계획하지 않은 표준서(할 일) */
export async function revisionsNeedingTraining(db: Db) {
  const recent = await recentRevisions(db);
  if (!recent.length) return [];
  const trs = await db.select({ createdAt: training.createdAt }).from(training).where(eq(training.kind, "std_rev"));
  const lastTr = trs.map((t) => seoulDate(t.createdAt)).sort().at(-1) ?? "";
  const byDoc = new Map<string, { docNo: string; rev: string | null; on: string; labels: string[]; key: string }>();
  for (const r of recent) {
    if (!r.revisedOn || r.revisedOn <= lastTr) continue;
    const cur = byDoc.get(r.docNo);
    if (cur) cur.labels.push(sectionLabel(r));
    else byDoc.set(r.docNo, { docNo: r.docNo, rev: r.rev, on: r.revisedOn, labels: [sectionLabel(r)], key: r.key });
  }
  return [...byDoc.values()];
}

export { chOf };

/** 문서 목록 미리 보기: 양식은 양식 본문, 절차서는 절 차례(번호·제목·바로가기). 열람 제한 절은 제목만 */
export async function docPreviews(db: Db, actor: Actor, docNos: string[]) {
  const out = new Map<string, { form?: string; sections?: { no: string; title: string; href: string }[] }>();
  if (!docNos.length) return out;
  const rows = await db.select().from(stdSection).where(inArray(stdSection.docNo, docNos)).orderBy(asc(stdSection.sort), asc(stdSection.key));
  for (const s of rows) {
    if (s.part === "form") {
      if (canSee(actor, s)) out.set(s.docNo, { form: s.body });
      continue;
    }
    if (s.part !== "procedure" || s.chapter) continue;
    const e = out.get(s.docNo) ?? { sections: [] };
    e.sections = [...(e.sections ?? []), { no: s.no, title: s.title, href: stdKeyHref(s.key) }];
    out.set(s.docNo, e);
  }
  return out;
}
