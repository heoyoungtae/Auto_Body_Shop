// 내 차 수첩을 휴대폰 홈 화면에 앱처럼 두기(PWA). 이름은 정비소 이름, 시작은 /my, 범위는 /my/ 만(사내 화면과 섞이지 않게)
import { getDb } from "@/db/runtime";
import { shopCard } from "@/modules/carbook/service";

export const dynamic = "force-dynamic";

export async function GET() {
  const shop = await shopCard(await getDb());
  const body = {
    name: `내 차 수첩 · ${shop.name}`,
    short_name: "내 차 수첩",
    description: "우리 정비소에서 고친 내 차의 수리 기록·서류·보증과 내 차계부",
    lang: "ko",
    start_url: "/my",
    scope: "/my/",
    id: "/my",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#1f6feb",
    icons: [
      { src: "/my/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/my/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/my/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
  return new Response(JSON.stringify(body), { headers: { "Content-Type": "application/manifest+json", "Cache-Control": "no-cache" } });
}
