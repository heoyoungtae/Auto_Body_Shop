"use client";
// 작업 사례 사진 가리기: 사진을 고르고 번호판·얼굴 위를 손가락(마우스)으로 끌어 네모를 그리면 그 자리를 검게 칠한 새 그림을 만들어 올린다.
// 새로 그린 그림(긴 변 1600px JPG)이라 원래 사진의 촬영 위치(GPS)·기기 정보가 따라가지 않는다. 원본 사진은 그대로 둔다.
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { uploadCasePhotoAction } from "../../actions";

type Side = "before" | "after";
type Rect = { x: number; y: number; w: number; h: number };
export type MaskSource = { path: string; side: Side };

const MAX = 1600;

async function loadBitmap(src: string | Blob) {
  const blob = typeof src === "string" ? await (await fetch(src)).blob() : src;
  return createImageBitmap(blob, { imageOrientation: "from-image" });
}

export function CaseMasker({ caseId, sources, full }: { caseId: string; sources: MaskSource[]; full: boolean }) {
  const router = useRouter();
  const canvas = useRef<HTMLCanvasElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [bmp, setBmp] = useState<ImageBitmap | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [side, setSide] = useState<Side>("before");
  const [rects, setRects] = useState<Rect[]>([]);
  const [drag, setDrag] = useState<Rect | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 그리기: 사진 + 가린 네모(검정) + 끄는 중인 네모(빨간 테두리)
  useEffect(() => {
    const c = canvas.current;
    if (!c || !bmp) return;
    const scale = Math.min(1, MAX / Math.max(bmp.width, bmp.height));
    c.width = Math.round(bmp.width * scale);
    c.height = Math.round(bmp.height * scale);
    const g = c.getContext("2d")!;
    g.drawImage(bmp, 0, 0, c.width, c.height);
    g.fillStyle = "#1f2937";
    for (const r of rects) g.fillRect(r.x, r.y, r.w, r.h);
    if (drag) {
      g.strokeStyle = "#d71f2b";
      g.lineWidth = Math.max(3, c.width / 300);
      g.strokeRect(drag.x, drag.y, drag.w, drag.h);
    }
  }, [bmp, rects, drag]);

  const open = async (src: string | Blob, s: Side, key: string) => {
    setError(null);
    try {
      setBmp(await loadBitmap(src));
      setPicked(key);
      setSide(s);
      setRects([]);
    } catch {
      setError("사진을 열지 못했습니다");
    }
  };

  const at = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = canvas.current!;
    const b = c.getBoundingClientRect();
    return { x: ((e.clientX - b.left) / b.width) * c.width, y: ((e.clientY - b.top) / b.height) * c.height };
  };
  const start = useRef<{ x: number; y: number } | null>(null);
  const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    start.current = at(e);
    setDrag({ ...start.current, w: 0, h: 0 });
  };
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!start.current) return;
    const p = at(e);
    const s = start.current;
    setDrag({ x: Math.min(s.x, p.x), y: Math.min(s.y, p.y), w: Math.abs(p.x - s.x), h: Math.abs(p.y - s.y) });
  };
  const up = () => {
    if (drag && drag.w > 8 && drag.h > 8) {
      // 가장자리가 비치지 않게 조금 넓혀 칠한다
      const pad = Math.max(4, Math.round(Math.min(drag.w, drag.h) * 0.08));
      setRects((r) => [...r, { x: drag.x - pad, y: drag.y - pad, w: drag.w + pad * 2, h: drag.h + pad * 2 }]);
    }
    start.current = null;
    setDrag(null);
  };

  const upload = async () => {
    const c = canvas.current;
    if (!c || !bmp) return;
    if (!rects.length && !confirm("가린 곳이 없습니다. 번호판·얼굴이 보이지 않는 사진이 맞나요?")) return;
    setBusy(true);
    setError(null);
    try {
      setDrag(null);
      const blob = await new Promise<Blob | null>((ok) => c.toBlob(ok, "image/jpeg", 0.85));
      if (!blob) throw new Error("그림을 만들지 못했습니다");
      const fd = new FormData();
      fd.set("id", caseId);
      fd.set("side", side);
      fd.set("width", String(c.width));
      fd.set("height", String(c.height));
      fd.set("file", blob, "case.jpg");
      const r = await uploadCasePhotoAction(fd);
      if (!r.ok) throw new Error(r.error);
      setBmp(null);
      setPicked(null);
      setRects([]);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "올리지 못했습니다");
    } finally {
      setBusy(false);
    }
  };

  const groups: [Side, string][] = [
    ["before", "수리 전(입고 사진)"],
    ["after", "수리 후(검사 사진)"],
  ];
  return (
    <div className="space-y-3">
      {error && (
        <p role="alert" className="text-sm font-medium text-[var(--danger)]">
          {error}
        </p>
      )}
      {groups.map(([s, label]) => {
        const list = sources.filter((x) => x.side === s);
        return (
          <div key={s}>
            <p className="mb-1 text-sm font-semibold">{label}</p>
            {!list.length ? (
              <p className="text-xs text-[var(--muted)]">이 수리 건에 사진이 없습니다. 아래 &lsquo;내 파일에서 고르기&rsquo;로 올릴 수 있습니다.</p>
            ) : (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {list.map((x) => (
                  <button key={x.path} type="button" onClick={() => open(`/api/files/${x.path}`, s, x.path)} className={`shrink-0 overflow-hidden rounded-md border-2 ${picked === x.path ? "border-[var(--accent)]" : "border-transparent"}`} title="이 사진으로 가리기 시작">
                    {/* eslint-disable-next-line @next/next/no-img-element -- 보관 사진 미리 보기 */}
                    <img src={`/api/files/${x.path}`} alt="" className="h-20 w-28 object-cover" loading="lazy" />
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
      <div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          data-assist="upload"
          className="hidden"
          onChange={(e) => {
            const f = e.currentTarget.files?.[0];
            if (f) void open(f, side, `file:${f.name}`);
            e.currentTarget.value = "";
          }}
        />
        <button type="button" onClick={() => fileRef.current?.click()} className="text-sm text-[var(--accent)] underline">
          내 파일에서 고르기
        </button>
      </div>

      {bmp && (
        <div className="space-y-2 rounded-lg border border-[var(--line)] p-3">
          <p className="text-sm">
            <b>번호판·얼굴·전화번호</b> 위를 끌어 네모를 그리면 검게 가려집니다. 여러 곳을 가릴 수 있습니다.
          </p>
          <canvas ref={canvas} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} className="w-full cursor-crosshair touch-none rounded-md bg-black" />
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span>올릴 자리:</span>
            {groups.map(([s, label]) => (
              <button key={s} type="button" onClick={() => setSide(s)} aria-pressed={side === s} className={`rounded-full border px-3 py-1 ${side === s ? "border-[var(--accent)] bg-[var(--accent-soft)] font-semibold" : "border-[var(--line)]"}`}>
                {label.split("(")[0]}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy || full} onClick={upload} className="inline-flex h-11 items-center rounded-md bg-[var(--accent)] px-4 text-sm font-medium text-[var(--accent-fg)] disabled:opacity-50">
              {busy ? "올리는 중…" : `가린 사진 올리기(${rects.length}곳 가림)`}
            </button>
            <button type="button" disabled={!rects.length} onClick={() => setRects((r) => r.slice(0, -1))} className="inline-flex h-11 items-center rounded-md border border-[var(--line-strong)] px-4 text-sm disabled:opacity-50">
              마지막 가림 지우기
            </button>
            <button
              type="button"
              onClick={() => {
                setBmp(null);
                setPicked(null);
              }}
              className="inline-flex h-11 items-center rounded-md border border-[var(--line-strong)] px-4 text-sm"
            >
              그만두기
            </button>
          </div>
          {full && <p className="text-xs text-[var(--warn)]">사진이 가득 찼습니다. 위에서 한 장을 빼고 올리세요.</p>}
        </div>
      )}
    </div>
  );
}
