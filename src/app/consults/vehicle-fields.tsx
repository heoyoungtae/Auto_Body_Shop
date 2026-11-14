"use client";
// 차량 칸: 차대번호를 적으면 제조사·연식을 채우고, 제조사를 고르면 그 회사 차종을 목록으로 보여 주고,
// 차종을 고르면 세대 목록(코드·생산 연도)과 이 정비소에서 쓴 트림·색상 코드를 추천한다.
// 차종·연식이 정해지면 세대를 고르고, 세대와 연식이 맞지 않으면 알려 준다(저장은 막지 않음).
// 비어 있는 칸만 채운다(사람이 적은 값은 건드리지 않음).
import { useEffect, useRef, useState } from "react";
import { COMMON_TRIMS, generationFor, generationsOf, genLabel, VEHICLE_OPTIONS, yearMismatch } from "@/modules/customer/generations";
import { decodeVin, MAKER_NAMES, MAKERS, makerOf } from "@/modules/customer/vehicles";
import { BODY_TYPES, bodyGuess } from "@/modules/repair/body-map";
import { CheckGroup, SelectField, TextField } from "../_input";

export type VehicleValues = {
  plateNo?: string;
  vin?: string | null;
  maker?: string | null;
  model?: string | null;
  generation?: string | null;
  trim?: string | null;
  year?: number | null;
  colorCode?: string | null;
  options?: string[] | null;
  bodyType?: string | null;
};
export type VehicleHints = { colors: Record<string, string[]>; trims: Record<string, string[]> };

function setField(form: HTMLFormElement, name: string, value: string) {
  const el = form.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement | null;
  if (!el || el.value) return false;
  Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), "value")?.set?.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
}
const val = (form: HTMLFormElement, name: string) => ((form.elements.namedItem(name) as HTMLInputElement | null)?.value ?? "").trim();

