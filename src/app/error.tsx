"use client";
// 화면을 열거나 저장하다 오류가 나면 기본 오류 화면 대신 이 안내를 보여 준다(대표 2026-11-20 '오류 기록').
// 오류 번호는 설정 › 서버 › 오류 기록에서 그대로 찾을 수 있다.
import Link from "next/link";
import { useEffect } from "react";
import { reportBrowserError } from "./_error-report";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => reportBrowserError(error), [error]);
  return (
    <main className="mx-auto max-w-lg px-4 py-12">
      <section className="rounded-lg border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[var(--shadow)]">
        <h1 className="text-lg font-semibold">죄송합니다. 이 화면에서 오류가 났습니다</h1>
        <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
          오류는 저절로 기록되었습니다. 한 번 더 해 보고, 계속 나면 아래 오류 번호를 대표에게 알려 주세요. 입력하던 내용은 저장되지 않았을 수 있습니다.
        </p>
        <p className="mt-3 rounded-md bg-[var(--surface-2)] px-3 py-2 text-sm">
          오류 번호 <b className="font-mono">{error.digest || "브라우저 오류(번호 없음)"}</b>
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" onClick={() => reset()} className="min-h-10 rounded-md bg-[var(--accent)] px-4 text-sm font-medium text-[var(--accent-fg)]">
            다시 해 보기
          </button>
          <Link href="/" className="inline-flex min-h-10 items-center rounded-md border border-[var(--line-strong)] px-4 text-sm">
            처음 화면으로
          </Link>
        </div>
      </section>
    </main>
  );
}
