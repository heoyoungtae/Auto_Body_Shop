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

export function TableCards() {
  const path = usePathname();
  useEffect(() => {
    if (path.endsWith("/print")) return;
    const main = document.querySelector("main");
    if (!main) return;
    const run = () => main.querySelectorAll("table").forEach(mark);
    run();
    const mo = new MutationObserver(run);
    mo.observe(main, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, [path]);
  return null;
}
