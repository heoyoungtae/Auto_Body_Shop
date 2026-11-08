"use client";
// 진단 칸을 적는 동안 판단 기준표(STD-02 5절)의 제안 방법·도막 두께 판정·보정 필요를 바로 보여 준다.
import { useEffect, useRef, useState } from "react";
import { isPaintLayer, METHODS, needsCalibration, parseFilm, partLabel, repainted, suggestMethod } from "@/modules/repair/rules";

export function MethodHint({ repaintUm, options }: { repaintUm: number; options: string[] }) {
  const box = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<{ method: string; why: string; chosen: string; film: string | null; cal: string | null } | null>(null);
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
      const panel = parseFilm(v("filmPanel"));
      const adj = parseFilm(v("filmAdjacent"));
      const film = repainted([...panel, ...adj], repaintUm) ? `도막 ${Math.max(...panel, ...adj)}μm — 기준 ${repaintUm}μm 초과: 재도장 이력으로 기록하고 고객에게 알립니다` : panel.length + adj.length ? `도막 최대 ${Math.max(...panel, ...adj)}μm (기준 ${repaintUm}μm 이하)` : null;
      setView({ method: s.method, why: s.why, chosen: v("method"), film, cal: v("part") ? needsCalibration(v("part"), options) && `${partLabel(v("part"))}: ${needsCalibration(v("part"), options)} 보정 필요` : null });
    };
    run();
    form.addEventListener("input", run);
    form.addEventListener("change", run);
    return () => {
      form.removeEventListener("input", run);
      form.removeEventListener("change", run);
    };
  }, [repaintUm, options]);
  if (!view) return <div ref={box} />;
  const differs = view.chosen && view.chosen !== view.method;
  return (
    <div ref={box} role="status" aria-live="polite" className="rounded-md border border-[var(--line)] bg-[var(--accent-soft)] px-3 py-2 text-sm">
      <p>
        기준표 제안: <b>{METHODS[view.method as keyof typeof METHODS]}</b> <span className="text-[var(--muted)]">— {view.why}</span>
      </p>
      {differs && <p className="mt-1 text-[var(--warn)]">⚠ 제안과 다른 방법을 골랐습니다. &lsquo;다른 방법 사유&rsquo;를 적어야 저장됩니다.</p>}
      {view.film && <p className={`mt-1 ${view.film.includes("초과") ? "text-[var(--warn)]" : "text-[var(--muted)]"}`}>{view.film}</p>}
      {view.cal && <p className="mt-1 text-[var(--warn)]">⚠ {view.cal}(차량 수리 사양 기준)</p>}
    </div>
  );
}
