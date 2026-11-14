"use client";
// 견적 화면의 차 그림: 견적 줄(진단 줄에서 만든 것)과 부위를 서로 가리킨다.
// 줄에 마우스를 올리거나 누르면 그림의 부위가, 그림의 부위를 누르면 그 부위의 줄들이 강조된다.
// 견적 표의 줄은 data-damage(진단 줄 id)만 달아 두고, 여기서 찾아 연결한다(표는 서버가 그린다).
import { useEffect, useRef, useState } from "react";
import type { roDamage } from "@/db/schema";
import type { CarLook } from "@/modules/repair/body-map";
import { partName } from "@/modules/repair/rules";
import { CarMap } from "./car-map";
import { damageFills, damagePins, MethodLegend } from "./damage-map";

type Damage = typeof roDamage.$inferSelect;

export function EstimateMap({ damages, scope, photos = [], car }: { damages: Damage[]; scope: string; photos?: { damageId: string; path: string }[]; car?: CarLook }) {
  const [part, setPart] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const partOf = (id: string | undefined) => damages.find((d) => d.id === id)?.part ?? null;

  useEffect(() => {
    const root = document.getElementById(scope);
    if (!root) return;
    const rows = [...root.querySelectorAll<HTMLElement>("[data-damage]")];
    const over = (e: Event) => setPart(partOf((e.currentTarget as HTMLElement).dataset.damage));
    for (const r of rows) {
      r.addEventListener("mouseenter", over);
      r.addEventListener("focusin", over);
    }
    return () => {
      for (const r of rows) {
        r.removeEventListener("mouseenter", over);
        r.removeEventListener("focusin", over);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, damages]);

  // 고른 부위의 줄에 표시
  useEffect(() => {
    const root = document.getElementById(scope);
    if (!root) return;
    for (const r of root.querySelectorAll<HTMLElement>("[data-damage]")) {
      const on = !!part && partOf(r.dataset.damage) === part;
      r.classList.toggle("bg-[var(--accent-soft)]", on);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [part, scope]);

  if (!damages.length) return null;
  const picked = damages.filter((d) => d.part === part);
  const shots = photos.filter((p) => picked.some((d) => d.id === p.damageId));
  return (
    <div ref={ref} className="mb-4">
      <CarMap label="견적 부위(색은 수리 방법)" fills={damageFills(damages)} pins={damagePins(damages)} highlight={part ? [part] : []} onPick={(p) => setPart(p === part ? null : p)} car={car} />
      <MethodLegend />
      <p className="mt-1 text-xs text-[var(--muted)]" role="status" aria-live="polite">
        {part ? (picked.length ? `${picked.map((d) => `${d.seq}. ${partName(d.part, d.subPart)}`).join(", ")} — 아래 표에서 강조한 줄입니다` : "이 부위에는 견적 줄이 없습니다") : "부위를 누르거나 아래 표의 줄에 손을 대면 서로 강조됩니다."}
      </p>
      {shots.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {shots.map((p) => (
            <a key={p.path} href={`/api/files/${p.path}`} target="_blank" rel="noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/files/${p.path}`} alt={`${partName(part!, null)} 손상 사진`} className="h-20 w-28 rounded object-cover" loading="lazy" />
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
