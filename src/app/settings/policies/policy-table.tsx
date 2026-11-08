"use client";
// 정책값 목록: 이름·조항·설명으로 바로 찾기. 설명은 칸마다 한 줄씩 보인다.
import Link from "next/link";
import { useState } from "react";

type Row = { key: string; label: string; unit: string; clause: string; value: number; defaultValue: number; scheduled: { effectiveFrom: string; value: number }[]; help: string };

export function PolicyTable({ rows, owner }: { rows: Row[]; owner: boolean }) {
  const [q, setQ] = useState("");
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const shown = rows.filter((r) => words.every((w) => `${r.label} ${r.clause} ${r.help} ${r.unit}`.toLowerCase().includes(w)));
  return (
    <div>
      <label className="mb-3 block text-sm">
        <span className="sr-only">정책값 찾기</span>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="찾기: 이름·조항·설명 (예: 견적, 8.4, 알림)"
          className="h-11 w-full rounded-md border border-[var(--line-strong)] bg-[var(--surface)] px-3"
        />
      </label>
      {shown.length === 0 && <p className="text-sm text-[var(--muted)]">&lsquo;{q}&rsquo;에 맞는 정책값이 없습니다.</p>}
      <ul className="divide-y divide-[var(--line)] text-sm">
        {shown.map((r) => (
          <li key={r.key} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 py-2.5">
            <div className="min-w-0 flex-1">
              <div className="font-medium">
                {r.label} <span className="text-xs font-normal text-[var(--muted)]">부록 D {r.clause}</span>
              </div>
              <p className="text-xs text-[var(--muted)]">{r.help}</p>
            </div>
            <div className="text-right">
              <div>
                <b className="tabular-nums">{r.value.toLocaleString("ko-KR")}</b> {r.unit}
                {r.value !== r.defaultValue && (
                  <span className="ml-1 rounded bg-[var(--accent-soft)] px-1.5 py-0.5 text-xs text-[var(--accent)]" title={`표준서 제안값 ${r.defaultValue.toLocaleString("ko-KR")}`}>
                    변경됨
                  </span>
                )}
              </div>
              {r.scheduled.map((p, i) => (
                <div key={i} className="text-xs text-[var(--warn)]">
                  {p.effectiveFrom}부터 {p.value.toLocaleString("ko-KR")} (시행 예정)
                </div>
              ))}
              <div className="mt-0.5 flex justify-end gap-3 text-xs">
                <Link href={`/settings/policies?key=${encodeURIComponent(r.key)}`} className="text-[var(--accent)]">
                  {owner ? "바꾸기·이력" : "설명·이력"}
                </Link>
                <Link href={`/approvals/new?policy=${encodeURIComponent(r.key)}`} className="text-[var(--accent)]">
                  개정 요청
                </Link>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
