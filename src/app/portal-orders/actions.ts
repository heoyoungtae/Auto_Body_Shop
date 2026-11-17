"use server";
import { redirect } from "next/navigation";
import { getDb } from "@/db/runtime";
import { importTechbayOrders, linkPortalOrder, markPortalStep, techbayLogin, techbayLogout, techbayRequestCode, techbaySettings } from "@/modules/partner/service";
import { errorUrl, noticeUrl, requireUser, userMessage } from "../_lib/session";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
/** 돌아갈 곳(같은 앱 안 주소만) */
const backOf = (f: FormData, def: string) => {
  const b = str(f, "back");
  return b.startsWith("/") && !b.startsWith("//") ? b : def;
};

/** 테크베이 연결: 설정·인증번호 요청·로그인·끊기 */
export async function techbayAction(form: FormData) {
  const user = await requireUser();
  const back = backOf(form, "/portal-orders");
  let msg = "";
  try {
    const db = await getDb();
    switch (str(form, "intent")) {
      case "settings":
        await techbaySettings(db, user, { url: str(form, "url"), phone: str(form, "phone") });
        msg = "테크베이 연결 설정을 저장했습니다";
        break;
      case "code":
        await techbayRequestCode(db, user, str(form, "phone"));
        msg = "인증번호를 문자로 보냈습니다. 5분 안에 넣어 주세요";
        break;
      case "login":
        await techbayLogin(db, user, str(form, "code"));
        msg = "테크베이에 연결했습니다";
        break;
      case "logout":
        await techbayLogout(db, user);
        msg = "테크베이 연결을 끊었습니다";
        break;
      default:
        throw new Error("알 수 없는 동작입니다");
    }
  } catch (e) {
    redirect(errorUrl(back, userMessage(e)));
  }
  redirect(noticeUrl(back, msg));
}

/** 고른 테크베이 주문을 업체 고객 앞 상담으로 */
export async function importAction(form: FormData) {
  const user = await requireUser();
  const customerId = str(form, "customerId");
  const back = `/portal-orders?customer=${customerId}&load=1`;
  let msg = "";
  try {
    const made = await importTechbayOrders(await getDb(), user, customerId, form.getAll("order").map(String));
    const moved = made.filter((m) => m.moved).length;
    msg = made.length ? `주문 ${made.length}건을 상담으로 만들었습니다(${made.map((m) => `${m.docNo} ${m.plateNo}`).join(", ")})${moved ? ` · 다른 고객의 차 ${moved}대를 이 업체로 옮김` : ""}. 차가 들어오면 상담에서 '입고 접수'를 하세요` : "불러올 주문이 없습니다(이미 불러왔거나 차량번호가 없음)";
  } catch (e) {
    redirect(errorUrl(back, userMessage(e)));
  }
  redirect(noticeUrl(`/portal-orders?customer=${customerId}`, msg));
}

/** 그쪽 앱 주문번호 잇기, 진행 상태 '등록함' */
export async function portalStepAction(form: FormData) {
  const user = await requireUser();
  const back = backOf(form, "/portal-orders");
  let msg = "";
  try {
    const db = await getDb();
    if (str(form, "intent") === "link") {
      await linkPortalOrder(db, user, str(form, "consultationId"), str(form, "extNo"));
      msg = "그쪽 앱 주문번호를 이었습니다";
    } else {
      await markPortalStep(db, user, str(form, "orderId"), str(form, "step"), str(form, "note"));
      msg = "그쪽 앱에 등록했다고 적었습니다";
    }
  } catch (e) {
    redirect(errorUrl(back, userMessage(e)));
  }
  redirect(noticeUrl(back, msg));
}
