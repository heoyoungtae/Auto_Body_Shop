"use client";
// 화학물질 칸(등록·고치기 같이 씀). 분류를 고르면 9.3 표의 보호구와 인화성, 같은 분류의 지난 보관 장소를 채운다
import { useState } from "react";
import {
  CHEM_CATEGORIES,
  FLAMMABLE_CATEGORIES,
  PPE,
  PPE_BY_CATEGORY,
} from "@/modules/safety/rules";
import {
  CheckGroup,
  DateField,
  RadioRow,
  SelectField,
  TextAreaField,
  TextField,
} from "../_input";

type C = {
  name: string;
  maker: string | null;
  category: string;
  hazards: string | null;
  monthlyUse: string | null;
  location: string | null;
  ppe: string[];
  flammable: boolean;
  msdsRevisedOn: string | null;
  trainedOn: string | null;
  note: string | null;
};

export function ChemicalFields({
  c,
  locations,
}: {
  c?: C;
  locations: Record<string, string>;
}) {
  const [cat, setCat] = useState(c?.category ?? "");
  const [loc, setLoc] = useState(c?.location ?? "");
  const [locFrom, setLocFrom] = useState<string | undefined>();
  const [flam, setFlam] = useState(c ? (c.flammable ? "1" : "0") : "");
  const pick = (v: string) => {
    setCat(v);
    if (c) return;
    if (locations[v] && !loc) {
      setLoc(locations[v]);
      setLocFrom(`같은 분류(${v})의 지난 등록`);
    }
    setFlam(FLAMMABLE_CATEGORIES.includes(v) ? "1" : "0");
  };
  const warnLoc = flam === "1" && loc && !/보관함|위험물/.test(loc);
  return (
    <>
      <TextField help="chem.name" name="name" required defaultValue={c?.name} />
      <TextField help="chem.maker" name="maker" defaultValue={c?.maker ?? ""} />
      <div
        onChange={(e) => pick((e.target as unknown as HTMLSelectElement).value)}
      >
        <SelectField
          help="chem.category"
          name="category"
          required
          defaultValue={c?.category ?? ""}
          placeholder="분류 고르기"
          options={CHEM_CATEGORIES.map((x) => ({ value: x, label: x }))}
        />
      </div>
      <TextField
        help="chem.hazards"
        name="hazards"
        defaultValue={c?.hazards ?? ""}
      />
      <TextField
        help="chem.monthlyUse"
        name="monthlyUse"
        defaultValue={c?.monthlyUse ?? ""}
      />
      <TextField
        help="chem.location"
        name="location"
        required
        value={loc}
        onChange={(e) => setLoc(e.currentTarget.value)}
        from={locFrom}
      />
      <div
        className="md:col-span-2"
        key={`f-${cat}`}
        onChange={(e) => setFlam((e.target as HTMLInputElement).value)}
      >
        <RadioRow
          help="chem.flammable"
          name="flammable"
          required
          defaultValue={flam || undefined}
          options={[
            { value: "1", label: "인화성", tone: "danger" },
            { value: "0", label: "인화성 아님" },
          ]}
        />
      </div>
      {warnLoc && (
        <p className="rounded-md border border-[var(--warn)] bg-[var(--warn-soft)] px-3 py-2 text-sm md:col-span-2">
          ⚠ 인화성 물질은 위험물 보관함(환기·접지)에 둡니다. 보관 장소에 '위험물
          보관함'을 적어야 저장됩니다.
        </p>
      )}
      <div className="md:col-span-2" key={`p-${c ? "edit" : cat}`}>
        <CheckGroup
          help="chem.ppe"
          name="ppe"
          options={PPE.map((p) => ({ value: p, label: p }))}
          defaultChecked={c?.ppe ?? PPE_BY_CATEGORY[cat] ?? []}
        />
      </div>
      <DateField
        help="chem.msdsRevisedOn"
        name="msdsRevisedOn"
        defaultValue={c?.msdsRevisedOn ?? ""}
        quick={[]}
      />
      <DateField
        help="chem.trainedOn"
        name="trainedOn"
        defaultValue={c?.trainedOn ?? ""}
        quick={["today"]}
      />
      <div className="md:col-span-2">
        <TextAreaField
          help="chem.note"
          name="note"
          rows={2}
          defaultValue={c?.note ?? ""}
        />
      </div>
    </>
  );
}
