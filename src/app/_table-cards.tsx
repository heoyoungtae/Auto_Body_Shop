"use client";
// 휴대폰에서 목록 표를 카드로 바꿔 보이게 한다(UI 개선 10, 2026-11-12).
// 화면마다 고치지 않고, 본문 안 표의 제목 줄(th) 글자를 각 칸(td)의 data-label 로 붙인 뒤 CSS(globals.css .table-cards)가 640px 아래에서 카드로 쌓는다.
// 칸 합치기(colspan·rowspan)가 있거나 열이 9개 이상인 표, 인쇄 화면, data-keep-table 이 붙은 표는 그대로 둔다(가로로 밀어 본다).
import { usePathname } from "next/navigation";
import { useEffect } from "react";

function mark(table: HTMLTableElement) {
  if (table.dataset.cards || table.closest("[data-keep-table]")) return;
  const heads = Array.from(table.tHead?.rows[0]?.cells ?? []);
  if (!heads.length || heads.length > 8) return;
  const rows = Array.from(table.tBodies).flatMap((b) => Array.from(b.rows));
  if (!rows.length) return;
  if ([...heads, ...rows.flatMap((r) => Array.from(r.cells))].some((c) => c.colSpan > 1 || c.rowSpan > 1)) return;
  if (rows.some((r) => r.cells.length !== heads.length)) return;
  const labels = heads.map((h) => (h.textContent ?? "").replace(/\?/g, "").trim());
  for (const r of rows) Array.from(r.cells).forEach((c, i) => labels[i] && c.setAttribute("data-label", labels[i]));
  table.dataset.cards = "1";
  table.classList.add("table-cards");
}

/**
 * 넓은 화면(1024px 이상)에서 줄이 많은 표는 아래로 내려도 제목 줄이 화면 위에 남게 한다(대표 결정 2026-11-23 PC 화면 개선).
 * 표를 감싼 가로 밀기 상자(overflow-x-auto)가 있으면 제목 줄이 그 상자에 갇혀 고정되지 않으므로,
 * 표가 상자 폭 안에 다 들어갈 때만 그 상자를 '잘라 보이기'로 바꾼다(넘치면 지금처럼 가로로 밀어 본다).
 */
function stick(table: HTMLTableElement) {
  if (!table.tHead || table.closest("[data-keep-table]") || table.closest(".report-sheet")) return;
  const rows = Array.from(table.tBodies).reduce((n, b) => n + b.rows.length, 0);
  if (rows < 8) return;
  const wrap = table.parentElement?.closest<HTMLElement>(".overflow-x-auto");
  const wide = window.matchMedia("(min-width: 1024px)").matches;
  const fits = !wrap || wrap.scrollWidth <= wrap.clientWidth + 1;
  if (wide && fits) {
    table.dataset.sticky = "1";
    if (wrap) wrap.dataset.stickyWrap = "1";
  } else {
    delete table.dataset.sticky;
    if (wrap) delete wrap.dataset.stickyWrap;
  }
}

export function TableCards() {
  const path = usePathname();
  useEffect(() => {
    if (path.endsWith("/print")) return;
    const main = document.querySelector("main");
    if (!main) return;
    const run = () =>
      main.querySelectorAll("table").forEach((t) => {
        mark(t);
        stick(t);
      });
    run();
    const mo = new MutationObserver(run);
    mo.observe(main, { childList: true, subtree: true });
    const onResize = () => main.querySelectorAll("table").forEach(stick);
    window.addEventListener("resize", onResize);
    return () => {
      mo.disconnect();
      window.removeEventListener("resize", onResize);
    };
  }, [path]);
  return null;
}
