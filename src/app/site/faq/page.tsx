// 홈페이지 › 자주 묻는 질문(손님 읽기 전용): 분야별로 보고, 낱말로 찾는다. 답이 없으면 견적 요청·전화로 잇는다.
import type { Metadata } from "next";
import Link from "next/link";
import { getDb } from "@/db/runtime";
import { FAQ_CATEGORIES } from "@/modules/site/faq-starters";
import { publicFaqs } from "@/modules/site/content";
import { siteBtn, siteData, SiteTitle } from "../_parts";

export const metadata: Metadata = { title: "자주 묻는 질문", description: "찌그러짐·긁힘·도색 수리, 견적·보험·보증에 대해 자주 묻는 질문과 답" };

export default async function FaqPage({ searchParams }: { searchParams: Promise<{ q?: string; c?: string }> }) {
  const { q = "", c = "" } = await searchParams;
  const query = q.slice(0, 40);
  const db = await getDb();
  const [{ shop, cfg }, all, list] = await Promise.all([siteData(), publicFaqs(db), publicFaqs(db, query, c)]);
  const cats = FAQ_CATEGORIES.filter((x) => all.some((f) => f.category === x));
  const chip = (on: boolean) => `rounded-full border px-4 py-2 text-sm font-medium ${on ? "border-[var(--ink)] bg-[var(--ink)] text-white dark:border-white dark:bg-white dark:text-[var(--ink)]" : "border-[var(--line)] hover:bg-[var(--surface-2)]"}`;
  const href = (cat: string) => `?${new URLSearchParams({ ...(query ? { q: query } : {}), ...(cat ? { c: cat } : {}) })}`;
  return (
    <div className="mx-auto max-w-3xl">
      <SiteTitle eyebrow="FAQ" help="site.faq" sub="찾는 답이 없으면 사진으로 견적을 요청하거나 전화해 주세요.">
        자주 묻는 질문
      </SiteTitle>
      <form className="mb-4 flex gap-2" role="search">
        {c && <input type="hidden" name="c" value={c} />}
        <input type="search" name="q" defaultValue={query} placeholder="낱말로 찾기 (예: 보험, 세차, 보증)" aria-label="질문 찾기" className="min-h-12 min-w-0 flex-1 rounded-lg border border-[var(--line-strong)] bg-[var(--surface)] px-4 text-base" />
        <button className={siteBtn("navy")}>찾기</button>
      </form>
      {cats.length > 1 && (
        <nav aria-label="분야" className="mb-6 flex flex-wrap gap-2">
          <Link href={href("")} className={chip(!c)}>
            전체
          </Link>
          {cats.map((x) => (
            <Link key={x} href={href(x)} className={chip(c === x)}>
              {x}
            </Link>
          ))}
        </nav>
      )}
      {!all.length ? (
        <p className="rounded-xl bg-[var(--surface-2)] p-6 text-center text-[var(--muted)]">질문을 준비하고 있습니다. 궁금한 점은 전화나 견적 요청으로 물어봐 주세요.</p>
      ) : !list.length ? (
        <p className="rounded-xl bg-[var(--surface-2)] p-6 text-center text-[var(--muted)]">
          &lsquo;{query}&rsquo;에 맞는 질문이 없습니다.{" "}
          <Link href="?" className="underline">
            전체 보기
          </Link>
        </p>
      ) : (
        <div className="space-y-6">
          {FAQ_CATEGORIES.map((cat) => {
            const items = list.filter((f) => f.category === cat);
            if (!items.length) return null;
            return (
              <section key={cat} aria-label={cat}>
                <h2 className="mb-2 text-lg font-bold">{cat}</h2>
                <div className="divide-y divide-[var(--line)] rounded-xl border border-[var(--line)] bg-[var(--surface)]">
                  {items.map((f) => (
                    <details key={f.id} className="group px-4 py-3" open={!!query && items.length <= 3}>
                      <summary className="flex cursor-pointer list-none items-start gap-2 font-semibold [&::-webkit-details-marker]:hidden">
                        <span className="text-[var(--red)]">Q.</span>
                        <span className="flex-1">{f.question}</span>
                        <span aria-hidden className="text-[var(--muted)] transition group-open:rotate-180">
                          ▾
                        </span>
                      </summary>
                      <p className="mt-2 whitespace-pre-line pl-6 text-[var(--muted)]">{f.answer}</p>
                    </details>
                  ))}
                </div>
              </section>
            );
          })}
          {list.some((f) => !(FAQ_CATEGORIES as readonly string[]).includes(f.category)) && (
            <section aria-label="기타">
              <h2 className="mb-2 text-lg font-bold">기타</h2>
              <div className="divide-y divide-[var(--line)] rounded-xl border border-[var(--line)] bg-[var(--surface)]">
                {list
                  .filter((f) => !(FAQ_CATEGORIES as readonly string[]).includes(f.category))
                  .map((f) => (
                    <details key={f.id} className="px-4 py-3">
                      <summary className="cursor-pointer font-semibold">{f.question}</summary>
                      <p className="mt-2 whitespace-pre-line text-[var(--muted)]">{f.answer}</p>
                    </details>
                  ))}
              </div>
            </section>
          )}
        </div>
      )}
      <div className="mt-10 flex flex-wrap justify-center gap-3">
        {cfg.requests && (
          <Link href="/request" className={siteBtn("red")}>
            사진으로 견적 요청
          </Link>
        )}
        {shop.phone && (
          <a href={`tel:${shop.tel}`} className={siteBtn("line")}>
            전화 {shop.phone}
          </a>
        )}
      </div>
    </div>
  );
}
