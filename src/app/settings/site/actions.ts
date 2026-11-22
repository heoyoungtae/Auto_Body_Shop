"use server";
// 설정 › 홈페이지 저장(대표): 기본 정보, 첫 화면 차례·보이기, 화면 글, 메뉴·바닥글
import { redirect } from "next/navigation";
import { getDb } from "@/db/runtime";
import { saveSiteConfig } from "@/modules/site/service";
import { orderFromNumbers, resetTexts, saveHomeLayout, saveMenu, saveTexts, sitePages, type TextsInput } from "@/modules/site/pages";
import { FOOT_PAGES, NAV_PAGES, pageTextDef, SECTION_KEYS } from "@/modules/site/page-text";
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
  return /^\/settings\/site(\/[a-z]+)?(\?[\w=.&%-]*)?$/.test(b) ? b : "/settings/site";
};

/** 양식 칸 이름: 한 줄·여러 줄 글 t:<key>, 둘씩 묶은 목록 p:<key>:<번호>:t|d, 한 줄에 하나씩 l:<key> */
export async function saveTextsAction(form: FormData) {
  const user = await requireUser(["owner"]);
  const back = backOf(form);
  const input: TextsInput = { text: {}, pairs: {}, lines: {} };
  for (const k of String(form.get("keys") ?? "").split(",").filter(Boolean)) {
    const d = pageTextDef(k);
    if (d?.kind === "text") input.text![k] = String(form.get(`t:${k}`) ?? "");
    else if (d?.kind === "pairs") input.pairs![k] = Array.from({ length: d.max }, (_, i) => ({ t: String(form.get(`p:${k}:${i}:t`) ?? ""), d: String(form.get(`p:${k}:${i}:d`) ?? "") }));
    else if (d?.kind === "lines") input.lines![k] = String(form.get(`l:${k}`) ?? "").split("\n");
  }
  let n = 0;
  try {
    n = await saveTexts(await getDb(), user, input);
  } catch (e) {
    redirect(errorUrl(back, userMessage(e)));
  }
  redirect(noticeUrl(back, n ? `${n}칸 저장했습니다. 홈페이지에 바로 보입니다` : "바뀐 칸이 없습니다"));
}

export async function resetTextsAction(form: FormData) {
  const user = await requireUser(["owner"]);
  const back = backOf(form);
  let n = 0;
  try {
    n = await resetTexts(await getDb(), user, String(form.get("keys") ?? "").split(",").filter(Boolean));
  } catch (e) {
    redirect(errorUrl(back, userMessage(e)));
  }
  redirect(noticeUrl(back, n ? `${n}칸을 처음 문구로 되돌렸습니다` : "고친 칸이 없습니다"));
}

export async function saveHomeLayoutAction(form: FormData) {
  const user = await requireUser(["owner"]);
  try {
    const db = await getDb();
    const cur = (await sitePages(db)).home.order;
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
  redirect(noticeUrl("/settings/site/home", "첫 화면 차례를 저장했습니다. 홈페이지에 바로 보입니다"));
}

export async function saveMenuAction(form: FormData) {
  const user = await requireUser(["owner"]);
  const rows = (prefix: string, pages: readonly { href: string }[]) =>
    pages
      .map((p, i) => ({ href: p.href, label: String(form.get(`${prefix}:label:${p.href}`) ?? ""), on: form.getAll(`${prefix}:on`).includes(p.href), isNew: form.getAll(`${prefix}:new`).includes(p.href), n: Number(form.get(`${prefix}:ord:${p.href}`) || i + 1), i }))
      .sort((a, b) => a.n - b.n || a.i - b.i);
  try {
    await saveMenu(await getDb(), user, { nav: rows("nav", NAV_PAGES), foot: rows("foot", FOOT_PAGES) });
  } catch (e) {
    redirect(errorUrl("/settings/site/menu", userMessage(e)));
  }
  redirect(noticeUrl("/settings/site/menu", "메뉴와 바닥글을 저장했습니다. 홈페이지에 바로 보입니다"));
}
