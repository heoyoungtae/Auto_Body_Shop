// 사업자등록증 파일 보기: 암호화해 둔 파일을 풀어 보여 준다(대표·회계 담당만, 열 때마다 기록)
import { getDb } from "@/db/runtime";
import { openRegFile } from "@/modules/platform/biz-reg";
import { UserError } from "@/modules/platform/errors";
import { currentUser } from "../../../_lib/session";

export async function GET(_req: Request, { params }: { params: Promise<{ n: string }> }) {
  const user = await currentUser();
  if (!user || user.mustChangePassword) return new Response("로그인이 필요합니다", { status: 401 });
  const n = Number((await params).n);
  if (!Number.isInteger(n) || n < 0) return new Response("없는 파일입니다", { status: 404 });
  try {
    const f = await openRegFile(await getDb(), user, n);
    return new Response(new Uint8Array(f.bytes), {
      headers: {
        "content-type": f.mime,
        "content-disposition": `inline; filename*=UTF-8''${encodeURIComponent(f.fileName)}`,
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (e) {
    if (e instanceof UserError) return new Response(e.message, { status: 403 });
    return new Response("없는 파일입니다", { status: 404 });
  }
}
