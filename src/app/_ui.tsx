// 공통 화면 조각. 작업장 태블릿에서 장갑 낀 손으로도 누를 수 있게 버튼·입력 높이를 44px 이상으로 둔다(설계서 4.1).
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { GLOSSARY, STATUS_HELP } from "@/modules/help/glossary";
import { PAGE_HELP, type PageHelpKey } from "@/modules/help/pages";

export function ErrorBox({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-md border border-[var(--danger)]/40 bg-[var(--danger-soft)] px-3 py-2.5 text-sm text-[var(--danger)]">
      {message}
    </p>
  );
}

export function Notice({ children }: { children: ReactNode }) {
  return <p className="rounded-md border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2.5 text-sm text-[var(--muted)]">{children}</p>;
}

type ButtonVariant = "primary" | "secondary" | "danger";

export function buttonClass(variant: ButtonVariant = "primary") {
  const style = {
    primary: "bg-[var(--accent)] text-[var(--accent-fg)] shadow-[var(--shadow)] hover:brightness-110",
    secondary: "border border-[var(--line-strong)] bg-[var(--surface)] shadow-[var(--shadow)] hover:bg-[var(--surface-2)]",
    danger: "border border-[var(--danger)]/50 bg-[var(--surface)] text-[var(--danger)] hover:bg-[var(--danger-soft)]",
  }[variant];
  return `inline-flex h-11 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-4 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${style}`;
}

export function Button({ variant = "primary", className = "", ...props }: ComponentProps<"button"> & { variant?: ButtonVariant }) {
  return <button {...props} className={`${buttonClass(variant)} ${className}`} />;
}

/** 화면 제목. help 키가 필수라서 도움말 없는 화면은 만들 수 없다 */
export function PageTitle({ children, sub, actions, help }: { children: ReactNode; sub?: ReactNode; actions?: ReactNode; help: PageHelpKey }) {
  return (
    <div className="mb-5">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">{children}</h1>
          {sub && <p className="mt-1 text-sm text-[var(--muted)]">{sub}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      <PageHelp id={help} />
    </div>
  );
}

/** 화면 도움말: 제목 아래 접힌 상자. 자바스크립트 없이도 열린다 */
export function PageHelp({ id }: { id: PageHelpKey }) {
  const h = PAGE_HELP[id] as (typeof PAGE_HELP)[PageHelpKey] & { tips?: string[]; faq?: { q: string; a: string }[]; refs?: string[]; terms?: string[] };
  return (
    <details className="group mt-2 rounded-md border border-[var(--line)] bg-[var(--surface-2)] text-sm open:bg-[var(--surface)]" data-page-help={id}>
      <summary className="flex min-h-10 cursor-pointer list-none items-center gap-1.5 px-3 text-[var(--accent)] [&::-webkit-details-marker]:hidden">
        <span aria-hidden className="inline-flex size-5 items-center justify-center rounded-full border border-current text-xs">?</span>
        이 화면 도움말
        <span className="ml-auto text-xs text-[var(--muted)] group-open:hidden">펼치기</span>
        <span className="ml-auto hidden text-xs text-[var(--muted)] group-open:inline">접기</span>
      </summary>
      <div className="space-y-3 border-t border-[var(--line)] px-3 py-3">
        <p>{h.purpose}</p>
        <p className="text-xs text-[var(--muted)]">쓰는 사람: {h.who}</p>
        <div>
          <h3 className="mb-1 text-xs font-semibold">순서</h3>
          <ol className="list-decimal space-y-0.5 pl-5">
            {h.steps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
        </div>
        {h.tips && (
          <div>
            <h3 className="mb-1 text-xs font-semibold">요령</h3>
            <ul className="list-disc space-y-0.5 pl-5">
              {h.tips.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </div>
        )}
        {h.faq && (
          <div>
            <h3 className="mb-1 text-xs font-semibold">자주 묻는 질문</h3>
            <dl className="space-y-1.5">
              {h.faq.map((f) => (
                <div key={f.q}>
                  <dt className="font-medium">Q. {f.q}</dt>
                  <dd className="text-[var(--muted)]">A. {f.a}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}
        {h.terms && (
          <div>
            <h3 className="mb-1 text-xs font-semibold">용어</h3>
            <dl className="grid gap-1 sm:grid-cols-2">
              {h.terms.map((t) => (
                <div key={t} className="text-xs">
                  <dt className="inline font-medium">{t}</dt> <dd className="inline text-[var(--muted)]">{GLOSSARY[t]}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}
        <p className="flex flex-wrap gap-x-3 text-xs text-[var(--muted)]">
          {h.refs && <span>관련: {h.refs.join(" · ")}</span>}
          <Link href="/help" className="text-[var(--accent)]">
            도움말 센터 →
          </Link>
        </p>
      </div>
    </details>
  );
}

/** 문서 상태 표시. 손가락을 대거나 마우스를 올리면 뜻을 보여 준다 */
export function StatusBadge({ status }: { status: string }) {
  return (
    <span title={STATUS_HELP[status]} aria-label={`${STATUS_LABEL[status] ?? status}: ${STATUS_HELP[status] ?? ""}`}>
      <Badge tone={STATUS_TONE[status]}>{STATUS_LABEL[status] ?? status}</Badge>
    </span>
  );
}

/** 빈 목록 안내: 무엇이 없고, 무엇을 하면 생기는지 */
export function Empty({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-md border border-dashed border-[var(--line-strong)] px-3 py-4 text-center text-sm text-[var(--muted)]">
      <p>{children}</p>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function Card({ title, children, actions }: { title?: ReactNode; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="rounded-lg border border-[var(--line)] bg-[var(--surface)] p-4 shadow-[var(--shadow)]">
      {(title || actions) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          {title && <h2 className="font-semibold">{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "ok" | "warn" | "danger" | "accent" }) {
  const c = {
    neutral: "bg-[var(--surface-2)] text-[var(--muted)]",
    ok: "bg-[var(--ok-soft)] text-[var(--ok)]",
    warn: "bg-[var(--warn-soft)] text-[var(--warn)]",
    danger: "bg-[var(--danger-soft)] text-[var(--danger)]",
    accent: "bg-[var(--accent-soft)] text-[var(--accent)]",
  }[tone];
  return <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ${c}`}>{children}</span>;
}

export const STATUS_LABEL: Record<string, string> = {
  draft: "임시저장",
  in_progress: "결재중",
  rejected: "반려",
  confirmed: "확정",
  checked: "확인완료",
  cancelled: "취소됨",
  discarded: "폐기",
};

export const STATUS_TONE: Record<string, "neutral" | "ok" | "warn" | "danger" | "accent"> = {
  draft: "neutral",
  in_progress: "accent",
  rejected: "danger",
  confirmed: "ok",
  checked: "ok",
  cancelled: "warn",
  discarded: "neutral",
};

export const fmtTime = (d: Date | string | null | undefined) =>
  d ? new Date(d).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", year: "2-digit", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : "";
