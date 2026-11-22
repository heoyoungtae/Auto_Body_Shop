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
const DRAFT = "site_pages_draft";
const HISTORY = "site_pages_history";
/** 이력에 남기는 지난 판 개수 */
export const HISTORY_MAX = 20;
type Actor = { id: string; roles: readonly Role[] };

export type SitePagesData = {
  text?: Record<string, string>;
  pairs?: Record<string, Pair[]>;
  lines?: Record<string, string[]>;
  rows?: Record<string, Record<string, string>[]>;
  home?: Partial<HomeLayout>;
  nav?: NavItem[];
  foot?: FootItem[];
};

async function readKey<T>(db: Db, key: string): Promise<T | null> {
  const [r] = await db.select({ data: appConfig.data }).from(appConfig).where(eq(appConfig.key, key));
  return (r?.data as T) ?? null;
}

/** 지금 공개 중인 홈페이지 글 */
export async function loadSitePages(db: Db): Promise<SitePagesData> {
  return (await readKey<SitePagesData>(db, KEY)) ?? {};
}

/** 공개 전 고침(없으면 null). 설정에서 고치면 여기에 쌓이고, '공개하기'를 눌러야 홈페이지에 보인다 */
export async function loadDraft(db: Db): Promise<SitePagesData | null> {
  return readKey<SitePagesData>(db, DRAFT);
}

/** 설정 화면이 보여 줄 값: 공개 전 고침이 있으면 그것, 없으면 공개 중인 것 */
export async function loadEditing(db: Db): Promise<SitePagesData> {
  return (await loadDraft(db)) ?? (await loadSitePages(db));
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
  // key 가 목록에 없으면(지운 칸) 빈 값. 화면은 처음 문구 목록(page-text.ts)의 key 만 쓴다
  const def = <T>(k: string, kind: string, own: T | undefined): T => own ?? ((pageTextDef(k)?.kind === kind ? pageTextDef(k)!.def : kind === "text" ? "" : []) as T);
  return {
    t: (k: TextKey | (string & {})) => f(def(k, "text", raw.text?.[k])),
    pairs: (k: PairsKey | (string & {})) => def<Pair[]>(k, "pairs", raw.pairs?.[k]).map((x) => ({ t: f(x.t), d: f(x.d) })),
    lines: (k: LinesKey | (string & {})) => def<string[]>(k, "lines", raw.lines?.[k]).map(f),
    rows: (k: string) => def<Record<string, string>[]>(k, "rows", raw.rows?.[k]).map((r) => Object.fromEntries(Object.entries(r).map(([a, b]) => [a, f(b)]))),
    home,
    shows: (k: SectionKey) => !home.off.includes(k),
    nav: normalizeLinks(raw.nav, NAV_PAGES, DEFAULT_NAV),
    foot: normalizeLinks(raw.foot, FOOT_PAGES, DEFAULT_FOOT),
  };
}
export type PagesView = ReturnType<typeof pagesView>;

/** 홈페이지 화면용. preview 면 공개 전 고침까지 보여 준다(대표가 '미리 보기'를 켰을 때만) */
export async function sitePages(db: Db, preview = false) {
  const [raw, p] = await Promise.all([preview ? loadEditing(db) : loadSitePages(db), loadPolicy(db)]);
  return pagesView(raw, p);
}

/** 설정 화면용: 지금 칸 값(자리표시 그대로)과 고친 칸인지 */
export function editValue(raw: SitePagesData, k: string): { value: string | Pair[] | string[] | Record<string, string>[]; edited: boolean } {
  const d = pageTextDef(k);
  if (!d) throw new SiteError("없는 칸입니다");
  const own = d.kind === "text" ? raw.text?.[k] : d.kind === "pairs" ? raw.pairs?.[k] : d.kind === "rows" ? raw.rows?.[k] : raw.lines?.[k];
  return { value: own ?? d.def, edited: own !== undefined };
}

const clampShade = (n: unknown) => (Number.isFinite(Number(n)) && n !== null && n !== undefined && n !== "" ? Math.max(40, Math.min(100, Math.round(Number(n)))) : DEFAULT_HOME.shade);
/** 값 견주기(jsonb 는 칸 차례를 바꿔 저장하므로 칸 이름 차례를 맞춰 견준다) */
const stable = (x: unknown): unknown => (Array.isArray(x) ? x.map(stable) : x && typeof x === "object" ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, v]) => [k, stable(v)])) : x);
const same = (a: unknown, b: unknown) => JSON.stringify(stable(a)) === JSON.stringify(stable(b));

function mustOwner(actor: Actor) {
  if (!actor.roles.includes("owner")) throw new SiteError("홈페이지 화면 글·메뉴는 대표만 고칩니다");
}

