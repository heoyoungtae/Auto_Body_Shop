"use client";
// 견적서 파일 고르기 칸(엑셀·CSV). 사진·PDF는 아직 읽지 못한다고 바로 알려 준다
import { useId, useState } from "react";
import { Shell } from "../../_input";

export function QuoteFile() {
  const id = useId();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <Shell id={id} helpKey="qt.file" error={error}>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <input
          id={id}
          type="file"
          data-assist="upload"
          name="file"
          accept=".xlsx,.xls,.csv,.txt,.htm,.html,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
          onChange={(e) => {
            const f = e.currentTarget.files?.[0];
            setError(null);
            const bad = f && (/\.(pdf|jpe?g|png|webp|heic|gif|bmp)$/i.test(f.name) ? "사진·PDF는 아직 읽지 못합니다. 위 '엑셀 양식'에 옮겨 적어 올리거나 표를 복사해 아래에 붙여 넣으세요" : f.size > 15 * 1024 * 1024 ? "15MB 까지입니다" : null);
            if (bad) {
              setError(bad);
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
