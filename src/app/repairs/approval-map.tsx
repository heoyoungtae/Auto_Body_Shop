"use client";
// 견적 승인(손님 링크·매장 서명·보험사 회신)의 차 그림: 작업 묶음(진단 줄)마다 부위를 칠해 두고,
// 그림에서 부위를 누르면 같은 폼의 작업 체크(name=groups)를 넣고 뺀다. 체크를 바꿔도 그림 색이 따라 바뀐다.
// 체크 상태는 폼이 가진다(AmountChecklist). 여기서는 읽고, 누를 때 체크 칸을 대신 누를 뿐이다.
import { useEffect, useRef, useState } from "react";
import { cellsLabel, type CarLook, type View } from "@/modules/repair/body-map";
import { CarMap, type MapFill, type MapPin } from "./car-map";

export type ApprovalZone = { key: string; seq: number; part: string; view: View | null; cells: number[]; label: string };

const ON = "#16a34a";
const OFF = "#9aa3ab";

export function ApprovalMap({ zones, car, name = "groups" }: { zones: ApprovalZone[]; car?: CarLook; name?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [on, setOn] = useState<string[] | null>(null);
  const boxes = () => [...(ref.current?.closest("form")?.querySelectorAll<HTMLInputElement>(`input[type=checkbox][name="${name}"]`) ?? [])];

  useEffect(() => {
    const form = ref.current?.closest("form");
    if (!form) return;
    const read = () => setOn(boxes().filter((b) => b.checked).map((b) => b.value));
    read();
    // 체크 칸은 React 상태로 바뀌므로, 바뀐 뒤 한 번 더 읽는다
    const later = () => requestAnimationFrame(read);
    form.addEventListener("change", later);
    form.addEventListener("click", later);
    form.addEventListener("reset", later);
    return () => {
      form.removeEventListener("change", later);
      form.removeEventListener("click", later);
      form.removeEventListener("reset", later);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name]);

  if (!zones.length) return null;
  const chosen = (k: string) => (on ? on.includes(k) : true);
  const fills: MapFill[] = zones.map((z) => ({ part: z.part, view: z.view, cells: z.cells, color: chosen(z.key) ? ON : OFF, strength: chosen(z.key) ? 0.6 : 0.35 }));
  const pins: MapPin[] = zones.flatMap((z) =>
    z.view
      ? [{ key: z.key + z.seq, part: z.part, view: z.view, cell: z.cells.length ? z.cells[Math.floor(z.cells.length / 2)] : 4, color: chosen(z.key) ? ON : OFF, text: String(z.seq), title: `${z.seq}. ${z.label} · ${cellsLabel(z.view, z.cells)} · ${chosen(z.key) ? "승인" : "뺌"}` }]
      : [],
  );
  const pick = (part: string) => {
    const keys = new Set(zones.filter((z) => z.part === part).map((z) => z.key));
    if (!keys.size) return;
    const mine = boxes().filter((b) => keys.has(b.value));
    const turnOn = !mine.some((b) => b.checked);
    for (const b of mine) if (b.checked !== turnOn) b.click();
  };
  const offCount = zones.filter((z) => !chosen(z.key)).length;

  return (
    <div ref={ref}>
      <CarMap label="수리할 부위(초록=승인, 회색=뺌)" fills={fills} pins={pins} onPick={(p) => pick(p)} car={car} />
      <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--muted)]" role="status" aria-live="polite">
        <span className="inline-flex items-center gap-1">
          <span className="size-2.5 rounded-sm" style={{ background: ON }} /> 승인
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="size-2.5 rounded-sm" style={{ background: OFF }} /> 뺌
        </span>
        <span>· 색칠한 부위를 누르면 그 작업을 넣고 뺍니다. 아래 목록과 같이 바뀝니다.{offCount ? ` 지금 ${offCount}곳을 뺐습니다.` : ""}</span>
      </p>
    </div>
  );
}
