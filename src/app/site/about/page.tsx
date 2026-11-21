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
    <div className="mx-auto max-w-3xl space-y-10">
      <SiteTitle help="site.about" sub={shop.name}>
        정비소 소개
      </SiteTitle>
      {cfg.about && (
        <section className="space-y-4 text-lg leading-relaxed">
          {cfg.about.split(/\n\s*\n/).map((p, i) => (
            <p key={i} className="whitespace-pre-line">
              {p}
            </p>
          ))}
        </section>
      )}
      <section>
        <h2 className="mb-3 text-xl font-bold">수리 분야</h2>
        <ul className="grid gap-3 sm:grid-cols-3">
          {SERVICES.map((s) => (
            <li key={s.title} className="rounded-xl bg-[var(--surface-2)] p-4">
              <p className="font-semibold">{s.title}</p>
              <p className="mt-1 text-sm text-[var(--muted)]">{s.body}</p>
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h2 className="mb-3 text-xl font-bold">작업 기준</h2>
        <p className="mb-3 text-[var(--muted)]">모든 수리는 사내 표준서에 정한 순서와 기준을 따릅니다.</p>
        <ul className="list-disc space-y-2 pl-5">
          {RULES.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      </section>
      <section className="rounded-xl border border-[var(--line)] p-6">
        <h2 className="mb-2 text-xl font-bold">오시는 길·영업시간</h2>
        <p>{shop.address || "주소 준비 중"}</p>
        {cfg.hours && <p className="mt-1 text-[var(--muted)]">{cfg.hours}</p>}
        {shop.phone && (
          <p className="mt-1">
            전화{" "}
            <a href={`tel:${shop.tel}`} className="text-[var(--accent)] underline">
              {shop.phone}
            </a>
          </p>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          {mapUrl && (
            <a href={mapUrl} target="_blank" rel="noopener" className={siteBtn("line")}>
              네이버 지도로 보기
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
