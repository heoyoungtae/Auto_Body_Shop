// 홈페이지 첫 화면(고급·전문 컨셉): 배경 사진 첫 화면(한 줄 소개·견적 요청·내 차 수첩, 믿을 근거 숫자) → 수리 분야(4) → 고를 이유 → 품질 기준 →
// 정비소 사진 → 진행 순서 → 내 차 수첩(홍보 중심, 휴대폰 그림) → 작업 사례 → 후기 → 보험·보증 → 기술자료 → 자주 묻는 질문 → 공지·오시는 길 → 마무리 띠.
// 숫자(보증 기간·검사 기준·회신 기한)는 정책값에서 불러와 정비소 기준이 바뀌면 함께 바뀐다.
// 배경 단락 다음 단락의 차례·보이기·문구는 설정 › 홈페이지 › 첫 화면에서 정한다(modules/site/page-text.ts 처음 문구 + site_pages 고친 것).
import { Fragment, type ReactNode } from "react";
import Link from "next/link";
import { getDb } from "@/db/runtime";
import { loadPolicy } from "@/modules/platform/policy";
import { noticeTitle, publicCases, publicFaqs, publicNotices } from "@/modules/site/content";
import { featuredArticles } from "@/modules/site/articles";
import { caseSamples, SAMPLE_LABEL, sampleImg } from "@/modules/site/case-samples";
import { SERVICE_PAGES } from "@/modules/site/service-pages";
import { heroImage, PHOTO_KINDS, siteTrust } from "@/modules/site/trust";
import { sitePages } from "@/modules/site/pages";
import type { SectionKey } from "@/modules/site/page-text";
import { ServiceIcon } from "./_icons";
import { Lines, SectionHead, siteBtn, siteData, SiteTitle } from "./_parts";
import { PhoneEstimate, PhoneProgress, PhoneWarranty } from "./_phone";

/** 진행 단계 개수에 맞춘 넓은 화면 칸 수 */
const STEP_COLS: Record<number, string> = { 3: "lg:grid-cols-3", 4: "lg:grid-cols-4", 5: "lg:grid-cols-5", 6: "lg:grid-cols-6", 7: "lg:grid-cols-7", 8: "lg:grid-cols-4" };

