"use client";
// 왼쪽 메뉴. 넓은 화면에서는 늘 보이고, 태블릿·휴대폰에서는 ☰ 단추로 열고 닫는다.
// 맨 위에 메뉴 찾기 칸(_menu-search-box.tsx)이 있고, 메뉴를 내려도 그 자리에 고정된다. 묶음은 기본으로 접혀 있다. 지금 화면이 든 묶음만 저절로 펼친다. 펼친 묶음과 '개발 예정 보기'는 이 기기에 기억한다.
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Role } from "@/modules/auth/roles";
import { can } from "@/modules/auth/permissions";
import { MENU, TOP, type MenuItem } from "./_menu";
import { MenuSearch, rememberRecent } from "./_menu-search-box";
import { pickActive } from "./_menu-active";

const NavCtx = createContext<{ open: boolean; setOpen: (v: boolean) => void }>({
  open: false,
  setOpen: () => {},
});

export function NavProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <NavCtx.Provider value={{ open, setOpen }}>{children}</NavCtx.Provider>
  );
}

export function MenuButton() {
  const { open, setOpen } = useContext(NavCtx);
  return (
    <button
      type="button"
      onClick={() => setOpen(!open)}
      aria-expanded={open}
      aria-controls="side-menu"
      aria-label="메뉴 열기"
      className="inline-flex size-11 items-center justify-center rounded-md text-xl hover:bg-[var(--surface-2)] lg:hidden"
    >
      ☰
    </button>
  );
}

const load = <T,>(k: string, d: T): T => {
  try {
    const v = localStorage.getItem(k);
    return v == null ? d : (JSON.parse(v) as T);
  } catch {
    return d;
  }
};
const save = (k: string, v: unknown) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* 저장 못 해도 동작에는 지장 없음 */
  }
};

/** 지금 화면에 맞는 메뉴: 경로가 가장 길게 겹치고, ?f= 같은 조건까지 맞는 것 하나(_menu-active.ts) */
const HREFS = [...TOP, ...MENU.flatMap((g) => g.items)]
  .map((i) => i.href)
  .filter((h): h is string => !!h);
const HAS_FUTURE = MENU.some((g) => g.items.some((i) => !i.href));
const activeHref = (path: string, search: string) => pickActive(HREFS, path, search);
// 바로가기(also)가 아닌 원래 자리 묶음을 펼친다
const groupOf = (h: string | undefined) =>
  h ? MENU.find((g) => g.items.some((i) => i.href === h && !i.also))?.id : undefined;
/** ★ 자주 쓰는 메뉴로 고를 수 있는 메뉴(원래 자리 하나씩) */
const PICKABLE = MENU.flatMap((g) => g.items).filter((i) => i.href && !i.also);
const FAV_MAX = 8;

