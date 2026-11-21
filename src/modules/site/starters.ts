// 홈페이지 처음 글 저절로 채우기(대표 2026-11-22 "기술자료와 자주 묻는 질문이 비었는데?").
// 손님이 홈페이지를 처음 열 때 한 번만: 자주 묻는 질문 20개·기술자료 17편을 지금 정책값으로 만들어 '공개'로 넣는다.
// 이미 초안을 불러와 두었는데 공개한 것이 하나도 없으면 그 초안을 공개로 바꾼다. 그 뒤로는 직원이 고치고 내리는 대로 둔다
// (모두 지워도 다시 채우지 않는다 — app_config 'site_seed_faq'·'site_seed_articles' 표시로 한 번만).
import { and, eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { appConfig, siteArticle, siteFaq } from "@/db/schema";
import { loadPolicy } from "@/modules/platform/policy";
import { seoulDate } from "@/modules/platform/time";
import { ARTICLE_STARTERS } from "./article-starters";
import { FAQ_STARTERS } from "./faq-starters";

/** 읽는 데 걸리는 분: 한국어 1분에 300자 남짓(꼼꼼히 읽는 속도) */
export const readMinutes = (body: string) => Math.max(1, Math.round(body.replace(/\s+/g, "").length / 300));

/** 이 표시를 처음 세운 쪽만 true(동시에 여러 손님이 열어도 한 번만 채운다) */
async function claim(db: Db, key: string, now: Date) {
  const r = await db.insert(appConfig).values({ key, data: { at: now.toISOString() }, updatedAt: now }).onConflictDoNothing().returning({ key: appConfig.key });
  return r.length > 0;
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
  const [pub] = await db.select({ id: siteFaq.id }).from(siteFaq).where(eq(siteFaq.published, true)).limit(1);
  if (pub || !(await claim(db, "site_seed_faq", now))) return;
  const rows = await db.select({ k: siteFaq.starterKey }).from(siteFaq);
  if (rows.length) await db.update(siteFaq).set({ published: true, updatedAt: now }).where(and(eq(siteFaq.origin, "starter"), eq(siteFaq.published, false)));
  const add = await faqStarterRows(db, new Set(rows.map((r) => r.k)), true, null, now);
  if (add.length) await db.insert(siteFaq).values(add);
}

export async function ensureArticleStarters(db: Db, now = new Date()) {
  const [pub] = await db.select({ id: siteArticle.id }).from(siteArticle).where(eq(siteArticle.published, true)).limit(1);
  if (pub || !(await claim(db, "site_seed_articles", now))) return;
  const rows = await db.select({ k: siteArticle.starterKey, slug: siteArticle.slug }).from(siteArticle);
  if (rows.length) await db.update(siteArticle).set({ published: true, updatedAt: now }).where(and(eq(siteArticle.origin, "starter"), eq(siteArticle.published, false)));
  const add = await articleStarterRows(db, new Set(rows.map((r) => r.k)), new Set(rows.map((r) => r.slug)), true, null, now);
  if (add.length) await db.insert(siteArticle).values(add);
}
