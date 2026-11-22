"use server";
// 설정 › 홈페이지 저장(대표): 기본 정보, 첫 화면 차례·보이기, 화면 글, 메뉴·바닥글
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/db/runtime";
import { saveSiteConfig } from "@/modules/site/service";
import { discardDraft, loadEditing, orderFromNumbers, pagesView, publishPages, resetTexts, restoreVersion, saveHomeLayout, saveMenu, saveTexts, type TextsInput } from "@/modules/site/pages";
import { loadPolicy } from "@/modules/platform/policy";
import { FOOT_PAGES, NAV_PAGES, pageTextDef, SECTION_KEYS } from "@/modules/site/page-text";
import { cancelLegal, issueLegal, title, type LegalKind } from "@/modules/site/legal";
import { liveLegalDoc } from "@/modules/site/legal-live";
import { seoulDate } from "@/modules/platform/time";
import { errorUrl, noticeUrl, requireUser, userMessage } from "../../_lib/session";

export async function saveSiteAction(form: FormData) {
  const user = await requireUser(["owner"]);
  const g = (k: string) => String(form.get(k) ?? "");
  try {
    await saveSiteConfig(await getDb(), user, {
      requests: form.get("requests") === "on",
      headline: g("headline"),
      lead: g("lead"),
      openOn: g("openOn"),
      about: g("about"),
      hours: g("hours"),
      kakao: g("kakao"),
      privacyOfficer: g("privacyOfficer"),
      privacyContact: g("privacyContact"),
      privacyFrom: g("privacyFrom"),
      insurers: g("insurers"),
      verifyNaver: g("verifyNaver"),
      verifyGoogle: g("verifyGoogle"),
    });
  } catch (e) {
    redirect(errorUrl("/settings/site", userMessage(e)));
  }
  redirect(noticeUrl("/settings/site", "저장했습니다. 홈페이지에 바로 보입니다"));
}

// ── 설정 › 홈페이지 › 첫 화면·화면 글·메뉴(대표) ──
const backOf = (form: FormData) => {
  const b = String(form.get("back") ?? "");
  return /^\/settings\/site(\/[a-z]+)?(\?[\w=.&%-]*)?$/.test(b) ? b : "/settings/site/history";
};

/** 양식 칸 이름: 한 줄·여러 줄 글 t:<key>, 둘씩 묶은 목록 p:<key>:<번호>:t|d, 한 줄에 하나씩 l:<key>, 칸 여럿 목록 r:<key>:<번호>:<칸> */
export async function saveTextsAction(form: FormData) {
  const user = await requireUser(["owner"]);
  const back = backOf(form);
  const input: TextsInput = { text: {}, pairs: {}, lines: {}, rows: {} };
  for (const k of String(form.get("keys") ?? "")
    .split(",")
    .filter(Boolean)) {
    const d = pageTextDef(k);
    if (d?.kind === "text") input.text![k] = String(form.get(`t:${k}`) ?? "");
    else if (d?.kind === "pairs") input.pairs![k] = Array.from({ length: d.max }, (_, i) => ({ t: String(form.get(`p:${k}:${i}:t`) ?? ""), d: String(form.get(`p:${k}:${i}:d`) ?? "") }));
    else if (d?.kind === "lines") input.lines![k] = String(form.get(`l:${k}`) ?? "").split("\n");
    else if (d?.kind === "rows") input.rows![k] = Array.from({ length: d.max }, (_, i) => Object.fromEntries(d.fields.map((f) => [f.k, String(form.get(`r:${k}:${i}:${f.k}`) ?? "")])));
  }
  let n = 0;
  try {
    n = await saveTexts(await getDb(), user, input);
  } catch (e) {
    redirect(errorUrl(back, userMessage(e)));
  }
  redirect(noticeUrl(back, n ? `${n}칸 저장했습니다. 아직 손님에게는 안 보입니다. 미리 보기로 확인하고 공개하기를 누르세요` : "바뀐 칸이 없습니다"));
}

export async function resetTextsAction(form: FormData) {
  const user = await requireUser(["owner"]);
  const back = backOf(form);
  let n = 0;
  try {
    n = await resetTexts(
      await getDb(),
      user,
      String(form.get("keys") ?? "")
        .split(",")
        .filter(Boolean),
    );
  } catch (e) {
    redirect(errorUrl(back, userMessage(e)));
  }
  redirect(noticeUrl(back, n ? `${n}칸을 처음 문구로 되돌렸습니다` : "고친 칸이 없습니다"));
}

