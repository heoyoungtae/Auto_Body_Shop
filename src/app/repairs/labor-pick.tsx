"use client";
// 견적 줄 '기준표에서 고르기': 공임 기준표 항목을 고르면 구분·작업내용·표준 시간·공임 금액을 채운다(다시 치지 않게).
// 덴트(시간) 항목은 가산 계수(알루미늄·접근 어려움 등)를 체크하면 시간에 곱한다.
import { useRef, useState } from "react";
import { CheckGroup, SelectField } from "../_input";

export type PickItem = { code: string; label: string; name: string; cat: string; minutes: number | null; won: number; hiddenOnly?: boolean };
export type PickCoef = { code: string; name: string; pct: number };

const setValue = (el: HTMLInputElement | HTMLSelectElement | null, v: string) => {
  if (!el) return;
  Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), "value")?.set?.call(el, v);
  el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
};

export function LaborPick({ items, coefs, rate, current }: { items: PickItem[]; coefs: PickCoef[]; rate: number; current?: string | null }) {
  const root = useRef<HTMLDivElement>(null);
  const [code, setCode] = useState(current ?? "");
  const [adj, setAdj] = useState<string[]>([]);
  const item = items.find((i) => i.code === code);
  const dentHours = item?.cat === "dent" && item.minutes != null;

  const fill = (it: PickItem | undefined, chosen: string[]) => {
    const form = root.current?.closest("form");
    if (!form || !it) return;
    const q = <T extends Element>(sel: string) => form.querySelector<T>(sel);
    const num = (name: string, v: number | null) => {
      const raw = q<HTMLInputElement>(`input[name="${name}"]`);
      const shown = raw?.dataset.rawFor ? (document.getElementById(raw.dataset.rawFor) as HTMLInputElement | null) : null;
      setValue(shown, v == null ? "" : v.toLocaleString("ko-KR"));
    };
    setValue(q<HTMLSelectElement>('select[name="category"]'), it.cat);
    let minutes = it.minutes;
    const names = [it.name];
    if (minutes != null && it.cat === "dent") {
      for (const c of coefs.filter((x) => chosen.includes(x.code))) {
        minutes = Math.round((minutes * c.pct) / 100);
        names.push(`${c.name} 가산`);
      }
    }
    setValue(q<HTMLInputElement>('input[name="name"]'), names.join(" · "));
    num("laborMinutes", minutes);
    num("laborWon", minutes != null ? Math.round(((minutes / 60) * rate) / 10) * 10 : it.won);
  };

  return (
    <div
      ref={root}
      className="space-y-2 rounded-md border border-dashed border-[var(--line-strong)] p-3"
      onChange={(e) => {
        const t = e.target as HTMLInputElement | HTMLSelectElement;
        if (t.name === "laborCode") {
          const it = items.find((i) => i.code === t.value);
          setCode(t.value);
          setAdj([]);
          fill(it, []);
        } else if (t.name === "dentAdj") {
          const form = root.current?.closest("form");
          const chosen = form ? new FormData(form).getAll("dentAdj").map(String) : [];
          setAdj(chosen);
          fill(item, chosen);
        }
      }}
    >
      <SelectField help="est.laborPick" name="laborCode" defaultValue={current ?? ""} placeholder="고르지 않음(직접 적기)" options={items.map((i) => ({ value: i.code, label: i.label }))} />
      {dentHours && coefs.length > 0 && <CheckGroup key={code} help="est.dentAdj" name="dentAdj" defaultChecked={adj} options={coefs.map((c) => ({ value: c.code, label: `${c.name} ×${c.pct / 100}` }))} />}
    </div>
  );
}
