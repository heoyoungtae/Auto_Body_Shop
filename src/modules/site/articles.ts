// 홈페이지 3단계 › 기술자료: 손님이 읽는 차체 수리 상식 글. 직원(consult.write)이 쓰고 공개하며, 손님은 읽기만 한다.
// 처음 초안 10편(표준서 기반, 정책값 숫자 넣음)을 '공개 안 함'으로 불러와 고쳐 공개한다.
import { and, asc, desc, eq, isNotNull, ne, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { siteArticle } from "@/db/schema";
import type { Role } from "@/modules/auth/roles";
import { can } from "@/modules/auth/permissions";
import { writeAudit } from "@/modules/platform/audit";
import { loadPolicy } from "@/modules/platform/policy";
import { seoulDate } from "@/modules/platform/time";
import { ARTICLE_CATEGORIES, ARTICLE_STARTERS } from "./article-starters";
import { maskPersonal } from "./rules";
import { SiteError } from "./service";

type Actor = { id: string; roles: readonly Role[] };
const cut = (s: unknown, n: number) => String(s ?? "").trim().slice(0, n);
function mustWrite(actor: Actor) {
  if (!can(actor, "consult.write")) throw new SiteError("홈페이지 글은 상담을 쓸 수 있는 사람(상담원·공장장·대표)이 씁니다");
}

/** 읽는 데 걸리는 분: 한국어 1분에 300자 남짓(꼼꼼히 읽는 속도) */
export const readMinutes = (body: string) => Math.max(1, Math.round(body.replace(/\s+/g, "").length / 300));

/** 주소용 이름: 영문 소문자·숫자·하이픈 3~60자 */
export const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export type ArticleBlock = { kind: "h"; text: string } | { kind: "p"; text: string } | { kind: "ul"; items: string[] };

/** 본문 꾸밈 풀기: '## 소제목', '- 항목', 빈 줄로 문단(그 밖의 꾸밈은 글자 그대로) */
export function parseBody(body: string): ArticleBlock[] {
  const out: ArticleBlock[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) out.push({ kind: "p", text: para.join(" ") });
    para = [];
  };
  for (const raw of body.replace(/\r/g, "").split("\n")) {
    const line = raw.trim();
    if (!line) {
      flush();
      continue;
    }
    if (line.startsWith("## ")) {
      flush();
      out.push({ kind: "h", text: line.slice(3).trim() });
    } else if (/^[-•·]\s+/.test(line)) {
      flush();
      const item = line.replace(/^[-•·]\s+/, "");
      const last = out[out.length - 1];
      if (last?.kind === "ul") last.items.push(item);
      else out.push({ kind: "ul", items: [item] });
    } else para.push(line);
  }
  flush();
  return out;
}

export async function listArticles(db: Db) {
  return db.select().from(siteArticle).orderBy(asc(siteArticle.category), asc(siteArticle.sort), asc(siteArticle.createdAt));
}

const order = (c: string) => {
  const i = (ARTICLE_CATEGORIES as readonly string[]).indexOf(c);
  return i < 0 ? 99 : i;
};

/** 공개한 글만(본문 빼고). q 가 있으면 제목·요약·본문에서 찾는다(띄어쓰기 무시) */
export async function publicArticles(db: Db, q = "", category = "") {
  const rows = await db
    .select({ id: siteArticle.id, slug: siteArticle.slug, category: siteArticle.category, title: siteArticle.title, summary: siteArticle.summary, body: siteArticle.body, minutes: siteArticle.minutes, sort: siteArticle.sort, updatedAt: siteArticle.updatedAt })
    .from(siteArticle)
    .where(eq(siteArticle.published, true))
    .orderBy(asc(siteArticle.sort), asc(siteArticle.createdAt));
  const words = q.replace(/\s+/g, " ").trim().toLowerCase().split(" ").filter(Boolean).slice(0, 5);
  const squash = (s: string) => s.replace(/\s+/g, "").toLowerCase();
  return rows
    .filter((r) => !category || r.category === category)
    .filter((r) => words.every((w) => squash(`${r.title} ${r.summary} ${r.body}`).includes(squash(w))))
    .sort((a, b) => order(a.category) - order(b.category) || a.sort - b.sort)
    .map(({ body, ...r }) => ({ ...r, minutes: readMinutes(body) }));
}

/** 홈 첫 화면용: 분야마다 맨 앞 글 하나씩, 분야 차례대로 n편(분야가 모자라면 나머지 글로 채움) */
export async function featuredArticles(db: Db, n = 3) {
  const all = await publicArticles(db);
  const seen = new Set<string>();
  const first = all.filter((a) => (seen.has(a.category) ? false : (seen.add(a.category), true)));
  return [...first, ...all.filter((a) => !first.includes(a))].slice(0, n);
}

