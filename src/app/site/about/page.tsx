// 공업사 소개: 인사말(설정 › 홈페이지), 수리 분야, 작업 기준(사내 표준서 요약), 보증, 오시는 길
import Link from "next/link";
import type { Metadata } from "next";
import { getDb } from "@/db/runtime";
import { PHOTO_KINDS, siteTrust } from "@/modules/site/trust";
import { EditFab, siteBtn, siteData, SiteTitle, viewPages } from "../_parts";

export const metadata: Metadata = { title: "공업사 소개" };

export default async function AboutPage() {
  const db = await getDb();
  const [{ shop, cfg, mapUrl }, trust, v] = await Promise.all([siteData(), siteTrust(db), viewPages()]);
  return (
    <div className="mx-auto max-w-4xl space-y-20">
      <EditFab to={"/settings/site/pages?g=about"} label="공업사 소개 고치기" />
      <SiteTitle eyebrow="ABOUT US" help="site.about" sub={shop.name}>
        공업사 소개
      </SiteTitle>
      {cfg.about && (
        <section className="-mt-8 space-y-5 border-l-2 border-[var(--red)] pl-6 text-lg leading-[1.9] sm:text-xl">
          {cfg.about.split(/\n\s*\n/).map((p, i) => (
            <p key={i} className="whitespace-pre-line">
              {p}
            </p>
          ))}
        </section>
      )}
      <section>
        <p className="eyebrow mb-2">SERVICES</p>
        <h2 className="mb-6 text-2xl font-bold sm:text-[2rem]">수리 분야</h2>
        <ul className="grid gap-5 sm:grid-cols-3">
          {v.pairs("about.services").map((s, i) => (
            <li key={i} className="rounded-2xl border border-[var(--line)] p-6">
              <p className="text-sm font-semibold tabular-nums text-[var(--red)]">0{i + 1}</p>
              <p className="mt-3 text-lg font-bold">{s.t}</p>
              <p className="mt-2 leading-relaxed text-[var(--muted)]">{s.d}</p>
            </li>
          ))}
        </ul>
      </section>
      {trust.photos.length > 0 && (
        <section aria-labelledby="shop">
          <p className="eyebrow mb-2">OUR SHOP</p>
          <h2 id="shop" className="mb-6 text-2xl font-bold sm:text-[2rem]">
            공업사 둘러보기
          </h2>
          <ul className="grid grid-cols-2 gap-3 md:grid-cols-3">
            {trust.photos.map((ph) => (
              <li key={ph.id}>
                <figure className="overflow-hidden rounded-2xl bg-[var(--surface-2)]">
                  {/* eslint-disable-next-line @next/next/no-img-element -- 공업사 사진 그대로 */}
                  <img src={`/api/site-file/${ph.path}`} alt={ph.caption || PHOTO_KINDS[ph.kind]} width={ph.width} height={ph.height} className="aspect-[4/3] w-full object-cover" loading="lazy" />
                  <figcaption className="px-4 py-2.5 text-sm">
                    <b>{PHOTO_KINDS[ph.kind]}</b>
                    {ph.caption && <span className="text-[var(--muted)]"> · {ph.caption}</span>}
                  </figcaption>
                </figure>
              </li>
            ))}
          </ul>
        </section>
      )}
      {trust.certs.length > 0 && (
        <section aria-labelledby="certs">
          <p className="eyebrow mb-2">CERTIFICATIONS</p>
          <h2 id="certs" className="mb-6 text-2xl font-bold sm:text-[2rem]">
            자격·인증
          </h2>
          <ul className="grid gap-4 sm:grid-cols-2">
            {trust.certs.map((c) => (
              <li key={c.id} className="rounded-2xl border border-[var(--line)] p-6">
                <p className="text-lg font-bold">{c.name}</p>
                <p className="mt-1.5 leading-relaxed text-[var(--muted)]">{c.desc}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section className="-mx-5 bg-[var(--paper)] px-5 py-14 sm:rounded-3xl sm:px-10">
        <p className="eyebrow mb-2">OUR STANDARD</p>
        <h2 className="text-2xl font-bold sm:text-[2rem]">{v.t("about.rules.title")}</h2>
        <p className="mt-3 whitespace-pre-line text-[var(--muted)]">{v.t("about.rules.lead")}</p>
        <ol className="mt-8 space-y-5">
          {v.lines("about.rules.items").map((r, i) => (
            <li key={i} className="flex gap-5">
              <span className="w-8 shrink-0 text-lg font-bold tabular-nums text-[var(--red)]">{String(i + 1).padStart(2, "0")}</span>
              <span className="text-lg leading-relaxed">{r}</span>
            </li>
          ))}
        </ol>
      </section>
      <section className="grid gap-8 rounded-2xl bg-[var(--ink)] p-8 text-white sm:grid-cols-[1fr_auto] sm:items-end sm:p-10">
        <div>
          <p className="eyebrow mb-2 !text-white/50">LOCATION · HOURS</p>
          <h2 className="mb-4 text-2xl font-bold">오시는 길·영업시간</h2>
          <p className="text-lg">{shop.address || "주소 준비 중"}</p>
          {cfg.hours && <p className="mt-1 text-white/65">{cfg.hours}</p>}
          {shop.phone && (
            <p className="mt-3 text-xl font-semibold tabular-nums">
              <a href={`tel:${shop.tel}`}>{shop.phone}</a>
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-3">
          {mapUrl && (
            <a href={mapUrl} target="_blank" rel="noopener" className={siteBtn("ghost")}>
              네이버 지도
            </a>
          )}
          {cfg.requests && (
            <Link href="/request" className={siteBtn("red")}>
              견적 요청하기
            </Link>
          )}
        </div>
      </section>
    </div>
  );
}
