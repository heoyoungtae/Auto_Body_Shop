// 홈페이지(jmotors.co.kr) 틀: 위 로고·메뉴, 개업 준비 띠, 아래 정비소 정보·처리방침, 휴대폰 아래 고정 단추(전화·견적 요청·길 찾기).
// 이름·전화·주소·대표·사업자번호는 사업장 정보, 로고는 설정 › 로고·앱 아이콘, 문구는 설정 › 홈페이지에서 불러온다(다시 치지 않음).
import type { Metadata } from "next";
import Link from "next/link";
import { getDb } from "@/db/runtime";
import { brandSize, brandUrl, loadBrand } from "@/modules/platform/brand-assets";
import { APP_NAME } from "@/modules/platform/brand";
import { seoulDate } from "@/modules/platform/time";
import { daysToOpen } from "@/modules/site/rules";
import { homeHref, siteBtn, siteData } from "./_parts";

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
  { href: "/request", label: "견적 요청" },
  { href: "/my", label: "내 차 수첩" },
] as const;

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const [{ shop, ceo, bizNo, cfg, mapUrl }, brand, home] = await Promise.all([siteData(), loadBrand(await getDb()), homeHref()]);
  const [w, h] = brandSize(brand, "logo-light");
  const dday = daysToOpen(cfg.openOn, seoulDate());
  const app = (process.env.APP_URL ?? "").replace(/\/$/, "");
  return (
    <div className="flex min-h-screen flex-col pb-20 text-[16px] sm:pb-0">
      <header className="sticky top-0 z-20 border-b border-[var(--line)] bg-[var(--surface)]/95 backdrop-blur">
        <div className="mx-auto flex min-h-16 max-w-6xl items-center gap-3 px-4">
          <Link href={home} className="flex shrink-0 items-center" title={`${shop.name} 홈`}>
            <picture>
              <source media="(prefers-color-scheme: dark)" srcSet={brandUrl(brand, "logo-dark")} />
              {/* eslint-disable-next-line @next/next/no-img-element -- 설정에서 올린 로고를 그대로 쓴다 */}
              <img src={brandUrl(brand, "logo-light")} alt={shop.name} width={w} height={h} className="h-9 w-auto max-w-[44vw] object-contain object-left sm:h-11" />
            </picture>
          </Link>
          <nav aria-label="홈페이지 메뉴" className="ml-auto hidden items-center gap-1 sm:flex">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className={n.href === "/request" ? `${siteBtn("red")} ml-2 min-h-10 px-4 text-sm` : "rounded-md px-3 py-2 font-medium hover:bg-[var(--surface-2)]"}>
                {n.label}
              </Link>
            ))}
          </nav>
          <details className="relative ml-auto sm:hidden">
            <summary className="flex size-11 list-none items-center justify-center rounded-md hover:bg-[var(--surface-2)] [&::-webkit-details-marker]:hidden" aria-label="메뉴 열기">
              <svg aria-hidden viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                <path d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </summary>
            <div className="absolute right-0 z-40 mt-1 w-52 rounded-lg border border-[var(--line)] bg-[var(--surface)] p-1 shadow-[var(--shadow-lg)]">
              <Link href={home} className="block rounded-md px-3 py-3 hover:bg-[var(--surface-2)]">
                홈
              </Link>
              {NAV.map((n) => (
                <Link key={n.href} href={n.href} className="block rounded-md px-3 py-3 hover:bg-[var(--surface-2)]">
                  {n.label}
                </Link>
              ))}
            </div>
          </details>
        </div>
        {dday != null && (
          <p className="bg-[#0a3e96] px-4 py-1.5 text-center text-sm text-white">
            개업 준비 중입니다 · {cfg.openOn.slice(5).replace("-", "월 ")}일 문을 엽니다(D-{dday}). 견적 요청은 지금도 받습니다.
          </p>
        )}
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>
      <footer className="border-t border-[var(--line)] bg-[var(--surface-2)]">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 py-8 text-sm text-[var(--muted)] sm:grid-cols-2">
          <div className="space-y-1">
            <p className="text-base font-semibold text-[var(--fg)]">{shop.name}</p>
            {(ceo || bizNo) && <p>{[ceo && `대표 ${ceo}`, bizNo && `사업자등록번호 ${bizNo}`].filter(Boolean).join(" · ")}</p>}
            {shop.address && (
              <p>
                {shop.address}
                {mapUrl && (
                  <>
                    {" "}
                    <a href={mapUrl} target="_blank" rel="noopener" className="text-[var(--accent)] underline">
                      지도
                    </a>
                  </>
                )}
              </p>
            )}
            {shop.phone && (
              <p>
                전화{" "}
                <a href={`tel:${shop.tel}`} className="text-[var(--accent)] underline">
                  {shop.phone}
                </a>
              </p>
            )}
            {cfg.hours && <p>{cfg.hours}</p>}
          </div>
          <div className="flex flex-col gap-1 sm:items-end">
            <Link href="/privacy" className="font-semibold text-[var(--fg)] underline">
              개인정보 처리방침
            </Link>
            <Link href="/terms" className="underline">
              이용약관
            </Link>
            {cfg.kakao && (
              <a href={cfg.kakao} target="_blank" rel="noopener" className="underline">
                카카오톡 채널
              </a>
            )}
            {app && (
              <a href={`${app}/login`} className="mt-3 text-xs underline">
                직원 로그인
              </a>
            )}
          </div>
        </div>
      </footer>
      {/* 휴대폰: 아래 고정 단추 세 개 */}
      <nav aria-label="바로 가기" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-3 border-t border-[var(--line)] bg-[var(--surface)] pb-[env(safe-area-inset-bottom)] sm:hidden">
        <a href={shop.tel ? `tel:${shop.tel}` : "/about"} className="flex min-h-14 flex-col items-center justify-center text-sm font-medium">
          전화 걸기
        </a>
        <Link href="/request" className="flex min-h-14 flex-col items-center justify-center bg-[#d71f2b] text-sm font-semibold text-white">
          견적 요청
        </Link>
        <a href={mapUrl || "/about"} target={mapUrl ? "_blank" : undefined} rel="noopener" className="flex min-h-14 flex-col items-center justify-center text-sm font-medium">
          길 찾기
        </a>
      </nav>
    </div>
  );
}
