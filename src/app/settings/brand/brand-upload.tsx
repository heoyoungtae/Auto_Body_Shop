"use client";
// 로고·아이콘 PNG 고르기: 고른 그림을 미리 보여 주고, 크기·모양이 칸에 맞는지 올리기 전에 알려 준다(입력도우미).
import { useState } from "react";
import { buttonClass } from "../../_ui";

type Rule = { label: string; shape: "square" | "wide"; minSide: number; advice: string };

export function BrandUpload({ kind, rule, dark }: { kind: string; rule: Rule; dark?: boolean }) {
  const [pick, setPick] = useState<{ url: string; name: string; w: number; h: number; problem: string } | null>(null);
  const onFile = (f: File | undefined) => {
    if (!f) return setPick(null);
    const url = URL.createObjectURL(f);
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      let problem = "";
      if (f.type !== "image/png") problem = "PNG 파일이 아닙니다. 그림을 PNG로 저장해 다시 골라 주세요.";
      else if (f.size > 5 * 1024 * 1024) problem = "5MB보다 큽니다. 그림 크기를 줄여 주세요.";
      else if (Math.min(w, h) < rule.minSide) problem = `짧은 변이 ${rule.minSide}px보다 작습니다.`;
      else if (rule.shape === "square" && Math.abs(w - h) > Math.max(2, Math.round(Math.max(w, h) * 0.02))) problem = "정사각형이 아닙니다.";
      else if (rule.shape === "wide" && w < h * 2) problem = "가로로 긴 그림이 아닙니다(가로가 세로의 2배 이상).";
      setPick({ url, name: f.name, w, h, problem });
    };
    img.onerror = () => setPick({ url: "", name: f.name, w: 0, h: 0, problem: "그림을 읽지 못했습니다. PNG 파일을 골라 주세요." });
    img.src = url;
  };
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={`file-${kind}`} className={`${buttonClass("secondary")} cursor-pointer`}>
          PNG 파일 고르기
        </label>
        <input
          id={`file-${kind}`}
          name="file"
          type="file"
          accept="image/png"
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
            <img src={pick.url} alt="고른 그림" className={`max-h-16 max-w-40 rounded ${dark ? "bg-[#0b1d4a]" : "bg-[var(--surface-2)]"}`} />
          )}
          <div>
            <p className="font-medium">
              {pick.name} {pick.w > 0 && <span className="text-[var(--muted)]">({pick.w}×{pick.h})</span>}
            </p>
            {pick.problem ? (
              <p className="text-[var(--danger)]">
                {pick.problem} 권장: {rule.advice}
              </p>
            ) : (
              <p className="text-[var(--muted)]">맞는 그림입니다. &apos;올리기&apos;를 누르면 바로 바뀝니다.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
