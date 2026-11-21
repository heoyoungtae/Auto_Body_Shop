"use server";
// 홈페이지 글 관리(자주 묻는 질문 · 공지사항 · 작업 사례) 저장 — 상담을 쓸 수 있는 직원
import { redirect } from "next/navigation";
import { getDb } from "@/db/runtime";
import { rolesFor } from "@/modules/auth/permissions";
import { addCasePhoto, createCase, deleteCase, deleteFaq, deleteNotice, loadFaqStarters, removeCasePhoto, saveCase, saveFaq, saveNotice } from "@/modules/site/content";
import { errorUrl, noticeUrl, requireUser, userMessage } from "../_lib/session";

const STAFF = rolesFor("consult.write");
const g = (f: FormData, k: string) => String(f.get(k) ?? "");
const on = (f: FormData, k: string) => f.getAll(k).map(String).includes("on");

export async function saveFaqAction(form: FormData) {
  const user = await requireUser([...STAFF]);
  const id = g(form, "id") || undefined;
  try {
    await saveFaq(await getDb(), user, { id, category: g(form, "category"), question: g(form, "question"), answer: g(form, "answer"), sort: Number(g(form, "sort") || 100), published: on(form, "published") });
  } catch (e) {
    redirect(errorUrl(id ? `/homepage/faq?edit=${id}` : "/homepage/faq", userMessage(e)));
  }
  redirect(noticeUrl("/homepage/faq", on(form, "published") ? "저장했습니다. 홈페이지에 바로 보입니다" : "저장했습니다(공개 안 함 — 홈페이지에는 아직 안 보입니다)"));
}

export async function deleteFaqAction(form: FormData) {
  const user = await requireUser([...STAFF]);
  await deleteFaq(await getDb(), user, g(form, "id"));
  redirect(noticeUrl("/homepage/faq", "지웠습니다"));
}

export async function faqStartersAction() {
  const user = await requireUser([...STAFF]);
  let n = 0;
  try {
    n = await loadFaqStarters(await getDb(), user);
  } catch (e) {
    redirect(errorUrl("/homepage/faq", userMessage(e)));
  }
  redirect(noticeUrl("/homepage/faq", n ? `초안 ${n}개를 넣었습니다(공개 안 함). 하나씩 읽고 고친 뒤 공개하세요` : "넣을 초안이 없습니다(이미 모두 넣었습니다)"));
}

export async function saveNoticeAction(form: FormData) {
  const user = await requireUser([...STAFF]);
  const id = g(form, "id") || undefined;
  let msg = "";
  try {
    const r = await saveNotice(await getDb(), user, {
      id,
      title: g(form, "title"),
      body: g(form, "body"),
      pinned: form.getAll("opts").includes("pinned"),
      banner: form.getAll("opts").includes("banner"),
      ad: form.getAll("opts").includes("ad"),
      published: on(form, "published"),
      startsOn: g(form, "startsOn"),
      endsOn: g(form, "endsOn"),
      notifyCarbook: form.getAll("opts").includes("notify"),
    });
    msg = r.sent != null ? `저장하고 내 차 수첩 알림을 ${r.sent}명에게 보냈습니다` : on(form, "published") ? "저장했습니다. 게시 기간이 되면 홈페이지에 보입니다" : "저장했습니다(공개 안 함)";
  } catch (e) {
    redirect(errorUrl(id ? `/homepage/notice?edit=${id}` : "/homepage/notice", userMessage(e)));
  }
  redirect(noticeUrl("/homepage/notice", msg));
}

export async function deleteNoticeAction(form: FormData) {
  const user = await requireUser([...STAFF]);
  await deleteNotice(await getDb(), user, g(form, "id"));
  redirect(noticeUrl("/homepage/notice", "지웠습니다"));
}

export async function createCaseAction(form: FormData) {
  const user = await requireUser([...STAFF]);
  let id: string;
  try {
    id = await createCase(await getDb(), user, g(form, "ro"));
  } catch (e) {
    redirect(errorUrl("/homepage/cases", userMessage(e)));
  }
  redirect(noticeUrl(`/homepage/cases/${id}`, "사례를 만들었습니다. 사진을 골라 번호판을 가리고 올리세요"));
}

export async function saveCaseAction(form: FormData) {
  const user = await requireUser([...STAFF]);
  const id = g(form, "id");
  try {
    await saveCase(await getDb(), user, id, { title: g(form, "title"), body: g(form, "body"), category: g(form, "category"), carLabel: g(form, "carLabel"), published: on(form, "published") });
  } catch (e) {
    redirect(errorUrl(`/homepage/cases/${id}`, userMessage(e)));
  }
  redirect(noticeUrl(`/homepage/cases/${id}`, on(form, "published") ? "저장했습니다. 홈페이지 작업 사례에 보입니다" : "저장했습니다(공개 안 함)"));
}

export async function deleteCaseAction(form: FormData) {
  const user = await requireUser([...STAFF]);
  await deleteCase(await getDb(), user, g(form, "id"));
  redirect(noticeUrl("/homepage/cases", "사례와 사진을 지웠습니다"));
}

/** 가린 사진 올리기(화면에서 새로 그린 그림). 결과만 돌려주고 화면이 새로 고친다 */
export async function uploadCasePhotoAction(form: FormData): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireUser([...STAFF]);
  const file = form.get("file");
  if (!(file instanceof Blob)) return { ok: false, error: "사진이 없습니다" };
  try {
    await addCasePhoto(await getDb(), user, g(form, "id"), g(form, "side"), new Uint8Array(await file.arrayBuffer()), { width: Number(g(form, "width")), height: Number(g(form, "height")) });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: userMessage(e) };
  }
}

export async function removeCasePhotoAction(form: FormData) {
  const user = await requireUser([...STAFF]);
  const id = g(form, "id");
  await removeCasePhoto(await getDb(), user, id, g(form, "path"));
  redirect(noticeUrl(`/homepage/cases/${id}`, "사진을 뺐습니다"));
}
