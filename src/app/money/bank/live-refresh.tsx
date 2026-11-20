"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** 받은 기록 저절로 새로 보기(대표 2026-11-20 '새로고침해야만 처리 결과가 보임'): 화면이 보이는 동안 10초마다 새로 받는다.
 *  입력 칸에 글을 쓰는 중이면 건너뛴다 */
export function LiveRefresh({ seconds = 10 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      const a = document.activeElement;
      if (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) return;
      try {
        router.refresh();
      } catch {}
    }, seconds * 1000);
    return () => clearInterval(t);
  }, [router, seconds]);
  return <span className="text-xs text-[var(--muted)]">· {seconds}초마다 저절로 새로 봄</span>;
}
