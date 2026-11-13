// 목록 엑셀(CSV) 내려받기: 화면 조회줄과 같은 조건·같은 권한, 쪽 나눔 없이 모든 줄 + 합계
import { getDb } from "@/db/runtime";
import { ListAccessError, listCsv, runList } from "@/modules/listq/core";
import { LISTS } from "@/modules/listq/registry";
import { seoulDate } from "@/modules/platform/time";
import { currentUser } from "../../../_lib/session";

export async function GET(req: Request, { params }: { params: Promise<{ key: string }> }) {
  const user = await currentUser();
  if (!user || user.mustChangePassword) return new Response("로그인이 필요합니다", { status: 401 });
  const def = LISTS[(await params).key];
  if (!def) return new Response("없는 목록입니다", { status: 404 });
  const q = Object.fromEntries(new URL(req.url).searchParams.entries());
  try {
    const r = await runList(await getDb(), def, user, q);
    const name = encodeURIComponent(`${def.title}_${r.lq.from ?? "전체"}_${r.lq.to ?? seoulDate()}.csv`);
    return new Response(listCsv(r, q), {
      headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename*=UTF-8''${name}`, "cache-control": "private, no-store" },
    });
  } catch (e) {
    if (e instanceof ListAccessError) return new Response(e.message, { status: 403 });
    throw e;
  }
}
