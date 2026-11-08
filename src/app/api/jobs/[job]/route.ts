// jobs 컨테이너가 부르는 주기 작업 주소. JOBS_TOKEN 이 맞아야 한다(설계서 8.6).
import { timingSafeEqual } from "node:crypto";
import { getDb } from "@/db/runtime";
import { runJob } from "@/modules/platform/jobs";

export const dynamic = "force-dynamic";

function authorized(req: Request) {
  const expected = process.env.JOBS_TOKEN;
  const got = req.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  if (!expected) return process.env.NODE_ENV !== "production";
  const a = Buffer.from(got);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: Request, { params }: { params: Promise<{ job: string }> }) {
  if (!authorized(req)) return new Response("unauthorized", { status: 401 });
  const { job } = await params;
  const result = await runJob(await getDb(), job);
  return Response.json(result, { status: result.status === "failed" ? 500 : 200 });
}
