"use client";
// 진단 칸을 적는 동안 판단 기준표(STD-02 5절)의 제안 방법·보정 필요를 바로 보여 준다.
import { useEffect, useRef, useState } from "react";
import { isPaintLayer, METHODS, needsCalibration, partLabel, suggestMethod } from "@/modules/repair/rules";

export function MethodHint({ options }: { options: string[] }) {
  const box = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<{ method: string; why: string; chosen: string; cal: string | null } | null>(null);
  useEffect(() => {
    const form = box.current?.closest("form");
    if (!form) return;
    const run = () => {
      const fd = new FormData(form);
      const v = (k: string) => String(fd.get(k) ?? "").trim();
      const flags = fd.getAll("flags").map(String);
      const layer = v("paintLayer");
      const s = suggestMethod({
        kind: v("kind") || "D",
        paintLayer: isPaintLayer(layer) ? layer : "none",
        crease: flags.includes("crease"),
        broken: flags.includes("broken"),
        structural: flags.includes("structural"),
        sizeCm: v("sizeCm") ? Number(v("sizeCm").replace(/\D/g, "")) : null,
      });
      setView({ method: s.method, why: s.why, chosen: v("method"), cal: v("part") ? needsCalibration(v("part"), options) && `${partLabel(v("part"))}: ${needsCalibration(v("part"), options)} 보정 필요` : null });
    };
    run();
    form.addEventListener("input", run);
    form.addEventListener("change", run);
    return () => {
      form.removeEventListener("input", run);
      form.removeEventListener("change", run);
    };
  }, [options]);
  if (!view) return <div ref={box} />;
  const differs = view.chosen && view.chosen !== view.method;
  return (
    <div ref={box} role="status" aria-live="polite" className="rounded-md border border-[var(--line)] bg-[var(--accent-soft)] px-3 py-2 text-sm">
      <p>
        기준표 제안: <b>{METHODS[view.method as keyof typeof METHODS]}</b> <span className="text-[var(--muted)]">— {view.why}</span>
      </p>
      {differs && <p className="mt-1 text-[var(--warn)]">⚠ 제안과 다른 방법을 골랐습니다. &lsquo;다른 방법 사유&rsquo;를 적어야 저장됩니다.</p>}
      {view.cal && <p className="mt-1 text-[var(--warn)]">⚠ {view.cal}(차량 수리 사양 기준)</p>}
    </div>
  );
}
