// 협력업체 내보내기(대표 요청 2026-11-20): 후보·승인 대기 업체(?all=1 이면 전체)를 서류 파일과 함께 .json 하나로 내려받는다
import { getDb } from "@/db/runtime";
import { exportSuppliers } from "@/modules/purchase/supplier-transfer";
import { seoulDate } from "@/modules/platform/time";
import { currentUser, userMessage } from "../../../_lib/session";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const user = await currentUser();
  if (!user || user.mustChangePassword) return new Response("로그인이 필요합니다", { status: 401 });
  const all = new URL(req.url).searchParams.get("all") === "1";
  try {
    const pack = await exportSuppliers(await getDb(), user, all ? ["candidate", "proposed", "registered", "stopped", "rejected"] : undefined);
    const name = `협력업체-${all ? "전체" : "후보"}-${seoulDate().replace(/-/g, "")}.json`;
    return new Response(JSON.stringify(pack), {
      headers: { "content-type": "application/json; charset=utf-8", "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(name)}`, "cache-control": "no-store" },
    });
  } catch (e) {
    return new Response(userMessage(e), { status: 403 });
  }
}
