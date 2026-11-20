"use client";
// 협력업체 내보내기 파일(.json) 고르기
import { useId, useState } from "react";
import { Shell } from "../../_input";

export function TransferFile() {
  const id = useId();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <Shell id={id} helpKey="sup.transferFile" required error={error}>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <input
          id={id}
          type="file"
          data-assist="upload"
          name="file"
          required
          accept=".json,application/json"
          onChange={(e) => {
            const f = e.currentTarget.files?.[0];
            setError(null);
            if (f && !/\.json$/i.test(f.name)) {
              setError("'내보내기'로 받은 .json 파일을 골라 주세요");
              e.currentTarget.value = "";
              setName("");
              return;
            }
            setName(f?.name ?? "");
          }}
          className="block w-full max-w-md text-sm file:mr-3 file:rounded-md file:border file:border-[var(--line-strong)] file:bg-[var(--surface)] file:px-3 file:py-2"
        />
        {name && <span className="text-xs text-[var(--muted)]">{name}</span>}
      </div>
    </Shell>
  );
}
