// 홈페이지(jmotors.co.kr) 틀: 위 로고·메뉴, 개업 준비 띠·공지 띠, 아래 먹색 바닥줄(정비소 정보·처리방침), 휴대폰 아래 고정 단추(전화·견적 요청·길 찾기).
// 이름·전화·주소·대표·사업자번호는 사업장 정보, 로고는 설정 › 로고·앱 아이콘, 문구는 설정 › 홈페이지에서 불러온다(다시 치지 않음).
// 모양은 site.css(.site 안에서만): 먹색·흰색·브랜드 빨강, 프리텐다드 글꼴(public/fonts, 필요한 글자 묶음만 받음).
import type { Metadata } from "next";
import Link from "next/link";
import { getDb } from "@/db/runtime";
import { brandSize, brandUrl, loadBrand } from "@/modules/platform/brand-assets";
import { APP_NAME } from "@/modules/platform/brand";
import { seoulDate } from "@/modules/platform/time";
import { daysToOpen } from "@/modules/site/rules";
import { bannerNotice, noticeTitle } from "@/modules/site/content";
import { homeHref, siteBtn, siteData } from "./_parts";
import "./site.css";

export async function generateMetadata(): Promise<Metadata> {
  const { cfg } = await siteData();
  return {
    title: { default: `${APP_NAME} — 찌그러짐·긁힘·도색`, template: `%s · ${APP_NAME}` },
    description: cfg.lead || "차체 외관 수리(찌그러짐·긁힘·도색) 전문 정비소",
    openGraph: { title: APP_NAME, description: cfg.lead, type: "website", locale: "ko_KR" },
  };
}

