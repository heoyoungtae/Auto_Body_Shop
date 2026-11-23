"use client";
// 카드·배너 그림 고르기: 고른 그림을 바로 보여 주고, 형식·크기가 맞지 않으면 올리기 전에 알려 준다(입력도우미).
import { useState } from "react";
import { buttonClass } from "../../_ui";

const OK_TYPES = ["image/png", "image/jpeg", "image/webp"];

export function GiftImageUpload({ kind, advice }: { kind: string; advice: string }) {
  const [pick, setPick] = useState<{ url: string; name: string; w: number; h: number; problem: string } | null>(null);
  const onFile = (f: File | undefined) => {
    if (!f) return setPick(null);
    const url = URL.createObjectURL(f);
    const img = new Image();
    img.onload = () => {
      let problem = "";
      if (!OK_TYPES.includes(f.type)) problem = "PNG·JPG·WEBP 그림이 아닙니다.";
      else if (f.size > 3 * 1024 * 1024) problem = "3MB보다 큽니다. 그림 크기를 줄여 주세요.";
      setPick({ url, name: f.name, w: img.naturalWidth, h: img.naturalHeight, problem });
    };
    img.onerror = () => setPick({ url: "", name: f.name, w: 0, h: 0, problem: "그림을 읽지 못했습니다. PNG·JPG 파일을 골라 주세요." });
    img.src = url;
  };
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={`gift-file-${kind}`} className={`${buttonClass("secondary")} cursor-pointer`}>
          그림 파일 고르기
        </label>
        <input
          id={`gift-file-${kind}`}
          name="file"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          required
          data-assist="upload"
          className="sr-only"
          onChange={(e) => onFile(e.currentTarget.files?.[0])}
        />
        <button disabled={!pick || !!pick.problem} className={buttonClass("primary")}>
          올리기
        </button>
      </div>
      {pick && (
        <div className="flex items-center gap-3 rounded-md border border-[var(--line)] p-2 text-sm">
          {pick.url && (
            // eslint-disable-next-line @next/next/no-img-element -- 고른 그림 미리 보기
            <img src={pick.url} alt="고른 그림" className="max-h-16 max-w-40 rounded bg-[var(--surface-2)]" />
          )}
          <div>
            <p className="font-medium">
              {pick.name} {pick.w > 0 && <span className="text-[var(--muted)]">({pick.w}×{pick.h})</span>}
            </p>
            {pick.problem ? (
              <p className="text-[var(--danger)]">
                {pick.problem} 권장: {advice}
              </p>
            ) : (
              <p className="text-[var(--muted)]">&apos;올리기&apos;를 누르면 미리보기에 바로 쓰입니다.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
