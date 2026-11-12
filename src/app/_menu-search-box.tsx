"use client";
// 사이드 메뉴 맨 위의 '메뉴 찾기' 칸(사용자 확정 2026-11-11). 2026-11-12부터 차량번호·전화번호·이름으로 수리 건·고객 바로 가기도 함(_quick-find-action.ts).
// 글자를 치면 묶음과 상관없이 맞는 메뉴만 평평하게 보이고, 비우면 원래 메뉴(children)로 돌아간다.
// 어느 화면에서든 / 또는 Ctrl+K(맥은 ⌘K)로 바로 칸에 간다. ↑↓로 고르고 Enter로 열고, Esc로 지운다.
// 칸을 누르기만 하면 최근에 연 메뉴 5개가 나온다(이 기기에만 기억). 권한 없는 메뉴는 부르는 쪽(allowed)에서 걸러 준다.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { HelpButton } from "./_help-drawer";
import { ALL_ENTRIES, searchMenu, type MenuHit } from "./_menu-search";
import type { MenuItem } from "./_menu";
import { quickFindAction } from "./_quick-find-action";
import type { QuickHit } from "@/modules/customer/quick-find";

const RECENT_KEY = "menu:recent";
const RECENT_MAX = 5;

const loadRecent = (): string[] => {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
};

/** 지금 연 메뉴를 최근 목록 맨 앞에 */
export function rememberRecent(href: string | undefined) {
  if (!href) return;
  try {
    const next = [href, ...loadRecent().filter((h) => h !== href)].slice(0, RECENT_MAX);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* 기억 못 해도 찾기는 된다 */
  }
}

/** 다른 칸에 글을 쓰는 중인가(그때는 / 를 가로채지 않는다) */
const typing = (el: EventTarget | null) =>
  el instanceof HTMLElement && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));

