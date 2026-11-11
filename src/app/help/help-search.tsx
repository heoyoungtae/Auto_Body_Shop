"use client";
// 도움말 찾기: 화면·용어·정책값·전결 설명을 한 번에 거른다.
import Link from "next/link";
import { useState } from "react";
import { HelpButton } from "../_help-drawer";

export type HelpItem = { kind: string; title: string; body: string; href?: string };

export function HelpSearch({ items, initial = "" }: { items: HelpItem[]; initial?: string }) {
  // 메뉴 찾기에서 못 찾고 넘어오면 그 말이 채워져 있다(/help?q=…)
  const [q, setQ] = useState(initial);
  const [kind, setKind] = useState("전체");
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const kinds = ["전체", ...Array.from(new Set(items.map((i) => i.kind)))];
  const shown = items.filter((i) => (kind === "전체" || i.kind === kind) && words.every((w) => `${i.title}\n${i.body}`.toLowerCase().includes(w)));
  return (
    <section className="rounded-lg border border-[var(--line)] bg-[var(--surface)] p-4 shadow-[var(--shadow)]">
      <h2 className="mb-3 flex items-center gap-1.5 font-semibold">
        찾기 <HelpButton topic={{ kind: "panel", id: "help.search" }} name="찾기" />
      </h2>
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="궁금한 말을 치세요 (예: 반려, 시행일, 견적, 잠김)"
        aria-label="도움말 찾기"
        className="mb-2 h-11 w-full rounded-md border border-[var(--line-strong)] bg-[var(--surface)] px-3"
      />
      <div className="mb-3 flex flex-wrap gap-1" role="group" aria-label="종류">
        {kinds.map((k) => (
          <button
            key={k}
            type="button"
            aria-pressed={kind === k}
            onClick={() => setKind(k)}
            className="min-h-8 rounded-full border border-[var(--line-strong)] px-3 text-xs aria-pressed:border-[var(--accent)] aria-pressed:bg-[var(--accent-soft)] aria-pressed:text-[var(--accent)]"
          >
            {k} {k === "전체" ? items.length : items.filter((i) => i.kind === k).length}
          </button>
        ))}
      </div>
      <p className="mb-2 text-xs text-[var(--muted)]">{shown.length}건</p>
      <ul className="divide-y divide-[var(--line)]">
        {shown.map((i) => (
          <li key={`${i.kind}-${i.title}`} className="py-2.5 text-sm">
            <div className="flex items-center gap-2">
              <span className="rounded bg-[var(--surface-2)] px-1.5 py-0.5 text-xs text-[var(--muted)]">{i.kind}</span>
              {i.href ? (
                <Link href={i.href} className="font-medium text-[var(--accent)]">
                  {i.title}
                </Link>
              ) : (
                <b>{i.title}</b>
              )}
            </div>
            <p className="mt-1 whitespace-pre-line text-[var(--muted)]">{i.body}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