async function put(db: Db, key: string, data: unknown, actorId: string, now: Date) {
  await db.insert(appConfig).values({ key, data, updatedBy: actorId, updatedAt: now }).onConflictDoUpdate({ target: appConfig.key, set: { data, updatedBy: actorId, updatedAt: now } });
}

/** 고친 것은 '공개 전 고침'에 남긴다(공개는 publishPages) */
async function write(db: Db, actor: Actor, data: SitePagesData, action: string, after: unknown, now: Date) {
  await put(db, DRAFT, data, actor.id, now);
  await writeAudit(db, { actorId: actor.id, action, entityType: "app_config", entityId: DRAFT, after });
}

function checkTokens(label: string, s: string) {
  const bad = unknownTokens(s);
  if (bad.length) throw new SiteError(`'${label}'에 모르는 자리표시 {${bad[0]}}가 있습니다. 넣을 수 있는 값 목록의 이름을 그대로 써 주세요`);
}

export type TextsInput = { text?: Record<string, string>; pairs?: Record<string, Pair[]>; lines?: Record<string, string[]>; rows?: Record<string, Record<string, string>[]> };

/**
 * 화면 글 저장. 비운 칸·처음 문구와 같은 칸은 '고친 것'에서 빼서 처음 문구를 따라가게 한다.
 * 목록은 빈 줄을 빼고, 최소 개수보다 적으면 막는다.
 */
export async function saveTexts(db: Db, actor: Actor, input: TextsInput, now = new Date()) {
  mustOwner(actor);
  const raw = await loadEditing(db);
  const text = { ...raw.text };
  const pairs = { ...raw.pairs };
  const lines = { ...raw.lines };
  const rowsAll = { ...raw.rows };
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
  for (const [k, v] of Object.entries(input.rows ?? {})) {
    const d = pageTextDef(k);
    if (d?.kind !== "rows") throw new SiteError("없는 칸입니다");
    const rows = v
      .map((x) => Object.fromEntries(d.fields.map((f) => [f.k, String(x[f.k] ?? "").replace(/\s*\n\s*/g, " ").trim().slice(0, f.max)])))
      .filter((x) => Object.values(x).some(Boolean));
    const first = d.fields[0];
    const noName = rows.findIndex((x) => !x[first.k]);
    if (noName >= 0) throw new SiteError(`'${d.label}' ${noName + 1}번째 줄에 ${first.label}을 적어 주세요`);
    if (rows.length > d.max) throw new SiteError(`'${d.label}'은 ${d.max}개까지입니다`);
    for (const r of rows) checkTokens(d.label, Object.values(r).join(" "));
    if (!rows.length || same(rows, d.def)) delete rowsAll[k];
    else if (rows.length < (d.min ?? 1)) throw new SiteError(`'${d.label}'은 ${d.min}개 이상 적어 주세요`);
    else rowsAll[k] = rows;
    if (!same(rowsAll[k], raw.rows?.[k])) changed.push(k);
  }
  if (!changed.length) return 0;
  await write(db, actor, { ...raw, text, pairs, lines, rows: rowsAll }, "site.pages", { changed }, now);
  return changed.length;
}

/** 처음 문구로 되돌리기 */
export async function resetTexts(db: Db, actor: Actor, keys: string[], now = new Date()) {
  mustOwner(actor);
  const raw = await loadEditing(db);
  const text = { ...raw.text };
  const pairs = { ...raw.pairs };
  const lines = { ...raw.lines };
  const rows = { ...raw.rows };
  const done = keys.filter((k) => k in text || k in pairs || k in lines || k in rows);
  for (const k of done) {
    delete text[k];
    delete pairs[k];
    delete lines[k];
    delete rows[k];
  }
  if (!done.length) return 0;
  await write(db, actor, { ...raw, text, pairs, lines, rows }, "site.pages_reset", { keys: done }, now);
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
  const raw = await loadEditing(db);
  const home: HomeLayout = { order: normalizeOrder(input.order), off: input.off.filter((k) => (SECTION_KEYS as string[]).includes(k)), shade: clampShade(input.shade), stats: !!input.stats };
  if (home.off.length === SECTION_KEYS.length) throw new SiteError("단락을 하나 이상 보이게 해 주세요");
  await write(db, actor, { ...raw, home }, "site.home_layout", home, now);
}

