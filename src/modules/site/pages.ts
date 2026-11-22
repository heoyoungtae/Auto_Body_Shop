// 홈페이지 화면 글·첫 화면 단락·메뉴 저장(app_config 'site_pages'). 고친 칸만 남기고, 나머지는 page-text.ts 의 처음 문구를 쓴다.
// 대표만 고친다(설정 › 홈페이지). 자주 묻는 질문·공지·사례·기술자료·후기는 지금처럼 '홈페이지 글'에서 상담원·공장장·대표가 고친다.
import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { appConfig } from "@/db/schema";
import type { Role } from "@/modules/auth/roles";
import { writeAudit } from "@/modules/platform/audit";
import { loadPolicy, type Policy } from "@/modules/platform/policy";
import {
  DEFAULT_FOOT,
  DEFAULT_HOME,
  DEFAULT_NAV,
  fillTokens,
  FOOT_PAGES,
  NAV_MAX,
  NAV_PAGES,
  normalizeLinks,
  normalizeOrder,
  PAGE_TEXT,
  pageTextDef,
  SECTION_KEYS,
  unknownTokens,
  type FootItem,
  type HomeLayout,
  type LinesKey,
  type NavItem,
  type Pair,
  type PairsKey,
  type SectionKey,
  type TextKey,
} from "./page-text";
import { SiteError } from "./service";

const KEY = "site_pages";
type Actor = { id: string; roles: readonly Role[] };

export type SitePagesData = {
  text?: Record<string, string>;
  pairs?: Record<string, Pair[]>;
  lines?: Record<string, string[]>;
  home?: Partial<HomeLayout>;
  nav?: NavItem[];
  foot?: FootItem[];
};

export async function loadSitePages(db: Db): Promise<SitePagesData> {
  const [r] = await db.select({ data: appConfig.data }).from(appConfig).where(eq(appConfig.key, KEY));
  return (r?.data as SitePagesData) ?? {};
}

/** 화면에서 쓰는 모양: 고친 글(없으면 처음 문구) + 자리표시를 정책값으로 */
export function pagesView(raw: SitePagesData, p: Policy) {
  const f = (s: string) => fillTokens(s, p);
  const home: HomeLayout = {
    order: normalizeOrder(raw.home?.order),
    off: (raw.home?.off ?? []).filter((k): k is SectionKey => (SECTION_KEYS as string[]).includes(k)),
    shade: clampShade(raw.home?.shade),
    stats: raw.home?.stats ?? DEFAULT_HOME.stats,
  };
  return {
    t: (k: TextKey) => f(raw.text?.[k] ?? PAGE_TEXT[k].def),
    pairs: (k: PairsKey) => (raw.pairs?.[k] ?? PAGE_TEXT[k].def).map((x) => ({ t: f(x.t), d: f(x.d) })),
    lines: (k: LinesKey) => (raw.lines?.[k] ?? PAGE_TEXT[k].def).map(f),
    home,
    shows: (k: SectionKey) => !home.off.includes(k),
    nav: normalizeLinks(raw.nav, NAV_PAGES, DEFAULT_NAV),
    foot: normalizeLinks(raw.foot, FOOT_PAGES, DEFAULT_FOOT),
  };
}
export type PagesView = ReturnType<typeof pagesView>;

export async function sitePages(db: Db) {
  const [raw, p] = await Promise.all([loadSitePages(db), loadPolicy(db)]);
  return pagesView(raw, p);
}

/** 설정 화면용: 지금 칸 값(자리표시 그대로)과 고친 칸인지 */
export function editValue(raw: SitePagesData, k: string): { value: string | Pair[] | string[]; edited: boolean } {
  const d = pageTextDef(k);
  if (!d) throw new SiteError("없는 칸입니다");
  const own = d.kind === "text" ? raw.text?.[k] : d.kind === "pairs" ? raw.pairs?.[k] : raw.lines?.[k];
  return { value: own ?? d.def, edited: own !== undefined };
}

