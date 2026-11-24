"use client";
// 입고 사진(F-02-01 첨부): 자리마다 '찍기'(카메라·PC 웹캠)와 '올리기'(사진첩·PC 폴더) 둘 다 된다.
// 올리기 전에 이 화면에서 긴 변 1600px WEBP(안 되면 JPG)로 줄여 보낸다(통신·저장 공간 절약).
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { DIRECTION_SLOTS, MULTI_SLOTS, PHOTO_SLOT_LABEL, PHOTO_SLOTS, type PhotoSlot } from "@/modules/repair/rules";
import { PhotoPick } from "../photo-pick";
import { removePhotoAction, uploadPhotoAction } from "./actions";

export type PhotoView = { id: string; slot: PhotoSlot; path: string };

export async function shrink(file: File): Promise<{ blob: Blob; width: number; height: number }> {
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

/**
 * 간소화 '입고 사진 한 번에 올리기'(simple.photo_bulk): 여러 장을 고르면 찍은 시각 순서대로
 * 비어 있는 8방향(정면부터 왼쪽으로 한 바퀴)·계기판 자리에 넣고, 남는 사진은 근접 사진으로 넣는다.
 */
export function bulkPlan(files: { lastModified: number }[], filled: PhotoSlot[]): PhotoSlot[] {
  const empty = [...DIRECTION_SLOTS, "dash" as PhotoSlot].filter((s) => !filled.includes(s));
  return files.map((_, i) => empty[i] ?? "close");
}

export function PhotoSlots({ roId, photos, readOnly = false, minPhotos, bulk = false }: { roId: string; photos: PhotoView[]; readOnly?: boolean; minPhotos: number; bulk?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const bySlot = (s: PhotoSlot) => photos.filter((p) => p.slot === s);
  const dirDone = DIRECTION_SLOTS.filter((s) => bySlot(s).length).length;
  const need = Math.min(minPhotos, DIRECTION_SLOTS.length);

  const upload = async (slot: PhotoSlot, files: File[]) => {
    if (!files.length) return;
    // 한 장 자리(방향·계기판)에 여러 장을 고르면 마지막 한 장만 남으므로 첫 장만 올린다
    if (!MULTI_SLOTS.includes(slot)) files = files.slice(0, 1);
    setError(null);
    setBusy(slot);
    try {
      for (const f of files) {
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
    }
  };
  const taken = useRef<PhotoSlot[]>([]);
  const uploadBulk = async (files: File[]) => {
    if (!files.length) return;
    const sorted = [...files].sort((a, b) => a.lastModified - b.lastModified);
    // 웹캠·카메라로 한 장씩 이어 찍을 때 화면이 새로 그려지기 전에도 앞 사진이 들어간 자리를 건너뛴다
    const plan = bulkPlan(sorted, [...PHOTO_SLOTS.filter((s) => bySlot(s).length), ...taken.current]);
    plan.forEach((p) => taken.current.push(p));
    setError(null);
    setBusy("bulk");
    try {
      for (let i = 0; i < sorted.length; i++) {
        const { blob, width, height } = await shrink(sorted[i]);
        const fd = new FormData();
        fd.set("id", roId);
        fd.set("slot", plan[i]);
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
    }
  };
  const remove = async (p: PhotoView) => {
    if (!confirm(`${PHOTO_SLOT_LABEL[p.slot]} 사진을 지울까요?`)) return;
    const fd = new FormData();
    fd.set("id", roId);
    fd.set("photoId", p.id);
    const r = await removePhotoAction(fd);
    if (!r.ok) setError(r.error);
    else taken.current = taken.current.filter((x) => x !== p.slot);
    router.refresh();
  };

  return (
    <div id="photos" tabIndex={-1}>
      <p className={`mb-3 text-sm ${dirDone >= need && bySlot("dash").length ? "text-[var(--ok)]" : "text-[var(--warn)]"}`}>
        8방향 {dirDone}/{need}장 · 계기판 {bySlot("dash").length ? "있음" : "없음"}
        {!readOnly && <span className="text-[var(--muted)]"> — 정면에서 시작해 왼쪽으로 한 바퀴 돌며 찍습니다. 밝은 곳에서, 차 전체가 들어오게.</span>}
      </p>
      {bulk && !readOnly && (
        <div className="mb-3 rounded-md border border-[var(--line)] bg-[var(--bg)] p-2 text-sm">
          <p className="mb-1.5 text-xs text-[var(--muted)]">정면부터 왼쪽으로 한 바퀴 돌며 8장, 마지막에 계기판을 찍은 뒤 한꺼번에 고르면 찍은 순서대로 빈 자리에 들어갑니다. 남는 사진은 근접 사진으로 들어갑니다. 잘못 들어간 사진은 ✕로 지우고 그 자리에서 다시 올립니다.</p>
          <PhotoPick multiple disabled={busy != null} busyLabel={busy === "bulk" ? "올리는 중…" : null} shootLabel="여러 장 찍기" onFiles={uploadBulk} />
        </div>
      )}
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
                <PhotoPick
                  multiple={multi}
                  disabled={busy != null}
                  busyLabel={busy === slot ? "올리는 중…" : null}
                  shootLabel={list.length ? (multi ? "더 찍기" : "다시 찍기") : "찍기"}
                  onFiles={(f) => upload(slot, f)}
                />
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
