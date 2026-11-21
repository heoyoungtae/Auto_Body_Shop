"use client";
// 주유 칸 셈: 금액·넣은 양·단가 중 두 칸이 차면 남은 칸에 들어갈 값을 바로 보여 준다(저장할 때 서버가 같은 셈으로 채움)
import { useEffect, useRef, useState } from "react";

export function FuelCalc({ unit }: { unit: string }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const [msg, setMsg] = useState("");
  useEffect(() => {
    const form = ref.current?.closest("form");
    if (!form) return;
    const val = (n: string) => {
      const el = form.querySelector<HTMLInputElement>(`input[name="${n}"]`);
      const t = (el?.value ?? "").replace(/,/g, "").trim();
      return t === "" || !Number.isFinite(Number(t)) ? null : Number(t);
    };
    const run = () => {
      const a = val("amount");
      const q = val("qty");
      const u = val("unitPrice");
      if (a != null && u && q == null) setMsg(`넣은 양은 약 ${(Math.round((a / u) * 100) / 100).toLocaleString("ko-KR")}${unit}로 적힙니다`);
      else if (q != null && u != null && a == null) setMsg(`금액은 ${Math.round(q * u).toLocaleString("ko-KR")}원으로 적힙니다`);
      else if (a != null && q && u == null) setMsg(`단가는 ${Math.round(a / q).toLocaleString("ko-KR")}원/${unit}로 적힙니다`);
      else setMsg(a == null && q == null ? "금액·넣은 양·단가 중 두 가지만 넣으면 나머지는 계산합니다" : "");
    };
    // 숫자 칸은 숨은 칸 값이 다시 그려진 뒤 바뀌므로 한 박자 늦게 읽는다
    const later = () => setTimeout(run, 0);
    run();
    form.addEventListener("input", later);
    return () => form.removeEventListener("input", later);
  }, [unit]);
  return (
    <p ref={ref} aria-live="polite" className="text-sm text-[var(--accent)]">
      {msg}
    </p>
  );
}
