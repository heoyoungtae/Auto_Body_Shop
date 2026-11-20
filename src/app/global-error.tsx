"use client";
// 맨 바깥 틀(layout)에서 오류가 나 error.tsx 도 못 띄울 때의 마지막 안내(스타일 파일 없이)
import { useEffect } from "react";
import { reportBrowserError } from "./_error-report";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => reportBrowserError(error), [error]);
  return (
    <html lang="ko">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#fff", color: "#1b1f24" }}>
        <main style={{ maxWidth: "28rem", margin: "3rem auto", padding: "0 1rem", lineHeight: 1.6 }}>
          <h1 style={{ fontSize: "1.15rem" }}>죄송합니다. 앱에서 오류가 났습니다</h1>
          <p>오류는 저절로 기록되었습니다. 계속 나면 아래 오류 번호를 대표에게 알려 주세요.</p>
          <p style={{ background: "#f6f7f9", padding: "0.5rem 0.75rem", borderRadius: 6 }}>
            오류 번호 <b style={{ fontFamily: "monospace" }}>{error.digest || "브라우저 오류(번호 없음)"}</b>
          </p>
          <button type="button" onClick={() => reset()} style={{ minHeight: 40, padding: "0 1rem" }}>
            다시 해 보기
          </button>
        </main>
      </body>
    </html>
  );
}
