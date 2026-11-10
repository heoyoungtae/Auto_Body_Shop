"use client";
// 지출 증빙 파일 붙이기(사진·PDF). 사진은 올리기 전에 줄인다
import { useId, useRef, useState } from "react";
import { Shell } from "../_input";
import { shrink } from "../repairs/photo-slots";

const MAX = 8 * 1024 * 1024;

export function EvidenceFiles({ saved = 0 }: { saved?: number }) {
  const id = useId();
  const input = useRef<HTMLInputElement | null>(null);
  const [names, setNames] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pick = async (files: FileList | null) => {
    if (!files?.length || !input.current) return;
    setError(null);
    setBusy(true);
    try {
      const dt = new DataTransfer();
      for (const f of Array.from(files)) {
        let out: File = f;
        if (f.type.startsWith("image/")) {
          const { blob } = await shrink(f);
          out = new File(
            [blob],
            f.name.replace(/\.[^.]+$/, "") +
              (blob.type === "image/webp" ? ".webp" : ".jpg"),
            { type: blob.type },
          );
        } else if (f.type !== "application/pdf")
          throw new Error(`${f.name}: 사진이나 PDF만 붙입니다`);
        if (out.size > MAX) throw new Error(`${f.name}: 8MB가 넘습니다`);
        dt.items.add(out);
      }
      input.current.files = dt.files;
      setNames(Array.from(dt.files).map((f) => f.name));
    } catch (e) {
      input.current.value = "";
      setNames([]);
      setError(e instanceof Error ? e.message : "파일을 붙이지 못했습니다");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Shell id={id} helpKey="exp.files">
      <div id={id} className="flex flex-wrap items-center gap-2 text-sm">
        <input
          ref={input}
          type="file"
          data-assist="upload"
          name="files"
          accept="image/*,application/pdf"
          multiple
          className="hidden"
          onChange={(e) => pick(e.currentTarget.files)}
        />
        <button
          type="button"
          disabled={busy}
          onClick={() => input.current?.click()}
          className="rounded border border-dashed border-[var(--line-strong)] px-3 py-2 hover:bg-[var(--accent-soft)] disabled:opacity-50"
        >
          {busy
            ? "줄이는 중…"
            : names.length
              ? "다시 고르기"
              : "+ 증빙 사진·PDF 붙이기"}
        </button>
        {saved > 0 && (
          <span className="text-xs text-[var(--muted)]">
            저장된 파일 {saved}개
          </span>
        )}
        {names.length > 0 && (
          <span className="w-full text-xs text-[var(--accent)]">
            붙임: {names.join(", ")} (저장하면 올라갑니다)
          </span>
        )}
        {error && (
          <span className="w-full text-xs text-[var(--danger)]">{error}</span>
        )}
      </div>
    </Shell>
  );
}
