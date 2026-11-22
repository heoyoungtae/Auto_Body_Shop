// 설정 › 홈페이지 위 탭: 기본 정보 · 첫 화면 · 화면 글 · 메뉴·바닥글 · 글·사진(홈페이지 글 화면으로)
import Link from "next/link";

const TABS = [
  { href: "/settings/site", label: "기본 정보" },
  { href: "/settings/site/home", label: "첫 화면" },
  { href: "/settings/site/pages", label: "화면 글" },
  { href: "/settings/site/menu", label: "메뉴·바닥글" },
  { href: "/homepage/faq", label: "질문·공지·사례·기술자료·후기 ↗" },
] as const;

export function SiteSettingsTabs({ on }: { on: (typeof TABS)[number]["href"] }) {
  return (
    <nav aria-label="홈페이지 설정" className="mb-4 flex flex-wrap gap-1 border-b border-[var(--line)]">
      {TABS.map((t) => (
        <Link key={t.href} href={t.href} aria-current={t.href === on ? "page" : undefined} className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${t.href === on ? "border-[var(--accent)] text-[var(--accent)]" : "border-transparent text-[var(--muted)] hover:text-[var(--fg)]"}`}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
