// 내 차 수첩 서비스 워커가 푸시를 받으면 여기서 보여 줄 글을 가져간다(로그인 쿠키 필요). 가져간 글은 다시 주지 않는다
import { cookies } from "next/headers";
import { getDb } from "@/db/runtime";
import { COOKIE } from "@/modules/carbook/rules";
import { sessionOf } from "@/modules/carbook/service";
import { takeInbox } from "@/modules/carbook/push";

export const dynamic = "force-dynamic";

export async function GET() {
  const db = await getDb();
  const s = await sessionOf(db, (await cookies()).get(COOKIE)?.value);
  if (!s) return Response.json([], { status: 401 });
  return Response.json(await takeInbox(db, s), { headers: { "Cache-Control": "no-store" } });
}
