"use client";
// 제출 버튼: 보내는 동안 막아서 두 번 눌러 요청이 겹치지 않게 한다.
import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "./_ui";

export function SubmitButton({ children, variant = "primary", full = false }: { children: ReactNode; variant?: "primary" | "secondary" | "danger"; full?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} className={full ? "w-full" : ""} disabled={pending} aria-busy={pending}>
      {pending ? "처리 중…" : children}
    </Button>
  );
}
