// '고치는 중' 표시: 전표 화면이 20초마다 부른다(src/app/_presence.tsx). 로그인한 직원만.
import { getDb } from "@/db/runtime";
import { heartbeat, leave } from "@/modules/platform/presence";
import { currentUser } from "../../_lib/session";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user || user.mustChangePassword) return Response.json({ ok: false }, { status: 401 });
  let body: { doc?: unknown; tab?: unknown; editing?: unknown; leave?: unknown };
  try {
    body = JSON.parse(await req.text());
  } catch {
    return Response.json({ ok: false }, { status: 400 });
  }
  const doc = String(body.doc ?? "");
  const tab = String(body.tab ?? "");
  const db = await getDb();
  if (body.leave) {
    await leave(db, doc, tab);
    return Response.json({ ok: true, viewers: [] });
  }
  const viewers = await heartbeat(db, user.id, doc, tab, body.editing === true);
  return Response.json({ ok: true, viewers }, { headers: { "cache-control": "no-store" } });
}
