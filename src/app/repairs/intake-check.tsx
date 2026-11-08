"use client";
// 서명 전 점검: 서명(점검 마침)이 막히는 이유를 미리 보여 준다. 서버(signIntake)와 같은 규칙(src/modules/repair/rules.ts).
import { useEffect, useRef, useState } from "react";
import { intakeIssues, type Issue } from "@/modules/repair/rules";

export function IntakeCheck({ photoSlots, minPhotos, consentOk, lastMileage }: { photoSlots: string[]; minPhotos: number; consentOk: boolean; lastMileage: number | null }) {
  const box = useRef<HTMLDivElement>(null);
  const [issues, setIssues] = useState<Issue[]>([]);
  useEffect(() => {
    const form = box.current?.closest("form");
    if (!form) return;
    let t: ReturnType<typeof setTimeout>;
    const run = () => {
      clearTimeout(t);
      t = setTimeout(() => {
        const fd = new FormData(form);
        const v = (k: string) => String(fd.get(k) ?? "").trim();
        const all = (k: string) => fd.getAll(k).map(String);
        const n = (k: string) => (v(k) ? Number(v(k).replace(/[^\d]/g, "")) : null);
        setIssues(
          intakeIssues(
            {
              mileage: n("mileage"),
              fuelPct: v("fuelPct") === "" ? null : Number(v("fuelPct")),
              photoSlots,
              valuables: v("valuables"),
              valuablesNone: all("valuablesNone").includes("1"),
              keyCount: n("keyCount"),
              coversOn: all("coversOn").includes("1"),
              agreeChecked: all("agree").includes("checked"),
              agreeMove: all("agree").includes("move"),
              consentOk: consentOk || all("consentNow").includes("1"),
              signerName: v("signerName"),
              signature: v("signature").startsWith("data:image/png"),
              delivered: v("arrival") === "driver",
              driverName: v("driverName"),
              lastMileage,
            },
            minPhotos,
          ),
        );
      }, 150);
    };
    run();
    form.addEventListener("input", run);
    form.addEventListener("change", run);
    form.addEventListener("assist:restored", run);
    return () => {
      form.removeEventListener("input", run);
      form.removeEventListener("change", run);
      form.removeEventListener("assist:restored", run);
    };
  }, [photoSlots, minPhotos, consentOk, lastMileage]);
  const go = (name: string) => {
    const form = box.current?.closest("form");
    const el = form?.querySelector<HTMLElement>(`[name="${name}"]`) ?? document.getElementById(name);
    const target = el?.getAttribute("type") === "hidden" ? (el.previousElementSibling as HTMLElement | null) ?? el.parentElement : el;
    target?.scrollIntoView({ behavior: "smooth", block: "center" });
    target?.focus();
  };
  return (
    <div ref={box} role="status" aria-live="polite">
      {issues.length ? (
        <div className="rounded-md border border-[var(--warn)] bg-[var(--warn-soft)] px-3 py-2.5 text-sm">
          <p className="font-semibold text-[var(--warn)]">아직 서명할 수 없습니다({issues.length}건). 누르면 그 칸으로 갑니다. 중간 저장은 됩니다.</p>
          <ul className="mt-1.5 space-y-1">
            {issues.map((i) => (
              <li key={i.field + i.msg}>
                <button type="button" onClick={() => go(i.field)} className="text-left underline-offset-2 hover:underline">
                  ⚠ {i.msg}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="rounded-md border border-[var(--line)] bg-[var(--ok-soft)] px-3 py-2 text-sm text-[var(--ok)]">모두 갖췄습니다. 서명 받고 마칠 수 있습니다.</p>
      )}
    </div>
  );
}
