"use client";
// 차체 도면(F-02-01): 위에서 본 차에 기존 손상을 기호로 찍는다(STD-02 4절 4단계).
// 기호를 고르고 도면을 누르면 표시가 생기고, 표시를 다시 누르면 지워진다. 값은 숨은 칸 marks(JSON)로 보낸다.
import { useEffect, useRef, useState } from "react";
import { BODY_PARTS, MARK_KINDS, partAt, partLabel, type BodyMark, type MarkKind } from "@/modules/repair/rules";

export function BodyDiagram({ initial, readOnly = false, name = "marks" }: { initial: BodyMark[]; readOnly?: boolean; name?: string }) {
  const [marks, setMarks] = useState<BodyMark[]>(initial);
  const [kind, setKind] = useState<MarkKind>("S");
  const svg = useRef<SVGSVGElement>(null);
  const hidden = useRef<HTMLInputElement>(null);

  // 서버 오류로 돌아와 폼 값이 되살려지면 도면도 다시 그린다
  useEffect(() => {
    const form = hidden.current?.form;
    if (!form) return;
    const sync = () =>
      setTimeout(() => {
        try {
          setMarks(JSON.parse(hidden.current?.value || "[]"));
        } catch {
          /* 무시 */
        }
      }, 0);
    form.addEventListener("assist:restored", sync);
    return () => form.removeEventListener("assist:restored", sync);
  }, []);

  const add = (e: React.MouseEvent<SVGSVGElement>) => {
    if (readOnly || !svg.current) return;
    const pt = svg.current.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const p = pt.matrixTransform(svg.current.getScreenCTM()!.inverse());
    const part = partAt(p.x, p.y);
    if (!part) return;
    const next = [...marks, { x: Math.round(p.x), y: Math.round(p.y), kind, part }];
    setMarks(next);
    queueMicrotask(() => hidden.current?.form?.dispatchEvent(new Event("change", { bubbles: true })));
  };
  const remove = (i: number) => {
    if (readOnly) return;
    setMarks(marks.filter((_, j) => j !== i));
    queueMicrotask(() => hidden.current?.form?.dispatchEvent(new Event("change", { bubbles: true })));
  };

  return (
    <div className="grid gap-4 md:grid-cols-[minmax(0,18rem)_1fr]">
      <input ref={hidden} type="hidden" name={name} value={JSON.stringify(marks)} />
      <div>
        {!readOnly && (
          <div className="mb-2 flex flex-wrap gap-1" role="radiogroup" aria-label="표시할 기호">
            {(Object.keys(MARK_KINDS) as MarkKind[]).map((k) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={kind === k}
                onClick={() => setKind(k)}
                className={`flex min-h-9 items-center gap-1 rounded-md border px-2 text-sm ${kind === k ? "border-[var(--accent)] bg-[var(--accent-soft)] font-semibold" : "border-[var(--line)]"}`}
              >
                <span className="grid size-5 place-items-center rounded-full text-xs font-bold text-white" style={{ background: MARK_KINDS[k].color }}>
                  {k}
                </span>
                {MARK_KINDS[k].label}
              </button>
            ))}
          </div>
        )}
        <svg ref={svg} viewBox="0 0 200 384" className={`w-full max-w-72 select-none rounded-md border border-[var(--line)] bg-[var(--surface)] ${readOnly ? "" : "cursor-crosshair"}`} onClick={add} role="img" aria-label="차체 도면(위에서 본 모습, 위가 앞)">
          <text x="100" y="6" textAnchor="middle" fontSize="6" fill="currentColor" opacity="0.5">
            ▲ 앞
          </text>
          {BODY_PARTS.map((p) => (
            <g key={p.id}>
              <rect x={p.x} y={p.y} width={p.w} height={p.h} rx={p.round ? 6 : 3} fill="var(--bg)" stroke="var(--line-strong)" strokeWidth="1">
                <title>{p.label}</title>
              </rect>
            </g>
          ))}
          {marks.map((m, i) => (
            <g
              key={i}
              onClick={(e) => {
                e.stopPropagation();
                remove(i);
              }}
              className={readOnly ? "" : "cursor-pointer"}
            >
              <circle cx={m.x} cy={m.y} r="7" fill={MARK_KINDS[m.kind].color} stroke="white" strokeWidth="1.5" />
              <text x={m.x} y={m.y + 3} textAnchor="middle" fontSize="8" fontWeight="700" fill="white">
                {m.kind}
              </text>
              <title>
                {MARK_KINDS[m.kind].label} · {partLabel(m.part)}
                {readOnly ? "" : " (누르면 지움)"}
              </title>
            </g>
          ))}
        </svg>
      </div>
      <div className="text-sm">
        {!readOnly && <p className="mb-2 text-xs text-[var(--muted)]">기호를 고르고 도면에서 그 자리를 누르세요. 잘못 찍은 표시는 다시 누르면 지워집니다. 수리할 곳은 O, 수리 범위 밖의 기존 손상은 D·S·C·R·W로 찍습니다.</p>}
        {marks.length ? (
          <ol className="space-y-1">
            {marks.map((m, i) => (
              <li key={i} className="flex items-center gap-2">
                <span className="grid size-5 shrink-0 place-items-center rounded-full text-xs font-bold text-white" style={{ background: MARK_KINDS[m.kind].color }}>
                  {m.kind}
                </span>
                <span>
                  {partLabel(m.part)} · {MARK_KINDS[m.kind].label}
                </span>
                {!readOnly && (
                  <button type="button" onClick={() => remove(i)} className="ml-auto text-xs text-[var(--danger)] hover:underline">
                    지우기
                  </button>
                )}
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-[var(--muted)]">표시 없음{readOnly ? "" : " — 기존 손상이 정말 없으면 그대로 두고, 고객과 함께 확인합니다"}</p>
        )}
      </div>
    </div>
  );
}
