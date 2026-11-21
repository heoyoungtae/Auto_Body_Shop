// 홈페이지 수리 분야 선 그림(얇은 선, 글자색을 따름)
import type { ReactNode } from "react";

const PATHS: Record<string, ReactNode> = {
  dent: <path d="M4 15c3-6 5 2 8-4s5 2 8-3M4 19h16" />,
  scratch: <path d="M5 18 19 6M8 19l9-8M5 14l7-6" />,
  paint: <path d="M6 4h9v5H6zM15 6h3v5h-7v3M11 14h2v6h-2z" />,
  rust: (
    <>
      <path d="M4 18h16M6 18c0-3 2-4 3-6s3-2 4 0 3 2 3 6" />
      <circle cx="9" cy="9" r="1" />
      <circle cx="15" cy="7" r="1.2" />
      <circle cx="12" cy="5" r="0.6" />
    </>
  ),
};

/** 분야 이름(찌그러짐·긁힘·도색) 또는 주소 이름(dent·scratch·paint·rust) */
const BY_TITLE: Record<string, string> = { 찌그러짐: "dent", 긁힘: "scratch", 도색: "paint", 부식: "rust" };

export function ServiceIcon({ name, className = "size-9" }: { name: string; className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className={`${className} text-[var(--red)]`} fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round">
      {PATHS[BY_TITLE[name] ?? name]}
    </svg>
  );
}
