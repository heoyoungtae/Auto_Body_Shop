// 앱 오류 기록(대표 2026-11-20): 화면을 열거나 저장하다 난 오류를 오류 기록(설정 › 서버 › 오류 기록)에 남긴다.
// 직원 화면에는 같은 오류 번호(digest)가 나오므로, 번호만 알려 주면 찾을 수 있다.
export function register() {}

export async function onRequestError(err: unknown, request: { path: string; method: string; headers: Record<string, string | string[] | undefined> }) {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    const e = (err ?? {}) as { message?: string; stack?: string; digest?: string };
    const { getDb } = await import("@/db/runtime");
    const { recordErrorSafe } = await import("@/modules/platform/error-log");
    const { getCurrentUser } = await import("@/modules/auth/service");
    const db = await getDb();
    const cookie = String(request.headers.cookie ?? "");
    const token = /(?:^|;\s*)abs_session=([^;]+)/.exec(cookie)?.[1];
    const user = token ? await getCurrentUser(db, decodeURIComponent(token)).catch(() => null) : null;
    await recordErrorSafe(db, {
      kind: "app",
      message: e.message || String(err),
      detail: e.stack ?? "",
      path: `${request.method} ${request.path}`,
      userId: user?.id ?? null,
      code: e.digest ?? "",
    });
  } catch {
    // 오류 기록이 실패해도 조용히
  }
}
