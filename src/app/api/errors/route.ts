// 브라우저에서 화면을 그리다 난 오류(대표 2026-11-20 '오류 기록'). 로그인 안 한 손님 화면에서도 받되, 짧게 자르고
// 같은 오류가 넘치면 오류 기록 쪽에서 더 쌓지 않는다.
import { cookies } from "next/headers";
import { getDb } from "@/db/runtime";
import { getCurrentUser } from "@/modules/auth/service";
import { recordErrorSafe } from "@/modules/platform/error-log";
import { SESSION_COOKIE } from "../../_lib/session";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { message?: unknown; detail?: unknown; path?: unknown } | null;
  if (!body || typeof body.message !== "string" || !body.message.trim()) return new Response(null, { status: 204 });
  const db = await getDb();
  const user = await getCurrentUser(db, (await cookies()).get(SESSION_COOKIE)?.value).catch(() => null);
  await recordErrorSafe(db, {
    kind: "browser",
    message: body.message,
    detail: `${String(body.detail ?? "")}\n\n${req.headers.get("user-agent") ?? ""}`.trim(),
    path: String(body.path ?? ""),
    userId: user?.id ?? null,
  });
  return new Response(null, { status: 204 });
}
