"use client";
// 확인한 서류: 서류마다 체크 + 파일 붙이기(사진·PDF). 사진은 올리기 전에 줄이고, 파일을 붙이면 체크도 된다
import { useId, useRef, useState } from "react";
import { SUPPLIER_DOCS, type SupplierDoc } from "@/modules/purchase/rules";
import { Shell } from "../_input";
import { shrink } from "../repairs/photo-slots";

const MAX = 8 * 1024 * 1024;

function DocRow({ doc, checked, saved }: { doc: SupplierDoc; checked: boolean; saved: number }) {
  const input = useRef<HTMLInputElement | null>(null);
  const [on, setOn] = useState(checked);
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
          out = new File([blob], f.name.replace(/\.[^.]+$/, "") + (blob.type === "image/webp" ? ".webp" : ".jpg"), { type: blob.type });
        } else if (f.type !== "application/pdf") throw new Error(`${f.name}: 사진이나 PDF만 붙입니다`);
        if (out.size > MAX) throw new Error(`${f.name}: 8MB가 넘습니다`);
        dt.items.add(out);
      }
      input.current.files = dt.files;
      setNames(Array.from(dt.files).map((f) => f.name));
      setOn(true);
    } catch (e) {
      input.current.value = "";
      setNames([]);
      setError(e instanceof Error ? e.message : "파일을 붙이지 못했습니다");
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="flex flex-wrap items-center gap-2 rounded-md border border-[var(--line)] px-3 py-2 has-[:checked]:border-[var(--accent)] has-[:checked]:bg-[var(--accent-soft)]">
      <label className="flex min-w-56 flex-1 items-center gap-2 text-sm">
        <input type="checkbox" name="docs" value={doc} checked={on} onChange={(e) => setOn(e.currentTarget.checked)} className="h-4 w-4" />
        {SUPPLIER_DOCS[doc].label}
        {saved > 0 && <span className="text-xs text-[var(--muted)]">· 저장된 파일 {saved}개</span>}
      </label>
      <input ref={input} type="file" name={`file_${doc}`} accept="image/*,application/pdf" multiple className="hidden" onChange={(e) => pick(e.currentTarget.files)} />
      <button type="button" disabled={busy} onClick={() => input.current?.click()} className="rounded border border-dashed border-[var(--line-strong)] px-2 py-1 text-xs hover:bg-[var(--accent-soft)] disabled:opacity-50">
        {busy ? "줄이는 중…" : names.length ? "다시 고르기" : "+ 파일 붙이기"}
      </button>
      {names.length > 0 && <span className="w-full text-xs text-[var(--accent)]">붙임: {names.join(", ")} (저장하면 올라갑니다)</span>}
      {error && <span className="w-full text-xs text-[var(--danger)]">{error}</span>}
    </li>
  );
}

export function DocChecks({ checked = [], saved = {} }: { checked?: string[]; saved?: Record<string, number> }) {
  const id = useId();
  return (
    <div className="md:col-span-2">
      <Shell id={id} helpKey="sup.docs">
      <ul id={id} role="group" className="grid gap-2 lg:grid-cols-2">
        {(Object.keys(SUPPLIER_DOCS) as SupplierDoc[]).map((d) => (
          <DocRow key={d} doc={d} checked={checked.includes(d)} saved={saved[d] ?? 0} />
        ))}
      </ul>
      </Shell>
      <p className="mt-1 text-xs text-[var(--muted)]">받아서 확인한 것만 체크합니다. 사진(휴대폰으로 찍어도 됨)이나 PDF를 붙여 두면 업체 화면에서 다시 볼 수 있습니다. 통장 사본은 회계 담당·대표만 열어 봅니다.</p>
    </div>
  );
}
