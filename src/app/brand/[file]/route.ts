// 등록한 로고·앱 아이콘 보기(로그인 없이) — 로그인 화면·브라우저 탭·홈 화면 아이콘에도 나와야 한다.
// 등록하지 않은 칸은 앱에 들어 있는 기본 그림으로 넘긴다. 보관 폴더의 brand/ 파일만 내보낸다.
import { getDb } from "@/db/runtime";
import { brandDefaultUrl, isBrandKind, loadBrand } from "@/modules/platform/brand-assets";
import { readStored } from "@/modules/platform/storage";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ file: string }> }) {
  const name = (await params).file.replace(/\.png$/, "");
  if (!isBrandKind(name)) return new Response("없는 그림입니다", { status: 404 });
  const fallback = () => Response.redirect(new URL(brandDefaultUrl(name), req.url), 302);
  const e = (await loadBrand(await getDb()))[name];
  if (!e?.path.startsWith("brand/")) return fallback();
  try {
    const body = await readStored(e.path);
    return new Response(new Uint8Array(body), {
      headers: {
        "content-type": "image/png",
        // 주소에 ?v=바꾼 시각 이 붙어 바꾸면 새로 받는다
        "cache-control": new URL(req.url).searchParams.has("v") ? "public, max-age=31536000, immutable" : "public, max-age=300",
        "x-content-type-options": "nosniff",
      },
    });
  } catch {
    return fallback();
  }
}
