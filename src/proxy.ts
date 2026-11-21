// 모든 요청 앞에서 막을 주소·외국 접속을 거른다(대표 2026-11-21 공격 대책). DB 는 보지 않고 앱 메모리 상태만 본다.
import { NextResponse, type NextRequest } from "next/server";
import { blockReason, clientIp, getSecState } from "@/modules/platform/security-state";

const PAGE = (title: string, body: string) =>
  `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><title>${title}</title></head><body style="margin:0;min-height:100vh;display:grid;place-items:center;font-family:system-ui,sans-serif"><main style="max-width:26rem;padding:1.5rem;text-align:center;line-height:1.6"><h1 style="font-size:1.2rem">${title}</h1><p>${body}</p></main></body></html>`;

export function proxy(req: NextRequest) {
  const why = blockReason(getSecState(), clientIp(req.headers));
  if (!why) return NextResponse.next();
  const html =
    why === "foreign"
      ? PAGE("해외에서는 열 수 없습니다", "이 앱은 국내에서만 열리도록 설정되어 있습니다. 해외에서 써야 하면 대표에게 알려 주세요.")
      : PAGE("잠시 접속이 막혔습니다", "이 주소에서 비정상적인 접속이 많아 잠시 막았습니다. 잘못 막혔다면 대표에게 알려 주세요.");
  return new NextResponse(html, { status: 403, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

export const config = {
  // 미니 PC 안에서 오는 상태 알림(/api/server-agent)은 주소가 없어 어차피 통과한다
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
