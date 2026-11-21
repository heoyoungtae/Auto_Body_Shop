// 홈페이지 › 작업 사례(손님 읽기 전용): 수리 전후 사진. 손님이 사진 홍보 사용에 동의한 건만, 번호판을 가린 사진만 보인다.
import type { Metadata } from "next";
import Link from "next/link";
import { getDb } from "@/db/runtime";
import { CASE_CATEGORIES, publicCases } from "@/modules/site/content";
import { caseSamples, SAMPLE_LABEL, sampleImg } from "@/modules/site/case-samples";
import { siteBtn, siteData, SiteTitle } from "../_parts";

export const metadata: Metadata = { title: "작업 사례", description: "찌그러짐·긁힘·도색 수리 전후 사진" };

const img = (path: string) => `/api/site-file/${path}`;

export default async function CasesPage({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const { c = "" } = await searchParams;
  const cat = CASE_CATEGORIES.includes(c) ? c : "";
  const db = await getDb();
  const [{ cfg }, rows, anyReal] = await Promise.all([siteData(), publicCases(db, cat), publicCases(db, "", 1)]);
  const samples = caseSamples(anyReal.length, cat);
  const chip = (on: boolean) => `rounded-full border px-4 py-2 text-sm font-medium ${on ? "border-[var(--ink)] bg-[var(--ink)] text-white dark:border-white dark:bg-white dark:text-[var(--ink)]" : "border-[var(--line)] hover:bg-[var(--surface-2)]"}`;
  return (
    <div>
      <SiteTitle eyebrow="OUR WORK" help="site.cases" sub={samples.length ? "수리 방법을 전·후 그림으로 먼저 보여 드립니다. 실제 사진은 고객님 동의를 받아 올립니다." : "고객님이 사진 사용에 동의해 주신 수리만 싣습니다. 번호판은 가렸습니다."}>
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
      {samples.length > 0 ? (
        <>
          <p className="mb-4 rounded-xl border border-[var(--red)]/30 bg-[var(--red)]/5 p-4 text-sm leading-relaxed">
            <b className="text-[var(--red)]">{SAMPLE_LABEL}</b> 개업 준비 중이라 아래는 수리 방법을 보여 드리는 그림입니다. 실제 수리 사진은 고객님 동의를 받아 번호판을 가린 뒤 올립니다.
          </p>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {samples.map((x) => (
              <li key={x.key}>
                <Link href={`/services/${x.service}`} className="block overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--surface)] hover:shadow-[var(--shadow-lg)]">
                  <div className="relative grid grid-cols-2 gap-px bg-[var(--line)]">
                    <span className="absolute inset-x-0 top-2 z-10 mx-auto w-fit rounded-full bg-[var(--red)] px-3 py-1 text-xs font-semibold text-white">{SAMPLE_LABEL}</span>
                    {(["before", "after"] as const).map((side) => (
                      <div key={side} className="relative aspect-[4/3] bg-[var(--surface-2)]">
                        {/* eslint-disable-next-line @next/next/no-img-element -- 예시 그림 */}
                        <img src={sampleImg(x.key, side)} alt={`${SAMPLE_LABEL} ${side === "before" ? "수리 전" : "수리 후"}`} className="size-full object-cover" loading="lazy" />
                      </div>
                    ))}
                  </div>
                  <div className="p-4">
                    <p className="text-xs font-semibold text-[var(--red)]">
                      {x.category} · {SAMPLE_LABEL}
                    </p>
                    <p className="font-semibold">{x.title}</p>
                    <p className="mt-1 text-sm text-[var(--muted)]">{x.body}</p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </>
      ) : !rows.length ? (
        <p className="rounded-xl bg-[var(--surface-2)] p-6 text-center text-[var(--muted)]">이 분야 작업 사례를 준비하고 있습니다.</p>
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
