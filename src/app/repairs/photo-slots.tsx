"use client";
// 입고 사진(F-02-01 첨부): 자리마다 찍기·올리기. 휴대폰에서는 바로 카메라가 열린다.
// 올리기 전에 이 화면에서 긴 변 1600px WEBP(안 되면 JPG)로 줄여 보낸다(통신·저장 공간 절약).
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { DIRECTION_SLOTS, MULTI_SLOTS, PHOTO_SLOT_LABEL, PHOTO_SLOTS, type PhotoSlot } from "@/modules/repair/rules";
import { removePhotoAction, uploadPhotoAction } from "./actions";

export type PhotoView = { id: string; slot: PhotoSlot; path: string };

async function shrink(file: File): Promise<{ blob: Blob; width: number; height: number }> {
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const width = Math.round(bmp.width * scale);
  const height = Math.round(bmp.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, width, height);
  const as = (type: string) => new Promise<Blob | null>((ok) => canvas.toBlob(ok, type, 0.82));
  let blob = await as("image/webp");
  if (!blob || blob.type !== "image/webp") blob = await as("image/jpeg"); // 사파리 등 WEBP 로 못 만드는 브라우저
  if (!blob) throw new Error("사진을 줄이지 못했습니다");
  return { blob, width, height };
}

export function PhotoSlots({ roId, photos, readOnly = false, minPhotos }: { roId: string; photos: PhotoView[]; readOnly?: boolean; minPhotos: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputs = useRef<Record<string, HTMLInputElement | null>>({});
  const bySlot = (s: PhotoSlot) => photos.filter((p) => p.slot === s);
  const dirDone = DIRECTION_SLOTS.filter((s) => bySlot(s).length).length;
  const need = Math.min(minPhotos, DIRECTION_SLOTS.length);

  const upload = async (slot: PhotoSlot, files: FileList | null) => {
    if (!files?.length) return;
    setError(null);
    setBusy(slot);
    try {
      for (const f of Array.from(files)) {
        const { blob, width, height } = await shrink(f);
        const fd = new FormData();
        fd.set("id", roId);
        fd.set("slot", slot);
        fd.set("width", String(width));
        fd.set("height", String(height));
        fd.set("file", blob, `photo.${blob.type === "image/webp" ? "webp" : "jpg"}`);
        const r = await uploadPhotoAction(fd);
        if (!r.ok) throw new Error(r.error);
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "올리지 못했습니다");
    } finally {
      setBusy(null);
      const el = inputs.current[slot];
      if (el) el.value = "";
    }
  };
  const remove = async (p: PhotoView) => {
    if (!confirm(`${PHOTO_SLOT_LABEL[p.slot]} 사진을 지울까요?`)) return;
    const fd = new FormData();
    fd.set("id", roId);
    fd.set("photoId", p.id);
    const r = await removePhotoAction(fd);
    if (!r.ok) setError(r.error);
    router.refresh();
  };

  return (
    <div id="photos" tabIndex={-1}>
      <p className={`mb-3 text-sm ${dirDone >= need && bySlot("dash").length ? "text-[var(--ok)]" : "text-[var(--warn)]"}`}>
        8방향 {dirDone}/{need}장 · 계기판 {bySlot("dash").length ? "있음" : "없음"}
        {!readOnly && <span className="text-[var(--muted)]"> — 정면에서 시작해 왼쪽으로 한 바퀴 돌며 찍습니다. 밝은 곳에서, 차 전체가 들어오게.</span>}
      </p>
      {error && (
        <p role="alert" className="mb-2 text-sm font-medium text-[var(--danger)]">
          {error}
        </p>
      )}
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6">
        {PHOTO_SLOTS.map((slot) => {
          const list = bySlot(slot);
          const multi = MULTI_SLOTS.includes(slot);
          const required = DIRECTION_SLOTS.includes(slot) || slot === "dash";
          return (
            <li key={slot} className={`rounded-md border p-1.5 text-xs ${list.length ? "border-[var(--line)]" : required ? "border-dashed border-[var(--warn)]" : "border-dashed border-[var(--line)]"}`}>
              <p className="mb-1 flex items-center gap-1 font-medium">
                {PHOTO_SLOT_LABEL[slot]}
                {required && !list.length && <span className="text-[var(--warn)]">필수</span>}
                {list.length > 1 && <span className="text-[var(--muted)]">{list.length}장</span>}
              </p>
              {list.length ? (
                <div className="grid grid-cols-1 gap-1">
                  {(multi ? list : list.slice(-1)).map((p) => (
                    <div key={p.id} className="relative">
                      <a href={`/api/files/${p.path}`} target="_blank" rel="noreferrer">
                        <img src={`/api/files/${p.path}`} alt={PHOTO_SLOT_LABEL[slot]} className="aspect-[4/3] w-full rounded object-cover" loading="lazy" />
                      </a>
                      {!readOnly && (
                        <button type="button" onClick={() => remove(p)} className="absolute top-1 right-1 rounded bg-black/60 px-1.5 py-0.5 text-white" aria-label={`${PHOTO_SLOT_LABEL[slot]} 사진 지우기`}>
                          ✕
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid aspect-[4/3] place-items-center rounded bg-[var(--bg)] text-[var(--muted)]">사진 없음</div>
              )}
              {!readOnly && (
                <>
                  <input
                    type="file"
                    data-assist="upload"
                    ref={(el) => {
                      inputs.current[slot] = el;
                    }}
                    accept="image/*"
                    capture="environment"
                    multiple={multi}
                    className="hidden"
                    onChange={(e) => upload(slot, e.currentTarget.files)}
                  />
                  <button type="button" disabled={busy != null} onClick={() => inputs.current[slot]?.click()} className="mt-1 min-h-9 w-full rounded border border-[var(--line-strong)] px-2 hover:bg-[var(--accent-soft)] disabled:opacity-50">
                    {busy === slot ? "올리는 중…" : list.length ? (multi ? "더 찍기" : "다시 찍기") : "찍기·올리기"}
                  </button>
                </>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
