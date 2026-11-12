// 수리 건 진행 단계 막대(UI 개선 4). 지금 어느 단계인지와 다음에 할 일 하나를 보여 준다.
import Link from "next/link";
import type { RoStep } from "@/modules/repair/steps";
import { buttonClass } from "../_ui";

export function RoSteps({ steps, next }: { steps: RoStep[]; next?: { label: string; href: string } }) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-3 rounded-lg border border-[var(--line)] bg-[var(--surface)] p-3 shadow-[var(--shadow)]">
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
