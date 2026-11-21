// 수발신 문서 파일 보기: 그 문서를 볼 수 있는 사람(대장 관리자·접수자·기안자·담당)만
import { getDb } from "@/db/runtime";
import { openCorrFile } from "@/modules/quality/corr";
import { UserError } from "@/modules/platform/errors";
import { currentUser } from "../../../../_lib/session";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string; n: string }> }) {
  const user = await currentUser();
  if (!user || user.mustChangePassword) return new Response("로그인이 필요합니다", { status: 401 });
  const { id, n } = await params;
  const i = Number(n);
  if (!Number.isInteger(i) || i < 0) return new Response("없는 파일입니다", { status: 404 });
  try {
    const f = await openCorrFile(await getDb(), user, id, i);
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
