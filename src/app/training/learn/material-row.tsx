"use client";
// 학습 화면의 자료 한 줄: '열기'를 누른 때부터 '다 봤음'까지 걸린 시간을 학습 시간으로 보낸다(서버가 상한을 둔다)
import { useRef, useState } from "react";
import { learnAction } from "../actions";

export function MaterialRow({ trainingId, materialId, href, title, kind, minutes, done, inline }: { trainingId: string; materialId: string; href: string | null; title: string; kind: string; minutes: number | null; done: boolean; inline?: React.ReactNode }) {
  const opened = useRef<number | null>(null);
  const spent = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const start = () => {
    if (opened.current == null) opened.current = Date.now();
  };
  return (
    <li className="rounded-md border border-[var(--line)] p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`text-lg ${done ? "text-[var(--ok)]" : "text-[var(--muted)]"}`} aria-hidden>
          {done ? "✓" : "○"}
        </span>
        <span className="font-medium">{title}</span>
        <span className="text-xs text-[var(--muted)]">
          {kind}
          {minutes ? ` · 약 ${minutes}분` : ""}
        </span>
        <span className="ml-auto flex items-center gap-2">
          {inline ? (
            <button
              type="button"
              className="rounded-md border border-[var(--line-strong)] px-3 py-1.5 text-sm hover:border-[var(--accent)]"
              onClick={() => {
                start();
                setOpen(!open);
              }}
            >
              {open ? "접기" : "펼쳐 보기"}
            </button>
          ) : (
            href && (
              <a href={href} target="_blank" rel="noreferrer" onClick={start} className="rounded-md border border-[var(--line-strong)] px-3 py-1.5 text-sm hover:border-[var(--accent)]">
                열기 ↗
              </a>
            )
          )}
          {!done && (
            <form
              action={learnAction}
              onSubmit={() => {
                if (spent.current) spent.current.value = String(opened.current ? Math.round((Date.now() - opened.current) / 1000) : 0);
              }}
            >
              <input type="hidden" name="id" value={trainingId} />
              <input type="hidden" name="intent" value="viewed" />
              <input type="hidden" name="materialId" value={materialId} />
              <input type="hidden" name="spent" ref={spent} defaultValue="0" />
              <button type="submit" className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-sm text-[var(--accent-fg)]">
                다 봤음
              </button>
            </form>
          )}
        </span>
      </div>
      {inline && open && <div className="mt-3 border-t border-[var(--line)] pt-3">{inline}</div>}
    </li>
  );
}
