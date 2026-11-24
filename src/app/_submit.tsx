"use client";
// 제출 버튼: 보내는 동안 막아서 두 번 눌러 요청이 겹치지 않게 한다.
import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "./_ui";

export function SubmitButton({
  children,
  variant = "primary",
  full = false,
  name,
  value,
  noValidate,
  disabled,
  form,
}: {
  children: ReactNode;
  variant?: "primary" | "secondary" | "danger";
  full?: boolean;
  /** 한 폼에 단추가 둘일 때 어느 단추인지(예: name="intent" value="sign") */
  name?: string;
  value?: string;
  /** 중간 저장처럼 필수 칸 검사를 건너뛸 때 */
  noValidate?: boolean;
  /** 보낼 수 없는 상태(받는 사람 없음 등) */
  disabled?: boolean;
  /** 이 단추가 바깥에 있는 양식을 보낼 때 그 양식의 id(form 속성) */
  form?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" form={form} name={name} value={value} formNoValidate={noValidate} variant={variant} className={full ? "w-full" : ""} disabled={pending || disabled} aria-busy={pending}>
      {pending ? "처리 중…" : children}
    </Button>
  );
}