const clampShade = (n: unknown) => (Number.isFinite(Number(n)) && n !== null && n !== undefined && n !== "" ? Math.max(40, Math.min(100, Math.round(Number(n)))) : DEFAULT_HOME.shade);
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function mustOwner(actor: Actor) {
  if (!actor.roles.includes("owner")) throw new SiteError("홈페이지 화면 글·메뉴는 대표만 고칩니다");
}

async function write(db: Db, actor: Actor, data: SitePagesData, action: string, after: unknown, now: Date) {
  await db.insert(appConfig).values({ key: KEY, data, updatedBy: actor.id, updatedAt: now }).onConflictDoUpdate({ target: appConfig.key, set: { data, updatedBy: actor.id, updatedAt: now } });
  await writeAudit(db, { actorId: actor.id, action, entityType: "app_config", entityId: KEY, after });
}

function checkTokens(label: string, s: string) {
  const bad = unknownTokens(s);
  if (bad.length) throw new SiteError(`'${label}'에 모르는 자리표시 {${bad[0]}}가 있습니다. 넣을 수 있는 값 목록의 이름을 그대로 써 주세요`);
}

export type TextsInput = { text?: Record<string, string>; pairs?: Record<string, Pair[]>; lines?: Record<string, string[]> };

/**
 * 화면 글 저장. 비운 칸·처음 문구와 같은 칸은 '고친 것'에서 빼서 처음 문구를 따라가게 한다.
 * 목록은 빈 줄을 빼고, 최소 개수보다 적으면 막는다.
 */
export async function saveTexts(db: Db, actor: Actor, input: TextsInput, now = new Date()) {
  mustOwner(actor);
  const raw = await loadSitePages(db);
  const text = { ...raw.text };
  const pairs = { ...raw.pairs };
  const lines = { ...raw.lines };
  const changed: string[] = [];
  for (const [k, v] of Object.entries(input.text ?? {})) {
    const d = pageTextDef(k);
    if (d?.kind !== "text") throw new SiteError("없는 칸입니다");
    const max = d.max ?? 300;
    const s = String(v ?? "").replace(/\r/g, "").trim();
    if (s.length > max) throw new SiteError(`'${d.label}'은 ${max}자까지입니다(지금 ${s.length}자)`);
    const one = d.multi ? s.replace(/\n{3,}/g, "\n\n") : s.replace(/\s*\n\s*/g, " ");
    checkTokens(d.label, one);
    if (!one || one === d.def) delete text[k];
    else text[k] = one;
    if (!same(text[k], raw.text?.[k])) changed.push(k);
  }
  for (const [k, v] of Object.entries(input.pairs ?? {})) {
    const d = pageTextDef(k);
    if (d?.kind !== "pairs") throw new SiteError("없는 칸입니다");
    const rows = v.map((x) => ({ t: String(x.t ?? "").trim().slice(0, 40), d: String(x.d ?? "").replace(/\s*\n\s*/g, " ").trim().slice(0, 300) })).filter((x) => x.t || x.d);
    const noTitle = rows.findIndex((x) => !x.t);
    if (noTitle >= 0) throw new SiteError(`'${d.label}' ${noTitle + 1}번째 줄에 제목을 적어 주세요`);
    if (rows.length > d.max) throw new SiteError(`'${d.label}'은 ${d.max}개까지입니다`);
    for (const r of rows) checkTokens(d.label, `${r.t} ${r.d}`);
    if (!rows.length || same(rows, d.def)) delete pairs[k];
    else if (rows.length < (d.min ?? 1)) throw new SiteError(`'${d.label}'은 ${d.min}개 이상 적어 주세요`);
    else pairs[k] = rows;
    if (!same(pairs[k], raw.pairs?.[k])) changed.push(k);
  }
  for (const [k, v] of Object.entries(input.lines ?? {})) {
    const d = pageTextDef(k);
    if (d?.kind !== "lines") throw new SiteError("없는 칸입니다");
    const rows = v.map((x) => String(x ?? "").trim().slice(0, 300)).filter(Boolean);
    if (rows.length > d.max) throw new SiteError(`'${d.label}'은 ${d.max}줄까지입니다(지금 ${rows.length}줄)`);
    for (const r of rows) checkTokens(d.label, r);
    if (!rows.length || same(rows, d.def)) delete lines[k];
    else if (rows.length < (d.min ?? 1)) throw new SiteError(`'${d.label}'은 ${d.min}줄 이상 적어 주세요`);
    else lines[k] = rows;
    if (!same(lines[k], raw.lines?.[k])) changed.push(k);
  }
  if (!changed.length) return 0;
  await write(db, actor, { ...raw, text, pairs, lines }, "site.pages", { changed }, now);
  return changed.length;
}

