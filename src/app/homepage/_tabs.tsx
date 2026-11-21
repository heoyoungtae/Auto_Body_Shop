// 홈페이지 글 관리 화면 위 탭(자주 묻는 질문 · 공지사항 · 작업 사례 · 견적 요청함)
import Link from "next/link";

const TABS = [
  { href: "/homepage/faq", label: "자주 묻는 질문" },
  { href: "/homepage/notice", label: "공지사항" },
  { href: "/homepage/cases", label: "작업 사례" },
  { href: "/homepage/trust", label: "후기·사진·인증" },
  { href: "/consults?f=online", label: "견적 요청함" },
] as const;

export function HomepageTabs({ on }: { on: string }) {
  return (
    <nav aria-label="홈페이지 글" className="mb-4 flex flex-wrap gap-1 border-b border-[var(--line)]">
      {TABS.map((t) => (
        <Link key={t.href} href={t.href} aria-current={t.href === on ? "page" : undefined} className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${t.href === on ? "border-[var(--accent)] text-[var(--accent)]" : "border-transparent text-[var(--muted)] hover:text-[var(--fg)]"}`}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

