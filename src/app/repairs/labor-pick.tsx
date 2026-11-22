"use client";
// 견적 줄 '기준표에서 고르기': 공임 기준표 항목을 고르면 구분·작업내용·표준 시간·공임 금액을 채운다(다시 치지 않게).
import { useRef } from "react";
import { SelectField } from "../_input";

export type PickItem = { code: string; label: string; name: string; cat: string; minutes: number | null; won: number; hiddenOnly?: boolean };

const setValue = (el: HTMLInputElement | HTMLSelectElement | null, v: string) => {
  if (!el) return;
  Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), "value")?.set?.call(el, v);
  el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
};

export function LaborPick({ items, rate, current }: { items: PickItem[]; rate: number; current?: string | null }) {
  const root = useRef<HTMLDivElement>(null);

  const fill = (it: PickItem | undefined) => {
    const form = root.current?.closest("form");
    if (!form || !it) return;
    const q = <T extends Element>(sel: string) => form.querySelector<T>(sel);
    const num = (name: string, v: number | null) => {
      const raw = q<HTMLInputElement>(`input[name="${name}"]`);
      const shown = raw?.dataset.rawFor ? (document.getElementById(raw.dataset.rawFor) as HTMLInputElement | null) : null;
      setValue(shown, v == null ? "" : v.toLocaleString("ko-KR"));
    };
    setValue(q<HTMLSelectElement>('select[name="category"]'), it.cat);
    const minutes = it.minutes;
    setValue(q<HTMLInputElement>('input[name="name"]'), it.name);
    num("laborMinutes", minutes);
    num("laborWon", minutes != null ? Math.round(((minutes / 60) * rate) / 10) * 10 : it.won);
  };

  return (
    <div
      ref={root}
      className="space-y-2 rounded-md border border-dashed border-[var(--line-strong)] p-3"
      onChange={(e) => {
        const t = e.target as HTMLInputElement | HTMLSelectElement;
        if (t.name === "laborCode") fill(items.find((i) => i.code === t.value));
      }}
    >
      <SelectField help="est.laborPick" name="laborCode" defaultValue={current ?? ""} placeholder="고르지 않음(직접 적기)" options={items.map((i) => ({ value: i.code, label: i.label }))} />
    </div>
  );
}