export function MenuSearch({
  allowed,
  future,
  onWake,
  children,
}: {
  /** 이 사람에게 보이는 메뉴인가(권한표·역할) */
  allowed: (i: MenuItem) => boolean;
  /** '개발 예정 메뉴도 보기'를 켰는가 */
  future: boolean;
  /** 단축키로 불렀을 때 — 휴대폰에서는 메뉴를 연다 */
  onWake: () => void;
  children: ReactNode;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();
  const [q, setQ] = useState("");
  const [focus, setFocus] = useState(false);
  const [active, setActive] = useState(0);
  const [recent, setRecent] = useState<string[]>([]);
  const [mac, setMac] = useState(false);
  // 차량번호·전화번호·이름 바로 가기(UI 개선 11). 숫자가 있거나 맞는 메뉴가 없을 때만 서버에 묻는다
  const [found, setFound] = useState<QuickHit[]>([]);

  useEffect(() => setMac(/Mac|iPhone|iPad/.test(navigator.platform)), []);

  // 단축키: / (다른 칸에 쓰는 중이 아닐 때), Ctrl+K·⌘K (어디서든)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const slash = e.key === "/" && !e.ctrlKey && !e.metaKey && !e.altKey && !typing(e.target);
      const ctrlK = (e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === "k";
      if (!slash && !ctrlK) return;
      e.preventDefault();
      onWake();
      // 휴대폰에서는 메뉴가 열린 뒤에 칸이 보이므로 한 박자 늦게
      requestAnimationFrame(() => {
        input.current?.focus();
        input.current?.select();
      });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onWake]);

  const shown = (i: MenuItem) => allowed(i) && (future || !!i.href);
  const hits: MenuHit[] = useMemo(() => {
    if (q.trim()) return searchMenu(q).filter(shown);
    if (!focus) return [];
    return recent
      .map((h) => ALL_ENTRIES.find((e) => e.href === h))
      .filter((e): e is (typeof ALL_ENTRIES)[number] => !!e && shown(e))
      .map((e) => ({ ...e, score: 0 }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, focus, recent, future, allowed]);
  const openable = hits.filter((h) => h.href);
  // 맞는 메뉴는 있지만 권한이 없어 숨긴 경우(못 찾은 까닭을 알려 준다)
  const hidden = q.trim() && !hits.length && searchMenu(q).some((h) => !allowed(h));
  const searching = !!q.trim();
  const listOpen = searching || (focus && hits.length > 0);

  useEffect(() => setActive(0), [q]);
  const menuEmpty = !!q.trim() && !hits.length;
  useEffect(() => {
    const s = q.trim();
    if (s.length < 2 || !(/\d/.test(s) || menuEmpty)) {
      setFound([]);
      return;
    }
    let live = true;
    const t = setTimeout(() => {
      quickFindAction(s)
        .then((r) => live && setFound(r))
        .catch(() => live && setFound([]));
    }, 250);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [q, menuEmpty]);
  // ↑↓·Enter 로 고르는 순서: 바로 가기 먼저, 그다음 메뉴
  const nav: { href: string }[] = [...(searching ? found : []), ...openable.map((h) => ({ href: h.href! }))];

  const go = (h: { href?: string } | undefined) => {
    if (!h?.href) return;
    setQ("");
    input.current?.blur();
    router.push(h.href);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (!nav.length) return;
      e.preventDefault();
      const d = e.key === "ArrowDown" ? 1 : -1;
      setActive((a) => (a + d + nav.length) % nav.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      go(nav[active]);
    } else if (e.key === "Escape") {
      e.stopPropagation();
      if (q) setQ("");
      else input.current?.blur();
    }
  };

  const activeHref = nav[active]?.href;
  const optId = (href: string) => `${listId}-${href.replace(/[^a-z0-9]/gi, "_")}`;

  return (
    <>
      {/* 메뉴를 내려도 찾기 칸은 맨 위에 붙어 있다(대표 지시 2026-11-12). 휴대폰에서는 '메뉴' 머리줄 바로 아래 */}
      <div className="sticky top-14 z-10 border-b border-[var(--line)] bg-[var(--surface)] px-2 pb-2 pt-3 lg:top-0">
        <div className="flex items-center gap-1">
          <div className="relative flex-1">
            <span aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-[var(--muted)]">
              ⌕
            </span>
            <input
              ref={input}
              type="search"
              role="combobox"
              aria-label="메뉴 찾기"
              aria-expanded={listOpen}
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={listOpen && activeHref ? optId(activeHref) : undefined}
              autoComplete="off"
              spellCheck={false}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={onKeyDown}
              onFocus={() => {
                setRecent(loadRecent());
                setFocus(true);
              }}
              // 목록을 누르는 사이에 닫히지 않게 조금 늦춘다
              onBlur={() => setTimeout(() => setFocus(false), 150)}
              placeholder="메뉴·차량번호 찾기 (/)"
              title={`메뉴 이름이나 차량번호로 찾기. 단축키: / 또는 ${mac ? "⌘K" : "Ctrl+K"}`}
              className="h-10 w-full rounded-md border border-[var(--line-strong)] bg-[var(--surface)] pl-7 pr-2 text-sm placeholder:text-[var(--muted)] focus:border-[var(--accent)] focus:outline-none"
            />
          </div>
          <HelpButton topic={{ kind: "panel", id: "menu.search" }} name="메뉴 찾기" />
        </div>
      </div>

      {listOpen ? (
        <div className="px-2 pt-2">
          {!searching && <p className="px-2 pb-1 text-xs font-semibold text-[var(--muted)]">최근에 연 메뉴</p>}
          {searching && (
            <p className="px-2 pb-1 text-xs text-[var(--muted)]" aria-live="polite">
              {hits.length || found.length ? `${hits.length + found.length}개 · Enter로 열기` : hidden ? "내 권한으로 열 수 있는 메뉴가 없습니다. 필요하면 대표에게 권한을 요청하세요." : "맞는 메뉴가 없습니다"}
            </p>
          )}
          <ul id={listId} role="listbox" aria-label="찾은 메뉴" className="space-y-0.5">
            {searching &&
              found.map((f) => (
                <li key={f.href} id={optId(f.href)} role="option" aria-selected={f.href === activeHref}>
                  <Link
                    href={f.href}
                    tabIndex={-1}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setQ("");
                      input.current?.blur();
                    }}
                    onMouseEnter={() => setActive(nav.findIndex((n) => n.href === f.href))}
                    className={`block rounded-md px-3 py-1.5 text-sm hover:bg-[var(--surface-2)] ${f.href === activeHref ? "bg-[var(--accent-soft)] text-[var(--accent)]" : ""}`}
                  >
                    <span className="font-medium">{f.label}</span>
                    <span className="block text-[11px] leading-tight text-[var(--muted)]">{f.sub}</span>
                  </Link>
                </li>
              ))}
            {hits.map((h) =>
              h.href ? (
                <li key={h.href} id={optId(h.href)} role="option" aria-selected={h.href === activeHref}>
                  <Link
                    href={h.href}
                    tabIndex={-1}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setQ("");
                      input.current?.blur();
                    }}
                    onMouseEnter={() => setActive(nav.findIndex((n) => n.href === h.href))}
                    className={`block rounded-md px-3 py-1.5 text-sm hover:bg-[var(--surface-2)] ${h.href === activeHref ? "bg-[var(--accent-soft)] text-[var(--accent)]" : ""}`}
                  >
                    <Label h={h} />
                    <Where h={h} />
                  </Link>
                </li>
              ) : (
                <li key={h.label} role="option" aria-selected={false} aria-disabled title={`${h.std ?? ""} · ${h.phase} 개발 예정`} className="rounded-md px-3 py-1.5 text-sm text-[var(--muted)] opacity-70">
                  {h.label} <span className="rounded bg-[var(--surface-2)] px-1.5 text-[10px]">{h.phase}</span>
                  <Where h={h} />
                </li>
              ),
            )}
          </ul>
          {searching && (
            <Link
              href={`/help?q=${encodeURIComponent(q.trim())}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setQ("")}
              className="mt-2 block rounded-md px-3 py-1.5 text-xs text-[var(--accent)] hover:bg-[var(--surface-2)]"
            >
              도움말 센터에서 ‘{q.trim()}’ 찾기 →
            </Link>
          )}
        </div>
      ) : (
        children
      )}
    </>
  );
}

/** 메뉴 이름, 맞은 글자는 굵게 */
function Label({ h }: { h: MenuHit }) {
  if (!h.mark) return <span>{h.label}</span>;
  const { start, end } = h.mark;
  return (
    <span>
      {h.label.slice(0, start)}
      <b className="font-bold text-[var(--accent)]">{h.label.slice(start, end)}</b>
      {h.label.slice(end)}
    </span>
  );
}

/** 이름 아래 작은 글씨: 묶음 › 표준서 번호, 별칭으로 맞았으면 그 말 */
function Where({ h }: { h: MenuHit }) {
  const bits = [h.group, h.parent && `${h.parent} 안 화면`, h.std].filter(Boolean).join(" · ");
  const via = h.via && h.via !== h.std && h.via !== h.group ? `‘${h.via}’로 찾음` : "";
  if (!bits && !via) return null;
  return (
    <span className="block text-[11px] leading-tight text-[var(--muted)]">
      {bits}
      {bits && via ? " · " : ""}
      {via}
    </span>
  );
}
