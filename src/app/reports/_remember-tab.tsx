"use client";
// 마지막에 본 보고서 분류 탭을 기억(이 브라우저에서만, 1년). 다음에 보고서 센터를 열면 그 탭이 먼저 열린다.
import { useEffect } from "react";

export function RememberTab({ tab }: { tab: string }) {
  useEffect(() => {
    document.cookie = `rep_tab=${tab}; path=/reports; max-age=31536000; samesite=lax`;
  }, [tab]);
  return null;
}
