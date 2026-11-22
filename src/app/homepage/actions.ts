"use server";
// 홈페이지 글 관리(자주 묻는 질문 · 공지사항 · 작업 사례 · 기술자료 · 후기·사진·인증) 저장 — 상담을 쓸 수 있는 직원
import { redirect } from "next/navigation";
import { getDb } from "@/db/runtime";
import { rolesFor } from "@/modules/auth/permissions";
import { addCasePhoto, createCase, deleteCase, deleteFaq, deleteNotice, loadFaqStarters, removeCasePhoto, saveCase, saveFaq, saveNotice } from "@/modules/site/content";
import { addCert, addReview, addShopPhoto, removeCert, removeReview, removeShopPhoto, saveTrustLinks, setHeroPhoto } from "@/modules/site/trust";
import { deleteArticle, loadArticleStarters, saveArticle } from "@/modules/site/articles";
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
  redirect(noticeUrl("/homepage/faq", n ? `처음 글 ${n}개를 넣어 공개했습니다. 맞지 않는 글은 고치거나 공개를 꺼 주세요` : "넣을 초안이 없습니다(이미 모두 넣었습니다)"));
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

// ── 후기·사진·인증 ──
async function trustDo(fn: () => Promise<unknown>, ok: string) {
  try {
    await fn();
  } catch (e) {
    redirect(errorUrl("/homepage/trust", userMessage(e)));
  }
  redirect(noticeUrl("/homepage/trust", ok));
}

export async function saveTrustLinksAction(form: FormData) {
  const user = await requireUser([...STAFF]);
  await trustDo(async () => saveTrustLinks(await getDb(), user, { naver: g(form, "naver"), kakao: g(form, "kakao"), google: g(form, "google"), score: g(form, "score"), count: g(form, "count"), source: g(form, "source") }), "저장했습니다");
}
export async function addReviewAction(form: FormData) {
  const user = await requireUser([...STAFF]);
  await trustDo(async () => addReview(await getDb(), user, { name: g(form, "name"), rating: Number(g(form, "rating")), text: g(form, "text"), source: g(form, "source"), date: g(form, "date") }), "후기를 넣었습니다. 홈페이지에 바로 보입니다");
}
export async function removeReviewAction(form: FormData) {
  const user = await requireUser([...STAFF]);
  await trustDo(async () => removeReview(await getDb(), user, g(form, "id")), "후기를 지웠습니다");
}
export async function addCertAction(form: FormData) {
  const user = await requireUser([...STAFF]);
  await trustDo(async () => addCert(await getDb(), user, { name: g(form, "name"), desc: g(form, "desc") }), "자격·인증을 넣었습니다");
}
export async function removeCertAction(form: FormData) {
  const user = await requireUser([...STAFF]);
  await trustDo(async () => removeCert(await getDb(), user, g(form, "id")), "지웠습니다");
}
export async function setHeroAction(form: FormData) {
  const user = await requireUser([...STAFF]);
  const id = g(form, "id");
  await trustDo(async () => setHeroPhoto(await getDb(), user, id), id ? "첫 화면 배경으로 정했습니다" : "첫 화면 배경을 기본 그림으로 되돌렸습니다");
}
export async function removeShopPhotoAction(form: FormData) {
  const user = await requireUser([...STAFF]);
  await trustDo(async () => removeShopPhoto(await getDb(), user, g(form, "id")), "사진을 뺐습니다");
}
/** 공업사 사진 올리기(화면에서 줄여 새로 그린 그림). 결과만 돌려준다 */
export async function uploadShopPhotoAction(form: FormData): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireUser([...STAFF]);
  const file = form.get("file");
  if (!(file instanceof Blob)) return { ok: false, error: "사진이 없습니다" };
  try {
    await addShopPhoto(await getDb(), user, new Uint8Array(await file.arrayBuffer()), { caption: g(form, "caption"), kind: g(form, "kind"), width: Number(g(form, "width")), height: Number(g(form, "height")) });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: userMessage(e) };
  }
}

// ── 기술자료 ──
export async function saveArticleAction(form: FormData) {
  const user = await requireUser([...STAFF]);
  const id = g(form, "id") || undefined;
  let saved = id;
  try {
    saved = await saveArticle(await getDb(), user, { id, slug: g(form, "slug"), category: g(form, "category"), title: g(form, "title"), summary: g(form, "summary"), body: g(form, "body"), sort: Number(g(form, "sort") || 100), published: on(form, "published") });
  } catch (e) {
    redirect(errorUrl(id ? `/homepage/articles?edit=${id}` : "/homepage/articles", userMessage(e)));
  }
  redirect(noticeUrl(`/homepage/articles?edit=${saved}`, on(form, "published") ? "저장했습니다. 홈페이지에 바로 보입니다" : "저장했습니다(공개 안 함 — 홈페이지에는 아직 안 보입니다)"));
}

export async function deleteArticleAction(form: FormData) {
  const user = await requireUser([...STAFF]);
  await deleteArticle(await getDb(), user, g(form, "id"));
  redirect(noticeUrl("/homepage/articles", "지웠습니다"));
}

export async function articleStartersAction() {
  const user = await requireUser([...STAFF]);
  let n = 0;
  try {
    n = await loadArticleStarters(await getDb(), user);
  } catch (e) {
    redirect(errorUrl("/homepage/articles", userMessage(e)));
  }
  redirect(noticeUrl("/homepage/articles", n ? `처음 글 ${n}편을 넣어 공개했습니다. 맞지 않는 글은 고치거나 공개를 꺼 주세요` : "넣을 초안이 없습니다(이미 모두 넣었습니다)"));
}
