"use client";
// 전결 구간 편집: 칸을 바꾸는 즉시 순서·역할 서열을 검사하고, 미리 보기 금액으로 누가 승인하는지 보여 준다.
import { useState } from "react";
import { NumberField, SelectField } from "../../_input";
import { koMoney } from "../../_format";

type Band = { upTo: number | null; role: string };
const RANK = ["advisor", "technician", "quality", "safety", "accounting", "plant_manager", "owner"];

export function BandEditor({ bands, unit, roles }: { bands: Band[]; unit: string; roles: { value: string; label: string }[] }) {
  const [rows, setRows] = useState<Band[]>(() => [0, 1, 2, 3].map((i) => bands[i] ?? { upTo: null, role: "" }));
  const [test, setTest] = useState("");
  const label = (r: string) => roles.find((x) => x.value === r)?.label ?? r;
  const used = rows.filter((r) => r.role);
  const problems: string[] = [];
  used.forEach((b, i) => {
    const last = i === used.length - 1;
    if (last && b.upTo != null) problems.push(`마지막 구간(${label(b.role)})은 상한을 비워 '그 이상'으로 둡니다`);
    if (!last && b.upTo == null) problems.push(`${i + 1}번째 구간에 상한을 적어 주세요`);
    if (i > 0 && !last && b.upTo != null && used[i - 1].upTo != null && b.upTo <= (used[i - 1].upTo as number)) problems.push(`${i + 1}번째 상한은 앞 구간보다 커야 합니다`);
    if (i > 0 && RANK.indexOf(b.role) <= RANK.indexOf(used[i - 1].role)) problems.push(`${label(b.role)}: 아래 구간보다 높은 역할이어야 합니다`);
  });
  if (!used.length) problems.push("적어도 한 구간은 있어야 합니다");
  const amount = Number(test.replace(/[^\d]/g, ""));
  const hit = test && !problems.length ? (used.find((b) => b.upTo == null || amount <= b.upTo) ?? used[used.length - 1]) : null;
  const fmt = (n: number) => (unit === "%" ? `${n}%` : `${n.toLocaleString("ko-KR")}원`);
  return (
    <div className="space-y-2">
      {rows.map((b, i) => (
        <div key={i} className="grid grid-cols-2 items-start gap-2">
          <NumberFieldWatch i={i} unit={unit} value={b.upTo} onChange={(v) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, upTo: v } : r)))} />
          <div onChange={(e) => {
            const t = e.target as unknown as HTMLSelectElement;
            setRows((rs) => rs.map((r, j) => (j === i ? { ...r, role: t.value } : r)));
          }}>
            <SelectField help="delegation.role" name={`role${i}`} label={`구간 ${i + 1} 최종 승인`} defaultValue={b.role} options={roles} placeholder="(안 씀)" />
          </div>
        </div>
      ))}
      <div className={`rounded-md border px-3 py-2 text-sm ${problems.length ? "border-[var(--warn)]/50 bg-[var(--warn-soft)]" : "border-[var(--ok)]/40 bg-[var(--ok-soft)]"}`} role="status">
        {problems.length ? (
          <ul className="list-disc pl-5 text-[var(--warn)]">
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        ) : (
          <p className="text-[var(--ok)]">
            ✓ 이대로 저장됩니다:{" "}
            {used.map((b, i) => `${b.upTo == null ? (i === 0 ? "전부" : "그 이상") : `${fmt(b.upTo)} 이하`} → ${label(b.role)}`).join(", ")}
          </p>
        )}
      </div>
      <label className="block text-sm">
        <span className="mb-1.5 block font-medium">미리 보기 {unit === "%" ? "할인율" : "금액"}</span>
        <input
          data-assist="preview"
          inputMode="numeric"
          value={test}
          onChange={(e) => {
            const d = e.target.value.replace(/[^\d]/g, "");
            setTest(d === "" ? "" : Number(d).toLocaleString("ko-KR"));
          }}
          placeholder={unit === "%" ? "예: 7" : "예: 1,500,000"}
          className="h-11 w-full rounded-md border border-[var(--line-strong)] bg-[var(--surface)] px-3 text-right tabular-nums"
        />
        <span className="mt-1 block text-xs text-[var(--muted)]">
          {hit ? (
            <>
              {unit === "%" ? `${amount}%` : koMoney(amount)} → <b className="text-[var(--fg)]">{label(hit.role)}</b> 최종 승인 (기안자가 {label(hit.role)} 본인이면 한 단계 위)
            </>
          ) : (
            "금액을 넣으면 누가 최종 승인하는지 보여 줍니다"
          )}
        </span>
      </label>
    </div>
  );
}

function NumberFieldWatch({ i, unit, value, onChange }: { i: number; unit: string; value: number | null; onChange: (v: number | null) => void }) {
  return (
    <div
      onInput={(e) => {
        const t = e.target as HTMLInputElement;
        if (t.name) return;
        const d = t.value.replace(/[^\d]/g, "");
        onChange(d === "" ? null : Number(d));
      }}
    >
      <NumberField help="delegation.upTo" name={`upTo${i}`} label={`구간 ${i + 1} 상한`} unit={unit === "%" ? "% 이하" : "원 이하"} defaultValue={value} />
    </div>
  );
}
