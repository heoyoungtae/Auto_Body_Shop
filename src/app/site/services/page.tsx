// 홈페이지 › 수리 안내(전체): 찌그러짐·긁힘·도색·부식 네 분야를 한눈에. 분야를 누르면 자세한 화면으로.
import type { Metadata } from "next";
import Link from "next/link";
import { SERVICE_PAGES } from "@/modules/site/service-pages";
import { ServiceIcon } from "../_icons";
import { CtaBand, siteData, SiteTitle } from "../_parts";

export const metadata: Metadata = { title: "수리 안내", description: "찌그러짐·긁힘·도색·부식(녹) 수리 방법과 기간, 비용이 정해지는 기준" };

const PRICE = [
  { t: "손상 크기·깊이", d: "같은 문콕이라도 깊이와 꺾임에 따라 덴트로 끝나기도, 판금이 필요하기도 합니다." },
  { t: "고치는 방법", d: "덴트·광택처럼 도장을 살리는 방법이 가장 빠르고 쌉니다. 도장이 깨지면 칠하는 공정이 더해집니다." },
  { t: "칠하는 판과 색", d: "판 수, 메탈릭·펄 같은 색 종류, 옆 판까지 번지게 칠해야 하는지에 따라 달라집니다." },
  { t: "부품", d: "고쳐 쓸 수 없으면 바꿉니다. 신품·재제조·인증 대체 부품 가운데 고르실 수 있습니다." },
];

export default async function ServicesPage() {
  const { shop, cfg } = await siteData();
  return (
    <div className="space-y-20">
      <SiteTitle eyebrow="SERVICES" help="site.services" sub="차체 외관 수리만 합니다. 분야를 누르면 고치는 방법, 걸리는 기간, 비용이 정해지는 기준을 자세히 볼 수 있습니다.">
        수리 안내
      </SiteTitle>

      <ul className="-mt-8 grid gap-5 sm:grid-cols-2">
        {SERVICE_PAGES.map((s, i) => (
          <li key={s.slug}>
            <Link href={`/services/${s.slug}`} className="lift group flex h-full flex-col rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-7 sm:p-8">
              <div className="mb-6 flex items-center justify-between">
                <ServiceIcon name={s.slug} className="size-10" />
                <span className="text-sm font-semibold tabular-nums text-[var(--steel)]">0{i + 1}</span>
              </div>
              <p className="eyebrow !tracking-[0.15em]">{s.en}</p>
              <p className="mt-1 text-2xl font-bold">{s.title}</p>
              <p className="mt-2 leading-relaxed text-[var(--muted)]">{s.lead}</p>
              <ul className="mt-5 flex flex-wrap gap-2">
                {s.methods.map((m) => (
                  <li key={m.name} className="rounded-full bg-[var(--paper)] px-3 py-1 text-sm">
                    {m.name.replace(/\(.*\)/, "")}
                  </li>
                ))}
              </ul>
              <span className="mt-auto inline-flex items-center gap-1.5 pt-6 text-sm font-semibold group-hover:text-[var(--red)]">
                자세히 보기 <span aria-hidden>→</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <section aria-labelledby="price" className="grid gap-10 lg:grid-cols-[1fr_1.4fr]">
        <div>
          <p className="eyebrow mb-2">PRICING</p>
          <h2 id="price" className="text-2xl font-bold leading-snug sm:text-[2rem]">
            수리비는
            <br />
            이렇게 정해집니다
          </h2>
          <p className="mt-4 leading-relaxed text-[var(--muted)]">정해진 가격표 대신 차를 보고 부위마다 정합니다. 법정 견적서에 부품·공임·도장을 나눠 적고, 승인하신 작업만 합니다. 뜯어 보니 더 다친 곳이 있으면 사진과 함께 먼저 여쭙니다.</p>
        </div>
        <ol className="grid gap-px overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--line)] sm:grid-cols-2">
          {PRICE.map((x, i) => (
            <li key={x.t} className="bg-[var(--surface)] p-6">
              <p className="text-sm font-semibold tabular-nums text-[var(--red)]">0{i + 1}</p>
              <p className="mt-1 text-lg font-bold">{x.t}</p>
              <p className="mt-1.5 text-sm leading-relaxed text-[var(--muted)]">{x.d}</p>
            </li>
          ))}
        </ol>
      </section>

      <CtaBand requests={cfg.requests} phone={shop.phone} tel={shop.tel} body="어느 분야인지 모르셔도 괜찮습니다. 사진을 보내 주시면 방법과 대략 금액을 알려 드립니다." />
    </div>
  );
}
