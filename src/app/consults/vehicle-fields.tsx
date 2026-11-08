"use client";
// 차량 칸: 차대번호를 적으면 제조사·연식을 채우고, 제조사를 고르면 그 회사 차종을 목록으로 보여 주고,
// 차종을 고르면 이 정비소에서 그 차종에 쓴 색상 코드를 추천한다. 비어 있는 칸만 채운다(사람이 적은 값은 건드리지 않음).
import { useEffect, useRef, useState } from "react";
import { decodeVin, MAKER_NAMES, MAKERS, makerOf } from "@/modules/customer/vehicles";
import { SelectField, TextField } from "../_input";

type V = { plateNo?: string; vin?: string | null; maker?: string | null; model?: string | null; year?: number | null; colorCode?: string | null };

function setField(form: HTMLFormElement, name: string, value: string) {
  const el = form.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement | null;
  if (!el || el.value) return false;
  Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), "value")?.set?.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
}

export function VehicleFields({ v, from, colors = {} }: { v?: V; from?: string; colors?: Record<string, string[]> }) {
  const box = useRef<HTMLDivElement>(null);
  const [maker, setMaker] = useState(v?.maker ?? "");
  const [model, setModel] = useState(v?.model ?? "");
  const [note, setNote] = useState<string | null>(null);
  const tag = (x: unknown) => (x ? from : undefined);

  useEffect(() => {
    const form = box.current?.closest("form");
    if (!form) return;
    const read = () =>
      setTimeout(() => {
        setMaker((form.elements.namedItem("maker") as HTMLSelectElement | null)?.value ?? "");
        setModel((form.elements.namedItem("model") as HTMLInputElement | null)?.value ?? "");
      }, 0);
    form.addEventListener("assist:restored", read);
    return () => form.removeEventListener("assist:restored", read);
  }, []);

  const onChange = (e: React.FormEvent<HTMLDivElement>) => {
    const t = e.target as unknown as HTMLInputElement;
    const form = t.form;
    if (!form) return;
    if (t.name === "maker") setMaker(t.value);
    if (t.name === "model") {
      setModel(t.value);
      const m = makerOf(t.value);
      if (m && setField(form, "maker", m)) setMaker(m);
    }
    if (t.name === "vin") {
      const d = decodeVin(t.value);
      if (!d) return setNote(t.value.trim().length >= 17 ? "차대번호 형식이 맞지 않습니다(영문·숫자 17자리, I·O·Q 없음)" : null);
      const filled: string[] = [];
      if (d.maker && setField(form, "maker", d.maker)) {
        setMaker(d.maker);
        filled.push(`제조사 ${d.maker}`);
      }
      if (d.year && setField(form, "year", String(d.year))) filled.push(`연식 ${d.year}`);
      setNote(filled.length ? `차대번호에서 ${filled.join(", ")}을(를) 채웠습니다` : d.year ? `차대번호 연식: ${d.year}` : null);
    }
  };

  const models = (maker && MAKERS[maker]) || MAKER_NAMES.flatMap((k) => MAKERS[k]);
  const colorList = colors[model] ?? [];

  return (
    <div ref={box} onInput={onChange} onChange={onChange} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <TextField help="veh.plate" name="plateNo" defaultValue={v?.plateNo} from={tag(v?.plateNo)} autoComplete="off" />
        <div className="xl:col-span-2">
          <TextField help="veh.vin" name="vin" defaultValue={v?.vin ?? undefined} from={tag(v?.vin)} autoComplete="off" />
          {note && <p className="mt-1 text-xs text-[var(--accent)]">{note}</p>}
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SelectField help="veh.maker" name="maker" defaultValue={v?.maker ?? ""} placeholder="고르기" options={MAKER_NAMES.map((m) => ({ value: m, label: m }))} from={tag(v?.maker)} />
        <TextField help="veh.model" name="model" defaultValue={v?.model ?? undefined} from={tag(v?.model)} suggestions={models.map((m) => ({ value: m }))} autoComplete="off" />
        <TextField help="veh.year" name="year" inputMode="numeric" maxLength={4} defaultValue={v?.year ? String(v.year) : undefined} from={tag(v?.year)} />
        <TextField help="veh.color" name="colorCode" defaultValue={v?.colorCode ?? undefined} from={tag(v?.colorCode)} suggestions={colorList.map((c) => ({ value: c, label: `${model}에서 쓴 코드` }))} autoComplete="off" />
      </div>
    </div>
  );
}
