// 열려 있는 직원 앱이 1분마다 묻는 안 읽은 알림 수. 늘었으면 클랙슨 소리를 내고 화면 숫자를 새로 그린다(_app-alerts.tsx)
import { getDb } from "@/db/runtime";
import { unreadCount } from "@/modules/platform/notify";
import { currentUser } from "../../../_lib/session";

export const dynamic = "force-dynamic";

export async function GET() {
  const me = await currentUser();
  if (!me) return Response.json({ n: 0 }, { status: 401 });
  return Response.json({ n: await unreadCount(await getDb(), me.id) }, { headers: { "Cache-Control": "no-store" } });
}
