// 홈 화면 바로가기(PWA) 설치 정보 — /manifest.webmanifest 로 나간다.
// 아이콘은 설정 › 로고·앱 아이콘에 올린 그림을 먼저 쓰고, 없으면 앱 기본 그림(scripts/app-icon/make.mjs 로 만듦)을 쓴다.
import type { MetadataRoute } from "next";
import { getDb } from "@/db/runtime";
import { APP_BG_COLOR, APP_NAME, APP_SHORT_NAME, APP_THEME_COLOR } from "@/modules/platform/brand";
import { brandSize, brandUrl, loadBrand } from "@/modules/platform/brand-assets";

export const dynamic = "force-dynamic";

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const cfg = await loadBrand(await getDb());
  const [w, h] = brandSize(cfg, "app-icon");
  const icons: MetadataRoute.Manifest["icons"] = cfg["app-icon"]
    ? [{ src: brandUrl(cfg, "app-icon"), sizes: `${w}x${h}`, type: "image/png", purpose: "any" }]
    : [
        { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
        { src: brandUrl(cfg, "app-icon"), sizes: `${w}x${h}`, type: "image/png", purpose: "any" },
        { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      ];
  return {
    id: "/",
    name: APP_NAME,
    short_name: APP_SHORT_NAME,
    description: "차체 외관 수리(찌그러짐·긁힘·도색) 공업사 업무 앱 — 상담부터 출고, 설비·품질까지",
    lang: "ko",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: APP_BG_COLOR,
    theme_color: APP_THEME_COLOR,
    icons,
  };
}
