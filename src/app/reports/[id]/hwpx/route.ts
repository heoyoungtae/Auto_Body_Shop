// 보고서 한 장 한글 문서(HWPX) 내려받기. 화면과 같은 권한·같은 숫자, 그래프는 그림으로 넣는다.
import { getDb } from "@/db/runtime";
import { FAMILIES, reportById } from "@/modules/report/catalog";
import { runHwpx } from "@/modules/report/hwpx/build";
import { isCompare, periodFromQuery } from "@/modules/report/period";
import { ReportAccessError, runReport } from "@/modules/report/run";
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
  const today = seoulDate();
  const p = periodFromQuery(q, today);
  const c = q.c && isCompare(q.c) ? q.c : "prev";
  try {
    const r = await runReport(await getDb(), user, id, p, c);
    const buf = runHwpx(r, { family: FAMILIES[def.family].label, printedOn: today, printedBy: user.name });
    const name = encodeURIComponent(`${def.title}_${p.from}_${p.to}.hwpx`);
    return new Response(new Uint8Array(buf), {
      headers: {
        "content-type": "application/hwp+zip",
        "content-disposition": `attachment; filename*=UTF-8''${name}`,
        "cache-control": "private, no-store",
      },
    });
  } catch (e) {
    if (e instanceof ReportAccessError) return new Response(e.message, { status: 403 });
    throw e;
  }
}
