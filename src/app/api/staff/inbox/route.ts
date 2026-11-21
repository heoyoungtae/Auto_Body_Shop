// 직원 앱 서비스 워커(public/sw.js)가 푸시를 받으면 여기서 띄울 알림 글을 가져간다(로그인 쿠키 필요). 가져간 글은 다시 주지 않는다
import { getDb } from "@/db/runtime";
import { takeStaffInbox } from "@/modules/platform/staff-push";
import { currentUser } from "../../../_lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const me = await currentUser();
  if (!me) return Response.json([], { status: 401 });
  return Response.json(await takeStaffInbox(await getDb(), me.id), { headers: { "Cache-Control": "no-store" } });
}
