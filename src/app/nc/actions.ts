"use server";
// 부적합·시정 조치(F-Q-10) 화면의 서버 동작
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/db/runtime";
import { UserError } from "@/modules/platform/errors";
import { addNcPhoto, closeNc, openNc, planNc, recordNcAction, removeNcPhoto, verifyNc } from "@/modules/quality/nc";
import { errorUrl, noticeUrl, requireUser, userMessage } from "../_lib/session";

const str = (form: FormData) => (k: string) => String(form.get(k) ?? "").trim();

export async function openNcAction(form: FormData) {
  const user = await requireUser();
  const s = str(form);
  let id = "";
  let docNo = "";
  try {
    ({ id, docNo } = await openNc(await getDb(), user, { source: s("source"), refType: s("refType"), refId: s("refId"), refLabel: s("refLabel"), content: s("content"), immediate: s("immediate"), major: s("major") === "1" }));
  } catch (e) {
    redirect(errorUrl("/nc/new", userMessage(e)));
  }
  redirect(noticeUrl(`/nc/${id}`, `${docNo}를 발행했습니다. 품질 담당·공장장에게 알렸습니다. 사진이 있으면 아래에 올리세요`));
}

export async function ncAction(form: FormData) {
  const user = await requireUser();
  const s = str(form);
  const id = s("id");
  const intent = s("intent");
  const back = `/nc/${id}`;
  let msg = "저장했습니다";
  try {
    const db = await getDb();
    if (intent === "plan") {
      await planNc(db, user, id, {
        immediate: s("immediate"),
        major: s("major") === "1",
        whys: [1, 2, 3, 4, 5].map((i) => s(`why${i}`)),
        rootCause: s("rootCause"),
        corrective: s("corrective"),
        assigneeId: s("assigneeId"),
        dueOn: s("dueOn"),
        stdRevision: s("stdRevision") === "1",
        revisionRef: s("revisionRef"),
      });
      msg = "원인과 시정 조치를 정했습니다. 조치 담당에게 알렸습니다";
    } else if (intent === "action") {
      await recordNcAction(db, user, id, s("actionDone"));
      msg = "조치를 적었습니다. 품질 담당이 효과를 확인합니다";
    } else if (intent === "verify") {
      const recurred = s("recurred") === "1";
      await verifyNc(db, user, id, { effectOn: s("effectOn"), recurred, effectNote: s("effectNote") });
      msg = recurred ? "재발로 확인했습니다. 시정 조치를 고쳐 다시 진행합니다" : "효과를 확인했습니다. 종결할 수 있습니다";
    } else if (intent === "close") {
      await closeNc(db, user, id);
      msg = "종결했습니다";
    } else throw new UserError("알 수 없는 요청");
  } catch (e) {
    redirect(errorUrl(back, userMessage(e)));
  }
  redirect(noticeUrl(back, msg));
}

type R = { ok: true } | { ok: false; error: string };

export async function uploadNcPhotoAction(form: FormData): Promise<R> {
  const user = await requireUser();
  const file = form.get("file");
  const id = String(form.get("id") ?? "");
  try {
    if (!(file instanceof Blob)) throw new UserError("사진을 고르지 않았습니다");
    await addNcPhoto(await getDb(), user, id, form.get("kind") === "action" ? "action" : "issue", new Uint8Array(await file.arrayBuffer()));
  } catch (e) {
    return { ok: false, error: userMessage(e) };
  }
  revalidatePath(`/nc/${id}`);
  return { ok: true };
}

export async function removeNcPhotoAction(form: FormData): Promise<R> {
  const user = await requireUser();
  const id = String(form.get("id") ?? "");
  try {
    await removeNcPhoto(await getDb(), user, id, String(form.get("path") ?? ""));
  } catch (e) {
    return { ok: false, error: userMessage(e) };
  }
  revalidatePath(`/nc/${id}`);
  return { ok: true };
}