export function Sidebar({ roles, unread }: { roles: Role[]; unread: number }) {
  const path = usePathname();
  // ?f=warranty 같은 조건도 봐야 '보증 수리'와 '만족도·불만'을 가른다
  const search = useSearchParams().toString();
  const current = activeHref(path, search);
  const { open, setOpen } = useContext(NavCtx);
  const [opened, setOpened] = useState<string[]>([]);
  const [future, setFuture] = useState(true);
  // ★ 자주 쓰는 메뉴(대표 결정 2026-11-23): 메뉴 옆 ☆ 를 눌러 고른다. 이 기기에 기억한다
  const [fav, setFav] = useState<string[]>([]);
  useEffect(() => {
    setOpened(load("menu:open", []));
    setFuture(load("menu:future", true));
    setFav(load("menu:fav", []));
  }, []);
  const toggleFav = (href: string) => {
    const next = fav.includes(href) ? fav.filter((h) => h !== href) : [...fav, href].slice(-FAV_MAX);
    setFav(next);
    save("menu:fav", next);
  };
  useEffect(() => setOpen(false), [path, setOpen]);
  // 메뉴 찾기 칸의 '최근에 연 메뉴'
  useEffect(() => rememberRecent(current), [current]);
  const wake = useCallback(() => setOpen(true), [setOpen]);
  // 지금 화면이 든 묶음은 펼친다(저장하지 않음 — 다른 화면으로 가면 원래대로)
  const [here, setHere] = useState<string | undefined>(() => groupOf(current));
  // 메뉴를 골라 화면이 바뀌면 지금 화면의 묶음만 펼치고 나머지는 접는다(대표 지시 2026-11-12).
  // 손으로 펼친 묶음은 다음에 화면이 바뀔 때까지만 펼쳐 둔다.
  const first = useRef(true);
  useEffect(() => {
    setHere(groupOf(current));
    if (first.current) {
      first.current = false;
      return;
    }
    setOpened([]);
    save("menu:open", []);
  }, [current]);
  // 지금 화면의 메뉴가 메뉴 아래로 밀려 안 보이면 보이는 곳까지 메뉴를 내린다(대표 결정 2026-11-23)
  const navRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const t = setTimeout(() => {
      const el = navRef.current?.querySelector<HTMLElement>("[data-menu] [aria-current=page]");
      el?.scrollIntoView({ block: "nearest" });
    }, 50);
    return () => clearTimeout(t);
  }, [current, here]);
  const allowed = (i: MenuItem) =>
    (!i.roles || i.roles.some((r) => roles.includes(r))) &&
    (!i.perm || i.perm.some((k) => can({ roles }, k)));
  const visible = (i: MenuItem) => allowed(i) && (future || i.href);
  const isOpen = (id: string) => opened.includes(id) || here === id;
  const toggle = (id: string) => {
    if (isOpen(id)) {
      if (here === id) setHere(undefined);
      const next = opened.filter((x) => x !== id);
      setOpened(next);
      save("menu:open", next);
    } else {
      const next = [...opened, id];
      setOpened(next);
      save("menu:open", next);
    }
  };
  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/30 lg:hidden"
          onClick={() => setOpen(false)}
          aria-hidden
        />
      )}
      <nav
        ref={navRef}
        id="side-menu"
        aria-label="메뉴"
        className={`fixed inset-y-0 left-0 z-30 w-64 shrink-0 overflow-y-auto border-r border-[var(--line)] bg-[var(--surface)] pb-6 transition-transform lg:sticky lg:top-14 lg:z-0 lg:h-[calc(100vh-3.5rem)] lg:translate-x-0 ${open ? "translate-x-0 shadow-[var(--shadow-lg)]" : "-translate-x-full"}`}
      >
        <div className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-[var(--line)] bg-[var(--surface)] px-3 lg:hidden">
          <span className="font-semibold">메뉴</span>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="메뉴 닫기"
            className="inline-flex size-10 items-center justify-center rounded-md text-lg hover:bg-[var(--surface-2)]"
          >
            ×
          </button>
        </div>
        <MenuSearch allowed={allowed} future={future} onWake={wake}>
        <ul className="space-y-0.5 px-2 pt-2 pb-1" data-menu>
          {TOP.filter(allowed).map((i) => (
            <li key={i.label}>
              <Link
                href={i.href!}
                aria-current={current === i.href ? "page" : undefined}
                className="flex min-h-10 items-center rounded-md px-3 text-sm font-semibold hover:bg-[var(--surface-2)] aria-[current=page]:bg-[var(--accent-soft)] aria-[current=page]:text-[var(--accent)] pointer-fine:lg:min-h-8"
              >
                {i.label}
              </Link>
            </li>
          ))}
        </ul>
        {/* ★ 자주 쓰는 메뉴: 고른 것이 없으면 고르는 법만 한 줄 */}
        <div className="border-t border-[var(--line)] px-2 py-1.5" data-menu>
          <p className="flex items-center justify-between px-2 text-xs text-[var(--muted)]">
            <span>★ 자주 쓰는 메뉴</span>
          </p>
          {fav.filter((h) => PICKABLE.some((i) => i.href === h && allowed(i))).length === 0 ? (
            <p className="px-2 py-1 text-xs text-[var(--muted)]">메뉴 이름 옆 ☆ 를 누르면 여기에 모입니다.</p>
          ) : (
            <ul className="mt-0.5 space-y-0.5">
              {fav
                .map((h) => PICKABLE.find((i) => i.href === h))
                .filter((i): i is MenuItem => !!i && allowed(i))
                .map((i) => (
                  <li key={i.href} className="group flex items-center">
                    <Link
                      href={i.href!}
                      aria-current={current === i.href ? "page" : undefined}
                      className="flex min-h-9 flex-1 items-center rounded-md px-2.5 text-sm hover:bg-[var(--surface-2)] aria-[current=page]:bg-[var(--accent-soft)] aria-[current=page]:font-semibold aria-[current=page]:text-[var(--accent)] pointer-fine:lg:min-h-8"
                    >
                      {i.label}
                    </Link>
                    <FavStar on onClick={() => toggleFav(i.href!)} label={i.label} />
                  </li>
                ))}
            </ul>
          )}
        </div>
        {MENU.map((g) => {
          const items = g.items.filter(visible);
          if (!items.length) return null;
          const shut = !isOpen(g.id);
          return (
            <div key={g.id} className="border-t border-[var(--line)] px-2 py-1.5 first-of-type:border-t-0 pointer-fine:lg:py-0.5" data-menu>
              {/* 묶음 이름: 굵은 글씨·펼침 표시로 메뉴와 구분한다. 아래 메뉴는 들여 쓰고 왼쪽 선으로 묶는다 */}
              <button
                type="button"
                onClick={() => toggle(g.id)}
                aria-expanded={!shut}
                className={`flex min-h-10 w-full items-center justify-between rounded-md px-2 text-sm font-bold hover:bg-[var(--surface-2)] pointer-fine:lg:min-h-8 ${!shut ? "text-[var(--fg)]" : "text-[var(--fg)]/80"}`}
              >
                {g.label}
                <span aria-hidden className={`text-xs text-[var(--muted)] transition-transform ${shut ? "" : "rotate-90"}`}>▶</span>
              </button>
              {!shut && (
                <ul className="mt-0.5 mb-1 ml-3 space-y-0.5 border-l-2 border-[var(--line)] pl-2">
                  {items.map((i) => (
                    <li key={i.label} className="group">
                      {i.section && (
                        <p className="mt-1.5 mb-0.5 px-2.5 text-xs font-semibold text-[var(--muted)]">{i.section}</p>
                      )}
                      {i.href ? (
                        <div className="flex items-center">
                        <Link
                          href={i.href}
                          aria-current={
                            current === i.href ? "page" : undefined
                          }
                          className="flex min-h-9 flex-1 items-center justify-between rounded-md px-2.5 text-sm text-[var(--fg)]/85 hover:bg-[var(--surface-2)] aria-[current=page]:bg-[var(--accent-soft)] aria-[current=page]:font-semibold aria-[current=page]:text-[var(--accent)] pointer-fine:lg:min-h-8"
                          title={i.also ? "업무 흐름에 맞춰 여기에도 둔 바로가기입니다" : undefined}
                        >
                          {i.label}
                          {i.href === "/notifications" && unread > 0 && (
                            <span className="rounded-full bg-[var(--danger)] px-1.5 text-xs text-white">
                              {unread}
                            </span>
                          )}
                        </Link>
                        {!i.also && <FavStar on={fav.includes(i.href)} onClick={() => toggleFav(i.href!)} label={i.label} />}
                        </div>
                      ) : (
                        <span
                          title={`${i.std ?? ""} · ${i.phase} 개발 예정`}
                          className="flex min-h-10 items-center justify-between rounded-md px-3 text-sm text-[var(--muted)] opacity-70"
                        >
                          {i.label}
                          <span className="rounded bg-[var(--surface-2)] px-1.5 text-[10px]">
                            {i.phase}
                          </span>
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
        </MenuSearch>
        {/* 개발 예정 메뉴가 하나라도 있을 때만 보인다(지금은 모든 메뉴가 열려 있어 숨김) */}
        {HAS_FUTURE && (
        <label className="mx-4 mt-4 flex min-h-10 cursor-pointer items-center gap-2 text-xs text-[var(--muted)]">
          <input
            type="checkbox"
            data-assist="preview"
            checked={future}
            onChange={(e) => {
              setFuture(e.target.checked);
              save("menu:future", e.target.checked);
            }}
            className="size-4"
          />
          개발 예정 메뉴도 보기
        </label>
        )}
      </nav>
    </>
  );
}

/** 메뉴 옆 ☆/★: 마우스를 올리거나 고른 것만 보인다 */
function FavStar({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      aria-label={on ? `${label} 자주 쓰는 메뉴에서 빼기` : `${label} 자주 쓰는 메뉴에 넣기`}
      title={on ? "자주 쓰는 메뉴에서 빼기" : "자주 쓰는 메뉴에 넣기"}
      className={`inline-flex size-8 shrink-0 items-center justify-center rounded-md text-sm hover:bg-[var(--surface-2)] ${on ? "text-[var(--warn)]" : "text-[var(--muted)] opacity-0 group-hover:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-60"}`}
    >
      {on ? "★" : "☆"}
    </button>
  );
}
