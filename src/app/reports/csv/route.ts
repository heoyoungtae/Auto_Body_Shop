// 통계·보고서 CSV 내려받기(엑셀에서 열림). 화면과 같은 권한·같은 숫자.
import { getDb } from "@/db/runtime";
import { can } from "@/modules/auth/permissions";
import { seoulDate } from "@/modules/platform/time";
import { isIsoDate, isPeriodKind, periodOf } from "@/modules/report/period";
import { buildReport, reportCsv } from "@/modules/report/service";
import { currentUser } from "../../_lib/session";

export async function GET(req: Request) {
  const user = await currentUser();
  if (!user || user.mustChangePassword) return new Response("로그인이 필요합니다", { status: 401 });
  if (!can(user, "report.view"))
    return new Response("통계·보고서는 대표·공장장·품질·회계 담당이 봅니다", {
      status: 403,
    });
  const u = new URL(req.url);
  const k = u.searchParams.get("k") ?? "month";
  const at = u.searchParams.get("at") ?? "";
  const p = periodOf(
    isPeriodKind(k) ? k : "month",
    isIsoDate(at) ? at : seoulDate(),
  );
  const csv = reportCsv(p, await buildReport(await getDb(), user, p));
  const name = encodeURIComponent(`경영보고서_${p.kind}_${p.from}.csv`);
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename*=UTF-8''${name}`,
      "cache-control": "private, no-store",
    },
  });
}
