"use client";
// 상대(보낸 곳·받는 곳) 칸: 이름을 목록에서 고르면 구분과(공문이면) 주소가 저절로 채워진다
import { useRef } from "react";
import { PARTY_KINDS } from "@/modules/quality/corr-rules";
import { SelectField, TextField } from "../_input";

export type PartyHint = { name: string; kind: string; addr?: string };

export function PartyFields({ hints, dir, party = "", kind = "other", addr = "", from }: { hints: PartyHint[]; dir: "in" | "out"; party?: string; kind?: string; addr?: string; from?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const fill = (name: string) => {
    const h = hints.find((x) => x.name === name.trim());
    const form = box.current?.closest("form");
    if (!h || !form) return;
    const k = form.elements.namedItem("partyKind");
    if (k instanceof HTMLSelectElement) k.value = h.kind;
    const a = form.elements.namedItem("partyAddr");
    if (a instanceof HTMLInputElement && !a.value && h.addr) a.value = h.addr;
  };
  return (
    <div ref={box} className="contents" onChange={(e) => (e.target as HTMLInputElement).name === "party" && fill((e.target as HTMLInputElement).value)}>
      <TextField help={dir === "in" ? "corr.partyIn" : "corr.partyOut"} name="party" required defaultValue={party} from={from} suggestions={hints.map((h) => ({ value: h.name, label: PARTY_KINDS[h.kind as keyof typeof PARTY_KINDS] }))} />
      <SelectField help="corr.partyKind" name="partyKind" defaultValue={kind} options={Object.entries(PARTY_KINDS).map(([value, label]) => ({ value, label }))} />
      {dir === "out" && <TextField help="corr.partyAddr" name="partyAddr" defaultValue={addr} />}
    </div>
  );
}