export function VehicleFields({ v, from, hints = { colors: {}, trims: {} } }: { v?: VehicleValues; from?: string; hints?: VehicleHints }) {
  const box = useRef<HTMLDivElement>(null);
  const [maker, setMaker] = useState(v?.maker ?? "");
  const [model, setModel] = useState(v?.model ?? "");
  const [gen, setGen] = useState(v?.generation ?? "");
  const [year, setYear] = useState(v?.year ? String(v.year) : "");
  const [note, setNote] = useState<string | null>(null);
  const tag = (x: unknown) => (x ? from : undefined);

  useEffect(() => {
    const form = box.current?.closest("form");
    if (!form) return;
    const read = () =>
      setTimeout(() => {
        setMaker(val(form, "maker"));
        setModel(val(form, "model"));
        setGen(val(form, "generation"));
        setYear(val(form, "year"));
      }, 0);
    form.addEventListener("assist:restored", read);
    return () => form.removeEventListener("assist:restored", read);
  }, []);

  /** 차종·연식이 정해졌고 세대 칸이 비었으면 세대를 고른다 */
  const pickGen = (form: HTMLFormElement) => {
    const x = generationFor(val(form, "model"), Number(val(form, "year")) || null);
    if (x && setField(form, "generation", x.code)) {
      setGen(x.code);
      return x.code;
    }
    return null;
  };

  const onChange = (e: React.FormEvent<HTMLDivElement>) => {
    const t = e.target as unknown as HTMLInputElement;
    const form = t.form;
    if (!form) return;
    if (t.name === "maker") setMaker(t.value);
    if (t.name === "generation") setGen(t.value.trim());
    if (t.name === "year") {
      setYear(t.value);
      pickGen(form);
    }
    if (t.name === "model") {
      setModel(t.value);
      const m = makerOf(t.value);
      if (m && setField(form, "maker", m)) setMaker(m);
      pickGen(form);
    }
    if (t.name === "vin") {
      const d = decodeVin(t.value);
      if (!d) return setNote(t.value.trim().length >= 17 ? "차대번호 형식이 맞지 않습니다(영문·숫자 17자리, I·O·Q 없음)" : null);
      const filled: string[] = [];
      if (d.maker && setField(form, "maker", d.maker)) {
        setMaker(d.maker);
        filled.push(`제조사 ${d.maker}`);
      }
      if (d.year && setField(form, "year", String(d.year))) {
        setYear(String(d.year));
        filled.push(`연식 ${d.year}`);
      }
      const g = pickGen(form);
      if (g) filled.push(`세대 ${g}`);
      setNote(filled.length ? `차대번호에서 ${filled.join(", ")}을(를) 채웠습니다` : d.year ? `차대번호 연식: ${d.year}` : null);
    }
  };

  const models = (maker && MAKERS[maker]) || MAKER_NAMES.flatMap((k) => MAKERS[k]);
  const gens = generationsOf(model);
  const warn = yearMismatch(model, gen, Number(year) || null);
  const own = hints.trims[model] ?? [];
  const common = (COMMON_TRIMS[maker] ?? []).filter((t) => !own.includes(t));
  const trimList = [...own.map((t) => ({ value: t, label: `${model}에서 쓴 트림` })), ...common.map((t) => ({ value: t, label: `${maker} 흔한 트림(모델마다 다를 수 있음)` }))];
  const colorList = hints.colors[model] ?? [];

  return (
    <div ref={box} onInput={onChange} onChange={onChange} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <TextField help="veh.plate" name="plateNo" defaultValue={v?.plateNo} from={tag(v?.plateNo)} autoComplete="off" />
        <div className="xl:col-span-2">
          <TextField help="veh.vin" name="vin" defaultValue={v?.vin ?? undefined} from={tag(v?.vin)} autoComplete="off" />
          {note && <p className="mt-1 text-xs text-[var(--accent)]">{note}</p>}
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <SelectField help="veh.maker" name="maker" defaultValue={v?.maker ?? ""} placeholder="고르기" options={MAKER_NAMES.map((m) => ({ value: m, label: m }))} from={tag(v?.maker)} />
        <TextField help="veh.model" name="model" defaultValue={v?.model ?? undefined} from={tag(v?.model)} suggestions={models.map((m) => ({ value: m }))} autoComplete="off" />
        <TextField
          help="veh.generation"
          name="generation"
          defaultValue={v?.generation ?? undefined}
          from={tag(v?.generation)}
          suggestions={gens.map((x) => ({ value: x.code, label: genLabel(x) }))}
          autoComplete="off"
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <div>
          <TextField help="veh.year" name="year" inputMode="numeric" maxLength={4} defaultValue={v?.year ? String(v.year) : undefined} from={tag(v?.year)} />
          {warn && <p className="mt-1 text-xs text-[var(--warn)]">⚠ {warn}</p>}
        </div>
        <TextField help="veh.trim" name="trim" defaultValue={v?.trim ?? undefined} from={tag(v?.trim)} suggestions={trimList} autoComplete="off" />
        <TextField help="veh.color" name="colorCode" defaultValue={v?.colorCode ?? undefined} from={tag(v?.colorCode)} suggestions={colorList.map((c) => ({ value: c, label: `${model}에서 쓴 코드` }))} autoComplete="off" />
        <SelectField
          help="veh.body"
          name="bodyType"
          defaultValue={v?.bodyType ?? ""}
          from={tag(v?.bodyType)}
          placeholder={`차종 이름으로 짐작(${BODY_TYPES[bodyGuess(model) ?? "sedan"]}${bodyGuess(model) ? "" : " — 모름"})`}
          options={Object.entries(BODY_TYPES).map(([value, label]) => ({ value, label }))}
        />
      </div>
      <input type="hidden" name="optionsShown" value="1" />
      <CheckGroup help="veh.options" name="options" options={Object.entries(VEHICLE_OPTIONS).map(([value, label]) => ({ value, label }))} defaultChecked={v?.options ?? []} />
    </div>
  );
}
