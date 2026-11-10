"use server";
// 환경 관리(STD-10) 화면의 서버 동작
import { redirect } from "next/navigation";
import { getDb } from "@/db/runtime";
import {
  importEnvAspects,
  recordEnvEvent,
  recordWasteGen,
  recordWasteOut,
  signEnvMonth,
} from "@/modules/safety/environment";
import {
  ENV_EVENTS,
  WASTE_ITEMS,
  type EnvEventKind,
  type WasteItem,
} from "@/modules/safety/env-rules";
import { UserError } from "@/modules/platform/errors";
import { errorUrl, noticeUrl, requireUser, userMessage } from "../_lib/session";

const str = (form: FormData) => (k: string) => String(form.get(k) ?? "").trim();

export async function envAction(form: FormData) {
  const user = await requireUser();
  const s = str(form);
  const ym = s("ym");
  const base = `/environment${ym ? `?ym=${ym}` : ""}`;
  let back = base;
  let msg = "저장했습니다";
  try {
    const db = await getDb();
    const intent = s("intent");
    if (intent === "event") {
      back = `${base}#ops`;
      const r = await recordEnvEvent(db, user, {
        kind: s("kind"),
        equipmentId: s("equipmentId"),
        on: s("on"),
        detail: s("detail"),
        result: s("result"),
        wasteKg: s("wasteKg"),
      });
      msg = `${ENV_EVENTS[s("kind") as EnvEventKind]}을(를) 기록했습니다${r.nextDue ? `. 다음 교체일 ${r.nextDue}` : ""}${r.wasteLogId ? ". 폐기물 관리대장에 발생으로 넣었습니다" : ""}`;
    } else if (intent === "sign") {
      msg = `확인 서명했습니다: ${await signEnvMonth(db, user, s("signYm"), s("signNote"))}`;
    } else if (intent === "gen") {
      back = `${base}#waste`;
      await recordWasteGen(db, user, {
        item: s("item"),
        qty: Number(s("qty")),
        on: s("on"),
        note: s("note"),
      });
      msg = `${WASTE_ITEMS[s("item") as WasteItem]?.label ?? ""} 발생을 기록했습니다`;
    } else if (intent === "out") {
      back = `${base}#waste`;
      await recordWasteOut(db, user, {
        item: s("item"),
        qty: Number(s("qty")),
        on: s("on"),
        supplierId: s("supplierId"),
        slipNo: s("slipNo"),
        note: s("note"),
      });
      msg = "위탁 인계를 기록했습니다. 올바로시스템 수량과 같은지 확인하세요";
    } else if (intent === "aspects") {
      const n = await importEnvAspects(db, user);
      msg = n
        ? `환경측면 ${n}건을 리스크·기회 대장에 넣었습니다. 점수를 확인하세요`
        : "이미 모두 들어 있습니다";
    } else throw new UserError("알 수 없는 요청");
  } catch (e) {
    redirect(errorUrl(back, userMessage(e)));
  }
  redirect(noticeUrl(back, msg));
}
