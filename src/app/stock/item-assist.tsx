"use client";
// 품목 칸 도우미: 단가의 부가세 계산을 바로 보여 주고, 구분을 고르면 지출 계정을 맞춰 넣는다(손으로 바꾼 계정은 그대로 둔다).
import { useEffect, useRef, useState } from "react";
import { KIND_EXP_CATEGORY, recommendTrack, splitVat, isVatMode, TRACK_MODES, type StockKind, type TrackMode } from "@/modules/purchase/rules";

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

/** 관리 방식 추천: 구분·단가·입수·유효기간·화학물질·안전 재고를 보고 추천과 이유를 보여 준다. 고르지 않으면 추천대로 저장 */
export function TrackHint({ low, high }: { low: number; high: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [rec, setRec] = useState<{ mode: TrackMode; reason: string } | null>(null);
  const [picked, setPicked] = useState("");
  useEffect(() => {
    const form = ref.current?.closest("form");
    if (!form) return;
    const calc = () =>
      requestAnimationFrame(() => {
        const fd = new FormData(form);
        const num = (k: string) => Number(String(fd.get(k) ?? "").replace(/[^\d]/g, "")) || 0;
        const m = String(fd.get("vatMode") ?? "excluded");
        const kind = String(fd.get("kind") ?? "");
        if (!kind) return setRec(null);
        setPicked(String(fd.get("trackMode") ?? ""));
        setRec(
          recommendTrack(
            { kind, unitWon: isVatMode(m) ? splitVat(num("unitWon"), m).supply : num("unitWon"), buyQty: fd.get("buyUnit") ? num("buyQty") : null, expiryTracked: fd.get("expiryTracked") === "1", chemicalId: String(fd.get("chemicalId") ?? "") || null, safetyQty: num("safetyQty") },
            { low, high },
          ),
        );
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
  }, [low, high]);
  const pick = () => {
    const el = ref.current?.closest("form")?.querySelector<HTMLInputElement>(`input[name="trackMode"][value="${rec?.mode}"]`);
    if (el) {
      el.checked = true;
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }
  };
  return (
    <div ref={ref} aria-live="polite" className="-mt-1 text-xs md:col-span-2">
      {rec && (
        <p className={picked && picked !== rec.mode ? "text-[var(--warn)]" : "text-[var(--accent)]"}>
          추천: <b>{TRACK_MODES[rec.mode]}</b> — {rec.reason}.{" "}
          {!picked ? "고르지 않으면 추천대로 저장합니다." : picked !== rec.mode ? "추천과 다르게 골랐습니다." : ""}
          {picked !== rec.mode && (
            <button type="button" onClick={pick} className="ml-1 underline">
              추천대로
            </button>
          )}
        </p>
      )}
    </div>
  );
}

/** 묶음 입수: '1박스 = 40롤 · 낱개 1,263원' */
export function PackPreview() {
  const ref = useRef<HTMLParagraphElement>(null);
  const [text, setText] = useState("");
  useEffect(() => {
    const form = ref.current?.closest("form");
    if (!form) return;
    const calc = () =>
      requestAnimationFrame(() => {
        const fd = new FormData(form);
        const n = Number(String(fd.get("buyQty") ?? "").replace(/[^\d]/g, ""));
        const bu = String(fd.get("buyUnit") ?? "");
        const u = String(fd.get("unit") ?? "");
        const w = Number(String(fd.get("unitWon") ?? "").replace(/[^\d]/g, ""));
        if (!bu || n < 2) return setText(bu ? "입수(1" + bu + "에 든 낱개 수)를 2 이상으로 적어 주세요" : "");
        if (bu === u) return setText("사는 단위와 재고(쓰는) 단위가 같습니다. 쓰는 단위(롤·장·개)를 고르세요");
        setText(`1${bu} = ${n}${u}${w ? ` · 낱개 1${u} ≈ ${won(Math.round(w / n))}` : ""} · 재고·사용·실사는 ${u}, 발주·입고는 ${bu}`);
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
