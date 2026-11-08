import { sql } from "drizzle-orm";
import { getDb } from "@/db/runtime";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await (await getDb()).execute(sql`select 1`);
    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: false }, { status: 503 });
  }
}
