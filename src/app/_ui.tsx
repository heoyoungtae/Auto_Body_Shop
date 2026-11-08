// 공통 화면 조각. 작업장 태블릿에서 장갑 낀 손으로도 누를 수 있게 버튼·입력 높이를 44px 이상으로 둔다(설계서 4.1).
import type { ComponentProps, ReactNode } from "react";

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

const inputBox =
  "block w-full rounded-md border border-[var(--line-strong)] bg-[var(--surface)] px-3 text-base shadow-[var(--shadow)] outline-none transition-colors focus:border-[var(--accent)] focus:ring-3 focus:ring-[var(--accent)]/15";

export function Field({ label, hint, ...props }: ComponentProps<"input"> & { label: string; hint?: string }) {
  return (
    <label className="block text-sm">
      <span className="mb-1.5 block font-medium">{label}</span>
      <input {...props} className={`h-11 ${inputBox}`} />
      {hint && <span className="mt-1 block text-xs text-[var(--muted)]">{hint}</span>}
    </label>
  );
}

export function TextArea({ label, ...props }: ComponentProps<"textarea"> & { label: string }) {
  return (
    <label className="block text-sm">
      <span className="mb-1.5 block font-medium">{label}</span>
      <textarea {...props} className={`min-h-28 py-2 ${inputBox}`} />
    </label>
  );
}

export function Select({ label, children, ...props }: ComponentProps<"select"> & { label: string }) {
  return (
    <label className="block text-sm">
      <span className="mb-1.5 block font-medium">{label}</span>
      <select {...props} className={`h-11 ${inputBox}`}>
        {children}
      </select>
    </label>
  );
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

export function PageTitle({ children, sub, actions }: { children: ReactNode; sub?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
      <div className="min-w-0 flex-1">
        <h1 className="text-xl font-bold tracking-tight sm:text-2xl">{children}</h1>
        {sub && <p className="mt-1 text-sm text-[var(--muted)]">{sub}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
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
