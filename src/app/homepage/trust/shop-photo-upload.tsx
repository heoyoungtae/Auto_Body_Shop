"use client";
// 정비소 사진 올리기: 고른 사진을 이 화면에서 긴 변 1600px 로 새로 그려(촬영 위치 등 사진 정보 빠짐) 올린다
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { shrink } from "../../repairs/photo-slots";
import { uploadShopPhotoAction } from "../actions";

export function ShopPhotoUpload({ kinds, full }: { kinds: Record<string, string>; full: boolean }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState(Object.keys(kinds)[0]);
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    setError(null);
    try {
      for (const f of Array.from(files)) {
        const { blob, width, height } = await shrink(f);
        const fd = new FormData();
        fd.set("kind", kind);
        fd.set("caption", caption);
        fd.set("width", String(width));
        fd.set("height", String(height));
        fd.set("file", blob, `shop.${blob.type === "image/webp" ? "webp" : "jpg"}`);
        const r = await uploadShopPhotoAction(fd);
        if (!r.ok) throw new Error(r.error);
      }
      setCaption("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "올리지 못했습니다");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="사진 종류">
        {Object.entries(kinds).map(([k, label]) => (
          <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)} className={`rounded-full border px-3 py-1 text-sm ${kind === k ? "border-[var(--accent)] bg-[var(--accent-soft)] font-semibold" : "border-[var(--line)]"}`}>
            {label}
          </button>
        ))}
      </div>
      <input type="text" data-assist="preview" value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={60} placeholder="사진 설명(선택, 예: 도장 부스)" aria-label="사진 설명" className="h-11 w-full rounded-md border border-[var(--line-strong)] bg-[var(--surface)] px-3 text-sm" />
      <input ref={input} type="file" accept="image/*" multiple data-assist="upload" className="hidden" onChange={(e) => upload(e.currentTarget.files)} />
      <button type="button" disabled={busy || full} onClick={() => input.current?.click()} className="inline-flex h-11 items-center rounded-md bg-[var(--accent)] px-4 text-sm font-medium text-[var(--accent-fg)] disabled:opacity-50">
        {busy ? "올리는 중…" : "사진 고르기·올리기"}
      </button>
      {full && <p className="text-xs text-[var(--warn)]">사진이 가득 찼습니다. 한 장을 빼고 올리세요.</p>}
      {error && (
        <p role="alert" className="text-sm font-medium text-[var(--danger)]">
          {error}
        </p>
      )}
    </div>
  );
}