export async function saveMenu(db: Db, actor: Actor, input: { nav: NavItem[]; foot: FootItem[] }, now = new Date()) {
  mustOwner(actor);
  const raw = await loadEditing(db);
  const clean = <T extends { label: string }>(xs: T[]) => xs.map((x) => ({ ...x, label: String(x.label ?? "").replace(/\s+/g, " ").trim().slice(0, 20) }));
  const nav = normalizeLinks(clean(input.nav), NAV_PAGES, DEFAULT_NAV).map((x) => ({ href: x.href, label: x.label, on: !!x.on, isNew: !!x.isNew && !!x.on }));
  const foot = normalizeLinks(clean(input.foot), FOOT_PAGES, DEFAULT_FOOT).map((x) => ({ href: x.href, label: x.label, on: !!x.on }));
  if (!nav.some((x) => x.on)) throw new SiteError("위 메뉴에 화면을 하나 이상 보이게 해 주세요");
  if (nav.filter((x) => x.on).length > NAV_MAX) throw new SiteError(`위 메뉴는 ${NAV_MAX}개까지 보입니다(넓은 화면 한 줄). 하나를 숨기거나 바닥글로 옮겨 주세요`);
  await write(db, actor, { ...raw, nav, foot }, "site.menu", { nav: nav.filter((x) => x.on).map((x) => x.label), foot: foot.filter((x) => x.on).map((x) => x.label) }, now);
}

// ── 공개하기·이력 ──
export type PagesVersion = { id: string; at: string; by: string; changed: string[]; data: SitePagesData };

/** 두 판 사이에 바뀐 곳(화면 글 key, 'home'=첫 화면 차례, 'nav'·'foot'=메뉴·바닥글) */
export function changedKeys(a: SitePagesData, b: SitePagesData): string[] {
  const out: string[] = [];
  for (const part of ["text", "pairs", "lines", "rows"] as const) {
    const x = a[part] ?? {};
    const y = b[part] ?? {};
    for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) if (!same((x as Record<string, unknown>)[k], (y as Record<string, unknown>)[k])) out.push(k);
  }
  // 첫 화면·메뉴·바닥글은 처음 값으로 채운 모양끼리 견준다(저장만 하고 그대로면 바뀐 것이 아니다)
  const home = (x: SitePagesData) => ({ ...DEFAULT_HOME, ...x.home, order: normalizeOrder(x.home?.order), shade: clampShade(x.home?.shade) });
  if (!same(home(a), home(b))) out.push("home");
  if (!same(normalizeLinks(a.nav, NAV_PAGES, DEFAULT_NAV), normalizeLinks(b.nav, NAV_PAGES, DEFAULT_NAV))) out.push("nav");
  if (!same(normalizeLinks(a.foot, FOOT_PAGES, DEFAULT_FOOT), normalizeLinks(b.foot, FOOT_PAGES, DEFAULT_FOOT))) out.push("foot");
  return out;
}

export async function pagesHistory(db: Db): Promise<PagesVersion[]> {
  return (await readKey<{ items: PagesVersion[] }>(db, HISTORY))?.items ?? [];
}

/** 공개 전 고침을 홈페이지에 공개한다. 지금 공개 중인 판은 이력에 남긴다 */
export async function publishPages(db: Db, actor: Actor, now = new Date()) {
  mustOwner(actor);
  const draft = await loadDraft(db);
  if (!draft) throw new SiteError("공개할 고침이 없습니다");
  const live = await loadSitePages(db);
  const changed = changedKeys(live, draft);
  const items = await pagesHistory(db);
  const prev: PagesVersion = { id: `v${now.getTime()}`, at: now.toISOString(), by: actor.id, changed, data: live };
  await put(db, HISTORY, { items: [prev, ...items].slice(0, HISTORY_MAX) }, actor.id, now);
  await put(db, KEY, draft, actor.id, now);
  await db.delete(appConfig).where(eq(appConfig.key, DRAFT));
  await writeAudit(db, { actorId: actor.id, action: "site.publish", entityType: "app_config", entityId: KEY, after: { changed } });
  return changed.length;
}

/** 공개 전 고침을 모두 버린다(공개 중인 홈페이지는 그대로) */
export async function discardDraft(db: Db, actor: Actor) {
  mustOwner(actor);
  const draft = await loadDraft(db);
  if (!draft) return 0;
  const n = changedKeys(await loadSitePages(db), draft).length;
  await db.delete(appConfig).where(eq(appConfig.key, DRAFT));
  await writeAudit(db, { actorId: actor.id, action: "site.draft_discard", entityType: "app_config", entityId: DRAFT, after: { discarded: n } });
  return n;
}

/** 지난 판을 '공개 전 고침'으로 가져온다. 미리 보기로 확인하고 공개하면 그 판으로 되돌아간다 */
export async function restoreVersion(db: Db, actor: Actor, id: string, now = new Date()) {
  mustOwner(actor);
  const v = (await pagesHistory(db)).find((x) => x.id === id);
  if (!v) throw new SiteError("없는 판입니다");
  await write(db, actor, v.data, "site.pages_restore", { from: v.at }, now);
}

/** 공개 전 고침이 있으면 바뀐 곳 수 */
export async function draftState(db: Db) {
  const draft = await loadDraft(db);
  return draft ? changedKeys(await loadSitePages(db), draft) : null;
}
