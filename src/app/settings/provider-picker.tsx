"use client";
// 공급사 고르기: 고른 공급사의 설명·연결 키 칸·준비 순서만 보여 준다(문자 대행사·기프티콘 공급사 공용).
import { useState } from "react";
import type { FieldHelpKey } from "@/modules/help/fields";
import { CheckGroup, SelectField, TextField } from "../_input";

type Field = { key: string; label: string; secret?: boolean; value: string; saved: boolean };
type Step = { id: string; title: string; detail: string; link?: string };
export type ProviderView = { id: string; label: string; summary: string; site?: string; fields: Field[]; guide: Step[] };

export function ProviderPicker({
  providers,
  current,
  help,
  credHelp,
  checkHelp,
  checked,
}: {
  providers: ProviderView[];
  current: string;
  help: FieldHelpKey;
  credHelp: FieldHelpKey;
  checkHelp: FieldHelpKey;
  checked: Record<string, boolean>;
}) {
  const [sel, setSel] = useState(current);
  return (
    <div className="space-y-4">
      <div onChange={(e) => setSel((e.target as unknown as HTMLSelectElement).value)}>
        <SelectField help={help} name="provider" required defaultValue={current} options={providers.map((p) => ({ value: p.id, label: p.label }))} />
      </div>
      {providers.map((p) => (
        <div key={p.id} hidden={p.id !== sel} className="space-y-4">
          <p className="text-sm text-[var(--muted)]">
            {p.summary}{" "}
            {p.site && (
              <a href={p.site} target="_blank" rel="noreferrer" className="text-[var(--accent)]">
                {p.site.replace("https://", "")} ↗
              </a>
            )}
          </p>
          {p.fields.length > 0 && (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {p.fields.map((f) => (
                <TextField
                  key={f.key}
                  help={credHelp}
                  label={f.label}
                  name={`f.${p.id}.${f.key}`}
                  type={f.secret ? "password" : "text"}
                  autoComplete="off"
                  spellCheck={false}
                  defaultValue={f.value}
                  required={p.id === sel && !(f.secret && f.saved)}
                  placeholder={f.secret && f.saved ? "저장됨 · 바꿀 때만 입력" : ""}
                />
              ))}
            </div>
          )}
          {p.guide.length > 0 && (
            <div className="rounded-md border border-[var(--line)] bg-[var(--surface-2)] p-3">
              <ol className="list-decimal space-y-1.5 pl-5 text-sm">
                {p.guide.map((g) => (
                  <li key={g.id}>
                    <b>{g.title}</b>
                    {checked[g.id] && p.id === current && <span className="ml-1 text-xs text-[var(--ok)]">✓ 완료</span>}
                    <span className="block text-xs text-[var(--muted)]">
                      {g.detail}{" "}
                      {g.link && (
                        <a href={g.link} target="_blank" rel="noreferrer" className="text-[var(--accent)]">
                          바로가기 ↗
                        </a>
                      )}
                    </span>
                  </li>
                ))}
              </ol>
              {p.id === sel && (
                <div className="mt-3">
                  <CheckGroup help={checkHelp} name="check" options={p.guide.map((g) => ({ value: g.id, label: g.title }))} defaultChecked={p.id === current ? Object.keys(checked).filter((k) => checked[k]) : []} />
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
