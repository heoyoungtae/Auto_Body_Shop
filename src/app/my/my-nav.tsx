"use client";
// 내 차 수첩 메뉴: 머리줄 왼쪽 ☰ 를 누르면 왼쪽에서 밀려 나오는 메뉴(대표 지시 2026-11-22, 아래 탭 줄 폐기).
// 지금 화면의 메뉴를 진하게. 화면을 옮기거나 바깥·× 를 누르거나 Esc 를 누르면 닫힌다.
// 로그인 전 화면(/my/login, 알림톡 링크 /my/l)에서는 보이지 않는다.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const TABS = [
  { href: "/my", label: "홈", d: "M3 11.5 12 4l9 7.5M5 10v10h14V10" },
  { href: "/my/repairs", label: "수리 이력", d: "M4 6h16M4 12h16M4 18h10" },
  { href: "/my/log", label: "내 기록", d: "M5 4h11l3 3v13H5zM9 12h6M9 16h6M9 8h3" },
  { href: "/my/docs", label: "서류", d: "M7 3h7l5 5v13H7zM14 3v5h5" },
  { href: "/my/more", label: "더보기", d: "M5 12h.01M12 12h.01M19 12h.01" },
];

export function MyMenu() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [open]);
  if (!path.startsWith("/my") || path.startsWith("/my/login") || path.startsWith("/my/l/")) return null;
  const on = (h: string) => (h === "/my" ? path === "/my" : path.startsWith(h));
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-expanded={open}
        aria-controls="my-menu"
        aria-label="메뉴 열기"
        className="no-print inline-flex size-11 shrink-0 items-center justify-center rounded-md text-xl hover:bg-[var(--surface-2)]"
      >
        ☰
      </button>
      {open && <div className="fixed inset-0 z-40 bg-black/30" onClick={() => setOpen(false)} aria-hidden />}
      <nav
        id="my-menu"
        aria-label="내 차 수첩 메뉴"
        aria-hidden={!open}
        inert={!open}
        className={`no-print fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] overflow-y-auto border-r border-[var(--line)] bg-[var(--surface)] pb-[env(safe-area-inset-bottom)] transition-transform ${open ? "translate-x-0 shadow-[var(--shadow-lg)]" : "-translate-x-full"}`}
      >
        <div className="flex h-14 items-center justify-between border-b border-[var(--line)] px-4">
          <span className="font-semibold">내 차 수첩</span>
          <button type="button" onClick={() => setOpen(false)} aria-label="메뉴 닫기" className="inline-flex size-11 items-center justify-center rounded-md text-xl hover:bg-[var(--surface-2)]">
            ×
          </button>
        </div>
        <ul className="space-y-1 p-2">
          {TABS.map((t) => (
            <li key={t.href}>
              <Link
                href={t.href}
                aria-current={on(t.href) ? "page" : undefined}
                className={`flex min-h-13 items-center gap-3 rounded-lg px-3 text-base hover:bg-[var(--surface-2)] ${on(t.href) ? "bg-[var(--accent-soft)] font-semibold text-[var(--accent)]" : "text-[var(--fg)]"}`}
              >
                <svg aria-hidden viewBox="0 0 24 24" className="size-6 shrink-0" fill="none" stroke="currentColor" strokeWidth={on(t.href) ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round">
                  <path d={t.d} />
                </svg>
                {t.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}

/** 머리줄 로고 링크: 직원은 대시보드, 손님은 내 차 수첩 홈(로그인 안 한 직원 화면은 직원 로그인) */
export function HomeLink({ staff, className, title, children }: { staff: boolean; className?: string; title?: string; children: React.ReactNode }) {
  const path = usePathname();
  const href = staff ? "/home" : path.startsWith("/my") ? "/my" : "/login";
  return (
    <Link href={href} className={className} title={title}>
      {children}
    </Link>
  );
}

/** 카카오톡 안 브라우저인지(인쇄·홈 화면 추가가 안 되는 곳) */
export function inAppEnv() {
  if (typeof navigator === "undefined") return { kakao: false, android: false };
  const ua = navigator.userAgent;
  return { kakao: /KAKAOTALK/i.test(ua), android: /Android/i.test(ua) };
}
