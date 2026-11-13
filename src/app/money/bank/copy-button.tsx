"use client";
// 문자 받는 주소 복사 단추
import { useState } from "react";
import { buttonClass } from "../../_ui";

export function CopyButton({ text, label = "주소 복사" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className={buttonClass("secondary")}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 2000);
        } catch {
          window.prompt("아래 주소를 길게 눌러 복사하세요", text);
        }
      }}
    >
      {done ? "복사했습니다" : label}
    </button>
  );
}
