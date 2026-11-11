"use server";
import { linkSuggestion } from "@/modules/journal/entry";
// 개선 제안(STD-08 8.12, F-08-06) 화면의 서버 동작
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db/runtime";
import { addSuggestionPhoto, completeSuggestion, decideSuggestion, removeSuggestionPhoto, submitSuggestion, updateSuggestion, type SuggestionInput } from "@/modules/equipment/suggestion";
import { SG_DECISIONS, type SgDecision } from "@/modules/equipment/rules";
import { UserError } from "@/modules/platform/errors";
import { errorUrl, noticeUrl, requireUser, userMessage } from "../_lib/session";

const str = (form: FormData) => (k: string) => String(form.get(k) ?? "").trim();
const input = (form: FormData): SuggestionInput => {
  const s = str(form);
  return { title: s("title"), area: s("area"), problem: s("problem"), proposal: s("proposal"), effect: s("effect") };
};

export async function submitSuggestionAction(form: FormData) {
  const user = await requireUser();
  let r = { id: "", docNo: "" };
  try {
    const db = await getDb();
    r = await submitSuggestion(db, user, input(form));
    const jd = String(form.get("journalDay") ?? "");
    if (jd) await linkSuggestion(db, user, jd, r.docNo);
  } catch (e) {
    redirect(errorUrl("/suggestions/new", userMessage(e)));
  }
  redirect(noticeUrl(`/suggestions/${r.id}`, `${r.docNo}로 제안했습니다. 사진이 있으면 아래에 올리세요. 공장장이 14일 안에 회신합니다`));
}

export async function suggestionAction(form: FormData) {
  const user = await requireUser();
  const s = str(form);
  const id = s("id");
  const back = `/suggestions/${id}`;
  let msg = "저장했습니다";
  try {
    const db = await getDb();
    const intent = s("intent");
    if (intent === "update") await updateSuggestion(db, user, id, input(form));
    else if (intent === "decide") {
      await decideSuggestion(db, user, id, { decision: s("decision"), reply: s("reply") });
      msg = `${SG_DECISIONS[s("decision") as SgDecision]}으로 회신했습니다. 제안자에게 알림이 갑니다`;
    } else if (intent === "done") {
      await completeSuggestion(db, user, id, { doneNote: s("doneNote"), effectNote: s("effectNote"), revisionRef: s("revisionRef") });
      msg = "실행·효과 확인을 기록했습니다";
    } else throw new UserError("알 수 없는 요청");
  } catch (e) {
    redirect(errorUrl(back, userMessage(e)));
  }
  redirect(noticeUrl(back, msg));
}

type R = { ok: true } | { ok: false; error: string };

export async function uploadSgPhotoAction(form: FormData): Promise<R> {
  const user = await requireUser();
  const file = form.get("file");
  const id = String(form.get("id") ?? "");
  try {
    if (!(file instanceof Blob)) throw new UserError("사진을 고르지 않았습니다");
    await addSuggestionPhoto(await getDb(), user, id, new Uint8Array(await file.arrayBuffer()));
  } catch (e) {
    return { ok: false, error: userMessage(e) };
  }
  revalidatePath(`/suggestions/${id}`);
  return { ok: true };
}

export async function removeSgPhotoAction(form: FormData): Promise<R> {
  const user = await requireUser();
  const id = String(form.get("id") ?? "");
  try {
    await removeSuggestionPhoto(await getDb(), user, id, String(form.get("path") ?? ""));
  } catch (e) {
    return { ok: false, error: userMessage(e) };
  }
  revalidatePath(`/suggestions/${id}`);
  return { ok: true };
}
