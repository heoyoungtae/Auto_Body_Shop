// 정비소 소개: 인사말(설정 › 홈페이지), 수리 분야, 작업 기준(사내 표준서 요약), 보증, 오시는 길
import Link from "next/link";
import type { Metadata } from "next";
import { SERVICES } from "@/modules/site/rules";
import { siteBtn, siteData, SiteTitle } from "../_parts";

export const metadata: Metadata = { title: "정비소 소개" };

const RULES = [
  "작업 전 법정 견적서로 금액을 먼저 알려 드리고, 승인하신 작업만 합니다.",
  "부품은 순정·품질인증 대체부품·재제조 중에서 고르실 수 있습니다.",
  "조색 배합과 도막 두께를 기록하고, 출고 전 단차·색상·광택을 검사합니다.",
  "수리 전·중·후 사진을 남겨 내 차 수첩에서 언제든 보실 수 있습니다.",
  "출고한 수리에는 보증 기간을 드리고, 기간 안에 문제가 생기면 내 차 수첩에서 바로 신청합니다.",
];

export default async function AboutPage() {
  const { shop, cfg, mapUrl } = await siteData();
  return (
    <div className="mx-auto max-w-4xl space-y-20">
      <SiteTitle eyebrow="ABOUT US" help="site.about" sub={shop.name}>
        정비소 소개
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
          {SERVICES.map((s, i) => (
            <li key={s.title} className="rounded-2xl border border-[var(--line)] p-6">
              <p className="text-sm font-semibold tabular-nums text-[var(--red)]">0{i + 1}</p>
              <p className="mt-3 text-lg font-bold">{s.title}</p>
              <p className="mt-2 leading-relaxed text-[var(--muted)]">{s.body}</p>
            </li>
          ))}
        </ul>
      </section>
      <section className="-mx-5 bg-[var(--paper)] px-5 py-14 sm:rounded-3xl sm:px-10">
        <p className="eyebrow mb-2">OUR STANDARD</p>
        <h2 className="text-2xl font-bold sm:text-[2rem]">작업 기준</h2>
        <p className="mt-3 text-[var(--muted)]">모든 수리는 사내 표준서에 정한 순서와 기준을 따릅니다.</p>
        <ol className="mt-8 space-y-5">
          {RULES.map((r, i) => (
            <li key={r} className="flex gap-5">
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