export async function saveHomeLayoutAction(form: FormData) {
  const user = await requireUser(["owner"]);
  try {
    const db = await getDb();
    const cur = pagesView(await loadEditing(db), await loadPolicy(db)).home.order;
    const nums = Object.fromEntries(SECTION_KEYS.map((k) => [k, form.get(`ord:${k}`) ? Number(form.get(`ord:${k}`)) : null]));
    const on = new Set(form.getAll("on").map(String));
    await saveHomeLayout(db, user, {
      order: orderFromNumbers(cur, nums),
      off: SECTION_KEYS.filter((k) => !on.has(k)),
      shade: Number(form.get("shade") || 100),
      stats: form.get("stats") === "on",
    });
  } catch (e) {
    redirect(errorUrl("/settings/site/home", userMessage(e)));
  }
  redirect(noticeUrl("/settings/site/home", "첫 화면 차례를 저장했습니다. 미리 보기로 확인하고 공개하기를 누르세요"));
}

export async function saveMenuAction(form: FormData) {
  const user = await requireUser(["owner"]);
  const rows = (prefix: string, pages: readonly { href: string }[]) =>
    pages
      .map((p, i) => ({
        href: p.href,
        label: String(form.get(`${prefix}:label:${p.href}`) ?? ""),
        on: form.getAll(`${prefix}:on`).includes(p.href),
        isNew: form.getAll(`${prefix}:new`).includes(p.href),
        n: Number(form.get(`${prefix}:ord:${p.href}`) || i + 1),
        i,
      }))
      .sort((a, b) => a.n - b.n || a.i - b.i);
  try {
    await saveMenu(await getDb(), user, { nav: rows("nav", NAV_PAGES), foot: rows("foot", FOOT_PAGES) });
  } catch (e) {
    redirect(errorUrl("/settings/site/menu", userMessage(e)));
  }
  redirect(noticeUrl("/settings/site/menu", "메뉴와 바닥글을 저장했습니다. 미리 보기로 확인하고 공개하기를 누르세요"));
}

// ── 미리 보기·공개하기·버리기·지난 판(대표) ──
const PREVIEW = "site_preview";

/** 미리 보기 켜기: 이 브라우저에서만, 2시간 동안 공개 전 고침까지 보인다 */
export async function previewOnAction(form: FormData) {
  await requireUser(["owner"]);
  (await cookies()).set(PREVIEW, "1", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 2 * 3600 });
  const to = String(form.get("to") ?? "/site");
  redirect(/^\/site(\/[\w/-]*)?$/.test(to) ? to : "/site");
}

export async function previewOffAction() {
  await requireUser(["owner"]);
  (await cookies()).delete(PREVIEW);
  redirect("/settings/site/history");
}

export async function publishAction(form: FormData) {
  const user = await requireUser(["owner"]);
  const back = backOf(form);
  let n = 0;
  try {
    n = await publishPages(await getDb(), user);
  } catch (e) {
    redirect(errorUrl(back, userMessage(e)));
  }
  (await cookies()).delete(PREVIEW);
  redirect(noticeUrl(back, `공개했습니다(바뀐 곳 ${n}개). 지금부터 손님에게 보입니다. 지난 판은 '이력'에 남았습니다`));
}

export async function discardAction(form: FormData) {
  const user = await requireUser(["owner"]);
  const back = backOf(form);
  const n = await discardDraft(await getDb(), user);
  redirect(noticeUrl(back, n ? `공개 전 고침 ${n}곳을 버렸습니다. 홈페이지는 그대로입니다` : "버릴 고침이 없습니다"));
}

export async function restoreAction(form: FormData) {
  const user = await requireUser(["owner"]);
  try {
    await restoreVersion(await getDb(), user, String(form.get("id") ?? ""));
  } catch (e) {
    redirect(errorUrl("/settings/site/history", userMessage(e)));
  }
  redirect(noticeUrl("/settings/site/history", "그 판을 공개 전 고침으로 가져왔습니다. 미리 보기로 확인하고 '공개하기'를 누르면 되돌아갑니다"));
}

const LEGAL_BACK = "/settings/site/legal";

/** 이용약관·처리방침: 지금 내용을 새 판으로 시행(시행 예정 판이 있으면 바꾼다) */
export async function issueLegalAction(form: FormData) {
  const user = await requireUser(["owner"]);
  const kind: LegalKind = form.get("kind") === "privacy" ? "privacy" : "terms";
  const from = String(form.get("from") ?? "");
  const today = seoulDate();
  try {
    const db = await getDb();
    await issueLegal(db, user, kind, from, await liveLegalDoc(db, kind), today);
  } catch (e) {
    redirect(errorUrl(LEGAL_BACK, userMessage(e)));
  }
  redirect(noticeUrl(LEGAL_BACK, from > today ? `${title(kind)} 새 판을 ${from}부터 시행합니다. 그때까지 손님 화면에 '바뀌는 내용 보기'가 뜹니다` : `${title(kind)} 새 판을 오늘부터 시행했습니다`));
}

export async function cancelLegalAction(form: FormData) {
  const user = await requireUser(["owner"]);
  try {
    await cancelLegal(await getDb(), user, String(form.get("id") ?? ""), seoulDate());
  } catch (e) {
    redirect(errorUrl(LEGAL_BACK, userMessage(e)));
  }
  redirect(noticeUrl(LEGAL_BACK, "시행 예정 판을 거뒀습니다"));
}
