"use client";
// 차량 전개도 그림(세단 다섯 면). 부위를 누르면 그 부위·면·3×3 칸을 알려 준다.
// 표시(pins: 동그라미 기호)와 칠(fills: 칸을 부드럽게 칠함)을 받아 그린다. 입고 도면·진단·견적이 같이 쓴다.
import { useId, useState } from "react";
import {
  cellAt,
  cellRect,
  END_DECOR,
  MAP_H,
  MAP_W,
  partLabel,
  SIDE_DECOR,
  VIEW_DEFS,
  VIEW_HINT,
  VIEW_LABEL,
  type Shape,
  type View,
  type ViewDef,
} from "@/modules/repair/body-map";

export type MapPin = { key: string; part: string; view: View; cell: number; color: string; text: string; title: string; onClick?: () => void };
/** view 를 주면 그 면의 칸만, 안 주면 부위가 나오는 모든 면을 옅게 칠한다. cells 가 비면 부위 전체 */
export type MapFill = { part: string; view?: View | null; cells: number[]; color: string; strength?: number };

const FACES: ("all" | View)[] = ["all", "front", "left", "top", "right", "rear"];
const FACE_LABEL = { all: "전체", front: "앞", left: "왼쪽", top: "위", right: "오른쪽", rear: "뒤" } as const;

/** 면 안 좌표 → 전체 그림 좌표(오른쪽 옆은 좌우가 뒤집혀 있다) */
const toMap = (v: ViewDef, x: number, y: number) => ({ x: v.x + (v.flip ? v.w - x : x), y: v.y + y });

