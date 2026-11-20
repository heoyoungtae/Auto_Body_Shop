// 협력업체 가져오기(대표 요청 2026-11-20). 서류 파일이 들어 있어 서버 액션 크기 제한(30MB)을 피하려고 일반 폼 POST 로 받는다.
// 세션 쿠키가 SameSite=Lax 라 다른 사이트에서 보낸 POST 에는 로그인이 실리지 않는다.
import { getDb } from "@/db/runtime";
import { importSuppliers } from "@/modules/purchase/supplier-transfer";
import { currentUser, errorUrl, userMessage } from "../../../_lib/session";

export const dynamic = "force-dynamic";
const back = (to: string) => new Response(null, { status: 303, headers: { location: to } });

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user || user.mustChangePassword) return back("/login");
  try {
    const f = (await req.formData()).get("file");
    if (!(f instanceof File) || !f.size) throw new Error("가져올 파일을 골라 주세요");
    if (f.size > 300 * 1024 * 1024) throw new Error("파일이 너무 큽니다(300MB 까지)");
    const r = await importSuppliers(await getDb(), user, await f.text());
    const q = new URLSearchParams({
      added: r.added.map((a) => `${a.name}(서류 ${a.files}${a.bank ? ", 계좌" : ""})`).join("|"),
      filled: r.filled.map((f) => `${f.name}(${[f.bank ? "계좌" : "", f.files ? `통장 사본 ${f.files}` : "", f.verified ? "확인 옮김" : ""].filter(Boolean).join(", ")})`).join("|"),
      skipped: r.skipped.map((s) => `${s.name}: ${s.why}`).join("|"),
    });
    return back(`/suppliers/transfer?${q}`);
  } catch (e) {
    return back(errorUrl("/suppliers/transfer", userMessage(e)));
  }
}
