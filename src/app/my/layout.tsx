// 내 차 수첩(고객용) 틀: 휴대폰 폭 가운데. 글자는 크게, 누를 곳은 넓게.
// 메뉴는 머리줄 왼쪽 ☰ 로 여는 옆 메뉴(my-nav.tsx MyMenu, 루트 layout.tsx 머리줄에 둠). 아래 탭 줄은 폐기(대표 지시 2026-11-22)
import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "내 차 수첩",
  description: "우리 정비소에서 고친 내 차의 수리 기록·서류·보증",
  // 홈 화면에 앱처럼 두기(3단계): 안드로이드는 manifest, 아이폰은 apple-touch-icon·appleWebApp
  manifest: "/my/manifest.webmanifest",
  icons: { icon: "/my/icon-192.png", apple: "/my/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "내 차 수첩", statusBarStyle: "default" },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#1f6feb" };

export default function MyLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-xl px-1 pb-8 text-[15px] sm:px-0">
      {children}
    </div>
  );
}
