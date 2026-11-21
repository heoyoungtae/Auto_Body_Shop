// 홈페이지 › 보험 수리 안내: 사고 직후 할 일, 자차·대물 차이, 정비소가 대신 하는 일, 거래 보험사(설정 › 홈페이지), 자비와 비교.
import type { Metadata } from "next";
import Link from "next/link";
import { siteBtn, siteData, SiteTitle } from "../_parts";

export const metadata: Metadata = { title: "보험 수리 안내", description: "자차·대물 보험 수리 절차와 정비소가 대신 해 드리는 일" };

const AFTER = [
  { t: "안전 먼저", d: "비상등을 켜고 차를 안전한 곳으로 옮깁니다. 다친 사람이 있으면 119에 먼저 연락합니다." },
  { t: "사진 남기기", d: "두 차의 위치, 다친 곳 가까이·멀리, 상대 차 번호판을 찍어 둡니다." },
  { t: "보험사 접수", d: "내 보험사(또는 상대 보험사)에 사고 접수를 하고 접수번호를 받아 둡니다." },
  { t: "정비소에 알리기", d: "접수번호와 보험사를 알려 주시면 그다음은 정비소가 이어서 진행합니다." },
];

const WE_DO = [
  "보험사에 수리 견적과 사진을 보내고 손해사정사와 협의합니다.",
  "뜯어 보니 손상이 더 있으면 추가 견적(사진 포함)을 보험사와 고객님께 함께 알립니다.",
  "대물 수리면 상대 보험사에 대차(렌트)를 요청해 드립니다.",
  "출고 때 자기부담금과 보험 처리 금액을 나눠 정비명세서에 적어 드립니다.",
];

export default async function InsurancePage() {
  const { shop, cfg } = await siteData();
  const insurers = cfg.insurers
    .split(/[,·\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
  return (
    <div className="mx-auto max-w-4xl space-y-16">
      <SiteTitle eyebrow="INSURANCE" help="site.insurance" sub="내 보험(자차)이든 상대 보험(대물)이든, 접수번호만 알려 주시면 보험사 협의는 정비소가 합니다.">
        보험 수리 안내
      </SiteTitle>

      <section aria-labelledby="after">
        <p className="eyebrow mb-2">RIGHT AFTER</p>
        <h2 id="after" className="mb-6 text-2xl font-bold">사고가 났다면</h2>
        <ol className="grid gap-4 sm:grid-cols-2">
          {AFTER.map((a, i) => (
            <li key={a.t} className="rounded-2xl border border-[var(--line)] p-6">
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
          <p className="mt-2 leading-relaxed text-[var(--muted)]">내 과실이 있거나 상대가 없는 사고(혼자 긁음 등)에 씁니다. 약관에 따라 자기부담금이 있고, 보험료가 오를 수 있습니다.</p>
        </div>
        <div className="rounded-2xl bg-[var(--paper)] p-7">
          <p className="eyebrow mb-2">PROPERTY DAMAGE</p>
          <p className="text-xl font-bold">상대 보험(대물)</p>
          <p className="mt-2 leading-relaxed text-[var(--muted)]">상대 과실로 난 사고에 상대 보험사가 수리비를 냅니다. 과실 100%면 자기부담금이 없고, 수리 동안 대차를 받을 수 있습니다.</p>
        </div>
      </section>

      <section aria-labelledby="wedo">
        <p className="eyebrow mb-2">WE HANDLE</p>
        <h2 id="wedo" className="mb-6 text-2xl font-bold">정비소가 대신 해 드리는 일</h2>
        <ul className="divide-y divide-[var(--line)] border-y border-[var(--line)]">
          {WE_DO.map((w) => (
            <li key={w} className="flex gap-4 py-4 text-lg">
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
          <h2 id="ins" className="mb-5 text-2xl font-bold">보험 수리를 해 온 보험사</h2>
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
        <h2 className="text-2xl font-bold">보험으로 할까, 자비로 할까?</h2>
        <p className="mt-3 max-w-2xl leading-relaxed text-white/70">수리비가 적으면 보험료가 오르는 것보다 자비가 나을 때가 있습니다. 견적 금액을 먼저 보고 고르셔도 됩니다. 보험료 할증은 보험사에 직접 확인해 주세요.</p>
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
