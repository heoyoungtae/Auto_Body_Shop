// 홈페이지 › 보험 수리 안내: 사고 직후 할 일, 자차·대물 차이, 저희가 대신 하는 일, 거래 보험사(설정 › 홈페이지), 자비와 비교. 문구는 설정 › 홈페이지 › 화면 글.
import type { Metadata } from "next";
import Link from "next/link";
import { getDb } from "@/db/runtime";
import { siteBtn, siteData, SiteTitle, viewPages } from "../_parts";

export const metadata: Metadata = { title: "보험 수리 안내", description: "자차·대물 보험 수리 절차와 저희가 대신 해 드리는 일" };

export default async function InsurancePage() {
  const [{ shop, cfg }, v] = await Promise.all([siteData(), viewPages()]);
  const insurers = cfg.insurers
    .split(/[,·\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
  return (
    <div className="mx-auto max-w-4xl space-y-16">
      <SiteTitle eyebrow="INSURANCE" help="site.insurance" sub={v.t("insurance.sub")}>
        보험 수리 안내
      </SiteTitle>

      <section aria-labelledby="after">
        <p className="eyebrow mb-2">RIGHT AFTER</p>
        <h2 id="after" className="mb-6 text-2xl font-bold">
          {v.t("insurance.after.title")}
        </h2>
        <ol className="grid gap-4 sm:grid-cols-2">
          {v.pairs("insurance.after.items").map((a, i) => (
            <li key={i} className="rounded-2xl border border-[var(--line)] p-6">
              <p className="text-sm font-semibold tabular-nums text-[var(--red)]">0{i + 1}</p>
              <p className="mt-2 text-lg font-bold">{a.t}</p>
              <p className="mt-1.5 leading-relaxed text-[var(--muted)]">{a.d}</p>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="kinds" className="grid gap-4 md:grid-cols-2">
        <h2 id="kinds" className="sr-only">
          자차와 대물
        </h2>
        <div className="rounded-2xl bg-[var(--paper)] p-7">
          <p className="eyebrow mb-2">OWN DAMAGE</p>
          <p className="text-xl font-bold">내 보험(자차)</p>
          <p className="mt-2 whitespace-pre-line leading-relaxed text-[var(--muted)]">{v.t("insurance.own")}</p>
        </div>
        <div className="rounded-2xl bg-[var(--paper)] p-7">
          <p className="eyebrow mb-2">PROPERTY DAMAGE</p>
          <p className="text-xl font-bold">상대 보험(대물)</p>
          <p className="mt-2 whitespace-pre-line leading-relaxed text-[var(--muted)]">{v.t("insurance.property")}</p>
        </div>
      </section>

      <section aria-labelledby="wedo">
        <p className="eyebrow mb-2">WE HANDLE</p>
        <h2 id="wedo" className="mb-6 text-2xl font-bold">
          {v.t("insurance.wedo.title")}
        </h2>
        <ul className="divide-y divide-[var(--line)] border-y border-[var(--line)]">
          {v.lines("insurance.wedo.items").map((w, i) => (
            <li key={i} className="flex gap-4 py-4 text-lg">
              <span aria-hidden className="text-[var(--red)]">
                ✓
              </span>
              <span>{w}</span>
            </li>
          ))}
        </ul>
      </section>

      {insurers.length > 0 && (
        <section aria-labelledby="ins">
          <p className="eyebrow mb-2">PARTNERS</p>
          <h2 id="ins" className="mb-5 text-2xl font-bold">
            {v.t("insurance.partners.title")}
          </h2>
          <ul className="flex flex-wrap gap-2">
            {insurers.map((n) => (
              <li key={n} className="rounded-full border border-[var(--line)] px-4 py-2 font-medium">
                {n}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-sm text-[var(--muted)]">목록에 없는 보험사도 수리할 수 있습니다.</p>
        </section>
      )}

      <section className="rounded-2xl bg-[var(--ink)] p-8 text-white sm:p-10">
        <h2 className="text-2xl font-bold">{v.t("insurance.compare.title")}</h2>
        <p className="mt-3 max-w-2xl whitespace-pre-line leading-relaxed text-white/70">{v.t("insurance.compare.lead")}</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/request" className={siteBtn("red")}>
            사진으로 견적 요청
          </Link>
          {shop.phone && (
            <a href={`tel:${shop.tel}`} className={siteBtn("ghost")}>
              전화 {shop.phone}
            </a>
          )}
          <Link href="/faq?c=%EB%B3%B4%ED%97%98%20%EC%88%98%EB%A6%AC" className={siteBtn("ghost")}>
            보험 수리 질문
          </Link>
        </div>
      </section>
    </div>
  );
}
