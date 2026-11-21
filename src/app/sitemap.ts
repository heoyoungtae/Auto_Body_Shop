// 사이트맵(/sitemap.xml): 홈페이지 화면(수리 분야별 안내 포함)과 게시 중인 공지·공개 작업 사례·공개 기술자료. 네이버 서치어드바이저·구글 서치 콘솔에 이 주소를 낸다.
import type { MetadataRoute } from "next";
import { getDb } from "@/db/runtime";
import { publicArticles } from "@/modules/site/articles";
import { publicCases, publicNotices } from "@/modules/site/content";
import { SERVICE_PAGES } from "@/modules/site/service-pages";
import { siteUrl } from "@/modules/site/service";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const db = await getDb();
  const [notices, cases, articles] = await Promise.all([publicNotices(db), publicCases(db), publicArticles(db)]);
  const pages: [string, number][] = [
    ["", 1],
    ["/about", 0.8],
    ["/request", 0.9],
    ["/services", 0.9],
    ...SERVICE_PAGES.map((x): [string, number] => [`/services/${x.slug}`, 0.8]),
    ["/cases", 0.8],
    ["/tech", 0.7],
    ["/carbook-guide", 0.7],
    ["/insurance", 0.7],
    ["/guide", 0.6],
    ["/faq", 0.7],
    ["/notice", 0.5],
    ["/privacy", 0.2],
    ["/terms", 0.2],
  ];
  return [
    ...pages.map(([p, priority]) => ({ url: `${base}${p || "/"}`, priority, changeFrequency: "weekly" as const })),
    ...notices.map((n) => ({ url: `${base}/notice/${n.id}`, lastModified: n.startsOn, priority: 0.4 })),
    ...articles.map((a) => ({ url: `${base}/tech/${a.slug}`, lastModified: a.updatedAt, priority: 0.6 })),
    ...cases.map((c) => ({ url: `${base}/cases/${c.id}`, lastModified: c.workedOn ?? undefined, priority: 0.6 })),
  ];
}