export default async function SiteHome() {
  const db = await getDb();
  const [{ shop, cfg, mapUrl }, p, cases, notices, faqs, trust, articles, v] = await Promise.all([
    siteData(),
    loadPolicy(db),
    publicCases(db, "", 3),
    publicNotices(db),
    publicFaqs(db),
    siteTrust(db),
    featuredArticles(db, 3),
    sitePages(db),
  ]);
  const hero = heroImage(trust);
  // 실제 공개 사례가 없으면 예시 그림 3장(분야마다 하나, '예시(실제 작업사진 준비중)' 표시)
  const samples = caseSamples(cases.length).filter((_, i) => i % 2 === 0);
  const reviewLinks = [
    ["네이버 후기", trust.links.naver],
    ["카카오맵 후기", trust.links.kakao],
    ["구글 후기", trust.links.google],
  ].filter(([, u]) => u);
  const warrantyTop = Math.max(p["warranty.paint_months"], p["warranty.dent_months"]);
  const TRUST = [
    { n: "6", u: "단계", d: "표준 공정" },
    {
      n: `${p["inspect.film_min_um"]}–${p["inspect.film_max_um"]}`,
      u: "μm",
      d: "도막 두께 검사",
    },
    { n: String(warrantyTop), u: "개월", d: "도장·판금 보증" },
    {
      n: String(p["consult.reply_business_days"]),
      u: "영업일",
      d: "사진 견적 회신",
    },
  ];
  const QUALITY = [
    { k: "패널 간극", v: `좌우 차 ${p["inspect.gap_mm"]}mm 이내` },
    {
      k: "도막 두께",
      v: `${p["inspect.film_min_um"]}~${p["inspect.film_max_um"]}μm`,
    },
    { k: "작업 후 사진", v: `${p["inspect.after_photos"]}장 이상 기록` },
    { k: "검사자", v: "작업자와 다른 사람" },
  ];
  const shown = v.home.order.filter(v.shows);
  const steps = v.pairs("home.process.items");
  const blocks: Record<SectionKey, ReactNode> = {
    services: (
      <>
        {/* 수리 분야 */}
        <section aria-labelledby="svc">
          <SectionHead eyebrow={v.t("home.services.eyebrow")} id="svc" title={v.t("home.services.title")} more={{ href: "/services", label: "수리 안내 모두 보기" }} />
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {SERVICE_PAGES.map((s, i) => (
              <Link key={s.slug} href={`/services/${s.slug}`} className="lift group flex flex-col rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-7">
                <div className="mb-8 flex items-center justify-between">
                  <ServiceIcon name={s.slug} />
                  <span className="text-sm font-semibold tabular-nums text-[var(--steel)]">0{i + 1}</span>
                </div>
                <p className="mb-2 text-xl font-bold">{s.title}</p>
                <p className="flex-1 leading-relaxed text-[var(--muted)]">{s.lead}</p>
                <span className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold group-hover:text-[var(--red)]">
                  방법·기간·비용 기준 <span aria-hidden>→</span>
                </span>
              </Link>
            ))}
          </div>
        </section>
      </>
    ),
    why: (
      <>
        {/* 고를 이유 */}
        <section aria-labelledby="why" className="grid gap-10 lg:grid-cols-[1fr_1.5fr]">
          <div>
            <p className="eyebrow mb-2">{v.t("home.why.eyebrow")}</p>
            <h2 id="why" className="text-2xl font-bold leading-snug sm:text-[2rem]">
              <Lines text={v.t("home.why.title")} />
            </h2>
            <p className="mt-4 max-w-sm whitespace-pre-line leading-relaxed text-[var(--muted)]">{v.t("home.why.lead")}</p>
          </div>
          <ol className="grid gap-x-8 gap-y-10 sm:grid-cols-2">
            {v.pairs("home.why.items").map((w, i) => (
              <li key={i}>
                <p className="text-4xl font-bold tabular-nums text-[var(--line-strong)]">{String(i + 1).padStart(2, "0")}</p>
                <p className="mt-2 text-lg font-bold">{w.t}</p>
                <p className="mt-1.5 leading-relaxed text-[var(--muted)]">{w.d}</p>
              </li>
            ))}
          </ol>
        </section>
      </>
    ),
    quality: (
      <>
        {/* 품질 기준 */}
        <section aria-labelledby="quality" className="-mx-5 bg-[var(--paper)] px-5 py-16 sm:py-20 lg:mx-[calc(50%-50vw)] lg:px-[calc(50vw-50%+1.25rem)]">
          <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[1fr_1.2fr] lg:items-center">
            <div>
              <p className="eyebrow mb-2">{v.t("home.quality.eyebrow")}</p>
              <h2 id="quality" className="text-2xl font-bold leading-snug sm:text-[2rem]">
                <Lines text={v.t("home.quality.title")} />
              </h2>
              <p className="mt-4 max-w-md whitespace-pre-line leading-relaxed text-[var(--muted)]">{v.t("home.quality.lead")}</p>
            </div>
            <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--line)]">
              {QUALITY.map((q) => (
                <div key={q.k} className="bg-[var(--surface)] p-6">
                  <dt className="text-sm text-[var(--muted)]">{q.k}</dt>
                  <dd className="mt-2 text-lg font-bold sm:text-xl">{q.v}</dd>
                </div>
              ))}
            </dl>
          </div>
          {trust.certs.length > 0 && (
            <ul className="mx-auto mt-10 grid max-w-6xl gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="자격·인증">
              {trust.certs.map((c) => (
                <li key={c.id} className="flex gap-3 rounded-xl bg-[var(--surface)] p-4">
                  <svg
                    aria-hidden
                    viewBox="0 0 24 24"
                    className="mt-0.5 size-6 shrink-0 text-[var(--red)]"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.6}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M12 3 4 6v6c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6z" />
                    <path d="m8.5 12 2.5 2.5 4.5-5" />
                  </svg>
                  <div>
                    <p className="font-bold">{c.name}</p>
                    <p className="mt-0.5 text-sm leading-relaxed text-[var(--muted)]">{c.desc}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </>
    ),
    photos: (
      <>
        {/* 정비소 사진 */}
        {trust.photos.length > 0 && (
          <section aria-labelledby="shop">
            <SectionHead eyebrow={v.t("home.photos.eyebrow")} id="shop" title={v.t("home.photos.title")} more={{ href: "/about", label: "정비소 소개" }} />
            <ul className="grid auto-rows-[11rem] grid-cols-2 gap-3 sm:auto-rows-[14rem] md:grid-cols-4">
              {trust.photos.slice(0, 6).map((ph, i) => (
                <li key={ph.id} className={`group relative overflow-hidden rounded-2xl bg-[var(--surface-2)] ${i === 0 ? "col-span-2 row-span-2" : ""}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- 정비소 사진 그대로 */}
                  <img src={`/api/site-file/${ph.path}`} alt={ph.caption || PHOTO_KINDS[ph.kind]} className="size-full object-cover transition duration-500 group-hover:scale-[1.03]" loading="lazy" />
                  <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-4 pb-3 pt-8 text-sm font-medium text-white">{ph.caption || PHOTO_KINDS[ph.kind]}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </>
    ),
    process: (
      <>
        {/* 진행 순서 */}
        <section aria-labelledby="flow">
          <SectionHead eyebrow={v.t("home.process.eyebrow")} id="flow" title={v.t("home.process.title")} />
          <ol className={`grid gap-x-6 gap-y-8 sm:grid-cols-3 ${STEP_COLS[steps.length] ?? "lg:grid-cols-4"}`}>
            {steps.map((s, i) => (
              <li key={i} className="relative border-t-2 border-[var(--line)] pt-5 first:border-[var(--red)]">
                <p className="text-sm font-semibold tabular-nums text-[var(--red)]">STEP 0{i + 1}</p>
                <p className="mt-1 text-lg font-bold">{s.t}</p>
                <p className="mt-1.5 text-sm leading-relaxed text-[var(--muted)]">{s.d}</p>
              </li>
            ))}
          </ol>
        </section>
      </>
    ),
    carbook: (
      <>
        {/* 내 차 수첩: 홍보의 중심 */}
        <section aria-labelledby="carbook" className="relative -mx-5 overflow-hidden bg-[var(--ink)] px-5 py-20 text-white sm:py-24 lg:mx-[calc(50%-50vw)] lg:px-[calc(50vw-50%+1.25rem)]">
          <div
            aria-hidden
            className="absolute inset-0 bg-[radial-gradient(50rem_28rem_at_90%_10%,rgb(200_16_46_/_0.35),transparent_60%),radial-gradient(40rem_24rem_at_0%_100%,rgb(64_92_140_/_0.3),transparent_60%)]"
          />
          <div className="relative mx-auto grid max-w-6xl gap-14 lg:grid-cols-[1fr_1.15fr] lg:items-center">
            <div>
              <p className="eyebrow mb-3 !text-white/55">
                {v.t("home.carbook.eyebrow")} <span className="ml-2 rounded-full bg-[var(--red)] px-2 py-0.5 text-[10px] tracking-normal text-white">무료</span>
              </p>
              <h2 id="carbook" className="text-3xl font-bold leading-tight sm:text-[2.6rem]">
                <Lines text={v.t("home.carbook.title")} />
              </h2>
              <p className="mt-5 max-w-lg whitespace-pre-line text-lg leading-relaxed text-white/70">{v.t("home.carbook.lead")}</p>
              <ul className="mt-8 grid gap-5 sm:grid-cols-2">
                {v.pairs("home.carbook.items").map((c, i) => (
                  <li key={i} className="border-l-2 border-[var(--red)] pl-4">
                    <p className="font-bold">{c.t}</p>
                    <p className="mt-1 text-sm leading-relaxed text-white/60">{c.d}</p>
                  </li>
                ))}
              </ul>
              {v.t("home.carbook.note") && <p className="mt-6 whitespace-pre-line text-sm text-white/55">{v.t("home.carbook.note")}</p>}
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/carbook-guide" className={siteBtn("red")}>
                  어떻게 쓰는지 보기
                </Link>
                <Link href="/my" className={siteBtn("ghost")}>
                  내 차 수첩 열기
                </Link>
              </div>
            </div>
            <div className="flex items-center justify-center gap-4 text-[var(--fg)] [&>div]:shrink-0">
              <div className="hidden translate-y-6 scale-90 sm:block">
                <PhoneEstimate />
              </div>
              <div className="relative z-10">
                <PhoneProgress />
              </div>
              <div className="hidden translate-y-6 scale-90 md:block">
                <PhoneWarranty months={p["warranty.paint_months"]} />
              </div>
            </div>
          </div>
        </section>
      </>
    ),
    cases: (
      <>
        {/* 작업 사례 예시(실제 사례가 없을 때만) */}
        {samples.length > 0 && (
          <section aria-labelledby="samples">
            <SectionHead eyebrow={v.t("home.cases.eyebrow")} id="samples" title={v.t("home.cases.sampleTitle")} more={{ href: "/cases", label: "작업 사례 보기" }} />
            <ul className="grid gap-5 sm:grid-cols-3">
              {samples.map((x) => (
                <li key={x.key}>
                  <Link href={`/services/${x.service}`} className="lift group block overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface)]">
                    <div className="relative grid grid-cols-2 gap-px bg-[var(--line)]">
                      <span className="absolute inset-x-0 top-2 z-10 mx-auto w-fit rounded-full bg-[var(--red)] px-3 py-1 text-xs font-semibold text-white">{SAMPLE_LABEL}</span>
                      {(["before", "after"] as const).map((side) => (
                        // eslint-disable-next-line @next/next/no-img-element -- 예시 그림
                        <img key={side} src={sampleImg(x.key, side)} alt={`${SAMPLE_LABEL} ${side === "before" ? "수리 전" : "수리 후"}`} className="aspect-[4/3] w-full object-cover" loading="lazy" />
                      ))}
                    </div>
                    <div className="p-5">
                      <p className="eyebrow eyebrow-red !tracking-[0.12em]">{x.category}</p>
                      <p className="mt-1 font-bold">{x.title}</p>
                      <p className="mt-1 text-sm text-[var(--muted)]">{SAMPLE_LABEL}</p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
        {/* 작업 사례 */}
        {cases.length > 0 && (
          <section aria-labelledby="cases">
            <SectionHead eyebrow={v.t("home.cases.eyebrow")} id="cases" title={v.t("home.cases.title")} more={{ href: "/cases", label: "사례 모두 보기" }} />
            <ul className="grid gap-5 sm:grid-cols-3">
              {cases.map((c) => {
                const after = c.photos.find((x) => x.side === "after") ?? c.photos[0];
                return (
                  <li key={c.id}>
                    <Link href={`/cases/${c.id}`} className="lift group block overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface)]">
                      <div className="aspect-[4/3] overflow-hidden bg-[var(--surface-2)]">
                        {after && (
                          // eslint-disable-next-line @next/next/no-img-element -- 가린 사진 그대로
                          <img src={`/api/site-file/${after.path}`} alt={c.title} className="size-full object-cover transition duration-500 group-hover:scale-[1.03]" loading="lazy" />
                        )}
                      </div>
                      <div className="p-5">
                        <p className="eyebrow eyebrow-red !tracking-[0.12em]">{c.category}</p>
                        <p className="mt-1 font-bold">{c.title}</p>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </>
    ),
    reviews: (
      <>
        {/* 손님 후기 */}
        {(trust.reviews.length > 0 || trust.rating.score) && (
          <section aria-labelledby="reviews">
            <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="eyebrow mb-2">{v.t("home.reviews.eyebrow")}</p>
                <h2 id="reviews" className="text-2xl font-bold sm:text-[2rem]">
                  {v.t("home.reviews.title")}
                </h2>
              </div>
              {trust.rating.score && (
                <p className="flex items-baseline gap-2">
                  <span className="text-4xl font-bold tabular-nums">{trust.rating.score.toFixed(1)}</span>
                  <span className="text-lg text-[#e0a100]" aria-label={`5점 만점에 ${trust.rating.score}점`}>
                    ★★★★★
                  </span>
                  <span className="text-sm text-[var(--muted)]">
                    {trust.rating.source}
                    {trust.rating.count ? ` 후기 ${trust.rating.count.toLocaleString("ko-KR")}개` : ""}
                  </span>
                </p>
              )}
            </div>
            {trust.reviews.length > 0 && (
              <ul className="grid gap-5 md:grid-cols-3">
                {trust.reviews.slice(0, 3).map((r) => (
                  <li key={r.id} className="flex flex-col rounded-2xl border border-[var(--line)] p-7">
                    <p className="text-[#e0a100]" aria-label={`${r.rating}점`}>
                      {"★".repeat(r.rating)}
                      <span className="text-[var(--line-strong)]">{"★".repeat(5 - r.rating)}</span>
                    </p>
                    <blockquote className="mt-4 flex-1 text-[17px] leading-relaxed">&ldquo;{r.text}&rdquo;</blockquote>
                    <p className="mt-5 text-sm text-[var(--muted)]">
                      <b className="text-[var(--fg)]">{r.name}</b> 고객님 · {r.source}
                      {r.date ? ` · ${r.date.slice(0, 7).replace("-", ".")}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            )}
            {reviewLinks.length > 0 && (
              <div className="mt-6 flex flex-wrap gap-2">
                {reviewLinks.map(([label, url]) => (
                  <a key={label} href={url} target="_blank" rel="noopener" className={siteBtn("line")}>
                    {label} 모두 보기
                  </a>
                ))}
              </div>
            )}
          </section>
        )}
      </>
    ),
    insurance: (
      <>
        {/* 보험·보증 */}
        <section aria-label="보험 수리와 보증" className="grid gap-5 md:grid-cols-2">
          <div className="rounded-2xl border border-[var(--line)] p-8">
            <p className="eyebrow mb-2">INSURANCE</p>
            <h2 className="text-2xl font-bold">{v.t("home.insurance.title")}</h2>
            <p className="mt-3 whitespace-pre-line leading-relaxed text-[var(--muted)]">{v.t("home.insurance.lead")}</p>
            <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2">
              <Link href="/insurance" className="inline-flex items-center gap-1.5 text-sm font-semibold hover:text-[var(--red)]">
                보험 수리 안내 <span aria-hidden>→</span>
              </Link>
              <Link href="/guide" className="inline-flex items-center gap-1.5 text-sm font-semibold hover:text-[var(--red)]">
                맡기기 전 준비·출고 뒤 관리 <span aria-hidden>→</span>
              </Link>
            </div>
          </div>
          <div className="rounded-2xl bg-[var(--ink)] p-8 text-white">
            <p className="eyebrow mb-2 !text-white/50">WARRANTY</p>
            <h2 className="text-2xl font-bold">{v.t("home.insurance.warrantyTitle")}</h2>
            <dl className="mt-5 grid grid-cols-3 gap-3 text-center">
              {[
                ["도장·판금", p["warranty.paint_months"]],
                ["덴트", p["warranty.dent_months"]],
                ["광택", p["warranty.polish_months"]],
              ].map(([k, v]) => (
                <div key={k} className="rounded-xl border border-white/12 py-4">
                  <dd className="text-2xl font-bold tabular-nums">
                    {v}
                    <span className="ml-0.5 text-sm font-medium text-white/60">개월</span>
                  </dd>
                  <dt className="mt-1 text-sm text-white/60">{k}</dt>
                </div>
              ))}
            </dl>
            <p className="mt-4 whitespace-pre-line text-sm leading-relaxed text-white/60">{v.t("home.insurance.warrantyNote")}</p>
          </div>
        </section>
      </>
    ),
    tech: (
      <>
        {/* 기술자료 */}
        {articles.length > 0 && (
          <section aria-labelledby="tech">
            <SectionHead eyebrow={v.t("home.tech.eyebrow")} id="tech" title={v.t("home.tech.title")} more={{ href: "/tech", label: "기술자료 모두 보기" }} />
            <ul className="grid gap-5 md:grid-cols-3">
              {articles.map((a, i) => (
                <li key={a.id}>
                  <Link href={`/tech/${a.slug}`} className={`lift flex h-full flex-col rounded-2xl p-7 ${i === 0 ? "hero-bg text-white" : "border border-[var(--line)] bg-[var(--surface)]"}`}>
                    <p className={`eyebrow !tracking-[0.12em] ${i === 0 ? "!text-white/60" : "eyebrow-red"}`}>{a.category}</p>
                    <p className="mt-2 text-lg font-bold leading-snug">{a.title}</p>
                    <p className={`mt-2 line-clamp-3 flex-1 text-[15px] leading-relaxed ${i === 0 ? "text-white/70" : "text-[var(--muted)]"}`}>{a.summary}</p>
                    <p className={`mt-5 text-sm ${i === 0 ? "text-white/55" : "text-[var(--steel)]"}`}>{a.minutes}분 읽기</p>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </>
    ),
    faq: (
      <>
        {/* 자주 묻는 질문 */}
        {faqs.length > 0 && (
          <section aria-labelledby="faq">
            <SectionHead eyebrow="FAQ" id="faq" title={v.t("home.faq.title")} more={{ href: "/faq", label: "질문 모두 보기" }} />
            <div className="divide-y divide-[var(--line)] border-y border-[var(--line)]">
              {faqs.slice(0, 5).map((f) => (
                <details key={f.id} className="group py-5">
                  <summary className="flex cursor-pointer list-none items-start gap-4 text-lg font-semibold [&::-webkit-details-marker]:hidden">
                    <span className="flex-1">{f.question}</span>
                    <span aria-hidden className="mt-1 text-xl leading-none text-[var(--steel)] transition group-open:rotate-45">
                      +
                    </span>
                  </summary>
                  <p className="mt-3 max-w-3xl whitespace-pre-line leading-relaxed text-[var(--muted)]">{f.answer}</p>
                </details>
              ))}
            </div>
          </section>
        )}
      </>
    ),
    notice: (
      <>
        {/* 공지·오시는 길 */}
        <section className="grid gap-5 md:grid-cols-2">
          <div className="rounded-2xl border border-[var(--line)] p-7">
            <p className="eyebrow mb-2">NOTICE</p>
            <h2 className="mb-4 text-xl font-bold">{v.t("home.notice.title")}</h2>
            {notices.length ? (
              <ul className="space-y-2.5">
                {notices.slice(0, 3).map((n) => (
                  <li key={n.id}>
                    <Link href={`/notice/${n.id}`} className="flex gap-3 hover:text-[var(--red)]">
                      <span className="min-w-0 flex-1 truncate">{noticeTitle(n)}</span>
                      <span className="shrink-0 text-sm tabular-nums text-[var(--muted)]">{n.startsOn.slice(5).replace("-", ".")}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[var(--muted)]">지금 올라온 공지가 없습니다.</p>
            )}
            <Link href="/notice" className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold hover:text-[var(--red)]">
              공지 모두 보기 <span aria-hidden>→</span>
            </Link>
          </div>
          <div className="rounded-2xl border border-[var(--line)] p-7">
            <p className="eyebrow mb-2">LOCATION</p>
            <h2 className="mb-3 text-xl font-bold">{v.t("home.notice.mapTitle")}</h2>
            <p>{shop.address || "주소 준비 중"}</p>
            {cfg.hours && <p className="mt-1 text-sm text-[var(--muted)]">{cfg.hours}</p>}
            {mapUrl && (
              <a href={mapUrl} target="_blank" rel="noopener" className={`${siteBtn("line")} mt-5`}>
                네이버 지도
              </a>
            )}
          </div>
        </section>
      </>
    ),
    cta: (
      <>
        {/* 마무리 띠 */}
        {cfg.requests && (
          <section className={`hero-bg -mx-5 px-5 py-16 text-center text-white sm:py-20 lg:mx-[calc(50%-50vw)] ${shown.at(-1) === "cta" ? "-mb-12 sm:-mb-16" : "rounded-none"}`}>
            <p className="eyebrow mb-3 !text-white/55">ESTIMATE</p>
            <h2 className="text-2xl font-bold sm:text-4xl">{v.t("home.cta.title")}</h2>
            <p className="mx-auto mt-3 max-w-xl whitespace-pre-line text-white/70">{v.t("home.cta.lead")}</p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Link href="/request" className={siteBtn("red")}>
                사진으로 견적 요청
              </Link>
              {shop.phone && (
                <a href={`tel:${shop.tel}`} className={siteBtn("ghost")}>
                  전화 {shop.phone}
                </a>
              )}
            </div>
          </section>
        )}
      </>
    ),
  };
  return (
    <div className="space-y-24 sm:space-y-32">
      {/* 첫 화면 */}
      <section className="relative -mx-5 -mt-12 overflow-hidden bg-[var(--ink)] px-5 pb-16 pt-20 text-white sm:-mt-16 sm:pb-20 sm:pt-28 lg:mx-[calc(50%-50vw)] lg:px-[calc(50vw-50%+1.25rem)]">
        {/* 배경: 고른 정비소 사진, 없으면 기본 그림(차체 곡면). 글자가 읽히게 왼쪽·아래를 어둡게 덮는다 */}
        {/* eslint-disable-next-line @next/next/no-img-element -- 배경 그림 그대로 */}
        <img src={hero} alt="" aria-hidden className="hero-photo absolute inset-0 size-full object-cover" fetchPriority="high" />
        {/* 어둡게 덮는 정도는 설정 › 홈페이지 › 첫 화면에서(밝은 사진이면 높이고, 사진을 더 보이려면 낮춘다) */}
        <div aria-hidden className="absolute inset-0" style={{ opacity: v.home.shade / 100 }}>
          <div className="absolute inset-0 bg-gradient-to-r from-[var(--ink)]/95 via-[var(--ink)]/70 to-[var(--ink)]/20" />
          <div className="absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-[var(--ink)] to-transparent" />
        </div>
        <div className="relative mx-auto max-w-6xl">
          <p className="eyebrow mb-5 !text-white/55">{v.t("home.hero.eyebrow")}</p>
          <div className="max-w-3xl [&_h1]:text-[2.4rem] [&_h1]:leading-[1.15] sm:[&_h1]:text-6xl [&_button]:text-white/60 [&_h1]:mb-0">
            <SiteTitle help="site.home">{cfg.headline}</SiteTitle>
          </div>
          {cfg.lead && <p className="-mt-4 max-w-2xl text-lg leading-relaxed text-white/75 sm:text-xl">{cfg.lead}</p>}
          <div className="mt-10 flex flex-wrap gap-3">
            {cfg.requests && (
              <Link href="/request" className={siteBtn("red")}>
                사진으로 견적 요청
              </Link>
            )}
            <Link href="/carbook-guide" className={siteBtn("ghost")}>
              {v.t("home.hero.button")}
            </Link>
            {shop.phone && (
              <a href={`tel:${shop.tel}`} className="inline-flex min-h-12 items-center px-2 text-[15px] font-semibold text-white/80 hover:text-white">
                전화 {shop.phone}
              </a>
            )}
          </div>
          {v.home.stats && (
            <dl className="mt-16 grid grid-cols-2 border-t border-white/12 sm:grid-cols-4">
              {TRUST.map((t, i) => (
                <div key={t.d} className={`py-6 pr-4 ${i % 2 ? "pl-4 sm:pl-6" : ""} ${i ? "sm:border-l sm:border-white/12 sm:pl-6" : ""}`}>
                  <dt className="sr-only">{t.d}</dt>
                  <dd>
                    <span className="whitespace-nowrap text-[1.7rem] font-bold tabular-nums tracking-tight sm:text-4xl">{t.n}</span>
                    <span className="ml-1 text-sm text-white/60">{t.u}</span>
                    <p className="mt-1 text-sm text-white/60">{t.d}</p>
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      </section>

      {shown.map((k) => (
        <Fragment key={k}>{blocks[k]}</Fragment>
      ))}
    </div>
  );
}
