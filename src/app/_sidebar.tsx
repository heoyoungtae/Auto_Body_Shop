"use client";
// 왼쪽 메뉴. 넓은 화면에서는 늘 보이고, 태블릿·휴대폰에서는 ☰ 단추로 열고 닫는다.
// 묶음 접기와 '개발 예정 보기'는 이 기기에 기억한다.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Role } from "@/modules/auth/roles";
import { MENU, type MenuItem } from "./_menu";

const NavCtx = createContext<{ open: boolean; setOpen: (v: boolean) => void }>({ open: false, setOpen: () => {} });

export function NavProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return <NavCtx.Provider value={{ open, setOpen }}>{children}</NavCtx.Provider>;
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

/** 지금 화면에 맞는 메뉴: 경로가 가장 길게 겹치는 것 하나 */
const HREFS = MENU.flatMap((g) => g.items.map((i) => i.href).filter((h): h is string => !!h));
const activeHref = (path: string) => HREFS.filter((h) => path === h || path.startsWith(h + "/")).sort((a, b) => b.length - a.length)[0];
const isActive = (path: string, href: string) => activeHref(path) === href;

export function Sidebar({ roles, unread }: { roles: Role[]; unread: number }) {
  const path = usePathname();
  const { open, setOpen } = useContext(NavCtx);
  const [closed, setClosed] = useState<string[]>([]);
  const [future, setFuture] = useState(true);
  useEffect(() => {
    setClosed(load("menu:closed", []));
    setFuture(load("menu:future", true));
  }, []);
  useEffect(() => setOpen(false), [path, setOpen]);
  const visible = (i: MenuItem) => (!i.roles || i.roles.some((r) => roles.includes(r))) && (future || i.href);
  const toggle = (id: string) => {
    const next = closed.includes(id) ? closed.filter((x) => x !== id) : [...closed, id];
    setClosed(next);
    save("menu:closed", next);
  };
  return (
    <>
      {open && <div className="fixed inset-0 z-30 bg-black/30 lg:hidden" onClick={() => setOpen(false)} aria-hidden />}
      <nav
        id="side-menu"
        aria-label="메뉴"
        className={`fixed inset-y-0 left-0 z-30 w-64 shrink-0 overflow-y-auto border-r border-[var(--line)] bg-[var(--surface)] pb-6 transition-transform lg:sticky lg:top-14 lg:z-0 lg:h-[calc(100vh-3.5rem)] lg:translate-x-0 ${open ? "translate-x-0 shadow-[var(--shadow-lg)]" : "-translate-x-full"}`}
      >
        <div className="flex min-h-14 items-center justify-between border-b border-[var(--line)] px-3 lg:hidden">
          <span className="font-semibold">메뉴</span>
          <button type="button" onClick={() => setOpen(false)} aria-label="메뉴 닫기" className="inline-flex size-10 items-center justify-center rounded-md text-lg hover:bg-[var(--surface-2)]">
            ×
          </button>
        </div>
        {MENU.map((g) => {
          const items = g.items.filter(visible);
          if (!items.length) return null;
          const shut = closed.includes(g.id);
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
                          aria-current={isActive(path, i.href) ? "page" : undefined}
                          className="flex min-h-10 items-center justify-between rounded-md px-3 text-sm hover:bg-[var(--surface-2)] aria-[current=page]:bg-[var(--accent-soft)] aria-[current=page]:font-semibold aria-[current=page]:text-[var(--accent)]"
                        >
                          {i.label}
                          {i.href === "/notifications" && unread > 0 && <span className="rounded-full bg-[var(--danger)] px-1.5 text-xs text-white">{unread}</span>}
                        </Link>
                      ) : (
                        <span
                          title={`${i.std ?? ""} · ${i.phase} 개발 예정`}
                          className="flex min-h-10 items-center justify-between rounded-md px-3 text-sm text-[var(--muted)] opacity-70"
                        >
                          {i.label}
                          <span className="rounded bg-[var(--surface-2)] px-1.5 text-[10px]">{i.phase}</span>
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
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
      </nav>
    </>
  );
}
