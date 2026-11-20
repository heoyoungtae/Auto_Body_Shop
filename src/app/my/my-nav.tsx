"use client";
// 내 차 수첩 아래 탭 줄(휴대폰 한 손 기준). 지금 화면의 탭을 진하게
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/my", label: "홈", d: "M3 11.5 12 4l9 7.5M5 10v10h14V10" },
  { href: "/my/repairs", label: "수리 이력", d: "M4 6h16M4 12h16M4 18h10" },
  { href: "/my/docs", label: "서류", d: "M7 3h7l5 5v13H7zM14 3v5h5" },
  { href: "/my/more", label: "더보기", d: "M5 12h.01M12 12h.01M19 12h.01" },
];

export function MyNav() {
  const path = usePathname();
  const on = (h: string) => (h === "/my" ? path === "/my" : path.startsWith(h));
  return (
    <nav aria-label="내 차 수첩 메뉴" className="no-print fixed inset-x-0 bottom-0 z-30 border-t border-[var(--line)] bg-[var(--surface)] pb-[env(safe-area-inset-bottom)]">
      <ul className="mx-auto grid max-w-xl grid-cols-4">
        {TABS.map((t) => (
          <li key={t.href}>
            <Link href={t.href} aria-current={on(t.href) ? "page" : undefined} className={`flex h-16 flex-col items-center justify-center gap-0.5 text-xs ${on(t.href) ? "font-semibold text-[var(--accent)]" : "text-[var(--muted)]"}`}>
              <svg aria-hidden viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth={on(t.href) ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round">
                <path d={t.d} />
              </svg>
              {t.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** 카카오톡 안 브라우저인지(인쇄·홈 화면 추가가 안 되는 곳) */
export function inAppEnv() {
  if (typeof navigator === "undefined") return { kakao: false, android: false };
  const ua = navigator.userAgent;
  return { kakao: /KAKAOTALK/i.test(ua), android: /Android/i.test(ua) };
}
