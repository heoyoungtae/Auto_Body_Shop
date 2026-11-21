// 홈페이지 › 작업 사례(손님 읽기 전용): 수리 전후 사진. 손님이 사진 홍보 사용에 동의한 건만, 번호판을 가린 사진만 보인다.
import type { Metadata } from "next";
import Link from "next/link";
import { getDb } from "@/db/runtime";
import { CASE_CATEGORIES, publicCases } from "@/modules/site/content";
import { siteBtn, siteData, SiteTitle } from "../_parts";

export const metadata: Metadata = { title: "작업 사례", description: "찌그러짐·긁힘·도색 수리 전후 사진" };

const img = (path: string) => `/api/site-file/${path}`;

export default async function CasesPage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const { c = "" } = await searchParams;
  const cat = CASE_CATEGORIES.includes(c) ? c : "";
  const db = await getDb();
  const [{ cfg }, rows] = await Promise.all([siteData(), publicCases(db, cat)]);
  const chip = (on: boolean) => `rounded-full border px-4 py-2 text-sm font-medium ${on ? "border-[var(--ink)] bg-[var(--ink)] text-white dark:border-white dark:bg-white dark:text-[var(--ink)]" : "border-[var(--line)] hover:bg-[var(--surface-2)]"}`;
  return (
    <div>
      <SiteTitle eyebrow="OUR WORK" help="site.cases" sub="고객님이 사진 사용에 동의해 주신 수리만 싣습니다. 번호판은 가렸습니다.">
        작업 사례
      </SiteTitle>
      <nav aria-label="분야" className="mb-6 flex flex-wrap gap-2">
        <Link href="?" className={chip(!cat)}>
          전체
        </Link>
        {CASE_CATEGORIES.map((x) => (
          <Link key={x} href={`?c=${encodeURIComponent(x)}`} className={chip(cat === x)}>
            {x}
          </Link>
        ))}
      </nav>
      {!rows.length ? (
        <p className="rounded-xl bg-[var(--surface-2)] p-6 text-center text-[var(--muted)]">작업 사례를 준비하고 있습니다.</p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((r) => {
            const before = r.photos.find((p) => p.side === "before");
            const after = r.photos.find((p) => p.side === "after");
            return (
              <li key={r.id}>
                <Link href={`/cases/${r.id}`} className="block overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface)] hover:shadow-[var(--shadow-lg)]">
                  <div className="grid grid-cols-2">
                    {[before, after].map((p, i) => (
                      <div key={i} className="relative aspect-[4/3] bg-[var(--surface-2)]">
                        {p && (
                          // eslint-disable-next-line @next/next/no-img-element -- 가린 사진 그대로
                          <img src={img(p.path)} alt={i ? "수리 후" : "수리 전"} className="size-full object-cover" loading="lazy" />
                        )}
                        <span className={`absolute left-2 top-2 rounded px-1.5 py-0.5 text-xs font-semibold text-white ${i ? "bg-[var(--ink)]" : "bg-black/60"}`}>{i ? "후" : "전"}</span>
                      </div>
                    ))}
                  </div>
                  <div className="p-4">
                    <p className="text-xs font-semibold text-[var(--red)]">{r.category}</p>
                    <p className="font-semibold">{r.title}</p>
                    {r.carLabel && <p className="text-sm text-[var(--muted)]">{r.carLabel}</p>}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {cfg.requests && (
        <div className="mt-10 text-center">
          <Link href="/request" className={siteBtn("red")}>
            내 차도 사진으로 견적 요청
          </Link>
        </div>
      )}
    </div>
  );
}
