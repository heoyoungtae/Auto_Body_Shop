"use server";
// 설정 › 로고·앱 아이콘. 바꾸기는 대표만.
import { redirect } from "next/navigation";
import { getDb } from "@/db/runtime";
import { BRAND_RULES, isBrandKind, saveBrandAsset } from "@/modules/platform/brand-assets";
import { UserError } from "@/modules/platform/errors";
import { errorUrl, noticeUrl, requireOwner, userMessage } from "../../_lib/session";

const PATH = "/settings/brand";

export async function brandAction(form: FormData) {
  const user = await requireOwner();
  const kind = String(form.get("kind") ?? "");
  const reset = form.get("intent") === "reset";
  let msg = "";
  try {
    if (!isBrandKind(kind)) throw new UserError("어느 그림인지 알 수 없습니다");
    const label = BRAND_RULES[kind].label;
    if (reset) {
      await saveBrandAsset(await getDb(), user, kind, null);
      msg = `${label}을(를) 앱 기본 그림으로 되돌렸습니다`;
    } else {
      const f = form.get("file");
      if (!(f instanceof File) || f.size === 0) throw new UserError("올릴 PNG 파일을 골라 주세요");
      await saveBrandAsset(await getDb(), user, kind, { bytes: new Uint8Array(await f.arrayBuffer()), fileName: f.name });
      msg = `${label}을(를) 등록했습니다. ${BRAND_RULES[kind].usedIn}에 바로 쓰입니다(휴대폰 홈 화면 아이콘은 바로가기를 다시 만들어야 바뀝니다)`;
    }
  } catch (e) {
    redirect(errorUrl(`${PATH}#${kind}`, userMessage(e)));
  }
  redirect(noticeUrl(PATH, msg) + `#${kind}`);
}
