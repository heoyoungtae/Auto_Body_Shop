// 공통 화면 조각. 작업장 태블릿에서 장갑 낀 손으로도 누를 수 있게 버튼·입력 높이를 44px 이상으로 둔다(설계서 4.1).
import type { ComponentProps, ReactNode } from "react";
import { STATUS_HELP } from "@/modules/help/glossary";
import { HelpButton, type HelpTopic } from "./_help-drawer";
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

/** 화면 제목. help 키가 필수라서 도움말 없는 화면은 만들 수 없다. 제목 옆 ? 를 누르면 오른쪽 도움말 창이 열린다 */
export function PageTitle({ children, sub, actions, help, std }: { children: ReactNode; sub?: ReactNode; actions?: ReactNode; help: PageHelpKey; /** 양식·표준서 번호. 설명 문장 뒤에 작게 붙인다(UI 개선 5) */ std?: string }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-x-4 gap-y-2" data-page-help={help}>
      <div className="min-w-0 flex-1">
        <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight sm:text-2xl">
          <span className="min-w-0">{children}</span>
          <HelpButton topic={{ kind: "page", id: help }} name={PAGE_HELP[help].title} />
        </h1>
        {(sub || std) && (
          <p className="mt-1 text-sm text-[var(--muted)]">
            {sub}
            {std && <span className="ml-2 inline-block rounded border border-[var(--line)] px-1.5 align-middle text-xs whitespace-nowrap">{std}</span>}
          </p>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
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

/** 패널. 제목이 있으면 help 도 넘긴다(제목 옆 ? → 오른쪽 도움말 창). 빠지면 테스트가 실패한다 */
export function Card({ title, children, actions, help }: { title?: ReactNode; children: ReactNode; actions?: ReactNode; help?: HelpTopic }) {
  return (
    <section className="rounded-lg border border-[var(--line)] bg-[var(--surface)] p-4 shadow-[var(--shadow)]">
      {(title || actions) && (
        <div className="mb-3 flex items-center justify-between gap-2">
          {title && (
            <h2 className="flex items-center gap-1.5 font-semibold">
              {title}
              {help && <HelpButton topic={help} name={typeof title === "string" ? title : "이 패널"} />}
            </h2>
          )}
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
