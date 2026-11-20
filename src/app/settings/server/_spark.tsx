"use client";

import { useState } from "react";
import { fmtValue, type SparkKind } from "./_fmt";

export type SparkPoint = { t: string; label: string; v: number | null };
/** 24시간 흐름 작은 그래프(대표 2026-11-20 '응답 속도·트래픽'). 한 그래프에 한 값만, 마우스·손가락을 대면 그때 값 */
export function Spark({ title, points, kind, note }: { title: string; points: SparkPoint[]; kind: SparkKind; note?: string }) {
  const fmt = (v: number) => fmtValue(kind, v);
  const [hover, setHover] = useState<number | null>(null);
  const W = 300;
  const H = 64;
  const vals = points.map((p) => p.v).filter((v): v is number => v != null);
  // 비율(%)은 0~100 으로 고정해 꽉 찬 듯 보이지 않게
  const max = kind === "pct" ? 100 : Math.max(1, ...vals);
  const n = points.length;
  const x = (i: number) => (n > 1 ? (i / (n - 1)) * W : W / 2);
  const y = (v: number) => H - 2 - (v / max) * (H - 6);
  // 값이 없는 칸(서버 소식 없음)은 선을 끊는다
  let d = "";
  let pen = false;
  points.forEach((p, i) => {
    if (p.v == null) return void (pen = false);
    d += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(p.v).toFixed(1)}`;
    pen = true;
  });
  let lastIdx = -1;
  points.forEach((p, i) => p.v != null && (lastIdx = i));
  const hi = hover ?? lastIdx;
  const cur = hi >= 0 ? points[hi] : null;
  const pick = (clientX: number, el: SVGSVGElement) => {
    const r = el.getBoundingClientRect();
    const i = Math.round(((clientX - r.left) / Math.max(1, r.width)) * (n - 1));
    setHover(Math.max(0, Math.min(n - 1, i)));
  };
  return (
    <figure className="min-w-0">
      <figcaption className="flex items-baseline justify-between gap-2 text-sm">
        <span className="font-medium">{title}</span>
        <span className="text-xs text-[var(--muted)]">
          {cur ? (
            <>
              {hover != null ? cur.label : "지금"} <b className="text-[var(--fg)] tabular-nums">{cur.v == null ? "-" : fmt(cur.v)}</b>
            </>
          ) : (
            "기록 없음"
          )}
          {vals.length > 0 && <> · 가장 높음 {fmt(Math.max(...vals))}</>}
        </span>
      </figcaption>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="mt-1 h-16 w-full touch-none select-none"
        role="img"
        aria-label={`${title} 24시간 흐름, 가장 높음 ${vals.length ? fmt(Math.max(...vals)) : "-"}`}
        onPointerMove={(e) => pick(e.clientX, e.currentTarget)}
        onPointerDown={(e) => pick(e.clientX, e.currentTarget)}
        onPointerLeave={() => setHover(null)}
      >
        <line x1="0" x2={W} y1={H - 1} y2={H - 1} stroke="var(--line)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        {d && <path d={`${d}`} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />}
        {hover != null && <line x1={x(hover)} x2={x(hover)} y1="0" y2={H} stroke="var(--line-strong)" strokeWidth="1" vectorEffect="non-scaling-stroke" />}
      </svg>
      <div className="flex justify-between text-[11px] text-[var(--muted)]">
        <span>{points[0]?.label ?? ""}</span>
        {note && <span>{note}</span>}
        <span>{points[n - 1]?.label ?? ""}</span>
      </div>
    </figure>
  );
}
