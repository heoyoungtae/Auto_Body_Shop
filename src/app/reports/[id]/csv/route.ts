// 보고서 한 장 CSV 내려받기(엑셀에서 열림). 화면과 같은 권한·같은 숫자.
import { getDb } from "@/db/runtime";
import { reportById } from "@/modules/report/catalog";
import { isCompare, periodFromQuery } from "@/modules/report/period";
import { ReportAccessError, runCsv, runReport } from "@/modules/report/run";
import { seoulDate } from "@/modules/platform/time";
import { currentUser } from "../../../_lib/session";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user || user.mustChangePassword) return new Response("로그인이 필요합니다", { status: 401 });
  const { id } = await params;
  const def = reportById(id);
  if (!def) return new Response("없는 보고서입니다", { status: 404 });
  const u = new URL(req.url);
  const q = Object.fromEntries(u.searchParams.entries());
  const p = periodFromQuery(q, seoulDate());
  const c = q.c && isCompare(q.c) ? q.c : "prev";
  try {
    const r = await runReport(await getDb(), user, id, p, c);
    const name = encodeURIComponent(`${def.title}_${p.from}_${p.to}.csv`);
    return new Response(runCsv(r), {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename*=UTF-8''${name}`,
        "cache-control": "private, no-store",
      },
    });
  } catch (e) {
    if (e instanceof ReportAccessError) return new Response(e.message, { status: 403 });
    throw e;
  }
}
