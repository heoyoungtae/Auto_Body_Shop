// 내 차 수첩 화면 조각: 진행 단계 줄, 사진 묶음, 정비소 안내
import Link from "next/link";
import type { mySteps } from "@/modules/carbook/rules";
import type { shopCard } from "@/modules/carbook/service";

export function MySteps({ steps }: { steps: ReturnType<typeof mySteps> }) {
  return (
    <ol aria-label="진행 단계" className="flex flex-wrap items-center gap-y-1.5 gap-x-1 py-1 text-xs">
      {steps.map((s, i) => (
        <li key={s.key} className="flex shrink-0 items-center gap-1" aria-current={s.state === "now" ? "step" : undefined}>
          {i > 0 && <span aria-hidden className={`h-px w-3 ${s.state === "todo" ? "bg-[var(--line-strong)]" : "bg-[var(--accent)]"}`} />}
          <span className={`rounded-full px-2.5 py-1 ${s.state === "now" ? "bg-[var(--accent)] font-semibold text-[var(--accent-fg)]" : s.state === "done" ? "bg-[var(--accent-soft)] text-[var(--accent)]" : "text-[var(--muted)]"}`}>
            {s.state === "done" && <span aria-label="끝남">✓ </span>}
            {s.label}
          </span>
        </li>
      ))}
    </ol>
  );
}

export const fileUrl = (path: string) => `/api/my/file/${path}`;

export function PhotoGrid({ paths, label }: { paths: string[]; label: string }) {
  if (!paths.length) return null;
  return (
    <div>
      <p className="mb-1 text-sm font-medium">{label}</p>
      <ul className="grid grid-cols-3 gap-1.5">
        {paths.map((p, i) => (
          <li key={p}>
            <a href={fileUrl(p)} target="_blank" rel="noreferrer" className="block aspect-[4/3] overflow-hidden rounded-md bg-[var(--surface-2)]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={fileUrl(p)} alt={`${label} ${i + 1}`} loading="lazy" className="size-full object-cover" />
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ShopFooter({ shop }: { shop: Awaited<ReturnType<typeof shopCard>> }) {
  return (
    <div className="mt-6 space-y-1 border-t border-[var(--line)] pt-3 text-xs text-[var(--muted)]">
      <p className="font-medium text-[var(--fg)]">{shop.name}</p>
      {shop.phone && (
        <p>
          전화{" "}
          <a href={`tel:${shop.tel}`} className="text-[var(--accent)] underline">
            {shop.phone}
          </a>
        </p>
      )}
      {shop.address && <p>{shop.address}</p>}
      {shop.hours && <p>영업시간 {shop.hours}</p>}
    </div>
  );
}

/** 링크로 들어온 손님에게: 이번 수리만 보이니 모든 기록은 문자 인증 */
export function LinkOnlyNote({ next = "/my" }: { next?: string }) {
  return (
    <div className="rounded-lg border border-[var(--accent)]/40 bg-[var(--accent-soft)] p-3 text-sm">
      <p>알림톡 링크로 들어오셔서 이번 수리만 보입니다.</p>
      <Link href={`/my/login?more=1&next=${encodeURIComponent(next)}`} className="mt-1 inline-block font-semibold text-[var(--accent)] underline">
        모든 기록 보기(문자 인증 한 번) →
      </Link>
    </div>
  );
}
