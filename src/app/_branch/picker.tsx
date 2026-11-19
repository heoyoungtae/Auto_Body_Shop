"use client";
// 지금 지점 표시·바꾸기(대표 결정 2026-11-19). 지점이 둘 이상이고 고를 수 있는 지점이 둘 이상일 때만 보인다.
// 밖에서 원격으로 일할 때 다른 지점 서류에 잘못 넣지 않도록 지금 지점을 늘 보여 준다.
import { usePathname, useSearchParams } from "next/navigation";
import { setBranchAction } from "./actions";

export function BranchPicker({ branches, current, view, allBranches }: { branches: { id: string; name: string }[]; current: string; view: string | null; allBranches: boolean }) {
  const path = usePathname();
  const sp = useSearchParams();
  const back = `${path}${sp.size ? `?${sp.toString()}` : ""}`;
  const label = view ? (branches.find((b) => b.id === view)?.name ?? "지점") : "전체 지점";
  return (
    <details className="relative">
      <summary
        className="flex h-9 list-none items-center gap-1 rounded-md border border-[var(--line-strong)] px-2 text-sm font-semibold hover:bg-[var(--surface-2)] [&::-webkit-details-marker]:hidden"
        title="지금 일하는 지점. 새 서류는 이 지점으로 들어갑니다. 눌러서 바꿉니다"
        aria-label={`지금 지점: ${label}. 바꾸기`}
      >
        <span aria-hidden>📍</span>
        {label}
      </summary>
      <div className="absolute left-0 z-40 mt-1 w-56 rounded-lg border border-[var(--line)] bg-[var(--surface)] p-1 shadow-[var(--shadow-lg)]">
        <p className="px-3 py-1.5 text-xs text-[var(--muted)]">새 서류는 고른 지점으로 들어갑니다. 어디서 접속해도 같습니다.</p>
        {allBranches && (
          <form action={setBranchAction}>
            <input type="hidden" name="back" value={back} />
            <input type="hidden" name="branch" value="" />
            <button className={`w-full rounded-md px-3 py-2.5 text-left hover:bg-[var(--surface-2)] ${view === null ? "font-semibold text-[var(--accent)]" : ""}`}>전체 지점 보기</button>
          </form>
        )}
        {branches.map((b) => (
          <form key={b.id} action={setBranchAction}>
            <input type="hidden" name="back" value={back} />
            <input type="hidden" name="branch" value={b.id} />
            <button className={`w-full rounded-md px-3 py-2.5 text-left hover:bg-[var(--surface-2)] ${view === b.id ? "font-semibold text-[var(--accent)]" : ""}`}>
              {b.name}
              {view === null && b.id === current && <span className="ml-1 text-xs text-[var(--muted)]">(새 서류)</span>}
            </button>
          </form>
        ))}
      </div>
    </details>
  );
}
