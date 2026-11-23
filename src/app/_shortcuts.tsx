"use client";
// PC 단축키(대표 결정 2026-11-23 PC 화면 개선).
//   Ctrl+S(⌘S)  지금 쓰는 양식 저장(브라우저의 '페이지 저장' 대신)
//   N           목록 화면의 '새로 쓰기·등록' 단추(글을 치는 중이 아닐 때)
//   ?           단축키 안내 열기
//   / · Ctrl+K  메뉴 찾기(_menu-search-box.tsx), Esc 도움말 창 닫기(_help-drawer.tsx)
import { useEffect, useState } from "react";

const typing = (el: EventTarget | null) =>
  el instanceof HTMLElement && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));

/** 저장할 양식: 지금 누른 칸이 든 양식, 없으면 화면에 저장 단추가 있는 양식이 하나뿐일 때 그 양식 */
function formToSave(): HTMLFormElement | null {
  const a = document.activeElement;
  const saving = (f: HTMLFormElement) => f.method.toLowerCase() !== "get" && f.getAttribute("role") !== "search" && !!f.querySelector("[type=submit]");
  const own = a instanceof HTMLElement ? a.closest("form") : null;
  if (own && saving(own)) return own;
  const forms = Array.from(document.querySelectorAll<HTMLFormElement>("main form")).filter(saving);
  return forms.length === 1 ? forms[0] : null;
}

/** '새로 …' 단추: 화면 제목 줄의 단추 가운데 새로 만드는 것 */
const NEW_WORDS = /^(새 |\+ )|(등록|쓰기|만들기)$/;
function newButton(): HTMLElement | null {
  const marked = document.querySelector<HTMLElement>("main [data-shortcut=new]");
  if (marked) return marked;
  const acts = Array.from(document.querySelectorAll<HTMLElement>("main .page-actions a"));
  return acts.find((b) => NEW_WORDS.test((b.textContent ?? "").trim())) ?? null;
}

function flash(text: string) {
  const el = document.createElement("div");
  el.textContent = text;
  el.setAttribute("role", "status");
  el.className = "fixed bottom-20 left-1/2 z-50 -translate-x-1/2 rounded-md bg-[var(--fg)] px-3 py-2 text-sm text-[var(--bg)] shadow-[var(--shadow-lg)]";
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1800);
}

export function Shortcuts() {
  const [open, setOpen] = useState(false);
  const [mac, setMac] = useState(false);
  useEffect(() => setMac(/Mac|iPhone|iPad/.test(navigator.platform)), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === "s") {
        e.preventDefault();
        const f = formToSave();
        if (f) f.requestSubmit();
        else flash("저장할 양식이 여럿이라 고르지 못했습니다. 저장할 칸을 한 번 누른 뒤 다시 누르세요.");
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey || typing(e.target)) return;
      if (e.key === "?") {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === "Escape") {
        setOpen(false);
      } else if (e.key === "n" || e.key === "N" || e.key === "ㅜ") {
        const b = newButton();
        if (b) {
          e.preventDefault();
          b.click();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  if (!open) return null;
  const mod = mac ? "⌘" : "Ctrl";
  const rows: [string, string][] = [
    [`${mod} + S`, "지금 쓰는 양식 저장"],
    ["N", "새로 쓰기·등록(목록 화면)"],
    [`/ 또는 ${mod} + K`, "메뉴·차량번호 찾기"],
    ["Esc", "도움말 창·이 안내 닫기"],
    ["?", "이 안내 열고 닫기"],
  ];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setOpen(false)}>
      <div role="dialog" aria-modal="true" aria-label="단축키" className="w-full max-w-sm rounded-lg border border-[var(--line)] bg-[var(--surface)] p-4 shadow-[var(--shadow-lg)]" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold">단축키</h2>
          <button type="button" onClick={() => setOpen(false)} aria-label="닫기" className="inline-flex size-8 items-center justify-center rounded-md hover:bg-[var(--surface-2)]">
            ×
          </button>
        </div>
        <table className="w-full text-sm" data-keep-table>
          <tbody className="divide-y divide-[var(--line)]">
            {rows.map(([k, v]) => (
              <tr key={k}>
                <td className="py-2 pr-3 whitespace-nowrap">
                  <kbd className="rounded border border-[var(--line-strong)] bg-[var(--surface-2)] px-1.5 py-0.5 text-xs">{k}</kbd>
                </td>
                <td className="py-2">{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 text-xs text-[var(--muted)]">글을 치는 중에는 N·? 가 글자로 들어갑니다. 한글 자판이어도 N(ㅜ)이 됩니다.</p>
      </div>
    </div>
  );
}
