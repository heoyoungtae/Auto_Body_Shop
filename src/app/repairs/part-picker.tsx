"use client";
// 진단 줄의 부위 고르기: 차 그림에서 부위를 누르면 부위·면·칸이 정해지고, 같은 부위를 다시 누르면 칸을 더하거나 뺀다.
// 값은 숨은 칸 part·view·cells 로 보낸다. 세부 부위(범퍼 커버·하단 스포일러 등)는 목록에서 고르거나 직접 적는다.
import { useEffect, useId, useRef, useState } from "react";
import { BODY_PARTS, CELLS, cellLabel, cellsLabel, parseCells, partLabel, SUB_PARTS, VIEW_LABEL, viewsOf, isView, type View } from "@/modules/repair/body-map";
import { Shell, TextField } from "../_input";
import { CarMap, type MapFill } from "./car-map";

type Pick = { part: string; view: View | null; cells: number[] };

export function PartPicker({ initial, subPart, others = [], from }: { initial?: Pick; subPart?: string | null; others?: MapFill[]; from?: string }) {
  const [p, setP] = useState<Pick>(initial ?? { part: "", view: null, cells: [] });
  const box = useRef<HTMLDivElement>(null);
  const id = `pp-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;

  const changed = () => queueMicrotask(() => box.current?.closest("form")?.dispatchEvent(new Event("change", { bubbles: true })));
  const set = (next: Pick) => {
    setP(next);
    changed();
  };

  // 서버 오류로 돌아와 폼 값이 되살려지면 고른 것도 되살린다
  useEffect(() => {
    const form = box.current?.closest("form");
    if (!form) return;
    const sync = () =>
      setTimeout(() => {
        const fd = new FormData(form);
        const v = String(fd.get("view") ?? "");
        setP({ part: String(fd.get("part") ?? ""), view: isView(v) ? v : null, cells: parseCells(String(fd.get("cells") ?? "")) });
      }, 0);
    form.addEventListener("assist:restored", sync);
    return () => form.removeEventListener("assist:restored", sync);
  }, []);

  const onPick = (part: string, view: View, cell: number) => {
    if (part !== p.part || view !== p.view) return set({ part, view, cells: [cell] });
    const cells = p.cells.includes(cell) ? p.cells.filter((c) => c !== cell) : [...p.cells, cell].sort((a, b) => a - b);
    set({ ...p, cells });
  };
  const subs = SUB_PARTS[p.part] ?? [];

  return (
    <div ref={box} className="space-y-3">
      <input type="hidden" name="part" value={p.part} />
      <input type="hidden" name="view" value={p.view ?? ""} />
      <input type="hidden" name="cells" value={p.cells.join(",")} />
      {/* 그림은 폭을 다 쓴다(작으면 누르기 어려움). 고른 결과·칸·목록은 아래 '부위' 칸에 */}
      <div className="rounded-md border border-[var(--line)] bg-[var(--surface-2)] p-2">
        <CarMap label="손상 부위 고르기(펼친 차 그림)" selected={p.part ? p : null} fills={others} onPick={onPick} />
      </div>
      <Shell id={`${id}-sel`} helpKey="dmg.part" required from={from}>
        <div>
          <div className="flex flex-wrap items-start gap-3">
            <p className={`min-w-56 flex-1 rounded-md border px-3 py-2 ${p.part ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-dashed border-[var(--line-strong)] text-[var(--muted)]"}`} role="status" aria-live="polite">
              {p.part ? (
                <>
                  <b>{partLabel(p.part)}</b> · {cellsLabel(p.view, p.cells)}
                  {p.view && <span className="block text-xs text-[var(--muted)]">{VIEW_LABEL[p.view]}에서 고름 — 같은 부위를 다시 누르면 칸을 더하거나 뺍니다</span>}
                </>
              ) : (
                "그림에서 손상된 부위를 누르세요"
              )}
            </p>
            {p.part && p.view && (
              <div>
                <p className="mb-1 text-xs text-[var(--muted)]">부위 안 위치(여러 칸 가능)</p>
                <div className="grid max-w-60 grid-cols-3 gap-1" role="group" aria-label="부위 안 위치 3×3 칸">
                  {CELLS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      aria-pressed={p.cells.includes(c)}
                      onClick={() => onPick(p.part, p.view!, c)}
                      className={`min-h-9 rounded border px-1 text-[11px] leading-tight ${p.cells.includes(c) ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-fg)]" : "border-[var(--line-strong)] hover:bg-[var(--surface-2)]"}`}
                    >
                      {cellLabel(p.view!, c)}
                    </button>
                  ))}
                </div>
                <button type="button" onClick={() => set({ ...p, cells: [] })} className="mt-1 text-xs text-[var(--accent)] hover:underline">
                  부위 전체로
                </button>
              </div>
            )}
            <label className="block w-56 text-xs text-[var(--muted)]">
              목록에서 고르기
              {/* 그림 대신 목록으로 고르기(키보드·화면 읽기 프로그램). 부위 칸(dmg.part) 도움말 안에 있다 */}
              <select
                data-assist="group"
                id={`${id}-sel`}
                value={p.part}
                onChange={(e) => set({ part: e.target.value, view: e.target.value ? viewsOf(e.target.value)[0] ?? null : null, cells: [] })}
                className="mt-1 block min-h-9 w-full rounded-md border border-[var(--line-strong)] bg-[var(--surface)] px-2 text-sm text-[var(--fg)]"
              >
                <option value="">고르기</option>
                {BODY_PARTS.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      </Shell>
      <TextField help="dmg.subPart" name="subPart" defaultValue={subPart ?? ""} placeholder={subs.length ? `예: ${subs.slice(0, 2).join(", ")}` : undefined} suggestions={subs.map((s) => ({ value: s }))} />
    </div>
  );
}
