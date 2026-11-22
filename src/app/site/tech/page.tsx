// 홈페이지 › 기술자료(손님 읽기 전용): 차량 관리·부식 예방·수리 방법·도장·보험 글. 분야별로 보고 낱말로 찾는다.
import type { Metadata } from "next";
import Link from "next/link";
import { getDb } from "@/db/runtime";
import { ARTICLE_CATEGORIES } from "@/modules/site/article-starters";
import { publicArticles } from "@/modules/site/articles";
import { CtaBand, siteBtn, siteData, SiteTitle } from "../_parts";

export const metadata: Metadata = { title: "기술자료", description: "차량 관리, 녹·부식 예방, 찌그러짐·긁힘·도장 수리 방법, 견적서·보험 이야기" };

export default async function TechPage({ searchParams }: { searchParams: Promise<{ q?: string; c?: string }> }) {
  const { q = "", c = "" } = await searchParams;
  const query = q.slice(0, 40);
  const db = await getDb();
  const [{ shop, cfg }, all, list] = await Promise.all([siteData(), publicArticles(db), publicArticles(db, query, c)]);
  const cats = ARTICLE_CATEGORIES.filter((x) => all.some((a) => a.category === x));
  const chip = (on: boolean) =>
    `rounded-full border px-4 py-2 text-sm font-medium ${on ? "border-[var(--ink)] bg-[var(--ink)] text-white dark:border-white dark:bg-white dark:text-[var(--ink)]" : "border-[var(--line)] hover:bg-[var(--surface-2)]"}`;
  const href = (cat: string) => `?${new URLSearchParams({ ...(query ? { q: query } : {}), ...(cat ? { c: cat } : {}) })}`;
  const [lead, ...rest] = list;
  return (
    <div className="space-y-16">
      <div>
        <SiteTitle eyebrow="KNOWLEDGE" help="site.tech" sub="차를 오래 아끼는 방법, 녹이 생기는 이유, 수리 방법과 견적서 읽는 법까지. 공업사에서 날마다 보는 것을 손님 말로 옮겼습니다.">
          기술자료
        </SiteTitle>
        <form className="-mt-4 mb-4 flex max-w-2xl gap-2" role="search">
          {c && <input type="hidden" name="c" value={c} />}
          <input
            type="search"
            name="q"
            defaultValue={query}
            placeholder="낱말로 찾기 (예: 녹, 세차, 겨울, 견적서)"
            aria-label="글 찾기"
            className="min-h-12 min-w-0 flex-1 rounded-lg border border-[var(--line-strong)] bg-[var(--surface)] px-4 text-base"
          />
          <button className={siteBtn("navy")}>찾기</button>
        </form>
        {cats.length > 1 && (
          <nav aria-label="분야" className="flex flex-wrap gap-2">
            <Link href={href("")} className={chip(!c)}>
              전체 {all.length}
            </Link>
            {cats.map((x) => (
              <Link key={x} href={href(x)} className={chip(c === x)}>
                {x} {all.filter((a) => a.category === x).length}
              </Link>
            ))}
          </nav>
        )}
      </div>

      {!all.length ? (
        <p className="rounded-xl bg-[var(--surface-2)] p-6 text-center text-[var(--muted)]">글을 준비하고 있습니다. 궁금한 점은 전화나 견적 요청으로 물어봐 주세요.</p>
      ) : !list.length ? (
        <p className="rounded-xl bg-[var(--surface-2)] p-6 text-center text-[var(--muted)]">
          &lsquo;{query}&rsquo;에 맞는 글이 없습니다.{" "}
          <Link href="?" className="underline">
            전체 보기
          </Link>
        </p>
      ) : (
        <div className="space-y-6">
          {lead && (
            <Link href={`/tech/${lead.slug}`} className="lift hero-bg block overflow-hidden rounded-3xl p-8 text-white sm:p-12">
              <p className="eyebrow !text-white/60">{lead.category}</p>
              <p className="mt-3 max-w-2xl text-2xl font-bold leading-snug sm:text-[2rem]">{lead.title}</p>
              <p className="mt-3 max-w-2xl leading-relaxed text-white/70">{lead.summary}</p>
              <p className="mt-6 text-sm text-white/60">
                {lead.minutes}분 읽기 · <span className="font-semibold text-white">읽어 보기 →</span>
              </p>
            </Link>
          )}
          {rest.length > 0 && (
            <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {rest.map((a) => (
                <li key={a.id}>
                  <Link href={`/tech/${a.slug}`} className="lift flex h-full flex-col rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-6">
                    <p className="eyebrow eyebrow-red !tracking-[0.12em]">{a.category}</p>
                    <p className="mt-2 text-lg font-bold leading-snug">{a.title}</p>
                    <p className="mt-2 line-clamp-3 flex-1 text-[15px] leading-relaxed text-[var(--muted)]">{a.summary}</p>
                    <p className="mt-4 text-sm text-[var(--steel)]">{a.minutes}분 읽기</p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <CtaBand requests={cfg.requests} phone={shop.phone} tel={shop.tel} title="내 차도 그런지 궁금하다면" body="사진을 보내 주시면 상태와 고칠 방법을 알려 드립니다." />
    </div>
  );
}
