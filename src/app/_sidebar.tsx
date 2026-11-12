"use client";
// 왼쪽 메뉴. 넓은 화면에서는 늘 보이고, 태블릿·휴대폰에서는 ☰ 단추로 열고 닫는다.
// 맨 위에 메뉴 찾기 칸(_menu-search-box.tsx)이 있다. 묶음은 기본으로 접혀 있다. 지금 화면이 든 묶음만 저절로 펼친다. 펼친 묶음과 '개발 예정 보기'는 이 기기에 기억한다.
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
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
const groupOf = (h: string | undefined) =>
  h ? MENU.find((g) => g.items.some((i) => i.href === h))?.id : undefined;

export function Sidebar({ roles, unread }: { roles: Role[]; unread: number }) {
  const path = usePathname();
  // ?f=warranty 같은 조건도 봐야 '보증 수리'와 '만족도·불만'을 가른다
  const search = useSearchParams().toString();
  const current = activeHref(path, search);
  const { open, setOpen } = useContext(NavCtx);
  const [opened, setOpened] = useState<string[]>([]);
  const [future, setFuture] = useState(true);
  useEffect(() => {
    setOpened(load("menu:open", []));
    setFuture(load("menu:future", true));
  }, []);
  useEffect(() => setOpen(false), [path, setOpen]);
  // 메뉴 찾기 칸의 '최근에 연 메뉴'
  useEffect(() => rememberRecent(current), [current]);
  const wake = useCallback(() => setOpen(true), [setOpen]);
  // 지금 화면이 든 묶음은 펼친다(저장하지 않음 — 다른 화면으로 가면 원래대로)
  const [here, setHere] = useState<string | undefined>(() => groupOf(current));
  useEffect(() => setHere(groupOf(current)), [current]);
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
        id="side-menu"
        aria-label="메뉴"
        className={`fixed inset-y-0 left-0 z-30 w-64 shrink-0 overflow-y-auto border-r border-[var(--line)] bg-[var(--surface)] pb-6 transition-transform lg:sticky lg:top-14 lg:z-0 lg:h-[calc(100vh-3.5rem)] lg:translate-x-0 ${open ? "translate-x-0 shadow-[var(--shadow-lg)]" : "-translate-x-full"}`}
      >
        <div className="flex min-h-14 items-center justify-between border-b border-[var(--line)] px-3 lg:hidden">
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
        <ul className="space-y-0.5 px-2 pt-3">
          {TOP.filter(allowed).map((i) => (
            <li key={i.label}>
              <Link
                href={i.href!}
                aria-current={current === i.href ? "page" : undefined}
                className="flex min-h-10 items-center rounded-md px-3 text-sm font-semibold hover:bg-[var(--surface-2)] aria-[current=page]:bg-[var(--accent-soft)] aria-[current=page]:text-[var(--accent)]"
              >
                {i.label}
              </Link>
            </li>
          ))}
        </ul>
        {MENU.map((g) => {
          const items = g.items.filter(visible);
          if (!items.length) return null;
          const shut = !isOpen(g.id);
          return (
            <div key={g.id} className="px-2 pt-3">
              <button
                type="button"
                onClick={() => toggle(g.id)}
                aria-expanded={!shut}
                className="flex min-h-9 w-full items-center justify-between rounded-md px-2 text-xs font-semibold text-[var(--muted)] hover:bg-[var(--surface-2)]"
              >
                {g.label}
                <span aria-hidden>{shut ? "▸" : "▾"}</span>
              </button>
              {!shut && (
                <ul className="mt-0.5 space-y-0.5">
                  {items.map((i) => (
                    <li key={i.label}>
                      {i.href ? (
                        <Link
                          href={i.href}
                          aria-current={
                            current === i.href ? "page" : undefined
                          }
                          className="flex min-h-10 items-center justify-between rounded-md px-3 text-sm hover:bg-[var(--surface-2)] aria-[current=page]:bg-[var(--accent-soft)] aria-[current=page]:font-semibold aria-[current=page]:text-[var(--accent)]"
                        >
                          {i.label}
                          {i.href === "/notifications" && unread > 0 && (
                            <span className="rounded-full bg-[var(--danger)] px-1.5 text-xs text-white">
                              {unread}
                            </span>
                          )}
                        </Link>
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

/** 휴대폰·태블릿 아래 탭 막대(UI 개선 9, 2026-11-12). 한 손·장갑 낀 손으로 자주 가는 화면만 */
export function TabBar({ roles, unread }: { roles: Role[]; unread: number }) {
  const path = usePathname();
  const { open, setOpen } = useContext(NavCtx);
  const third =
    can({ roles }, "work.do") || can({ roles }, "work.assign")
      ? { href: "/work", label: "작업", d: "M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.5-2.5z" }
      : { href: "/schedule", label: "일정", d: "M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2" };
  const tabs = [
    { href: "/home", label: "대시보드", d: "M3 10.5 12 3l9 7.5V21H3zM9 21v-6h6v6" },
    { href: "/todo", label: "내 할 일", d: "M9 11l3 3 8-8M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9" },
    third,
    { href: "/notifications", label: "알림", d: "M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0" },
  ];
  const icon = (d: string) => (
    <svg aria-hidden viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
  const cls = "relative flex min-h-[3.75rem] flex-1 flex-col items-center justify-center gap-0.5 text-[11px]";
  return (
    <nav id="tab-bar" aria-label="자주 가는 화면" className="no-print fixed inset-x-0 bottom-0 z-20 flex border-t border-[var(--line)] bg-[var(--surface)] pb-[env(safe-area-inset-bottom)] lg:hidden">
      {tabs.map((t) => {
        const on = path === t.href || path.startsWith(`${t.href}/`);
        return (
          <Link key={t.href} href={t.href} aria-current={on ? "page" : undefined} className={`${cls} ${on ? "font-semibold text-[var(--accent)]" : "text-[var(--muted)]"}`}>
            {icon(t.d)}
            {t.label}
            {t.href === "/notifications" && unread > 0 && (
              <span className="absolute top-1.5 left-1/2 ml-1.5 min-w-5 rounded-full bg-[var(--danger)] px-1 text-center text-xs leading-5 text-white">{unread > 99 ? "99+" : unread}</span>
            )}
          </Link>
        );
      })}
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-controls="side-menu" className={`${cls} text-[var(--muted)]`}>
        {icon("M4 6h16M4 12h16M4 18h16")}
        메뉴
      </button>
    </nav>
  );
}
