"use client";
// 결재 처리: 의견 칸(문구 넣기 포함)과 승인·반려. 반려는 의견이 비면 보내지 않고 바로 알려 준다.
import { useRef, useState } from "react";
import { TextAreaField } from "../../_input";

export function ActForm({ id, kind, action }: { id: string; kind: string; action: (f: FormData) => void | Promise<void> }) {
  const ref = useRef<HTMLFormElement>(null);
  const [warn, setWarn] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isConfirm = kind === "confirm";
  return (
    <form
      ref={ref}
      action={action}
      className="space-y-3"
      onSubmit={(e) => {
        const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
        const comment = (ref.current?.elements.namedItem("comment") as HTMLTextAreaElement | null)?.value.trim();
        if (submitter?.value === "reject" && !comment) {
          e.preventDefault();
          setWarn("반려할 때는 무엇을 고치면 되는지 의견에 적어 주세요");
          (ref.current?.elements.namedItem("comment") as HTMLTextAreaElement | null)?.focus();
          return;
        }
        setBusy(true);
      }}
    >
      <input type="hidden" name="id" value={id} />
      <TextAreaField help="approval.comment" name="comment" rows={3} />
      {warn && (
        <p role="alert" className="text-xs font-medium text-[var(--danger)]">
          {warn}
        </p>
      )}
      <div className="flex gap-2">
        <button name="type" value={isConfirm ? "confirm" : "approve"} disabled={busy} className="inline-flex h-11 items-center rounded-md bg-[var(--accent)] px-4 text-sm font-medium text-[var(--accent-fg)] disabled:opacity-50">
          {isConfirm ? "확인" : "승인"}
        </button>
        {!isConfirm && (
          <button name="type" value="reject" disabled={busy} className="inline-flex h-11 items-center rounded-md border border-[var(--danger)]/50 px-4 text-sm font-medium text-[var(--danger)] disabled:opacity-50">
            반려
          </button>
        )}
      </div>
    </form>
  );
}
