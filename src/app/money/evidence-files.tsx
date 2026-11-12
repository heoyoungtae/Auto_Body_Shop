"use client";
// 지출 증빙 파일 붙이기(사진·PDF). 사진은 올리기 전에 줄인다
import { useId, useRef, useState } from "react";
import type { FieldHelpKey } from "@/modules/help/fields";
import { Shell } from "../_input";
import { shrink } from "../repairs/photo-slots";

const MAX = 8 * 1024 * 1024;

/** 사진·PDF 여러 개 붙이기. 지출 증빙 말고도(직원 서류·수리 이력) help·name·문구를 바꿔 쓴다 */
export function EvidenceFiles({ saved = 0, help = "exp.files", name = "files", pickLabel = "+ 증빙 사진·PDF 붙이기", multiple = true, video = false }: { saved?: number; help?: FieldHelpKey; name?: string; pickLabel?: string; multiple?: boolean; /** 짧은 MP4 영상(25MB)도 받기 — 교육 자료 */ video?: boolean }) {
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
        } else if (video && f.type === "video/mp4") {
          if (f.size > 25 * 1024 * 1024) throw new Error(`${f.name}: 영상은 25MB까지입니다. 긴 영상은 유튜브 '일부 공개' 링크로 거세요`);
        } else if (f.type !== "application/pdf")
          throw new Error(`${f.name}: 사진${video ? "·PDF·MP4 영상" : "이나 PDF"}만 붙입니다`);
        if (out.size > MAX && out.type !== "video/mp4") throw new Error(`${f.name}: 8MB가 넘습니다`);
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
    <Shell id={id} helpKey={help}>
      <div id={id} className="flex flex-wrap items-center gap-2 text-sm">
        <input
          ref={input}
          type="file"
          data-assist="upload"
          name={name}
          accept={video ? "image/*,application/pdf,video/mp4" : "image/*,application/pdf"}
          multiple={multiple}
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
              : pickLabel}
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
