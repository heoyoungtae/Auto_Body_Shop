// 수리 건 진행 단계 막대(UI 개선 4). 지금 어느 단계인지와 다음에 할 일 하나를 보여 준다.
import Link from "next/link";
import type { RoStep } from "@/modules/repair/steps";
import { buttonClass } from "../_ui";

// PC(마우스·넓은 화면)에서는 화면 위에 붙어 있어 아래로 내려도 수리 건 번호·차·다음 단추가 보인다(대표 결정 2026-11-23 PC 화면 개선).
export function RoSteps({ steps, next, who }: { steps: RoStep[]; next?: { label: string; href: string }; who?: string }) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-3 rounded-lg border border-[var(--line)] bg-[var(--surface)] p-3 shadow-[var(--shadow)] pointer-fine:lg:sticky pointer-fine:lg:top-[3.75rem] pointer-fine:lg:z-10 print:static">
      {who && <span className="hidden shrink-0 text-sm font-semibold pointer-fine:lg:inline">{who}</span>}
      <ol aria-label="진행 단계" className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto text-xs sm:text-sm">
        {steps.map((s, i) => (
          <li key={s.key} className="flex shrink-0 items-center gap-1" aria-current={s.state === "now" ? "step" : undefined}>
            {i > 0 && <span aria-hidden className={`h-px w-3 sm:w-5 ${s.state === "todo" ? "bg-[var(--line-strong)]" : "bg-[var(--accent)]"}`} />}
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 ${
                s.state === "now"
                  ? "bg-[var(--accent)] font-semibold text-[var(--accent-fg)]"
                  : s.state === "done"
                    ? "bg-[var(--accent-soft)] text-[var(--accent)]"
                    : "text-[var(--muted)]"
              }`}
            >
              {s.state === "done" && <span aria-label="끝남">✓</span>}
              {s.label}
            </span>
          </li>
        ))}
      </ol>
      {next && (
        <Link href={next.href} className={buttonClass("primary")}>
          다음: {next.label} →
        </Link>
      )}
    </div>
  );
}