/** 처음 문구로 되돌리기 */
export async function resetTexts(db: Db, actor: Actor, keys: string[], now = new Date()) {
  mustOwner(actor);
  const raw = await loadSitePages(db);
  const text = { ...raw.text };
  const pairs = { ...raw.pairs };
  const lines = { ...raw.lines };
  const done = keys.filter((k) => k in text || k in pairs || k in lines);
  for (const k of done) {
    delete text[k];
    delete pairs[k];
    delete lines[k];
  }
  if (!done.length) return 0;
  await write(db, actor, { ...raw, text, pairs, lines }, "site.pages_reset", { keys: done }, now);
  return done.length;
}

/** 숫자 차례 → 단락 차례(같은 숫자·빈 칸은 지금 차례대로) */
export function orderFromNumbers(current: readonly SectionKey[], nums: Partial<Record<SectionKey, number | null>>): SectionKey[] {
  return current
    .map((k, i) => ({ k, i, n: Number.isFinite(nums[k] as number) && nums[k] !== null ? Number(nums[k]) : i + 1 }))
    .sort((a, b) => a.n - b.n || a.i - b.i)
    .map((x) => x.k);
}

export async function saveHomeLayout(db: Db, actor: Actor, input: { order: SectionKey[]; off: SectionKey[]; shade: number; stats: boolean }, now = new Date()) {
  mustOwner(actor);
  const raw = await loadSitePages(db);
  const home: HomeLayout = { order: normalizeOrder(input.order), off: input.off.filter((k) => (SECTION_KEYS as string[]).includes(k)), shade: clampShade(input.shade), stats: !!input.stats };
  if (home.off.length === SECTION_KEYS.length) throw new SiteError("단락을 하나 이상 보이게 해 주세요");
  await write(db, actor, { ...raw, home }, "site.home_layout", home, now);
}

export async function saveMenu(db: Db, actor: Actor, input: { nav: NavItem[]; foot: FootItem[] }, now = new Date()) {
  mustOwner(actor);
  const raw = await loadSitePages(db);
  const clean = <T extends { label: string }>(xs: T[]) => xs.map((x) => ({ ...x, label: String(x.label ?? "").replace(/\s+/g, " ").trim().slice(0, 20) }));
  const nav = normalizeLinks(clean(input.nav), NAV_PAGES, DEFAULT_NAV).map((x) => ({ href: x.href, label: x.label, on: !!x.on, isNew: !!x.isNew && !!x.on }));
  const foot = normalizeLinks(clean(input.foot), FOOT_PAGES, DEFAULT_FOOT).map((x) => ({ href: x.href, label: x.label, on: !!x.on }));
  if (!nav.some((x) => x.on)) throw new SiteError("위 메뉴에 화면을 하나 이상 보이게 해 주세요");
  if (nav.filter((x) => x.on).length > NAV_MAX) throw new SiteError(`위 메뉴는 ${NAV_MAX}개까지 보입니다(넓은 화면 한 줄). 하나를 숨기거나 바닥글로 옮겨 주세요`);
  await write(db, actor, { ...raw, nav, foot }, "site.menu", { nav: nav.filter((x) => x.on).map((x) => x.label), foot: foot.filter((x) => x.on).map((x) => x.label) }, now);
}
