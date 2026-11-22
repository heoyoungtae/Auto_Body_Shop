// 홈페이지 › 수리 안내(전체): 찌그러짐·긁힘·도색·부식 네 분야를 한눈에. 분야를 누르면 자세한 화면으로.
import type { Metadata } from "next";
import Link from "next/link";
import { getDb } from "@/db/runtime";
import { servicePagesView } from "@/modules/site/service-text";
import { ServiceIcon } from "../_icons";
import { CtaBand, Lines, siteData, SiteTitle, viewPages } from "../_parts";

export const metadata: Metadata = { title: "수리 안내", description: "찌그러짐·긁힘·도색·부식(녹) 수리 방법과 기간, 비용이 정해지는 기준" };

export default async function ServicesPage() {
  const [{ shop, cfg }, v] = await Promise.all([siteData(), viewPages()]);
  const services = servicePagesView(v);
  return (
    <div className="space-y-20">
      <SiteTitle eyebrow="SERVICES" help="site.services" sub={v.t("services.sub")}>
        수리 안내
      </SiteTitle>

      <ul className="-mt-8 grid gap-5 sm:grid-cols-2">
        {services.map((s, i) => (
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
                {s.methods.map((m, j) => (
                  <li key={j} className="rounded-full bg-[var(--paper)] px-3 py-1 text-sm">
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
            <Lines text={v.t("services.price.title")} />
          </h2>
          <p className="mt-4 whitespace-pre-line leading-relaxed text-[var(--muted)]">{v.t("services.price.lead")}</p>
        </div>
        <ol className="grid gap-px overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--line)] sm:grid-cols-2">
          {v.pairs("services.price.items").map((x, i) => (
            <li key={i} className="bg-[var(--surface)] p-6">
              <p className="text-sm font-semibold tabular-nums text-[var(--red)]">0{i + 1}</p>
              <p className="mt-1 text-lg font-bold">{x.t}</p>
              <p className="mt-1.5 text-sm leading-relaxed text-[var(--muted)]">{x.d}</p>
            </li>
          ))}
        </ol>
      </section>

      <CtaBand requests={cfg.requests} phone={shop.phone} tel={shop.tel} body={v.t("services.cta")} />
    </div>
  );
}
