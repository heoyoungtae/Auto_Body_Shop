"use client";
// 자금 전표 종류 고르기: 고르면 차변·대변 계정을 보여 주고, '기타'일 때만 계정을 직접 고른다
import { useState } from "react";
import { SelectField } from "../../_input";

type Opt = { value: string; label: string; dr: string; cr: string };
export function FundKindPicker({ kinds, accounts, defaultKind }: { kinds: Opt[]; accounts: { value: string; label: string }[]; defaultKind: string }) {
  const [kind, setKind] = useState(defaultKind);
  const k = kinds.find((x) => x.value === kind);
  const name = (c: string) => accounts.find((a) => a.value === c)?.label ?? c;
  return (
    <div className="contents" onChange={(e) => { const t = e.target as unknown as HTMLSelectElement; if (t.name === "kind") setKind(t.value); }}>
      <SelectField help="fund.kind" name="kind" required defaultValue={defaultKind} placeholder="고르세요" options={kinds.map((x) => ({ value: x.value, label: x.label }))} />
      {kind === "other" ? (
        <>
          <SelectField help="fund.drCode" name="drCode" required placeholder="고르세요" options={accounts} />
          <SelectField help="fund.crCode" name="crCode" required placeholder="고르세요" options={accounts} />
        </>
      ) : k ? (
        <p className="self-center text-sm text-[var(--muted)]">
          차변 <b>{name(k.dr)}</b> / 대변 <b>{name(k.cr)}</b>
        </p>
      ) : null}
    </div>
  );
}
