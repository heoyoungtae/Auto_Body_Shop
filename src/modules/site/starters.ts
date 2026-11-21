// 홈페이지 처음 글 저절로 채우기(대표 2026-11-22 "기술자료와 자주 묻는 질문이 비었는데?").
// 손님이 홈페이지를 처음 열 때 한 번만: 자주 묻는 질문 23개·기술자료 17편을 지금 정책값으로 만들어 '공개'로 넣는다.
// 이미 초안을 불러와 두었는데 공개한 것이 하나도 없으면 그 초안을 공개로 바꾼다. 그 뒤로는 직원이 고치고 내리는 대로 둔다
// (모두 지워도 다시 채우지 않는다 — app_config 'site_seed_faq'·'site_seed_articles'에 넣은 key 목록). 처음 글을 뒤에 늘리면 새 글만 저절로 들어간다.
import { and, eq, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { appConfig, siteArticle, siteFaq } from "@/db/schema";
import { loadPolicy } from "@/modules/platform/policy";
import { seoulDate } from "@/modules/platform/time";
import { ARTICLE_STARTERS } from "./article-starters";
import { FAQ_STARTERS } from "./faq-starters";

/** 읽는 데 걸리는 분: 한국어 1분에 300자 남짓(꼼꼼히 읽는 속도) */
export const readMinutes = (body: string) => Math.max(1, Math.round(body.replace(/\s+/g, "").length / 300));

type Seed = { at: string; keys: string[] };

/**
 * 처음 글 넣기 표시(app_config): 지금까지 홈페이지에 넣어 준 처음 글 key 목록.
 * - 표시가 없으면(처음) 세우고, 공개 글이 하나도 없을 때 예전에 '공개 안 함'으로 불러 둔 처음 글을 공개로 바꾼다.
 * - 목록에 없는 새 처음 글(뒤에 늘린 글)만 넣는다. 직원이 지운 글은 목록에 있으므로 다시 넣지 않는다.
 * - 동시에 여러 손님이 열어도 한 번만: 표시를 고치는 쪽(낙관적 잠금)만 넣는다.
 * 돌려주는 값: 이번에 넣어야 할 key(없으면 빈 배열)
 */
async function claimNew(db: Db, key: string, all: string[], now: Date): Promise<{ fresh: boolean; add: Set<string> }> {
  const [cur] = await db.select({ data: appConfig.data }).from(appConfig).where(eq(appConfig.key, key));
  const next: Seed = { at: now.toISOString(), keys: all };
  if (!cur) {
    const r = await db.insert(appConfig).values({ key, data: next, updatedAt: now }).onConflictDoNothing().returning({ key: appConfig.key });
    return { fresh: r.length > 0, add: r.length ? new Set(all) : new Set() };
  }
  const old = cur.data as Partial<Seed>;
  const had = new Set(old.keys ?? []);
  const add = all.filter((k) => !had.has(k));
  if (!add.length) return { fresh: false, add: new Set() };
  const r = await db
    .update(appConfig)
    .set({ data: { ...next, keys: [...had, ...add] }, updatedAt: now })
    .where(and(eq(appConfig.key, key), sql`${appConfig.data} = ${JSON.stringify(cur.data)}::jsonb`))
    .returning({ key: appConfig.key });
  return { fresh: false, add: r.length ? new Set(add) : new Set() };
}

export async function faqStarterRows(db: Db, have: Set<string | null>, published: boolean, actorId: string | null, now: Date) {
  const p = await loadPolicy(db, seoulDate(now));
  return FAQ_STARTERS.filter((s) => !have.has(s.key)).map((s, i) => ({ category: s.category, question: s.q, answer: s.a(p), sort: (FAQ_STARTERS.indexOf(s) + 1) * 10, published, origin: "starter", starterKey: s.key, updatedBy: actorId, createdAt: new Date(now.getTime() + i), updatedAt: now }));
}

export async function articleStarterRows(db: Db, have: Set<string | null>, slugs: Set<string>, published: boolean, actorId: string | null, now: Date) {
  const p = await loadPolicy(db, seoulDate(now));
  return ARTICLE_STARTERS.filter((s) => !have.has(s.key) && !slugs.has(s.slug)).map((s, i) => {
    const body = s.body(p);
    return { slug: s.slug, category: s.category, title: s.title, summary: s.summary, body, minutes: readMinutes(body), sort: (ARTICLE_STARTERS.indexOf(s) + 1) * 10, published, origin: "starter", starterKey: s.key, updatedBy: actorId, createdAt: new Date(now.getTime() + i), updatedAt: now };
  });
}

export async function ensureFaqStarters(db: Db, now = new Date()) {
  const { fresh, add } = await claimNew(db, "site_seed_faq", FAQ_STARTERS.map((x) => x.key), now);
  if (!fresh && !add.size) return;
  const rows = await db.select({ k: siteFaq.starterKey, pub: siteFaq.published }).from(siteFaq);
  if (fresh && !rows.some((r) => r.pub)) await db.update(siteFaq).set({ published: true, updatedAt: now }).where(and(eq(siteFaq.origin, "starter"), eq(siteFaq.published, false)));
  const skip = new Set<string | null>([...rows.map((r) => r.k), ...FAQ_STARTERS.map((x) => x.key).filter((k) => !add.has(k))]);
  const ins = await faqStarterRows(db, skip, true, null, now);
  if (ins.length) await db.insert(siteFaq).values(ins);
}

export async function ensureArticleStarters(db: Db, now = new Date()) {
  const { fresh, add } = await claimNew(db, "site_seed_articles", ARTICLE_STARTERS.map((x) => x.key), now);
  if (!fresh && !add.size) return;
  const rows = await db.select({ k: siteArticle.starterKey, slug: siteArticle.slug, pub: siteArticle.published }).from(siteArticle);
  if (fresh && !rows.some((r) => r.pub)) await db.update(siteArticle).set({ published: true, updatedAt: now }).where(and(eq(siteArticle.origin, "starter"), eq(siteArticle.published, false)));
  const skip = new Set<string | null>([...rows.map((r) => r.k), ...ARTICLE_STARTERS.map((x) => x.key).filter((k) => !add.has(k))]);
  const ins = await articleStarterRows(db, skip, new Set(rows.map((r) => r.slug)), true, null, now);
  if (ins.length) await db.insert(siteArticle).values(ins);
}
