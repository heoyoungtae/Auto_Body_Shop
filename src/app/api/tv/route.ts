// TV 현황판 값(30초마다 화면이 다시 부른다). 로그인한 직원이거나, 주소의 비밀 열쇠(?k=)가 맞아야 준다.
import { getDb } from "@/db/runtime";
import { tvBoard, tvScope, tvTokenOk } from "@/modules/dashboard/tv";
import { noteTvIp } from "@/modules/staff/punch";
import { currentUser, requestMeta } from "../../_lib/session";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const db = await getDb();
  const q = new URL(req.url).searchParams;
  const k = q.get("k");
  const user = k ? null : await currentUser();
  const ok = k ? await tvTokenOk(db, k) : !!user && !user.mustChangePassword;
  if (!ok) return Response.json({ ok: false, message: k ? "TV 링크가 맞지 않습니다. 설정 › TV 현황판에서 새 링크로 다시 띄워 주세요." : "로그인이 필요합니다" }, { status: 401 });
  // TV 링크로 띄운 현황판(정비소 TV)의 주소를 정비소 인터넷 주소로 따라간다(출퇴근 장소 'TV 현황판과 같은 인터넷')
  if (k) await noteTvIp(db, (await requestMeta()).ip).catch(() => undefined);
  return Response.json({ ok: true, data: await tvBoard(db, new Date(), await tvScope(db, { b: q.get("b"), w: q.get("w") })) }, { headers: { "cache-control": "no-store" } });
}
