"use server";
// 비품·자산(STD-07 9절, F-07-04) 화면의 서버 동작
import { redirect } from "next/navigation";
import { getDb } from "@/db/runtime";
import { checkFixture, confirmReceipt, disposeFixture, markLabeled, moveFixture, registerFixture, updateFixture, type FixtureInput } from "@/modules/purchase/fixture";
import { UserError } from "@/modules/platform/errors";
import { errorUrl, noticeUrl, requireUser, userMessage } from "../_lib/session";

const str = (form: FormData) => (k: string) => String(form.get(k) ?? "").trim();

function input(form: FormData): FixtureInput {
  const s = str(form);
  const price = s("priceWon").replace(/[^\d]/g, "");
  return { name: s("name"), category: s("category"), spec: s("spec"), purchasedOn: s("purchasedOn"), priceWon: price ? Number(price) : 0, location: s("location"), holderId: s("holderId"), warrantyUntil: s("warrantyUntil"), supplierId: s("supplierId"), expenseRef: s("expenseRef"), note: s("note") };
}

export async function registerFixtureAction(form: FormData) {
  const user = await requireUser();
  let r = { id: "", no: "" };
  try {
    r = await registerFixture(await getDb(), user, input(form));
  } catch (e) {
    redirect(errorUrl("/fixtures/new", userMessage(e)));
  }
  redirect(noticeUrl(`/fixtures/${r.id}`, `${r.no}로 등록했습니다. 라벨을 인쇄해 붙이세요`));
}

export async function fixtureAction(form: FormData) {
  const user = await requireUser();
  const s = str(form);
  const id = s("id");
  const back = s("back") || `/fixtures/${id}`;
  let msg = "저장했습니다";
  try {
    const db = await getDb();
    const intent = s("intent");
    if (intent === "update") await updateFixture(db, user, id, input(form));
    else if (intent === "move") {
      await moveFixture(db, user, id, { location: s("location"), holderId: s("holderId") });
      msg = "위치·사용자를 바꿨습니다";
    } else if (intent === "receive") {
      await confirmReceipt(db, user, id);
      msg = "수령을 확인했습니다";
    } else if (intent === "label") {
      await markLabeled(db, user, id);
      msg = "라벨 부착을 기록했습니다";
    } else if (intent === "check") {
      const result = s("result");
      await checkFixture(db, user, id, result, s("checkNote"));
      msg = result === "ok" ? "실물을 확인했습니다" : result === "found" ? "되찾음·수리를 기록했습니다" : "기록하고 대표에게 보고했습니다";
    } else if (intent === "dispose") {
      await disposeFixture(db, user, id, { method: s("method"), note: s("disposeNote"), dataWiped: s("dataWiped") === "1" });
      msg = "처분했습니다";
    } else throw new UserError("알 수 없는 요청");
  } catch (e) {
    redirect(errorUrl(back, userMessage(e)));
  }
  redirect(noticeUrl(back, msg));
}
