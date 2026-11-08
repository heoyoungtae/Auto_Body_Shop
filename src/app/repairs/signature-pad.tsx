"use client";
// 서명란: 손가락·펜·마우스로 그린 서명을 PNG 로 숨은 칸 signature 에 넣는다.
import { useEffect, useRef, useState } from "react";

export function SignaturePad({ name = "signature" }: { name?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const hidden = useRef<HTMLInputElement>(null);
  const drawing = useRef(false);
  // 숨은 칸의 value 는 속성으로 다뤄져 다시 그릴 때 지워지므로 상태로 묶는다
  const [data, setData] = useState("");
  const has = data !== "";

  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    const r = c.getBoundingClientRect();
    c.width = Math.round(r.width * 2);
    c.height = Math.round(r.height * 2);
    const ctx = c.getContext("2d")!;
    ctx.scale(2, 2);
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#111";
  }, []);

  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top] as const;
  };
  const changed = () => queueMicrotask(() => hidden.current?.form?.dispatchEvent(new Event("change", { bubbles: true })));
  const save = () => {
    if (canvas.current) setData(canvas.current.toDataURL("image/png"));
    changed();
  };
  const clear = () => {
    const c = canvas.current!;
    c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
    setData("");
    changed();
  };

  return (
    <div id="signature" tabIndex={-1}>
      <input ref={hidden} type="hidden" name={name} value={data} />
      <canvas
        ref={canvas}
        className="h-36 w-full touch-none rounded-md border-2 border-dashed border-[var(--line-strong)] bg-white"
        aria-label="서명란"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          drawing.current = true;
          const ctx = e.currentTarget.getContext("2d")!;
          const [x, y] = pos(e);
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x + 0.1, y + 0.1);
          ctx.stroke();
        }}
        onPointerMove={(e) => {
          if (!drawing.current) return;
          const ctx = e.currentTarget.getContext("2d")!;
          const [x, y] = pos(e);
          ctx.lineTo(x, y);
          ctx.stroke();
        }}
        onPointerUp={() => {
          if (!drawing.current) return;
          drawing.current = false;
          save();
        }}
      />
      <div className="mt-1 flex items-center justify-between text-xs text-[var(--muted)]">
        <span>{has ? "서명을 받았습니다" : "이 칸에 고객(탁송이면 기사)이 서명합니다"}</span>
        <button type="button" onClick={clear} className="text-[var(--accent)] hover:underline">
          지우고 다시
        </button>
      </div>
    </div>
  );
}
