// 홈 화면 바로가기(PWA) 설치 정보 — /manifest.webmanifest 로 나간다.
// 아이콘 원본은 scripts/app-icon(symbol.png·icon-small.svg), 크기별 파일은 node scripts/app-icon/make.mjs 로 다시 만든다.
import type { MetadataRoute } from "next";
import { APP_BG_COLOR, APP_NAME, APP_SHORT_NAME, APP_THEME_COLOR } from "@/modules/platform/brand";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: APP_NAME,
    short_name: APP_SHORT_NAME,
    description: "차체 외관 수리(찌그러짐·긁힘·도색) 정비소 업무 앱 — 상담부터 출고, 설비·품질까지",
    lang: "ko",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: APP_BG_COLOR,
    theme_color: APP_THEME_COLOR,
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
