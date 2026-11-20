"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const KEY = "server-update-watch";

/** 새 버전 올리기 진행 자동 확인(대표 요청 2026-11-20): 요청·올리는 중이면 15초마다 화면을 새로 받아
 *  끝나면 새로고침 없이 성공·실패를 띄운다. 올리는 중 앱이 몇 초 끊겨도 다음 확인 때 이어 간다.
 *  새 버전이 올라가 화면이 통째로 다시 열려도 알 수 있게 '기다리는 중'을 sessionStorage 에 둔다 */
export function UpdateWatch({ active, resultAt, ok, message }: { active: boolean; resultAt: string | null; ok: boolean; message: string }) {
  const router = useRouter();
  const [done, setDone] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    let since: string | null = null;
    try {
      since = sessionStorage.getItem(KEY);
    } catch {}
    if (active) {
      if (!since) {
        try {
          sessionStorage.setItem(KEY, new Date().toISOString());
        } catch {}
      }
      const t = setInterval(() => {
        try {
          router.refresh();
        } catch {}
      }, 15_000);
      return () => clearInterval(t);
    }
    if (since && resultAt && Date.parse(resultAt) >= Date.parse(since) - 60_000) {
      setDone({ ok, message });
      try {
        sessionStorage.removeItem(KEY);
      } catch {}
    }
  }, [active, resultAt, ok, message, router]);

  if (active)
    return (
      <p className="text-xs text-[var(--muted)]" aria-live="polite">
        이 화면은 15초마다 진행 상태를 저절로 확인합니다. 새로고침하지 않아도 끝나면 알려 드립니다.
      </p>
    );
  if (!done) return null;
  return (
    <div
      role="status"
      className={`rounded-md border px-3 py-2 text-sm ${done.ok ? "border-[var(--ok)] bg-[var(--ok-soft)]" : "border-[var(--danger)] bg-[var(--danger-soft)]"}`}
    >
      {done.ok ? "새 버전 올리기를 마쳤습니다. " : "새 버전 올리기에 실패했습니다. 이전 버전이 그대로 돌고 있습니다. "}
      {done.message}
    </div>
  );
}
