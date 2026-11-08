// 서버 backup.sh 가 매일 결과를 알려 온다. 실패하면 대표에게 알림(앱 설계서 9.5).
import { timingSafeEqual } from "node:crypto";
import { getDb } from "@/db/runtime";
import { writeAudit } from "@/modules/platform/audit";
import { notifyRole } from "@/modules/platform/notify";
import { seoulDate } from "@/modules/platform/time";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const expected = process.env.JOBS_TOKEN ?? "";
  const got = Buffer.from(req.headers.get("authorization")?.replace(/^Bearer /, "") ?? "");
  if (!expected || got.length !== expected.length || !timingSafeEqual(got, Buffer.from(expected))) return new Response("unauthorized", { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { ok?: boolean; message?: string };
  const db = await getDb();
  const message = String(body.message ?? "").slice(0, 300);
  await writeAudit(db, { actorId: null, action: body.ok ? "backup.ok" : "backup.failed", entityType: "backup", entityId: seoulDate(), after: { message } });
  if (!body.ok) await notifyRole(db, "owner", `백업 실패: ${message}`, `backup:${seoulDate()}`);
  return Response.json({ ok: true });
}
