"use client";
// 문자 미리보기: 같은 form 의 textarea[name=body] 를 읽어 바꿈 칸을 채운 글, 바이트·SMS/LMS, 광고 표기를 바로 보여 준다
import { useEffect, useRef, useState } from "react";

const bytes = (s: string) => Array.from(s).reduce((n, ch) => n + (ch.charCodeAt(0) < 128 ? 1 : 2), 0);

export function SmsPreview({ vars, purpose, optout, names }: { vars: Record<string, string>; purpose: "info" | "ad"; optout: string; names: string[] }) {
  const box = useRef<HTMLDivElement>(null);
  const [body, setBody] = useState("");
  useEffect(() => {
    const ta = box.current?.closest("form")?.querySelector<HTMLTextAreaElement>("textarea[name=body]");
    if (!ta) return;
    const on = () => setBody(ta.value);
    on();
    ta.addEventListener("input", on);
    return () => ta.removeEventListener("input", on);
  }, []);
  const insert = (k: string) => {
    const ta = box.current?.closest("form")?.querySelector<HTMLTextAreaElement>("textarea[name=body]");
    if (!ta) return;
    const at = ta.selectionStart ?? ta.value.length;
    ta.value = ta.value.slice(0, at) + `#{${k}}` + ta.value.slice(ta.selectionEnd ?? at);
    ta.focus();
    ta.setSelectionRange(at + k.length + 3, at + k.length + 3);
    ta.dispatchEvent(new Event("input", { bubbles: true }));
  };
  const filled = body.replace(/#\{([^}]+)\}/g, (m, k: string) => vars[k] ?? m).trim();
  const text = purpose === "ad" ? `(광고)${filled}\n무료수신거부 ${optout || "(번호 없음)"}` : filled;
  const b = bytes(text);
  return (
    <div ref={box} className="space-y-2">
      <div className="flex flex-wrap gap-1" aria-label="바꿈 칸 넣기">
        <span className="self-center text-xs text-[var(--muted)]">바꿈 칸 넣기:</span>
        {names.map((k) => (
          <button key={k} type="button" onClick={() => insert(k)} className="min-h-8 rounded-full border border-[var(--line-strong)] px-2.5 text-xs hover:bg-[var(--surface-2)]">
            {k}
          </button>
        ))}
      </div>
      <div className="rounded-lg bg-[var(--surface-2)] p-3 text-sm">
        <p className="mb-1 text-xs text-[var(--muted)]">
          미리보기({vars.고객명 ?? "보기"} 고객) · {b.toLocaleString("ko-KR")}바이트 · {b <= 90 ? "단문(SMS)" : b <= 2000 ? "장문(LMS)" : "너무 김"}
        </p>
        <p className="whitespace-pre-wrap">{text || "내용을 적으면 여기에 보입니다"}</p>
      </div>
    </div>
  );
}
