// 견적서(단가표) 엑셀 양식 내려받기. 업체 견적서를 이 양식에 옮겨 '견적서로 품목 등록'에 올린다.
import { quoteTemplate } from "@/modules/purchase/quote-template";
import { currentUser } from "../../../_lib/session";

export async function GET() {
  const user = await currentUser();
  if (!user || user.mustChangePassword) return new Response("로그인이 필요합니다", { status: 401 });
  return new Response(new Uint8Array(quoteTemplate()), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent("견적서_양식.xlsx")}`,
      "cache-control": "private, no-store",
    },
  });
}
