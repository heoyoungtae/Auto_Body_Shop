// 홈페이지(jmotors.co.kr) 공용 부품: 제목 줄(도움말 단추), 홈 주소, 정비소 정보 불러오기
import { headers } from "next/headers";
import type { ReactNode } from "react";
import { getDb } from "@/db/runtime";
import { shopCard } from "@/modules/carbook/service";
import { PAGE_HELP, type PageHelpKey } from "@/modules/help/pages";
import { loadShopInfo, formatBizNo } from "@/modules/platform/shop";
import { siteConfig } from "@/modules/site/service";
import { isHomepageHost } from "@/modules/site/rules";
import { HelpButton } from "../_help-drawer";

/** 홈페이지 주소(jmotors.co.kr)면 '/', 앱 주소(테스트 서버)면 '/site' */
export async function homeHref() {
  const h = await headers();
  return isHomepageHost(h.get("x-forwarded-host") ?? h.get("host")) ? "/" : "/site";
}

/** 정비소 이름·전화·주소(사업장 정보)와 홈페이지 설정을 한 번에 */
export async function siteData() {
  const db = await getDb();
  const [shop, info, cfg] = await Promise.all([shopCard(db), loadShopInfo(db), siteConfig(db)]);
  return { shop, ceo: info.ceo, bizNo: info.bizNo ? formatBizNo(info.bizNo) : "", cfg, mapUrl: shop.address ? `https://map.naver.com/p/search/${encodeURIComponent(shop.address.replace(/^\(\d+\)\s*/, ""))}` : "" };
}

/** 홈페이지 화면 제목: 영어 작은 머리말 + 큰 글자 + 도움말 단추(모든 화면 도움말 규칙) */
export function SiteTitle({ help, children, sub, eyebrow }: { help: PageHelpKey; children: ReactNode; sub?: ReactNode; eyebrow?: string }) {
  return (
    <div className="mb-10" data-page-help={help}>
      {eyebrow && <p className="eyebrow eyebrow-red mb-3">{eyebrow}</p>}
      <h1 className="flex items-center gap-2 text-3xl font-bold leading-tight break-keep sm:text-[2.6rem]">
        <span>{children}</span>
        <HelpButton topic={{ kind: "page", id: help }} name={PAGE_HELP[help].title} />
      </h1>
      {sub && <p className="mt-3 max-w-2xl text-lg text-[var(--muted)]">{sub}</p>}
    </div>
  );
}

/** 섹션 머리: 영어 머리말 + 제목 + (오른쪽) 더 보기 */
export function SectionHead({ eyebrow, title, more, id, dark = false }: { eyebrow: string; title: ReactNode; more?: { href: string; label: string }; id?: string; dark?: boolean }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="eyebrow mb-2">{eyebrow}</p>
        <h2 id={id} className={`text-2xl font-bold sm:text-[2rem] ${dark ? "text-white" : ""}`}>
          {title}
        </h2>
      </div>
      {more && (
        <a href={more.href} className={`group inline-flex items-center gap-1.5 text-sm font-semibold ${dark ? "text-white/80 hover:text-white" : "text-[var(--fg)] hover:text-[var(--red)]"}`}>
          {more.label}
          <span aria-hidden className="transition group-hover:translate-x-0.5">
            →
          </span>
        </a>
      )}
    </div>
  );
}

/** 단추 모양: red(주 행동) · ink(먹색) · line(테두리) · ghost(어두운 바탕 위 흰 테두리) */
export const siteBtn = (kind: "red" | "navy" | "ink" | "line" | "ghost" = "red") =>
  `inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-6 text-[15px] font-semibold tracking-[-0.01em] transition ${
    kind === "red"
      ? "bg-[var(--red)] text-white shadow-[0_8px_24px_rgb(200_16_46_/_0.28)] hover:bg-[var(--red-hi)]"
      : kind === "navy" || kind === "ink"
        ? "bg-[var(--ink)] text-white hover:bg-black dark:bg-white dark:text-[var(--ink)] dark:hover:bg-white/90"
        : kind === "ghost"
          ? "border border-white/35 text-white hover:border-white hover:bg-white/10"
          : "border border-[var(--line-strong)] hover:border-[var(--fg)]"
  }`;
