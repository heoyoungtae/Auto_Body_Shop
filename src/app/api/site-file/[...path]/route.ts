// 홈페이지 작업 사례 사진·공업사 사진(누구나 봄). 공개 중이고 손님 동의가 살아 있는 사례의 '가린 사진'만 연다(modules/site/content publicCaseFile)
import { getDb } from "@/db/runtime";
import { publicCaseFile } from "@/modules/site/content";
import { publicShopFile } from "@/modules/site/trust";
import { contentTypeOf, readStored } from "@/modules/platform/storage";

export async function GET(_req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const rel = (await params).path.join("/");
  const db = await getDb();
  if (!(await publicCaseFile(db, rel)) && !(await publicShopFile(db, rel))) return new Response("볼 수 없는 사진입니다", { status: 404 });
  try {
    const body = await readStored(rel);
    // 짧게만 담아 둔다: 동의를 거두거나 공개를 끄면 곧 안 보이게
    return new Response(new Uint8Array(body), { headers: { "content-type": contentTypeOf(rel), "cache-control": "public, max-age=600", "x-content-type-options": "nosniff" } });
  } catch {
    return new Response("없는 사진입니다", { status: 404 });
  }
}
