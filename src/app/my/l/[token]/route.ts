// 알림톡·문자의 '내 차 수첩' 링크: 열면 그 수리 건만 보는 로그인(30일)이 되고 그 수리 화면으로 간다.
// 이미 문자 인증으로 들어와 있는 기기면 로그인을 바꾸지 않는다.
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getDb } from "@/db/runtime";
import { openLink, sessionOf } from "@/modules/carbook/service";
import { COOKIE } from "@/modules/carbook/rules";
import { requestMeta } from "../../../_lib/session";

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const db = await getDb();
  const jar = await cookies();
  const base = new URL(req.url);
  const go = (path: string) => NextResponse.redirect(new URL(path, process.env.APP_URL ?? base.origin), 303);
  const now = await sessionOf(db, jar.get(COOKIE)?.value);
  const o = await openLink(db, token, await requestMeta());
  if (!o) return go(`/my/login?error=${encodeURIComponent("링크 기간(90일)이 지났거나 올바르지 않습니다. 휴대폰 문자 인증으로 들어와 주세요")}`);
  if (now?.scope === "full" && now.customerId === o.customerId) return go(o.roId ? `/my/repairs/${o.roId}` : "/my");
  const res = go(o.roId ? `/my/repairs/${o.roId}` : "/my");
  res.cookies.set(COOKIE, o.token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: o.maxAgeDays * 86400 });
  return res;
}
