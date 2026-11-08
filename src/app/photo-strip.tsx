"use client";
// 공정 사진: 휴대폰에서 바로 카메라가 열리고, 줄여서 올린다(입고 사진과 같은 방식)
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { shrink } from "./repairs/photo-slots";

type Act = (form: FormData) => Promise<{ ok: true } | { ok: false; error: string }>;

/** 사진 줄: fields 를 함께 보내 어느 기록의 사진인지 알린다(공정·검사 등) */
export function PhotoStrip({ fields, photos, editable, label, upload: uploadAction, remove: removeAction }: { fields: Record<string, string>; photos: string[]; editable: boolean; label: string; upload: Act; remove: Act }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement | null>(null);

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setError(null);
    setBusy(true);
    try {
      for (const f of Array.from(files)) {
        const { blob } = await shrink(f);
        const fd = new FormData();
        for (const [k, v] of Object.entries(fields)) fd.set(k, v);
        fd.set("file", blob, `photo.${blob.type === "image/webp" ? "webp" : "jpg"}`);
        const r = await uploadAction(fd);
        if (!r.ok) throw new Error(r.error);
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "올리지 못했습니다");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };
  const remove = async (path: string) => {
    if (!confirm("이 사진을 지울까요?")) return;
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) fd.set(k, v);
    fd.set("path", path);
    const r = await removeAction(fd);
    if (!r.ok) setError(r.error);
    router.refresh();
  };

  return (
    <div>
      {error && (
        <p role="alert" className="mb-1 text-sm font-medium text-[var(--danger)]">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {photos.map((p) => (
          <div key={p} className="relative">
            <a href={`/api/files/${p}`} target="_blank" rel="noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/files/${p}`} alt={`${label} 사진`} className="h-20 w-28 rounded object-cover" loading="lazy" />
            </a>
            {editable && (
              <button type="button" onClick={() => remove(p)} className="absolute top-1 right-1 rounded bg-black/60 px-1.5 py-0.5 text-xs text-white" aria-label="사진 지우기">
                ✕
              </button>
            )}
          </div>
        ))}
        {editable && (
          <>
            <input type="file" data-assist="upload" ref={input} accept="image/*" capture="environment" multiple className="hidden" onChange={(e) => upload(e.currentTarget.files)} />
            <button type="button" disabled={busy} onClick={() => input.current?.click()} className="grid h-20 w-28 place-items-center rounded border border-dashed border-[var(--line-strong)] text-xs hover:bg-[var(--accent-soft)] disabled:opacity-50">
              {busy ? "올리는 중…" : "+ 찍기·올리기"}
            </button>
          </>
        )}
        {!editable && !photos.length && <span className="text-xs text-[var(--muted)]">사진 없음</span>}
      </div>
    </div>
  );
}
