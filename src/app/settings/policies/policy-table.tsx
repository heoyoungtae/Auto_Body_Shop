"use client";
// 정책값 목록: 이름·조항·설명으로 바로 찾기. 설명은 칸마다 한 줄씩 보인다.
import Link from "next/link";
import { useState } from "react";
import type { PolicyKey } from "@/modules/platform/policy";
import { HelpButton } from "../../_help-drawer";

type Row = { key: string; label: string; unit: string; clause: string; value: number; defaultValue: number; scheduled: { effectiveFrom: string; value: number }[]; help: string; group: string; legal: { via: string; article: string; href: string } | null; cand: boolean };

/** 분류 탭을 고르면 그 분류만, 찾기 칸에 적으면 전체에서 찾는다 */
export function PolicyTable({ rows, owner, group }: { rows: Row[]; owner: boolean; group: string | null }) {
  const [q, setQ] = useState("");
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const shown = rows.filter((r) => (words.length ? words.every((w) => `${r.label} ${r.clause} ${r.help} ${r.unit} ${r.legal?.article ?? ""}`.toLowerCase().includes(w)) : !group || r.group === group));
  return (
    <div>
      <label className="mb-3 block text-sm">
        <span className="sr-only">정책값 찾기</span>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="찾기: 이름·조항·설명·근거 법령 (예: 견적, 8.4, 접대비, 소득세법)"
          className="h-11 w-full rounded-md border border-[var(--line-strong)] bg-[var(--surface)] px-3 text-base"
        />
      </label>
      {shown.length === 0 && <p className="text-sm text-[var(--muted)]">&lsquo;{q}&rsquo;에 맞는 정책값이 없습니다.</p>}
      <div aria-hidden className="hidden border-b border-[var(--line)] pb-1.5 text-xs text-[var(--muted)] lg:grid lg:grid-cols-[minmax(11rem,17rem)_9.5rem_minmax(0,1fr)_7rem] lg:gap-x-4">
        <span>이름·조항</span>
        <span>지금 값</span>
        <span>설명</span>
        <span className="text-right">바꾸기</span>
      </div>
      <ul className="divide-y divide-[var(--line)] text-sm">
        {shown.map((r) => (
          <li key={r.key} className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4 gap-y-1 py-2.5 lg:grid-cols-[minmax(11rem,17rem)_9.5rem_minmax(0,1fr)_7rem]">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-1.5 font-medium">
                {r.label} <HelpButton topic={{ kind: "policy", id: r.key as PolicyKey, title: r.label, note: `부록 D ${r.clause} · 표준서 제안 ${r.defaultValue.toLocaleString("ko-KR")} ${r.unit}` }} name={r.label} />
                <span className="text-xs font-normal whitespace-nowrap text-[var(--muted)]">부록 D {r.clause}</span>
                {r.legal && <span className="rounded bg-[var(--accent-soft)] px-1.5 py-0.5 text-xs font-normal text-[var(--accent)]">{r.legal.via === "notice" ? "법정(고시)" : r.legal.via === "auto" ? "법정(자동)" : "법정"}</span>}
                {r.cand && <span className="rounded bg-[var(--danger-soft,#fde8e8)] px-1.5 py-0.5 text-xs font-normal text-[var(--danger)]">새 값 후보</span>}
              </div>
              {r.legal && (
                <a href={r.legal.href} target="_blank" rel="noreferrer" className="text-xs text-[var(--accent)]">
                  {r.legal.article}
                </a>
              )}
            </div>
            <div className="text-right lg:text-left">
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
            </div>
            <p className="col-span-2 text-xs text-[var(--muted)] lg:col-span-1">{r.help}</p>
            <div className="col-span-2 flex justify-end gap-3 text-xs lg:col-span-1 lg:flex-col lg:items-end lg:gap-1">
              <Link href={`/settings/policies?key=${encodeURIComponent(r.key)}`} className="text-[var(--accent)]">
                {owner ? "바꾸기·이력" : "설명·이력"}
              </Link>
              <Link href={`/approvals/new?policy=${encodeURIComponent(r.key)}`} className="text-[var(--accent)]">
                개정 요청
              </Link>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
