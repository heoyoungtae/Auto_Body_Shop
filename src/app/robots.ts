// 검색 로봇 안내(/robots.txt). 홈페이지 주소(jmotors.co.kr)는 손님 화면만 열어 두고, 직원 앱 주소는 모두 막는다.
import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { isHomepageHost } from "@/modules/site/rules";
import { siteUrl } from "@/modules/site/service";

export const dynamic = "force-dynamic";

export default async function robots(): Promise<MetadataRoute.Robots> {
  const h = await headers();
  if (!isHomepageHost(h.get("x-forwarded-host") ?? h.get("host"))) return { rules: { userAgent: "*", disallow: "/" } };
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/my", "/request/", "/estimate/", "/consent/", "/survey/", "/verify"] },
    sitemap: `${siteUrl()}/sitemap.xml`,
    host: siteUrl(),
  };
}
