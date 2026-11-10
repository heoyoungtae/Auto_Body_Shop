"use server";
// 화학물질 목록·MSDS(F-09-02) 화면의 서버 동작
import { redirect } from "next/navigation";
import { getDb } from "@/db/runtime";
import {
  createChemical,
  recordChemTraining,
  replaceMsds,
  retireChemical,
  updateChemical,
  type ChemicalInput,
  type MsdsUpload,
} from "@/modules/safety/chemical";
import { UserError } from "@/modules/platform/errors";
import { errorUrl, noticeUrl, requireUser, userMessage } from "../_lib/session";

const str = (form: FormData) => (k: string) => String(form.get(k) ?? "").trim();
function input(form: FormData): ChemicalInput {
  const s = str(form);
  return {
    name: s("name"),
    maker: s("maker"),
    category: s("category"),
    hazards: s("hazards"),
    monthlyUse: s("monthlyUse"),
    location: s("location"),
    ppe: form.getAll("ppe").map(String),
    flammable: s("flammable") === "1",
    msdsRevisedOn: s("msdsRevisedOn"),
    trainedOn: s("trainedOn"),
    note: s("note"),
  };
}
async function file(form: FormData): Promise<MsdsUpload | null> {
  const f = form.get("msds");
  return f instanceof File && f.size
    ? { name: f.name, bytes: new Uint8Array(await f.arrayBuffer()) }
    : null;
}

export async function createChemicalAction(form: FormData) {
  const user = await requireUser();
  let id = "";
  const f = await file(form);
  try {
    id = await createChemical(await getDb(), user, input(form), f);
  } catch (e) {
    redirect(errorUrl("/chemicals/new", userMessage(e)));
  }
  redirect(
    noticeUrl(
      `/chemicals/${id}`,
      f
        ? "등록했습니다. 공장장에게 MSDS 교육 알림이 갔습니다"
        : "등록했습니다. MSDS 파일을 아래에 올려 주세요",
    ),
  );
}

export async function chemicalAction(form: FormData) {
  const user = await requireUser();
  const s = str(form);
  const id = s("id");
  const back = `/chemicals/${id}`;
  let msg = "저장했습니다";
  const f = await file(form);
  try {
    const db = await getDb();
    const intent = s("intent");
    if (intent === "update") await updateChemical(db, user, id, input(form));
    else if (intent === "msds") {
      await replaceMsds(
        db,
        user,
        id,
        f ?? { name: "", bytes: new Uint8Array() },
        s("revisedOn"),
      );
      msg = "MSDS를 바꿨습니다";
    } else if (intent === "train") {
      await recordChemTraining(db, user, id, s("trainedOn"));
      msg = "MSDS 교육을 기록했습니다";
    } else if (intent === "retire" || intent === "restore") {
      await retireChemical(db, user, id, intent === "restore");
      msg =
        intent === "restore"
          ? "다시 쓰는 물질로 돌렸습니다"
          : "사용 중지했습니다";
    } else throw new UserError("알 수 없는 요청");
  } catch (e) {
    redirect(errorUrl(back, userMessage(e)));
  }
  redirect(noticeUrl(back, msg));
}
