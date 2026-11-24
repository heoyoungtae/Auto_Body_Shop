// 수리 건 사진 zip 내려받기 — 로그인한 직원만(사진 보기와 같음)
import { getDb } from "@/db/runtime";
import { photoZip } from "@/modules/repair/photo-bundle";
import { currentUser } from "../../../_lib/session";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user || user.mustChangePassword) return new Response("로그인이 필요합니다", { status: 401 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new Response("없는 수리 건입니다", { status: 404 });
  const z = await photoZip(await getDb(), id);
  if (!z) return new Response("없는 수리 건입니다", { status: 404 });
  return new Response(new Uint8Array(z.body), {
    headers: {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="photos.zip"; filename*=UTF-8''${encodeURIComponent(z.name)}`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
