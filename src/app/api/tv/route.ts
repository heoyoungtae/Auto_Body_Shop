// TV 현황판 값(30초마다 화면이 다시 부른다). 로그인한 직원이거나, 주소의 비밀 열쇠(?k=)가 맞아야 준다.
import { getDb } from "@/db/runtime";
import { tvBoard, tvTokenOk } from "@/modules/dashboard/tv";
import { currentUser } from "../../_lib/session";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const db = await getDb();
  const k = new URL(req.url).searchParams.get("k");
  const user = k ? null : await currentUser();
  const ok = k ? await tvTokenOk(db, k) : !!user && !user.mustChangePassword;
  if (!ok) return Response.json({ ok: false, message: k ? "TV 링크가 맞지 않습니다. 설정 › TV 현황판에서 새 링크로 다시 띄워 주세요." : "로그인이 필요합니다" }, { status: 401 });
  return Response.json({ ok: true, data: await tvBoard(db) }, { headers: { "cache-control": "no-store" } });
}