/** 공개 글 한 편(본 횟수 +1)과 같은 분야 다른 글 */
export async function readArticle(db: Db, slug: string) {
  if (!SLUG_RE.test(slug)) return null;
  const [a] = await db.select().from(siteArticle).where(and(eq(siteArticle.slug, slug), eq(siteArticle.published, true)));
  if (!a) return null;
  await db.update(siteArticle).set({ views: sql`${siteArticle.views} + 1` }).where(eq(siteArticle.id, a.id));
  const related = await db
    .select({ slug: siteArticle.slug, title: siteArticle.title, category: siteArticle.category, minutes: siteArticle.minutes })
    .from(siteArticle)
    .where(and(eq(siteArticle.published, true), ne(siteArticle.id, a.id)))
    .orderBy(desc(sql`${siteArticle.category} = ${a.category}`), asc(siteArticle.sort))
    .limit(3);
  return { ...a, minutes: readMinutes(a.body), related };
}

export type ArticleInput = { id?: string; slug: string; category: string; title: string; summary: string; body: string; sort: number; published: boolean };

export async function saveArticle(db: Db, actor: Actor, input: ArticleInput, now = new Date()) {
  mustWrite(actor);
  const slug = cut(input.slug, 60).toLowerCase();
  const category = cut(input.category, 20);
  const title = cut(input.title, 120);
  const summary = cut(input.summary, 300);
  const body = cut(input.body, 20000);
  if (!SLUG_RE.test(slug) || slug.length < 3) throw new SiteError("주소 이름은 영문 소문자·숫자·하이픈 3자 이상입니다(예: dent-vs-panel)");
  if (!category) throw new SiteError("분야를 골라 주세요");
  if (title.length < 4) throw new SiteError("제목을 적어 주세요");
  if (summary.length < 10) throw new SiteError("목록에 보일 요약을 두세 줄 적어 주세요");
  if (body.length < 50) throw new SiteError("본문이 너무 짧습니다");
  const all = `${title}\n${summary}\n${body}`;
  if (input.published && maskPersonal(all) !== all) throw new SiteError("공개할 글에 휴대폰 번호나 차량번호가 있습니다. 지우고 공개해 주세요");
  const [dup] = await db.select({ id: siteArticle.id }).from(siteArticle).where(eq(siteArticle.slug, slug));
  if (dup && dup.id !== input.id) throw new SiteError("같은 주소 이름의 글이 이미 있습니다. 다른 이름을 써 주세요");
  const sort = Number.isFinite(input.sort) ? Math.max(0, Math.min(999, Math.round(input.sort))) : 100;
  const values = { slug, category, title, summary, body, minutes: readMinutes(body), sort, published: input.published, updatedBy: actor.id, updatedAt: now };
  let id = input.id;
  if (id) {
    const [r] = await db.update(siteArticle).set(values).where(eq(siteArticle.id, id)).returning({ id: siteArticle.id });
    if (!r) throw new SiteError("없는 글입니다");
  } else {
    [{ id }] = await db.insert(siteArticle).values({ ...values, createdAt: now }).returning({ id: siteArticle.id });
  }
  await writeAudit(db, { actorId: actor.id, action: "site.article", entityType: "site_article", entityId: id!, after: { slug, title, published: input.published } });
  return id!;
}

export async function deleteArticle(db: Db, actor: Actor, id: string) {
  mustWrite(actor);
  const [r] = await db.delete(siteArticle).where(eq(siteArticle.id, id)).returning({ t: siteArticle.title });
  if (r) await writeAudit(db, { actorId: actor.id, action: "site.article_delete", entityType: "site_article", entityId: id, before: { title: r.t } });
}

/** 처음 초안 10편 넣기(이미 넣은 것·같은 주소 이름은 건너뜀). 지금 정책값을 넣고 '공개 안 함'으로 둔다 */
export async function loadArticleStarters(db: Db, actor: Actor, now = new Date()) {
  mustWrite(actor);
  const have = await db.select({ k: siteArticle.starterKey, slug: siteArticle.slug }).from(siteArticle).where(isNotNull(siteArticle.slug));
  const keys = new Set(have.map((r) => r.k));
  const slugs = new Set(have.map((r) => r.slug));
  const p = await loadPolicy(db, seoulDate(now));
  const rows = ARTICLE_STARTERS.filter((s) => !keys.has(s.key) && !slugs.has(s.slug)).map((s, i) => {
    const body = s.body(p);
    return { slug: s.slug, category: s.category, title: s.title, summary: s.summary, body, minutes: readMinutes(body), sort: (ARTICLE_STARTERS.indexOf(s) + 1) * 10, published: false, origin: "starter", starterKey: s.key, updatedBy: actor.id, createdAt: new Date(now.getTime() + i), updatedAt: now };
  });
  if (rows.length) await db.insert(siteArticle).values(rows);
  await writeAudit(db, { actorId: actor.id, action: "site.article_starters", entityType: "site_article", entityId: "starters", after: { added: rows.length } });
  return rows.length;
}

/** 화면 제목·검색 설명용(본 횟수 안 올림) */
export async function articleMeta(db: Db, slug: string) {
  if (!SLUG_RE.test(slug)) return null;
  const [a] = await db.select({ title: siteArticle.title, summary: siteArticle.summary }).from(siteArticle).where(and(eq(siteArticle.slug, slug), eq(siteArticle.published, true)));
  return a ?? null;
}
