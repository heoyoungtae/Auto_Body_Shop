"use client";
// 고르기 칸의 값에 따라 아래 칸을 바꿔 보여 준다(예: 결과가 '입고 예약'이면 날짜·시간 칸).
// 안 쓰는 칸은 아예 그리지 않아, 숨은 필수 칸 때문에 저장이 막히지 않게 한다.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { restoreWithin } from "../_assist";

export function ShowWhen({ field, initial, cases, children }: { field: string; initial: string; cases: Record<string, ReactNode>; children: ReactNode }) {
  const [v, setV] = useState(initial);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const form = box.current?.closest("form");
    if (!form) return;
    const read = () => setTimeout(() => {
      const el = form.elements.namedItem(field) as HTMLSelectElement | null;
      if (el) setV(el.value);
    }, 0);
    form.addEventListener("assist:restored", read);
    form.addEventListener("reset", read);
    return () => {
      form.removeEventListener("assist:restored", read);
      form.removeEventListener("reset", read);
    };
  }, [field]);
  const caseBox = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (caseBox.current) restoreWithin(caseBox.current);
  }, [v]);
  return (
    <div
      ref={box}
      className="space-y-4"
      onChange={(e) => {
        const t = e.target as unknown as HTMLSelectElement;
        if (t.name === field) setV(t.value);
      }}
    >
      {children}
      <div ref={caseBox} className="space-y-4 empty:hidden">
        {cases[v] ?? null}
      </div>
    </div>
  );
}
