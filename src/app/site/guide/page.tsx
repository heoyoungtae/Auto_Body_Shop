// 홈페이지 › 이용 안내: 맡기기 전 준비, 맡긴 동안(진행 알림·추가 견적), 찾아갈 때, 출고 뒤 관리(세차 금지 기간·보증) — 숫자는 정책값에서
import type { Metadata } from "next";
import Link from "next/link";
import { getDb } from "@/db/runtime";
import { sitePages } from "@/modules/site/pages";
import { siteBtn, SiteTitle } from "../_parts";

export const metadata: Metadata = { title: "이용 안내", description: "차를 맡기기 전 준비할 것과 출고 뒤 관리 방법" };

export default async function GuidePage() {
  const v = await sitePages(await getDb());
  // 문구는 설정 › 홈페이지 › 화면 글(숫자는 {세차금지일}·{도장보증} 같은 자리표시로 정책값이 들어간다)
  const BLOCKS = (["before", "during", "pickup", "after"] as const).map((k, i) => ({ e: ["BEFORE", "DURING", "PICK UP", "AFTER CARE"][i], t: v.t(`guide.${k}.title`), items: v.lines(`guide.${k}.items`) }));
  return (
    <div className="mx-auto max-w-4xl">
      <SiteTitle eyebrow="GUIDE" help="site.guide" sub={v.t("guide.sub")}>
        이용 안내
      </SiteTitle>
      <div className="space-y-5">
        {BLOCKS.map((b, i) => (
          <section key={b.e} aria-label={b.t} className={`grid gap-4 rounded-2xl p-7 sm:grid-cols-[12rem_1fr] sm:p-9 ${i === 3 ? "bg-[var(--ink)] text-white" : "border border-[var(--line)]"}`}>
            <div>
              <p className={`eyebrow mb-1 ${i === 3 ? "!text-white/50" : ""}`}>{b.e}</p>
              <h2 className="text-xl font-bold">{b.t}</h2>
            </div>
            <ul className="space-y-2.5">
              {b.items.map((x, j) => (
                <li key={j} className="flex gap-3 leading-relaxed">
                  <span aria-hidden className="mt-2.5 size-1.5 shrink-0 rounded-full bg-[var(--red)]" />
                  <span className={i === 3 ? "text-white/85" : ""}>{x}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <div className="mt-10 flex flex-wrap gap-3">
        <Link href="/request" className={siteBtn("red")}>
          사진으로 견적 요청
        </Link>
        <Link href="/my" className={siteBtn("line")}>
          내 차 수첩 열기
        </Link>
      </div>
    </div>
  );
}
