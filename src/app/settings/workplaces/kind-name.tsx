"use client";
// 종류를 고르면 이름 칸에 그 종류의 이름을 추천한다(입력도우미). 이름이 비어 있을 때만 첫 추천을 넣어 준다.
import { useRef, useState } from "react";
import { SelectField, TextField } from "../../_input";

export function KindNameFields({
  kinds,
  suggest,
  defaultKind,
  defaultName,
}: {
  kinds: { value: string; label: string }[];
  suggest: Record<string, string[]>;
  defaultKind?: string;
  defaultName?: string;
}) {
  const [kind, setKind] = useState(defaultKind ?? "");
  const box = useRef<HTMLDivElement>(null);
  return (
    <div
      ref={box}
      className="space-y-3"
      onChange={(e) => {
        const el = e.target as unknown as HTMLSelectElement;
        if (el.name !== "kind") return;
        setKind(el.value);
        const name = box.current?.querySelector<HTMLInputElement>('input[name="name"]');
        const first = suggest[el.value]?.[0];
        if (name && !name.value.trim() && first) name.value = first;
      }}
    >
      <SelectField help="wp.kind" name="kind" required options={kinds} placeholder="고르세요" defaultValue={defaultKind} />
      <TextField help="wp.name" name="name" required defaultValue={defaultName} suggestions={(suggest[kind] ?? []).map((v) => ({ value: v }))} />
    </div>
  );
}
