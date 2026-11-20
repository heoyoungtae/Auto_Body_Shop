// 브라우저에서 난 오류를 오류 기록에 보낸다(서버 오류는 digest 가 있어 서버가 이미 남겼으므로 보내지 않는다)
export function reportBrowserError(error: Error & { digest?: string }) {
  if (error.digest) return;
  try {
    void fetch("/api/errors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: String(error.message ?? error).slice(0, 500), detail: String(error.stack ?? "").slice(0, 4000), path: location.pathname }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // 조용히
  }
}
