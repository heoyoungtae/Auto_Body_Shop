"use client";
// 보증 신청 사진: 찍거나 골라서 5장까지. 보내기 전에 이 화면에서 줄여(긴 변 1600px) 같은 칸에 다시 넣는다(통신 절약)
import { useRef, useState } from "react";
import { Button } from "../../../_ui";
import { shrink } from "../../../repairs/photo-slots";

export function ClaimPhotos({ max = 5 }: { max?: number }) {
  const input = useRef<HTMLInputElement>(null);
  const [previews, setPreviews] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pick = async (files: FileList | null) => {
    if (!files?.length || !input.current) return;
    setError(null);
    setBusy(true);
    try {
      const dt = new DataTransfer();
      const urls: string[] = [];
      for (const f of Array.from(files).slice(0, max)) {
        const { blob } = await shrink(f);
        const out = new File([blob], `photo.${blob.type === "image/webp" ? "webp" : "jpg"}`, { type: blob.type });
        dt.items.add(out);
        urls.push(URL.createObjectURL(out));
      }
      input.current.files = dt.files;
      setPreviews(urls);
      if (files.length > max) setError(`사진은 ${max}장까지라 앞의 ${max}장만 넣었습니다`);
    } catch {
      setError("사진을 읽지 못했습니다. 다른 사진을 골라 주세요");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="text-sm">
      <p className="font-medium">사진(선택, {max}장까지)</p>
      <input ref={input} type="file" name="photo" accept="image/*" multiple className="hidden" data-assist="upload" onChange={(e) => pick(e.currentTarget.files)} />
      <Button type="button" variant="secondary" className="mt-1" disabled={busy} onClick={() => input.current?.click()}>
        {busy ? "줄이는 중…" : previews.length ? "사진 다시 고르기" : "사진 찍기·고르기"}
      </Button>
      {error && <p className="mt-1 text-xs text-[var(--danger)]">{error}</p>}
      {previews.length > 0 && (
        <ul className="mt-2 grid grid-cols-5 gap-1">
          {previews.map((u) => (
            <li key={u}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={u} alt="고른 사진" className="aspect-square w-full rounded object-cover" />
            </li>
          ))}
        </ul>
      )}
      <p className="mt-1 text-xs text-[var(--muted)]">이상한 곳을 가까이 한 장, 차 전체가 보이게 한 장 찍어 주시면 판정이 빨라집니다.</p>
    </div>
  );
}
