// 내 차 수첩 손님이 보는 보관 파일(사진·서류의 서명·직인·보증 신청 사진). 자기 수리 건의 '보일 것'만 연다(modules/carbook canSeeFile)
import { cookies } from "next/headers";
import { getDb } from "@/db/runtime";
import { canSeeFile, sessionOf } from "@/modules/carbook/service";
import { COOKIE } from "@/modules/carbook/rules";
import { contentTypeOf, readStored } from "@/modules/platform/storage";

export async function GET(_req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const db = await getDb();
  const s = await sessionOf(db, (await cookies()).get(COOKIE)?.value);
  if (!s) return new Response("내 차 수첩에 들어와 주세요", { status: 401 });
  const rel = (await params).path.join("/");
  if (!(await canSeeFile(db, s, rel))) return new Response("볼 수 없는 파일입니다", { status: 403 });
  try {
    const body = await readStored(rel);
    return new Response(new Uint8Array(body), { headers: { "content-type": contentTypeOf(rel), "cache-control": "private, max-age=86400", "x-content-type-options": "nosniff" } });
  } catch {
    return new Response("없는 파일입니다", { status: 404 });
  }
}
