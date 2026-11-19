// 미니 PC 의 minipc/agent.sh 가 1분마다 서버 상태를 알리고 '지금 새 버전 올리기' 요청을 받아 간다(JOBS_TOKEN).
import { timingSafeEqual } from "node:crypto";
import { getDb } from "@/db/runtime";
import { agentReport } from "@/modules/platform/server-ops";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const expected = process.env.JOBS_TOKEN ?? "";
  const got = Buffer.from(req.headers.get("authorization")?.replace(/^Bearer /, "") ?? "");
  if (!expected || got.length !== expected.length || !timingSafeEqual(got, Buffer.from(expected))) return new Response("unauthorized", { status: 401 });
  const body = (await req.json().catch(() => ({}))) as Parameters<typeof agentReport>[1];
  return Response.json({ ok: true, ...(await agentReport(await getDb(), body)) });
}
