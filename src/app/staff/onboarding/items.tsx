// 오리엔테이션 항목 목록(점검표 화면과 명부 화면이 같이 씀)
import Link from "next/link";
import type { OnboardItem } from "@/modules/staff/onboarding";
import { Badge } from "../../_ui";

export function OnboardingItems({ items, today }: { items: OnboardItem[]; today: string }) {
  return (
    <ol className="space-y-1.5 text-sm">
      {items.map((i) => (
        <li key={i.key} className="flex items-start gap-2">
          <span aria-hidden className={i.done ? "text-[var(--ok)]" : i.due < today ? "text-[var(--danger)]" : "text-[var(--muted)]"}>
            {i.done ? "✓" : "○"}
          </span>
          <span className="flex-1">
            {i.done ? (
              i.label
            ) : (
              <Link href={i.href} className="text-[var(--accent)]">
                {i.label}
              </Link>
            )}
            <span className="block text-xs text-[var(--muted)]">
              {i.who} · {i.due}까지{i.detail ? ` · ${i.detail}` : ""}
            </span>
          </span>
          {!i.done && i.due < today && <Badge tone="danger">늦음</Badge>}
        </li>
      ))}
    </ol>
  );
}
