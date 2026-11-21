// 문서 목록 파일(작업 지침서·외부 문서) 보기: 직원 누구나(현장에서 보는 문서)
import { getDb } from "@/db/runtime";
import { openDocFile } from "@/modules/quality/doc-files";
import { UserError } from "@/modules/platform/errors";
import { currentUser } from "../../../../_lib/session";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string; n: string }> }) {
  const user = await currentUser();
  if (!user || user.mustChangePassword) return new Response("로그인이 필요합니다", { status: 401 });
  const { id, n } = await params;
  const i = Number(n);
  if (!Number.isInteger(i) || i < 0) return new Response("없는 파일입니다", { status: 404 });
  try {
    const f = await openDocFile(await getDb(), id, i);
    return new Response(new Uint8Array(f.bytes), {
      headers: {
        "content-type": f.mime,
        "content-disposition": `inline; filename*=UTF-8''${encodeURIComponent(f.name)}`,
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (e) {
    if (e instanceof UserError) return new Response(e.message, { status: 403 });
    return new Response("없는 파일입니다", { status: 404 });
  }
}
