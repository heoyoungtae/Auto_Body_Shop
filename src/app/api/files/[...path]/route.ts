// 보관 파일(입고 사진·서명) 보기 — 로그인한 직원만. 경로는 보관 폴더 밖으로 못 나간다(storage.resolveStored).
import { contentTypeOf, readStored } from "@/modules/platform/storage";
import { currentUser } from "../../../_lib/session";

export async function GET(_req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const user = await currentUser();
  if (!user) return new Response("로그인이 필요합니다", { status: 401 });
  const rel = (await params).path.join("/");
  try {
    const body = await readStored(rel);
    return new Response(new Uint8Array(body), { headers: { "content-type": contentTypeOf(rel), "cache-control": "private, max-age=86400", "x-content-type-options": "nosniff" } });
  } catch {
    return new Response("없는 파일입니다", { status: 404 });
  }
}
