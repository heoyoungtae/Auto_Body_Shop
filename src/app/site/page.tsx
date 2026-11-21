// 홈페이지 첫 화면(고급·전문 컨셉): 먹색 첫 화면(한 줄 소개·견적 요청·전화, 믿을 근거 숫자) → 수리 분야 → 품질 기준 →
// 진행 순서 → 작업 사례 → 보험·보증 → 자주 묻는 질문 → 공지·내 차 수첩·오시는 길 → 마무리 띠.
// 숫자(보증 기간·검사 기준·회신 기한)는 정책값에서 불러와 정비소 기준이 바뀌면 함께 바뀐다.
import Link from "next/link";
import type { ReactNode } from "react";
import { getDb } from "@/db/runtime";
import { loadPolicy } from "@/modules/platform/policy";
import { noticeTitle, publicCases, publicFaqs, publicNotices } from "@/modules/site/content";
import { SERVICES } from "@/modules/site/rules";
import { SectionHead, siteBtn, siteData, SiteTitle } from "./_parts";

const STEPS = [
  { t: "상담", d: "전화·방문·홈페이지로 다친 곳을 알려 주세요." },
  { t: "진단", d: "차를 직접 보고 부위마다 고칠 방법을 정합니다." },
  { t: "견적 승인", d: "법정 견적서를 드리고, 승인하신 작업만 합니다." },
  { t: "작업", d: "판금·도장 공정마다 사진과 기록을 남깁니다." },
  { t: "검사", d: "작업자가 아닌 검사자가 기준대로 잽니다." },
  { t: "출고", d: "명세서·사진·보증을 내 차 수첩에 남깁니다." },
];

/** 수리 분야 선 그림(얇은 선, 글자색을 따름) */
const ICONS: Record<string, ReactNode> = {
  찌그러짐: <path d="M4 15c3-6 5 2 8-4s5 2 8-3M4 19h16" />,
  긁힘: <path d="M5 18 19 6M8 19l9-8M5 14l7-6" />,
  도색: <path d="M6 4h9v5H6zM15 6h3v5h-7v3M11 14h2v6h-2z" />,
};

