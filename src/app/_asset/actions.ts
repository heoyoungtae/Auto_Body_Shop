"use server";
// 비품·설비 공통 동작(대표 지시 2026-11-12): 들어옴 확인·관리자 정/부·소유 구분·감가상각·사용계약·반납·수리 이력
import { redirect } from "next/navigation";
import { getDb } from "@/db/runtime";
import { addRepair, assetHref, attachContractFile, confirmArrival, markEquipmentLabeled, returnAsset, saveFinance, setManagers, type AssetKind } from "@/modules/asset/service";
import { UserError } from "@/modules/platform/errors";
import { errorUrl, noticeUrl, requireUser, userMessage } from "../_lib/session";

const num = (v: string) => {
  const d = v.replace(/[^\d]/g, "");
  return d ? Number(d) : 0;
};

export async function assetAction(form: FormData) {
  const user = await requireUser();
  const s = (k: string) => String(form.get(k) ?? "").trim();
  const kind = (s("kind") === "equipment" ? "equipment" : "fixture") as AssetKind;
  const id = s("id");
  const back = assetHref(kind, id);
  let msg = "저장했습니다";
  let anchor = "";
  try {
    const db = await getDb();
    const op = s("op");
    if (op === "arrive") {
      await confirmArrival(db, user, kind, id, s("arriveOn"));
      msg = kind === "equipment" ? "들어옴(시운전)을 확인했습니다. 라벨을 붙이세요" : "들어옴을 확인했습니다. 라벨을 붙이세요";
    } else if (op === "managers") {
      await setManagers(db, user, kind, id, s("managerId"), s("subManagerId"));
      msg = "관리자를 정했습니다. 라벨을 다시 붙여 주세요";
      anchor = "#managers";
    } else if (op === "finance") {
      const ownership = s("ownership");
      const payDay = s("payDay");
      await saveFinance(db, user, kind, id, {
        ownership,
        depMethod: s("depMethod") || "none",
        usefulYears: s("usefulYears") ? num(s("usefulYears")) : null,
        depStartOn: s("depStartOn"),
        contract: ownership === "own" ? null : { party: s("party"), phone: s("partyPhone"), start: s("contractStart"), end: s("contractEnd"), feeWon: num(s("feeWon")), payDay: payDay ? num(payDay) : undefined, repairBy: s("repairBy") === "us" ? "us" : "owner", terms: s("terms") },
      });
      const f = form.get("contractFile");
      if (f instanceof File && f.size > 0) await attachContractFile(db, user, kind, id, { name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) });
      anchor = "#finance";
    } else if (op === "return") {
      await returnAsset(db, user, kind, id, s("returnOn"), s("returnNote"));
      msg = "반납을 기록했습니다. 대장에서 빠집니다";
    } else if (op === "repair") {
      const files = form.getAll("repairFiles").filter((f): f is File => f instanceof File && f.size > 0);
      await addRepair(db, user, kind, id, {
        on: s("repairOn"),
        what: s("repairWhat"),
        vendor: s("repairVendor"),
        costWon: num(s("repairCost")),
        capital: s("capital") === "1",
        files: await Promise.all(files.map(async (f) => ({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) }))),
        failureId: s("failureId") || null,
      });
      msg = "수리 이력을 남겼습니다";
      anchor = "#repairs";
    } else throw new UserError("알 수 없는 요청");
  } catch (e) {
    redirect(errorUrl(back, userMessage(e)) + anchor);
  }
  redirect(noticeUrl(back, msg) + anchor);
}

/** 설비 라벨 붙였음(인쇄한 것 모두) */
export async function equipmentLabeledAction(form: FormData) {
  const user = await requireUser();
  const ids = form.getAll("ids").map(String).filter(Boolean);
  let n = 0;
  try {
    n = await markEquipmentLabeled(await getDb(), user, ids);
  } catch (e) {
    redirect(errorUrl("/equipment/labels", userMessage(e)));
  }
  redirect(noticeUrl("/equipment", `라벨 ${n}장 부착을 기록했습니다`));
}
