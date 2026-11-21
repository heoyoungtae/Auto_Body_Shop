// 홈페이지 › 기술자료 한 편: 제목·요약·본문(소제목·항목·문단), 같이 읽을 글, 견적 요청. 공개를 끄면 '없는 글'.
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/db/runtime";
import { articleMeta, parseBody, readArticle } from "@/modules/site/articles";
import { ArticleBody, CtaBand, siteBtn, siteData, SiteTitle } from "../../_parts";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const a = await articleMeta(await getDb(), (await params).slug);
  return a ? { title: a.title, description: a.summary, openGraph: { title: a.title, description: a.summary, type: "article" } } : {};
}

export default async function ArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const db = await getDb();
  const [a, { shop, cfg }] = await Promise.all([readArticle(db, (await params).slug), siteData()]);
  if (!a) notFound();
  return (
    <article className="space-y-16">
      <div className="mx-auto max-w-3xl">
        <nav aria-label="위치" className="mb-6 text-sm text-[var(--muted)]">
          <Link href="/tech" className="hover:text-[var(--fg)]">
            기술자료
          </Link>{" "}
          / {a.category}
        </nav>
        <SiteTitle eyebrow={a.category} help="site.tech" sub={a.summary}>
          {a.title}
        </SiteTitle>
        <p className="-mt-6 mb-10 border-b border-[var(--line)] pb-6 text-sm text-[var(--steel)]">
          {a.minutes}분 읽기 · {a.updatedAt.toISOString().slice(0, 10).replaceAll("-", ".")} 고침 · {shop.name}
        </p>
        <ArticleBody blocks={parseBody(a.body)} />
        <p className="mt-10 rounded-xl border border-[var(--line)] p-5 text-sm leading-relaxed text-[var(--muted)]">이 글은 일반적인 안내입니다. 차마다 상태가 달라, 정확한 판단과 비용은 차를 직접 보고 견적서로 알려 드립니다.</p>
      </div>

      {a.related.length > 0 && (
        <section aria-labelledby="more" className="mx-auto max-w-5xl">
          <h2 id="more" className="mb-5 text-xl font-bold">
            같이 읽으면 좋은 글
          </h2>
          <ul className="grid gap-4 md:grid-cols-3">
            {a.related.map((r) => (
              <li key={r.slug}>
                <Link href={`/tech/${r.slug}`} className="lift block h-full rounded-2xl border border-[var(--line)] p-6">
                  <p className="eyebrow eyebrow-red !tracking-[0.12em]">{r.category}</p>
                  <p className="mt-1 font-bold leading-snug">{r.title}</p>
                  <p className="mt-3 text-sm text-[var(--steel)]">{r.minutes}분 읽기</p>
                </Link>
              </li>
            ))}
          </ul>
          <Link href="/tech" className={`${siteBtn("line")} mt-6`}>
            기술자료 모두 보기
          </Link>
        </section>
      )}

      <div className="mx-auto max-w-5xl">
        <CtaBand requests={cfg.requests} phone={shop.phone} tel={shop.tel} title="내 차도 그런지 궁금하다면" body="사진을 보내 주시면 상태와 고칠 방법을 알려 드립니다." />
      </div>
    </article>
  );
}
