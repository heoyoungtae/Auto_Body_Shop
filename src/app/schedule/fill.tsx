"use client";
// 일정표 달력이 브라우저 창 높이에 맞춰 화면 아래까지 채우게 한다(사용자 요청 2026-11-09).
import Link from "next/link";
import { Children, useEffect, useRef, useState, type ReactNode } from "react";

/** 자기 위치부터 창 아래까지(reserve 만큼 남김) 높이를 채운다. 창 크기가 바뀌면 따라 바뀐다 */
export function FillHeight({ children, reserve = 72, min = 420, className = "" }: { children: ReactNode; reserve?: number; min?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [h, setH] = useState<number | null>(null);
  useEffect(() => {
    const fit = () => {
      const el = ref.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top + window.scrollY;
      setH(Math.max(min, window.innerHeight - top - reserve));
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [reserve, min]);
  return (
    <div ref={ref} className={className} style={{ height: h ?? undefined, minHeight: min }}>
      {children}
    </div>
  );
}

/** 칸에 다 안 들어가는 일정 수를 세어 '+n'으로 보여 준다(누르면 그날 목록) */
export function CellItems({ children, more }: { children: ReactNode; more: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [hidden, setHidden] = useState(0);
  const count = Children.count(children);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const check = () => {
      const bottom = el.getBoundingClientRect().bottom;
      let n = 0;
      for (const c of Array.from(el.children)) if (c.getBoundingClientRect().bottom > bottom + 1) n++;
      setHidden(n);
    };
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [count]);
  return (
    <div className="relative min-h-0 flex-1">
      <div ref={ref} className={`grid h-full content-start gap-0.5 overflow-hidden ${hidden ? "pb-4" : ""}`}>
        {children}
      </div>
      {hidden > 0 && (
        <Link href={more} className="absolute right-0 bottom-0 left-0 bg-[var(--surface)] px-1 text-right text-xs text-[var(--accent)]">
          +{hidden}개 더
        </Link>
      )}
    </div>
  );
}
