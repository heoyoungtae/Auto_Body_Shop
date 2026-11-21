// 모든 요청 앞에서 막을 주소·외국 접속을 거른다(대표 2026-11-21 공격 대책). DB 는 보지 않고 앱 메모리 상태만 본다.
import { NextResponse, type NextRequest } from "next/server";
import { blockReason, clientIp, getSecState } from "@/modules/platform/security-state";
import { isHomepageHost, routeFor } from "@/modules/site/rules";

const PAGE = (title: string, body: string) =>
  `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><title>${title}</title></head><body style="margin:0;min-height:100vh;display:grid;place-items:center;font-family:system-ui,sans-serif"><main style="max-width:26rem;padding:1.5rem;text-align:center;line-height:1.6"><h1 style="font-size:1.2rem">${title}</h1><p>${body}</p></main></body></html>`;

export function proxy(req: NextRequest) {
  // 홈페이지 주소(jmotors.co.kr)는 손님 화면만 연다. 직원 화면 주소로 오면 앱 주소로 보낸다(대표 결정 2026-11-21 A안)
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const onHomepage = isHomepageHost(host);
  const path = req.nextUrl.pathname;
  const route = routeFor(path, onHomepage);
  const read = req.method === "GET" || req.method === "HEAD";
  // 외국 접속 막기는 직원 앱에만. 홈페이지 보기는 열어 둔다(구글 검색 로봇이 미국에서 온다). 글을 보내는 것(POST)은 국내만
  let why = blockReason(getSecState(), clientIp(req.headers));
  if (why === "foreign" && read && (onHomepage || route.kind === "rewrite" || path.startsWith("/site"))) why = null;
  if (!why) {
    if (route.kind === "app") {
      const app = (process.env.APP_URL ?? "").replace(/\/$/, "");
      if (app && !isHomepageHost(new URL(app).host)) return NextResponse.redirect(`${app}${path}${req.nextUrl.search}`, 308);
      return NextResponse.next();
    }
    if (route.kind === "rewrite" || path === "/site" || path.startsWith("/site/")) {
      const h = new Headers(req.headers);
      h.set("x-site", "1");
      if (route.kind === "rewrite") {
        const url = req.nextUrl.clone();
        url.pathname = route.to;
        return NextResponse.rewrite(url, { request: { headers: h } });
      }
      return NextResponse.next({ request: { headers: h } });
    }
    // 손님이 꾸며 보낸 x-site 머리글은 지운다(직원 화면 머리줄이 사라지지 않게)
    if (req.headers.has("x-site")) {
      const h = new Headers(req.headers);
      h.delete("x-site");
      return NextResponse.next({ request: { headers: h } });
    }
    return NextResponse.next();
  }
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