export function CarMap({
  pins = [],
  fills = [],
  selected,
  highlight = [],
  onPick,
  label = "차량 전개도",
  className = "",
}: {
  pins?: MapPin[];
  fills?: MapFill[];
  /** 고르는 중인 부위·면·칸: 테두리와 칸 선을 보여 준다 */
  selected?: { part: string; view: View | null; cells: number[] } | null;
  /** 밖(견적 줄 등)에서 가리킨 부위 */
  highlight?: string[];
  onPick?: (part: string, view: View, cell: number) => void;
  label?: string;
  className?: string;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const [face, setFace] = useState<"all" | View>("all");
  const vb = face === "all" ? `0 0 ${MAP_W} ${MAP_H}` : (() => { const v = VIEW_DEFS.find((d) => d.view === face)!; return `${v.x - 14} ${v.y - 30} ${v.w + 28} ${v.h + 40}`; })();
  const pick = (e: React.MouseEvent<SVGPathElement> | React.KeyboardEvent<SVGPathElement>, v: ViewDef, s: Shape) => {
    if (!onPick) return;
    let cell = 4;
    if ("clientX" in e && e.clientX) {
      const ctm = e.currentTarget.getScreenCTM();
      if (ctm) {
        const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
        cell = cellAt(s.box, p.x, p.y);
      }
    }
    onPick(s.part, v.view, cell);
  };

  return (
    <div className={`min-w-0 ${className}`}>
      <div className="mb-1.5 flex flex-wrap gap-1" role="group" aria-label="볼 면">
        {FACES.map((f) => (
          <button
            key={f}
            type="button"
            aria-pressed={face === f}
            onClick={() => setFace(f)}
            className={`min-h-8 rounded-full border px-3 text-xs ${face === f ? "border-[var(--fg)] bg-[var(--fg)] text-[var(--bg)]" : "border-[var(--line-strong)] hover:bg-[var(--surface-2)]"}`}
          >
            {FACE_LABEL[f]}
          </button>
        ))}
      </div>
      <svg viewBox={vb} className="car-map block h-auto w-full select-none" role="img" aria-label={label}>
        <defs>
          <linearGradient id={`${uid}-body`} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="170">
            <stop offset="0" stopColor="var(--car-body-hi)" />
            <stop offset="1" stopColor="var(--car-body-lo)" />
          </linearGradient>
          <linearGradient id={`${uid}-glass`} x1="0" y1="0" x2="0.4" y2="1">
            <stop offset="0" stopColor="var(--car-glass-hi)" />
            <stop offset="1" stopColor="var(--car-glass-lo)" />
          </linearGradient>
          <radialGradient id={`${uid}-rim`}>
            <stop offset="0" stopColor="var(--car-rim-hi)" />
            <stop offset="1" stopColor="var(--car-rim)" />
          </radialGradient>
          <radialGradient id={`${uid}-shadow`}>
            <stop offset="0" stopColor="var(--car-shadow)" stopOpacity="0.55" />
            <stop offset="1" stopColor="var(--car-shadow)" stopOpacity="0" />
          </radialGradient>
          {VIEW_DEFS.map((v) => (
            <clipPath key={v.view} id={`${uid}-sil-${v.view}`}>
              <path d={v.silhouette} />
            </clipPath>
          ))}
          {VIEW_DEFS.flatMap((v) =>
            v.shapes.map((s) => (
              <clipPath key={`${v.view}-${s.part}`} id={`${uid}-p-${v.view}-${s.part}`}>
                <path d={s.d} />
              </clipPath>
            )),
          )}
        </defs>

        {VIEW_DEFS.map((v) => {
          const side = v.view === "left" || v.view === "right";
          const end = v.view === "front" || v.view === "rear";
          const tf = `translate(${v.x},${v.y})${v.flip ? ` translate(${v.w},0) scale(-1,1)` : ""}`;
          const shapeEl = (s: Shape) => {
            const isSel = selected?.part === s.part && (!selected.view || selected.view === v.view);
            const isHi = highlight.includes(s.part);
            const wheel = s.part.endsWith("wheel");
            return (
              <path
                key={s.part}
                d={s.d}
                data-part={s.part}
                className={`cm-part ${wheel ? "cm-wheel" : ""} ${s.look ? `cm-${s.look}` : ""} ${onPick ? "cm-pick" : ""} ${isSel ? "cm-sel" : ""} ${isHi ? "cm-hi" : ""}`}
                fill={wheel ? "var(--car-tire)" : s.look === "glass" || s.look === "lamp" ? `url(#${uid}-glass)` : s.look === "tail" ? "var(--car-tail)" : s.look === "grille" ? "var(--car-grille)" : `url(#${uid}-body)`}
                tabIndex={onPick ? 0 : undefined}
                role={onPick ? "button" : undefined}
                aria-label={onPick ? `${partLabel(s.part)} (${VIEW_LABEL[v.view]})` : undefined}
                onClick={(e) => pick(e, v, s)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    pick(e, v, s);
                  }
                }}
              >
                <title>{partLabel(s.part)}</title>
              </path>
            );
          };
          const clipped = v.shapes.filter((s) => s.clip !== false);
          const free = v.shapes.filter((s) => s.clip === false);
          const myFills = fills.filter((f) => v.shapes.some((s) => s.part === f.part));
          const sel = selected && selected.view === v.view ? v.shapes.find((s) => s.part === selected.part) : null;
          return (
            <g key={v.view}>
              <text x={v.x} y={v.y - 12} className="cm-label">
                {VIEW_LABEL[v.view]} <tspan className="cm-hint">· {VIEW_HINT[v.view]}</tspan>
              </text>
              <g transform={tf}>
                {side && <ellipse cx={232} cy={160} rx={236} ry={9} fill={`url(#${uid}-shadow)`} />}
                {v.view === "top" && <ellipse cx={232} cy={104} rx={240} ry={96} fill={`url(#${uid}-shadow)`} opacity="0.5" />}
                {end && END_DECOR.tires.map(([x, y]) => <rect key={x} x={x} y={y} width={26} height={20} rx={5} fill="var(--car-tire)" />)}
                {end && <ellipse cx={100} cy={164} rx={96} ry={6} fill={`url(#${uid}-shadow)`} />}
                <g clipPath={`url(#${uid}-sil-${v.view})`}>{clipped.map(shapeEl)}</g>
                <path d={v.silhouette} fill="none" className="cm-outline" />
                {/* 꾸밈: 누르지 않음 */}
                <g pointerEvents="none">
                  {side && (
                    <>
                      {SIDE_DECOR.glass.map((d) => (
                        <path key={d} d={d} fill={`url(#${uid}-glass)`} className="cm-glass-decor" />
                      ))}
                      <path d={SIDE_DECOR.line} className="cm-line" />
                      <path d={SIDE_DECOR.headlamp} className="cm-lamp" />
                      <path d={SIDE_DECOR.taillamp} className="cm-tail" />
                      {SIDE_DECOR.handles.map(([x, y]) => (
                        <rect key={x} x={x} y={y} width={20} height={4.5} rx={2.25} className="cm-handle" />
                      ))}
                    </>
                  )}
                  {v.view === "front" && <path d={END_DECOR.frontGlass} fill={`url(#${uid}-glass)`} className="cm-glass-decor" />}
                  {v.view === "rear" && <path d={END_DECOR.rearGlass} fill={`url(#${uid}-glass)`} className="cm-glass-decor" />}
                  {end && <rect x={END_DECOR.plate[0]} y={END_DECOR.plate[1]} width={END_DECOR.plate[2]} height={END_DECOR.plate[3]} rx={2} className="cm-plate" />}
                </g>
                {free.map(shapeEl)}
                {side && (
                  <g pointerEvents="none">
                    {SIDE_DECOR.wheels.map(([x, y]) => (
                      <g key={x}>
                        <circle cx={x} cy={y} r={20} fill={`url(#${uid}-rim)`} />
                        {[0, 72, 144, 216, 288].map((a) => (
                          <line key={a} x1={x} y1={y} x2={x + 17 * Math.cos((a * Math.PI) / 180)} y2={y + 17 * Math.sin((a * Math.PI) / 180)} className="cm-spoke" />
                        ))}
                        <circle cx={x} cy={y} r={4.5} className="cm-hub" />
                      </g>
                    ))}
                  </g>
                )}
                {/* 칠: 칸을 둥글게, 정도가 셀수록 진하게 */}
                <g pointerEvents="none">
                  {myFills.map((f, i) => {
                    const s = v.shapes.find((x) => x.part === f.part)!;
                    const cells = f.cells.length && f.view === v.view ? f.cells : null;
                    const op = (f.strength ?? 0.5) * (f.view && f.view !== v.view ? 0.4 : 1);
                    const inner = cells ? (
                      cells.map((c) => {
                        const r = cellRect(s.box, c);
                        return <rect key={c} x={r.x + 0.8} y={r.y + 0.8} width={r.w - 1.6} height={r.h - 1.6} rx={Math.min(6, r.w / 4, r.h / 4)} fill={f.color} opacity={op} />;
                      })
                    ) : (
                      <path d={s.d} fill={f.color} opacity={op * 0.55} />
                    );
                    const g = <g clipPath={`url(#${uid}-p-${v.view}-${s.part})`}>{inner}</g>;
                    return s.clip === false ? <g key={i}>{g}</g> : <g key={i} clipPath={`url(#${uid}-sil-${v.view})`}>{g}</g>;
                  })}
                </g>
                {/* 고르는 중인 부위의 3×3 칸 선 */}
                {sel && (
                  <g pointerEvents="none" clipPath={sel.clip === false ? undefined : `url(#${uid}-sil-${v.view})`}>
                  <g clipPath={`url(#${uid}-p-${v.view}-${sel.part})`}>
                    {[1, 2].map((i) => (
                      <g key={i}>
                        <line x1={sel.box[0] + (sel.box[2] * i) / 3} y1={sel.box[1]} x2={sel.box[0] + (sel.box[2] * i) / 3} y2={sel.box[1] + sel.box[3]} className="cm-grid" />
                        <line x1={sel.box[0]} y1={sel.box[1] + (sel.box[3] * i) / 3} x2={sel.box[0] + sel.box[2]} y2={sel.box[1] + (sel.box[3] * i) / 3} className="cm-grid" />
                      </g>
                    ))}
                    {selected!.cells.map((c) => {
                      const r = cellRect(sel.box, c);
                      return <rect key={c} x={r.x + 1} y={r.y + 1} width={r.w - 2} height={r.h - 2} rx={4} className="cm-cell-sel" />;
                    })}
                  </g>
                  </g>
                )}
              </g>
            </g>
          );
        })}

        {/* 기호(전체 그림 좌표로 그려 글자가 뒤집히지 않게) */}
        {(() => {
          const seen = new Map<string, number>();
          return pins.map((p) => {
            const v = VIEW_DEFS.find((d) => d.view === p.view);
            const s = v?.shapes.find((x) => x.part === p.part);
            if (!v || !s) return null;
            const r = cellRect(s.box, p.cell);
            const k = `${p.view}-${p.part}-${p.cell}`;
            const n = seen.get(k) ?? 0;
            seen.set(k, n + 1);
            const at = toMap(v, r.x + r.w / 2, r.y + r.h / 2);
            return (
              <g
                key={p.key}
                transform={`translate(${at.x + n * 13},${at.y})`}
                className={p.onClick ? "cursor-pointer" : ""}
                onClick={(e) => {
                  e.stopPropagation();
                  p.onClick?.();
                }}
              >
                <circle r={9} fill={p.color} className="cm-pin" />
                <text y={3.6} textAnchor="middle" fontSize={10} fontWeight={700} fill="#fff" pointerEvents="none">
                  {p.text}
                </text>
                <title>{p.title}</title>
              </g>
            );
          });
        })()}
      </svg>
    </div>
  );
}
