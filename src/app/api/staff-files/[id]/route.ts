// 직원 서류 보기: 암호화해 둔 파일을 풀어 보여 준다(대표·회계 담당·본인만)
import { getDb } from "@/db/runtime";
import { openStaffFile } from "@/modules/staff/files";
import { UserError } from "@/modules/platform/errors";
import { currentUser } from "../../../_lib/session";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user || user.mustChangePassword) return new Response("로그인이 필요합니다", { status: 401 });
  try {
    const f = await openStaffFile(await getDb(), user, (await params).id);
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