export default async function SiteHome() {
  const db = await getDb();
  const [{ shop, cfg, mapUrl }, p, cases, notices, faqs] = await Promise.all([siteData(), loadPolicy(db), publicCases(db, "", 3), publicNotices(db), publicFaqs(db)]);
  const warrantyTop = Math.max(p["warranty.paint_months"], p["warranty.dent_months"]);
  const TRUST = [
    { n: "6", u: "단계", d: "표준 공정" },
    { n: `${p["inspect.film_min_um"]}–${p["inspect.film_max_um"]}`, u: "μm", d: "도막 두께 검사" },
    { n: String(warrantyTop), u: "개월", d: "도장·판금 보증" },
    { n: String(p["consult.reply_business_days"]), u: "영업일", d: "사진 견적 회신" },
  ];
  const QUALITY = [
    { k: "패널 간극", v: `좌우 차 ${p["inspect.gap_mm"]}mm 이내` },
    { k: "도막 두께", v: `${p["inspect.film_min_um"]}~${p["inspect.film_max_um"]}μm` },
    { k: "작업 후 사진", v: `${p["inspect.after_photos"]}장 이상 기록` },
    { k: "검사자", v: "작업자와 다른 사람" },
  ];
  return (
    <div className="space-y-24 sm:space-y-32">
      {/* 첫 화면 */}
      <section className="hero-bg relative -mx-5 -mt-12 overflow-hidden px-5 pb-16 pt-20 text-white sm:-mt-16 sm:pb-20 sm:pt-28 lg:mx-[calc(50%-50vw)] lg:px-[calc(50vw-50%+1.25rem)]">
        <div className="mx-auto max-w-6xl">
          <p className="eyebrow mb-5 !text-white/55">COLLISION · DENT · PAINT</p>
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
            {shop.phone && (
              <a href={`tel:${shop.tel}`} className={siteBtn("ghost")}>
                전화 {shop.phone}
              </a>
            )}
          </div>
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
        </div>
      </section>

      {/* 수리 분야 */}
      <section aria-labelledby="svc">
        <SectionHead eyebrow="SERVICES" id="svc" title="이런 수리를 합니다" more={{ href: "/about", label: "정비소 소개" }} />
        <div className="grid gap-5 sm:grid-cols-3">
          {SERVICES.map((s, i) => (
            <div key={s.title} className="lift rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-7">
              <div className="mb-8 flex items-center justify-between">
                <svg aria-hidden viewBox="0 0 24 24" className="size-9 text-[var(--red)]" fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round">
                  {ICONS[s.title]}
                </svg>
                <span className="text-sm font-semibold tabular-nums text-[var(--steel)]">0{i + 1}</span>
              </div>
              <p className="mb-2 text-xl font-bold">{s.title}</p>
              <p className="leading-relaxed text-[var(--muted)]">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 품질 기준 */}
      <section aria-labelledby="quality" className="-mx-5 bg-[var(--paper)] px-5 py-16 sm:py-20 lg:mx-[calc(50%-50vw)] lg:px-[calc(50vw-50%+1.25rem)]">
        <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-[1fr_1.2fr] lg:items-center">
          <div>
            <p className="eyebrow mb-2">QUALITY STANDARD</p>
            <h2 id="quality" className="text-2xl font-bold leading-snug sm:text-[2rem]">
              감으로 하지 않습니다.
              <br />
              재고, 기록하고, 검사합니다.
            </h2>
            <p className="mt-4 max-w-md leading-relaxed text-[var(--muted)]">모든 수리는 사내 표준서에 정한 순서와 기준을 따릅니다. 조색 배합과 도막 두께를 기록하고, 출고 전에 작업한 사람이 아닌 검사자가 다시 확인합니다.</p>
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
      </section>

      {/* 진행 순서 */}
      <section aria-labelledby="flow">
        <SectionHead eyebrow="PROCESS" id="flow" title="이렇게 진행합니다" />
        <ol className="grid gap-x-6 gap-y-8 sm:grid-cols-3 lg:grid-cols-6">
          {STEPS.map((s, i) => (
            <li key={s.t} className="relative border-t-2 border-[var(--line)] pt-5 first:border-[var(--red)]">
              <p className="text-sm font-semibold tabular-nums text-[var(--red)]">STEP 0{i + 1}</p>
              <p className="mt-1 text-lg font-bold">{s.t}</p>
              <p className="mt-1.5 text-sm leading-relaxed text-[var(--muted)]">{s.d}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* 작업 사례 */}
      {cases.length > 0 && (
        <section aria-labelledby="cases">
          <SectionHead eyebrow="OUR WORK" id="cases" title="작업 사례" more={{ href: "/cases", label: "사례 모두 보기" }} />
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

      {/* 보험·보증 */}
      <section aria-label="보험 수리와 보증" className="grid gap-5 md:grid-cols-2">
        <div className="rounded-2xl border border-[var(--line)] p-8">
          <p className="eyebrow mb-2">INSURANCE</p>
          <h2 className="text-2xl font-bold">보험 수리, 맡겨 주세요</h2>
          <p className="mt-3 leading-relaxed text-[var(--muted)]">내 보험(자차)·상대 보험(대물) 모두 됩니다. 사고 접수번호와 보험사만 알려 주시면 보험사 협의는 정비소가 진행합니다. 견적 금액을 보고 자비 수리와 비교해 고르셔도 됩니다.</p>
          <Link href="/faq?c=%EB%B3%B4%ED%97%98%20%EC%88%98%EB%A6%AC" className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold hover:text-[var(--red)]">
            보험 수리 질문 보기 <span aria-hidden>→</span>
          </Link>
        </div>
        <div className="rounded-2xl bg-[var(--ink)] p-8 text-white">
          <p className="eyebrow mb-2 !text-white/50">WARRANTY</p>
          <h2 className="text-2xl font-bold">고친 곳은 끝까지 책임집니다</h2>
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
          <p className="mt-4 text-sm leading-relaxed text-white/60">보증 기간과 내용은 내 차 수첩에 남고, 문제가 생기면 사진과 함께 바로 신청하실 수 있습니다.</p>
        </div>
      </section>

      {/* 자주 묻는 질문 */}
      {faqs.length > 0 && (
        <section aria-labelledby="faq">
          <SectionHead eyebrow="FAQ" id="faq" title="자주 묻는 질문" more={{ href: "/faq", label: "질문 모두 보기" }} />
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

      {/* 공지·내 차 수첩·오시는 길 */}
      <section className="grid gap-5 md:grid-cols-3">
        <div className="rounded-2xl border border-[var(--line)] p-7">
          <p className="eyebrow mb-2">NOTICE</p>
          <h2 className="mb-4 text-xl font-bold">공지사항</h2>
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
          <p className="eyebrow mb-2">MY CAR BOOK</p>
          <h2 className="mb-3 text-xl font-bold">내 차 수첩</h2>
          <p className="leading-relaxed text-[var(--muted)]">수리 진행·사진·견적서·명세서·보증 기간을 휴대폰으로 봅니다. 아이디 없이 휴대폰 문자 인증으로 들어옵니다.</p>
          <Link href="/my" className={`${siteBtn("ink")} mt-5`}>
            내 차 수첩 열기
          </Link>
        </div>
        <div className="rounded-2xl border border-[var(--line)] p-7">
          <p className="eyebrow mb-2">LOCATION</p>
          <h2 className="mb-3 text-xl font-bold">오시는 길</h2>
          <p>{shop.address || "주소 준비 중"}</p>
          {cfg.hours && <p className="mt-1 text-sm text-[var(--muted)]">{cfg.hours}</p>}
          {mapUrl && (
            <a href={mapUrl} target="_blank" rel="noopener" className={`${siteBtn("line")} mt-5`}>
              네이버 지도
            </a>
          )}
        </div>
      </section>

      {/* 마무리 띠 */}
      {cfg.requests && (
        <section className="hero-bg -mx-5 -mb-12 px-5 py-16 text-center text-white sm:-mb-16 sm:py-20 lg:mx-[calc(50%-50vw)]">
          <p className="eyebrow mb-3 !text-white/55">ESTIMATE</p>
          <h2 className="text-2xl font-bold sm:text-4xl">사진 몇 장이면 충분합니다</h2>
          <p className="mx-auto mt-3 max-w-xl text-white/70">다친 곳 사진을 보내 주시면 영업일 {p["consult.reply_business_days"]}일 안에 대략 금액과 기간을 알려 드립니다. 회원가입은 필요 없습니다.</p>
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
    </div>
  );
}
