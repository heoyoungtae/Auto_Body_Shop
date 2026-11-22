// 홈페이지 › 수리 안내(분야 한 곳): 이런 손상이면 → 고치는 방법(언제·어떻게·기간) → 순서 → 비용 기준·알아 둘 점 → 보증 → 작업 사례·기술자료 → 견적 요청.
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/db/runtime";
import { publicArticles } from "@/modules/site/articles";
import { publicCases } from "@/modules/site/content";
import { servicePage } from "@/modules/site/service-pages";
import { servicePagesView } from "@/modules/site/service-text";
import { ServiceIcon } from "../../_icons";
import { CtaBand, siteData, SiteTitle, viewPages } from "../../_parts";

const CASE_CAT: Record<string, string> = { dent: "찌그러짐", scratch: "긁힘", paint: "도색" };

/** 분야 한 곳(설정 › 홈페이지 › 화면 글에서 고친 글) */
async function load(slug: string) {
  if (!servicePage(slug)) return null;
  const v = await viewPages();
  const all = servicePagesView(v);
  return { s: all.find((x) => x.slug === slug)!, all, v };
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const r = await load((await params).slug);
  return r ? { title: r.s.title, description: r.s.lead } : {};
}

export default async function ServicePage({ params }: { params: Promise<{ slug: string }> }) {
  const r = await load((await params).slug);
  if (!r) notFound();
  const { s, all, v } = r;
  const db = await getDb();
  const [{ shop, cfg }, arts, cases] = await Promise.all([siteData(), publicArticles(db), CASE_CAT[s.slug] ? publicCases(db, CASE_CAT[s.slug], 3) : Promise.resolve([])]);
  const related = s.articles.map((k) => arts.find((a) => a.slug === k)).filter((a) => !!a);
  const others = all.filter((x) => x.slug !== s.slug);
  return (
    <div className="space-y-20">
      <div>
        <nav aria-label="위치" className="mb-6 text-sm text-[var(--muted)]">
          <Link href="/services" className="hover:text-[var(--fg)]">
            수리 안내
          </Link>{" "}
          / {s.title}
        </nav>
        <div className="flex items-start gap-5">
          <ServiceIcon name={s.slug} className="mt-2 hidden size-14 shrink-0 sm:block" />
          <SiteTitle eyebrow={s.en} help="site.services" sub={s.lead}>
            {s.title}
          </SiteTitle>
        </div>
        <p className="-mt-4 inline-flex rounded-full bg-[var(--ink)] px-4 py-2 text-sm font-semibold text-white dark:bg-white dark:text-[var(--ink)]">{s.warranty}</p>
      </div>

      <section aria-labelledby="signs" className="grid gap-8 lg:grid-cols-[1fr_1.6fr] lg:items-start">
        <div>
          <p className="eyebrow mb-2">SYMPTOMS</p>
          <h2 id="signs" className="text-2xl font-bold sm:text-[2rem]">
            이런 손상이면
          </h2>
        </div>
        <ul className="grid gap-3 sm:grid-cols-2">
          {s.signs.map((x, i) => (
            <li key={i} className="flex gap-3 rounded-xl border border-[var(--line)] p-4">
              <span aria-hidden className="mt-0.5 text-[var(--red)]">
                ✓
              </span>
              <span>{x}</span>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="methods">
        <p className="eyebrow mb-2">METHODS</p>
        <h2 id="methods" className="mb-8 text-2xl font-bold sm:text-[2rem]">
          고치는 방법
        </h2>
        <ul className="grid gap-5 md:grid-cols-3">
          {s.methods.map((m, i) => (
            <li key={i} className="flex flex-col rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-7">
              <p className="text-sm font-semibold tabular-nums text-[var(--red)]">METHOD 0{i + 1}</p>
              <p className="mt-1 text-xl font-bold">{m.name}</p>
              <dl className="mt-4 flex-1 space-y-3 text-[15px] leading-relaxed">
                <div>
                  <dt className="text-sm font-semibold text-[var(--steel)]">언제</dt>
                  <dd>{m.when}</dd>
                </div>
                <div>
                  <dt className="text-sm font-semibold text-[var(--steel)]">어떻게</dt>
                  <dd className="text-[var(--muted)]">{m.how}</dd>
                </div>
              </dl>
              <p className="mt-5 border-t border-[var(--line)] pt-4 text-sm">
                <span className="text-[var(--muted)]">걸리는 기간 </span>
                <b>{m.time}</b>
              </p>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-sm text-[var(--muted)]">기간은 보통의 눈대중입니다. 정확한 날짜는 차를 보고 견적서에 적어 드립니다.</p>
      </section>

      <section aria-labelledby="steps" className="-mx-5 bg-[var(--paper)] px-5 py-14 sm:rounded-3xl sm:px-10 lg:mx-0">
        <p className="eyebrow mb-2">PROCESS</p>
        <h2 id="steps" className="mb-8 text-2xl font-bold sm:text-[2rem]">
          이렇게 진행합니다
        </h2>
        <ol className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {s.steps.map((x, i) => (
            <li key={i} className="border-t-2 border-[var(--line-strong)] pt-4 first:border-[var(--red)]">
              <p className="text-sm font-semibold tabular-nums text-[var(--red)]">STEP 0{i + 1}</p>
              <p className="mt-1 text-lg font-bold">{x.t}</p>
              <p className="mt-1 text-sm leading-relaxed text-[var(--muted)]">{x.d}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="grid gap-5 md:grid-cols-2">
        <div className="rounded-2xl border border-[var(--line)] p-7 sm:p-8">
          <p className="eyebrow mb-2">PRICING</p>
          <h2 className="mb-4 text-xl font-bold">비용은 이것으로 정해집니다</h2>
          <ul className="space-y-2.5">
            {s.costs.map((x, i) => (
              <li key={i} className="flex gap-3">
                <span aria-hidden className="mt-[0.6em] size-1.5 shrink-0 rounded-full bg-[var(--red)]" />
                {x}
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-2xl bg-[var(--ink)] p-7 text-white sm:p-8">
          <p className="eyebrow mb-2 !text-white/50">GOOD TO KNOW</p>
          <h2 className="mb-4 text-xl font-bold">맡기기 전에 알아 두세요</h2>
          <ul className="space-y-3 text-white/80">
            {s.tips.map((x, i) => (
              <li key={i} className="leading-relaxed">
                {x}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {cases.length > 0 && (
        <section aria-labelledby="cases">
          <div className="mb-6 flex items-end justify-between">
            <h2 id="cases" className="text-2xl font-bold">
              {CASE_CAT[s.slug]} 작업 사례
            </h2>
            <Link href={`/cases?c=${encodeURIComponent(CASE_CAT[s.slug])}`} className="text-sm font-semibold hover:text-[var(--red)]">
              더 보기 →
            </Link>
          </div>
          <ul className="grid gap-5 sm:grid-cols-3">
            {cases.map((c) => {
              const after = c.photos.find((x) => x.side === "after") ?? c.photos[0];
              return (
                <li key={c.id}>
                  <Link href={`/cases/${c.id}`} className="lift block overflow-hidden rounded-2xl border border-[var(--line)]">
                    <div className="aspect-[4/3] bg-[var(--surface-2)]">
                      {/* eslint-disable-next-line @next/next/no-img-element -- 가린 사진 그대로 */}
                      {after && <img src={`/api/site-file/${after.path}`} alt={c.title} className="size-full object-cover" loading="lazy" />}
                    </div>
                    <p className="p-4 font-bold">{c.title}</p>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {related.length > 0 && (
        <section aria-labelledby="read">
          <p className="eyebrow mb-2">READ MORE</p>
          <h2 id="read" className="mb-6 text-2xl font-bold">
            같이 읽으면 좋은 글
          </h2>
          <ul className="grid gap-4 md:grid-cols-3">
            {related.map((a) => (
              <li key={a.slug}>
                <Link href={`/tech/${a.slug}`} className="lift block h-full rounded-2xl border border-[var(--line)] p-6">
                  <p className="eyebrow eyebrow-red !tracking-[0.12em]">{a.category}</p>
                  <p className="mt-1 font-bold leading-snug">{a.title}</p>
                  <p className="mt-2 line-clamp-2 text-sm text-[var(--muted)]">{a.summary}</p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <nav aria-label="다른 수리 분야" className="flex flex-wrap gap-2">
        <span className="mr-2 self-center text-sm text-[var(--muted)]">다른 분야</span>
        {others.map((o) => (
          <Link key={o.slug} href={`/services/${o.slug}`} className="inline-flex items-center gap-2 rounded-full border border-[var(--line)] px-4 py-2 text-sm font-medium hover:border-[var(--fg)]">
            <ServiceIcon name={o.slug} className="size-4" />
            {o.title}
          </Link>
        ))}
      </nav>

      <CtaBand requests={cfg.requests} phone={shop.phone} tel={shop.tel} title={`${s.title}, 사진으로 먼저 물어보세요`} body={v.t("services.ctaOne")} />
    </div>
  );
}
