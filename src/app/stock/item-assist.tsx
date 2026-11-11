"use client";
// 품목 칸 도우미: 단가의 부가세 계산을 바로 보여 주고, 구분을 고르면 지출 계정을 맞춰 넣는다(손으로 바꾼 계정은 그대로 둔다).
import { useEffect, useRef, useState } from "react";
import { KIND_EXP_CATEGORY, splitVat, isVatMode, type StockKind } from "@/modules/purchase/rules";

const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;

/** 단가·부가세 칸 아래에 공급가 + 부가세 = 합계를 보여 준다 */
export function VatPreview() {
  const ref = useRef<HTMLParagraphElement>(null);
  const [text, setText] = useState("");
  useEffect(() => {
    const form = ref.current?.closest("form");
    if (!form) return;
    const calc = () =>
      // 숫자 칸의 숨은 값은 다시 그린 뒤 바뀌므로 한 박자 늦게 읽는다
      requestAnimationFrame(() => {
        const fd = new FormData(form);
        const n = Number(String(fd.get("unitWon") ?? "").replace(/[^\d]/g, ""));
        const m = String(fd.get("vatMode") ?? "excluded");
        if (!n || !isVatMode(m)) return setText("");
        const v = splitVat(n, m);
        setText(m === "none" ? `부가세 없음: ${won(v.supply)}` : `공급가 ${won(v.supply)} + 부가세 ${won(v.vat)} = ${won(v.total)}${m === "included" ? " → 공급가로 저장" : ""}`);
      });
    calc();
    form.addEventListener("input", calc);
    form.addEventListener("change", calc);
    form.addEventListener("assist:restored", calc);
    return () => {
      form.removeEventListener("input", calc);
      form.removeEventListener("change", calc);
      form.removeEventListener("assist:restored", calc);
    };
  }, []);
  return (
    <p ref={ref} aria-live="polite" className="-mt-1 text-xs font-medium text-[var(--accent)] md:col-span-2">
      {text}
    </p>
  );
}

/** 구분 → 지출 계정 자동 넣기 */
export function KindLinksCategory() {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const form = ref.current?.closest("form");
    if (!form) return;
    const sel = form.querySelector<HTMLSelectElement>('select[name="expCategory"]');
    if (!sel) return;
    let touched = false;
    const onSel = (e: Event) => e.isTrusted && (touched = true);
    const onKind = (e: Event) => {
      const t = e.target as HTMLInputElement;
      if (t.name !== "kind" || touched) return;
      const c = KIND_EXP_CATEGORY[t.value as StockKind];
      if (c) sel.value = c;
    };
    sel.addEventListener("change", onSel);
    form.addEventListener("change", onKind);
    return () => {
      sel.removeEventListener("change", onSel);
      form.removeEventListener("change", onKind);
    };
  }, []);
  return <span ref={ref} hidden />;
}
