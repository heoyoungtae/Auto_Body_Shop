// 홈페이지 › 작업 사례 한 건: 수리 전·후 사진과 설명. 공개를 끄거나 손님이 동의를 거두면 '없는 사례'가 된다
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/db/runtime";
import { readCase } from "@/modules/site/content";
import { siteBtn, siteData, SiteTitle } from "../../_parts";

export const metadata: Metadata = { title: "작업 사례" };

export default async function CasePage({ params }: { params: Promise<{ id: string }> }) {
  const db = await getDb();
  const [c, { cfg }] = await Promise.all([readCase(db, (await params).id), siteData()]);
  if (!c) notFound();
  const sides = [
    ["before", "수리 전"],
    ["after", "수리 후"],
  ] as const;
  return (
    <article className="mx-auto max-w-4xl">
      <SiteTitle eyebrow="OUR WORK" help="site.cases" sub={[c.category, c.carLabel, c.workedOn ? `${c.workedOn.slice(0, 4)}년 ${Number(c.workedOn.slice(5, 7))}월` : null].filter(Boolean).join(" · ")}>
        {c.title}
      </SiteTitle>
      <div className="grid gap-6 md:grid-cols-2">
        {sides.map(([s, label]) => (
          <section key={s} aria-label={label}>
            <h2 className="mb-2 font-bold">{label}</h2>
            <div className="space-y-3">
              {c.photos
                .filter((p) => p.side === s)
                .map((p) => (
                  // eslint-disable-next-line @next/next/no-img-element -- 가린 사진 그대로
                  <img key={p.path} src={`/api/site-file/${p.path}`} alt={`${c.title} ${label}`} width={p.width} height={p.height} className="w-full rounded-xl border border-[var(--line)]" loading="lazy" />
                ))}
            </div>
          </section>
        ))}
      </div>
      {c.body && <p className="mt-6 whitespace-pre-line rounded-xl bg-[var(--surface-2)] p-5 leading-relaxed">{c.body}</p>}
      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/cases" className={siteBtn("line")}>
          다른 사례 보기
        </Link>
        {cfg.requests && (
          <Link href="/request" className={siteBtn("red")}>
            사진으로 견적 요청
          </Link>
        )}
      </div>
    </article>
  );
}
