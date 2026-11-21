"use client";
// 계정 금고 열기(대표 2026-11-21): 앱 비밀번호를 다시 넣으면 30초 동안만 보이고 저절로 가린다
import { useActionState, useEffect, useState } from "react";
import { PasswordField } from "../../_input";
import { SubmitButton } from "../../_submit";
import { revealAction } from "./actions";

export function Reveal({ kind }: { kind: string }) {
  const [state, act] = useActionState(revealAction, null);
  const [left, setLeft] = useState(0);
  useEffect(() => {
    if (!state?.value) return;
    setLeft(30);
    const t = setInterval(() => setLeft((x) => (x > 0 ? x - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, [state?.at, state?.value]);
  const shown = !!state?.value && left > 0;
  return (
    <div className="space-y-2">
      {shown ? (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-[var(--warn)] bg-[var(--warn-soft)] px-3 py-2 text-sm">
          <span>비밀번호</span>
          <b className="select-all break-all font-mono">{state!.value}</b>
          <button type="button" className="rounded border border-[var(--line-strong)] px-2 py-0.5 text-xs" onClick={() => navigator.clipboard?.writeText(state!.value!).catch(() => {})}>
            복사
          </button>
          <button type="button" className="rounded border border-[var(--line-strong)] px-2 py-0.5 text-xs" onClick={() => setLeft(0)}>
            지금 가리기
          </button>
          <span className="text-xs text-[var(--muted)]">{left}초 뒤 가림</span>
        </div>
      ) : (
        <form action={act} className="space-y-2">
          <input type="hidden" name="kind" value={kind} />
          <PasswordField help="domain.appPassword" name="appPassword" required autoComplete="current-password" />
          {state?.error && <p className="text-sm text-[var(--danger)]">{state.error}</p>}
          <SubmitButton variant="secondary">비밀번호 보기(30초)</SubmitButton>
        </form>
      )}
    </div>
  );
}
