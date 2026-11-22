"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** 접속 방식을 바꾸는 동안 10초마다 화면을 새로 받는다(바꾸는 중 잠시 끊겨도 다음 차례에 이어 간다) */
export function AutoRefresh({ active, every = 10_000 }: { active: boolean; every?: number }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => {
      try {
        router.refresh();
      } catch {}
    }, every);
    return () => clearInterval(t);
  }, [active, every, router]);
  return null;
}
