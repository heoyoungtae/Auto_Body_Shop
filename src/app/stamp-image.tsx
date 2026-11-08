"use client";
// 직인·서명 그림 올리기: 사진·스캔한 그림에서 흰 바탕을 지워(투명) 글자 위에 겹쳐 찍히게 하고,
// 빈 가장자리를 잘라 PNG 로 숨은 칸에 넣는다. 서버는 PNG 만 받는다.
import { useEffect, useRef, useState } from "react";

/** 투명하지 않은 부분만 남기고 잘라 낸 캔버스 */
export function trimCanvas(src: HTMLCanvasElement, pad = 6): HTMLCanvasElement | null {
  const ctx = src.getContext("2d")!;
  const { width: w, height: h } = src;
  const px = ctx.getImageData(0, 0, w, h).data;
  let x0 = w,
    y0 = h,
    x1 = -1,
    y1 = -1;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (px[(y * w + x) * 4 + 3] > 16) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  if (x1 < 0) return null;
  x0 = Math.max(0, x0 - pad);
  y0 = Math.max(0, y0 - pad);
  x1 = Math.min(w - 1, x1 + pad);
  y1 = Math.min(h - 1, y1 + pad);
  const out = document.createElement("canvas");
  out.width = x1 - x0 + 1;
  out.height = y1 - y0 + 1;
  out.getContext("2d")!.drawImage(src, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
  return out;
}

/** 그림 파일 → 흰 바탕 투명 → 잘라 내기 → 가장 긴 변 maxSide 로 줄인 PNG data URL */
export async function prepareStamp(file: File, maxSide = 600): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, fail) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = fail;
      i.src = url;
    });
    const k = Math.min(1, (maxSide * 2) / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(img.width * k));
    c.height = Math.max(1, Math.round(img.height * k));
    const ctx = c.getContext("2d")!;
    ctx.drawImage(img, 0, 0, c.width, c.height);
    const d = ctx.getImageData(0, 0, c.width, c.height);
    const p = d.data;
    for (let i = 0; i < p.length; i += 4) {
      // 밝은(흰·연회색) 바탕은 지우고, 그 경계는 반투명으로 부드럽게
      const light = Math.min(p[i], p[i + 1], p[i + 2]);
      if (light > 225) p[i + 3] = 0;
      else if (light > 190) p[i + 3] = Math.round(p[i + 3] * ((225 - light) / 35));
    }
    ctx.putImageData(d, 0, 0);
    const t = trimCanvas(c) ?? c;
    const s = Math.min(1, maxSide / Math.max(t.width, t.height));
    const o = document.createElement("canvas");
    o.width = Math.max(1, Math.round(t.width * s));
    o.height = Math.max(1, Math.round(t.height * s));
    o.getContext("2d")!.drawImage(t, 0, 0, o.width, o.height);
    return o.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** 그림 올리기 단추 + 미리 보기. 고른 그림은 숨은 칸 name 에 PNG data URL 로 들어간다 */
export function StampImageInput({ name, label = "그림 파일 고르기", hint }: { name: string; label?: string; hint?: string }) {
  const file = useRef<HTMLInputElement>(null);
  const hidden = useRef<HTMLInputElement>(null);
  const [data, setData] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const changed = () => queueMicrotask(() => hidden.current?.form?.dispatchEvent(new Event("change", { bubbles: true })));
  return (
    <div>
      <input ref={hidden} type="hidden" name={name} value={data} />
      <input
        ref={file}
        type="file"
        data-assist="upload"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={async (e) => {
          const f = e.currentTarget.files?.[0];
          e.currentTarget.value = "";
          if (!f) return;
          setErr(null);
          try {
            setData(await prepareStamp(f));
            changed();
          } catch {
            setErr("그림을 읽지 못했습니다. PNG·JPG 파일로 다시 골라 주세요");
          }
        }}
      />
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => file.current?.click()} className="h-10 rounded-md border border-[var(--line-strong)] px-3 text-sm hover:bg-[var(--accent-soft)]">
          {label}
        </button>
        {data && (
          <button
            type="button"
            onClick={() => {
              setData("");
              changed();
            }}
            className="text-xs text-[var(--accent)] hover:underline"
          >
            고른 그림 빼기
          </button>
        )}
      </div>
      {data ? (
        <div className="mt-2 inline-block rounded border border-[var(--line)] bg-[repeating-conic-gradient(#eee_0_25%,#fff_0_50%)] bg-[length:16px_16px] p-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={data} alt="올릴 그림 미리 보기" className="max-h-28 max-w-[16rem] object-contain" />
          <p className="mt-1 text-xs text-[var(--muted)]">흰 바탕은 지웠습니다(바둑판 무늬가 투명한 곳). 저장해야 반영됩니다.</p>
        </div>
      ) : (
        hint && <p className="mt-1 text-xs text-[var(--muted)]">{hint}</p>
      )}
      {err && (
        <p role="alert" className="mt-1 text-xs font-medium text-[var(--danger)]">
          {err}
        </p>
      )}
    </div>
  );
}

/** 저장 전 점검: 그림 칸(숨은 칸)이 모두 비었으면 저장 단추 위에 알려 준다 */
export function NeedImageNote({ fields, msg }: { fields: string[]; msg: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [empty, setEmpty] = useState(true);
  useEffect(() => {
    const form = ref.current?.closest("form");
    if (!form) return;
    const check = () => setEmpty(fields.every((f) => !String(new FormData(form).get(f) ?? "")));
    // 숨은 칸 값은 그림 부품이 다시 그려진 뒤에 바뀌므로 한 박자 늦게 본다
    const later = () => setTimeout(check, 50);
    check();
    form.addEventListener("change", later);
    return () => form.removeEventListener("change", later);
  }, [fields]);
  return (
    <p ref={ref} className={empty ? "rounded-md border border-[var(--warn)] bg-[var(--warn-soft)] px-3 py-2 text-sm" : "hidden"}>
      {msg}
    </p>
  );
}
