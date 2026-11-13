"use client";
// 엑셀·CSV 파일 고르기 칸(입력도우미 Shell 안). 은행·카드사·홈택스가 준 원본 그대로 받는다
import { useId, useState } from "react";
import { Shell } from "../../_input";

export function SheetFile() {
  const id = useId();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <Shell id={id} helpKey="bank.file" required error={error}>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <input
          id={id}
          type="file"
          data-assist="upload"
          name="file"
          required
          accept=".xlsx,.xls,.csv,.txt,.htm,.html,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
          onChange={(e) => {
            const f = e.currentTarget.files?.[0];
            setError(null);
            if (f && f.size > 15 * 1024 * 1024) {
              setError("15MB 까지입니다. 기간을 나눠 내려받아 주세요");
              e.currentTarget.value = "";
              setName("");
              return;
            }
            if (f && /\.pdf$/i.test(f.name)) {
              setError("PDF 는 읽지 못합니다. 은행·카드사 화면에서 '엑셀'로 받아 주세요");
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
