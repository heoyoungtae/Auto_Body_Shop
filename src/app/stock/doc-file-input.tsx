"use client";
// 품목 문서 파일 고르기(PDF·사진 한 개)
import { useRef, useState } from "react";

export function DocFileInput() {
  const ref = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <input ref={ref} type="file" data-assist="upload" name="docFile" accept="application/pdf,image/*" className="hidden" onChange={(e) => setName(e.currentTarget.files?.[0]?.name ?? "")} />
      <button type="button" onClick={() => ref.current?.click()} className="rounded border border-dashed border-[var(--line-strong)] px-3 py-2 hover:bg-[var(--accent-soft)]">
        {name ? "다시 고르기" : "+ 문서 파일 고르기"}
      </button>
      <span className="text-xs text-[var(--muted)]">{name || "PDF나 사진, 8MB까지(필수)"}</span>
    </div>
  );
}
