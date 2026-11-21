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

/** 홈페이지 화면 제목: 큰 글자 + 도움말 단추(모든 화면 도움말 규칙) */
export function SiteTitle({ help, children, sub }: { help: PageHelpKey; children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="mb-6" data-page-help={help}>
      <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight break-keep sm:text-3xl">
        <span>{children}</span>
        <HelpButton topic={{ kind: "page", id: help }} name={PAGE_HELP[help].title} />
      </h1>
      {sub && <p className="mt-2 text-[var(--muted)]">{sub}</p>}
    </div>
  );
}

export const siteBtn = (kind: "red" | "navy" | "line" = "red") =>
  `inline-flex min-h-12 items-center justify-center gap-2 rounded-lg px-5 text-base font-semibold transition ${
    kind === "red" ? "bg-[#d71f2b] text-white hover:bg-[#b91822]" : kind === "navy" ? "bg-[#0a3e96] text-white hover:bg-[#08327a]" : "border border-[var(--line-strong)] hover:bg-[var(--surface-2)]"
  }`;