const NAV = [
  { href: "/about", label: "정비소 소개" },
  { href: "/cases", label: "작업 사례" },
  { href: "/faq", label: "자주 묻는 질문" },
  { href: "/notice", label: "공지사항" },
  { href: "/my", label: "내 차 수첩" },
] as const;

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const db = await getDb();
  const [{ shop, ceo, bizNo, cfg, mapUrl }, brand, home, banner] = await Promise.all([siteData(), loadBrand(db), homeHref(), bannerNotice(db)]);
  const [w, h] = brandSize(brand, "logo-light");
  const [dw, dh] = brandSize(brand, "logo-dark");
  const dday = daysToOpen(cfg.openOn, seoulDate());
  const app = (process.env.APP_URL ?? "").replace(/\/$/, "");
  return (
    <div className="site flex min-h-screen flex-col bg-[var(--bg)] pb-20 text-[16px] lg:pb-0">
      {/* eslint-disable-next-line @next/next/no-css-tags -- 프리텐다드 글꼴(이 서버에 둔 파일) */}
      <link rel="stylesheet" href="/fonts/pretendard/pretendard.css" precedence="default" />
      {dday != null && (
        <p className="bg-[var(--ink)] px-4 py-2 text-center text-[13px] text-white/85">
          <span className="mr-2 font-semibold text-white">GRAND OPENING</span>
          {cfg.openOn.slice(5).replace("-", "월 ")}일 문을 엽니다 · D-{dday} · 견적 요청은 지금도 받습니다
        </p>
      )}
      <header className="sticky top-0 z-20 border-b border-[var(--line)] bg-[var(--surface)]/90 backdrop-blur-md">
        <div className="mx-auto flex h-[4.5rem] max-w-6xl items-center gap-3 px-5">
          <Link href={home} className="flex shrink-0 items-center" title={`${shop.name} 홈`}>
            <picture>
              <source media="(prefers-color-scheme: dark)" srcSet={brandUrl(brand, "logo-dark")} />
              {/* eslint-disable-next-line @next/next/no-img-element -- 설정에서 올린 로고를 그대로 쓴다 */}
              <img src={brandUrl(brand, "logo-light")} alt={shop.name} width={w} height={h} className="h-9 w-auto max-w-[46vw] object-contain object-left sm:h-10" />
            </picture>
          </Link>
          <nav aria-label="홈페이지 메뉴" className="ml-auto hidden items-center gap-1 lg:flex">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className="rounded-full px-3.5 py-2 text-[15px] font-medium text-[var(--fg)]/80 transition hover:bg-[var(--surface-2)] hover:text-[var(--fg)]">
                {n.label}
              </Link>
            ))}
            {shop.phone && (
              <a href={`tel:${shop.tel}`} className="ml-3 border-l border-[var(--line)] pl-4 text-[15px] font-semibold tabular-nums">
                {shop.phone}
              </a>
            )}
            <Link href="/request" className={`${siteBtn("red")} ml-3 min-h-10 px-5 text-sm`}>
              견적 요청
            </Link>
          </nav>
          <details className="relative ml-auto lg:hidden">
            <summary className="flex size-11 list-none items-center justify-center rounded-full hover:bg-[var(--surface-2)] [&::-webkit-details-marker]:hidden" aria-label="메뉴 열기">
              <svg aria-hidden viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
                <path d="M4 7h16M4 12h16M4 17h16" />
              </svg>
            </summary>
            <div className="absolute right-0 z-40 mt-2 w-60 overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-2 shadow-[var(--shadow-lg)]">
              <Link href={home} className="block rounded-xl px-4 py-3 font-medium hover:bg-[var(--surface-2)]">
                홈
              </Link>
              {NAV.map((n) => (
                <Link key={n.href} href={n.href} className="block rounded-xl px-4 py-3 font-medium hover:bg-[var(--surface-2)]">
                  {n.label}
                </Link>
              ))}
              <Link href="/request" className={`${siteBtn("red")} mt-1 w-full`}>
                견적 요청
              </Link>
            </div>
          </details>
        </div>
        {banner && (
          <Link href={`/notice/${banner.id}`} className="block border-t border-[var(--line)] bg-[var(--paper)] px-5 py-2 text-center text-sm hover:underline">
            <span className="eyebrow eyebrow-red mr-2 !tracking-[0.15em]">NOTICE</span>
            {noticeTitle(banner)}
          </Link>
        )}
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-12 sm:py-16">{children}</main>
      <footer className="bg-[var(--ink)] text-white/70">
        <div className="mx-auto grid max-w-6xl gap-10 px-5 py-14 text-sm sm:grid-cols-[1.4fr_1fr_1fr]">
          <div className="space-y-3">
            <picture>
              {/* eslint-disable-next-line @next/next/no-img-element -- 어두운 바탕용 로고 */}
              <img src={brandUrl(brand, "logo-dark")} alt={shop.name} width={dw} height={dh} className="h-9 w-auto object-contain object-left" />
            </picture>
            <p className="max-w-sm leading-relaxed">찌그러짐·긁힘·도색 차체 외관 수리. 사내 표준에 따라 기록하고 검사합니다.</p>
          </div>
          <div className="space-y-1.5">
            <p className="eyebrow mb-3 !text-white/45">CONTACT</p>
            {shop.phone && (
              <p>
                <a href={`tel:${shop.tel}`} className="text-lg font-semibold text-white tabular-nums">
                  {shop.phone}
                </a>
              </p>
            )}
            {shop.address && (
              <p>
                {shop.address}
                {mapUrl && (
                  <>
                    {" "}
                    <a href={mapUrl} target="_blank" rel="noopener" className="text-white underline underline-offset-4">
                      지도
                    </a>
                  </>
                )}
              </p>
            )}
            {cfg.hours && <p>{cfg.hours}</p>}
            {cfg.kakao && (
              <p>
                <a href={cfg.kakao} target="_blank" rel="noopener" className="text-white underline underline-offset-4">
                  카카오톡 채널
                </a>
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <p className="eyebrow mb-3 !text-white/45">INFORMATION</p>
            <p>
              <Link href="/privacy" className="font-semibold text-white">
                개인정보 처리방침
              </Link>
            </p>
            <p>
              <Link href="/terms" className="hover:text-white">
                이용약관
              </Link>
            </p>
            {app && (
              <p>
                <a href={`${app}/login`} className="hover:text-white">
                  직원 로그인
                </a>
              </p>
            )}
          </div>
        </div>
        <div className="border-t border-white/10">
          <p className="mx-auto max-w-6xl px-5 py-5 text-xs text-white/45">
            {[shop.name, ceo && `대표 ${ceo}`, bizNo && `사업자등록번호 ${bizNo}`].filter(Boolean).join(" · ")}
          </p>
        </div>
      </footer>
      {/* 휴대폰·태블릿: 아래 고정 단추 세 개 */}
      <nav aria-label="바로 가기" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-3 border-t border-[var(--line)] bg-[var(--surface)]/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden">
        <a href={shop.tel ? `tel:${shop.tel}` : "/about"} className="flex min-h-14 items-center justify-center text-sm font-semibold">
          전화 걸기
        </a>
        <Link href="/request" className="flex min-h-14 items-center justify-center bg-[var(--red)] text-sm font-semibold text-white">
          견적 요청
        </Link>
        <a href={mapUrl || "/about"} target={mapUrl ? "_blank" : undefined} rel="noopener" className="flex min-h-14 items-center justify-center text-sm font-semibold">
          길 찾기
        </a>
      </nav>
    </div>
  );
}
