"use client";
// 차체 도면(F-02-01): 펼친 차 그림(앞·뒤·위·왼쪽·오른쪽)에 기존 손상을 기호로 찍는다(STD-02 4절 4단계).
// 기호를 고르고 부위를 누르면 누른 자리(부위 안 3×3 칸)에 표시가 생기고, 표시를 다시 누르면 지워진다. 값은 숨은 칸 marks(JSON)로 보낸다.
import { useEffect, useRef, useState } from "react";
import { cellLabel, VIEW_LABEL } from "@/modules/repair/body-map";
import { MARK_KINDS, partLabel, type BodyMark, type MarkKind } from "@/modules/repair/rules";
import { CarMap } from "./car-map";

export function BodyDiagram({ initial, readOnly = false, name = "marks" }: { initial: BodyMark[]; readOnly?: boolean; name?: string }) {
  const [marks, setMarks] = useState<BodyMark[]>(initial);
  const [kind, setKind] = useState<MarkKind>("S");
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

  const changed = () => queueMicrotask(() => hidden.current?.form?.dispatchEvent(new Event("change", { bubbles: true })));
  const remove = (i: number) => {
    if (readOnly) return;
    setMarks(marks.filter((_, j) => j !== i));
    changed();
  };
  const where = (m: BodyMark) => `${partLabel(m.part)} · ${cellLabel(m.view, m.cell)}`;

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_16rem]">
      <input ref={hidden} type="hidden" name={name} value={JSON.stringify(marks)} />
      <div className="min-w-0">
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
        <CarMap
          label="차체 도면(펼친 차 그림)"
          fills={marks.map((m) => ({ part: m.part, view: m.view, cells: [m.cell], color: MARK_KINDS[m.kind].color, strength: 0.28 }))}
          pins={marks.map((m, i) => ({
            key: String(i),
            part: m.part,
            view: m.view,
            cell: m.cell,
            color: MARK_KINDS[m.kind].color,
            text: m.kind,
            title: `${MARK_KINDS[m.kind].label} · ${where(m)}${readOnly ? "" : " (누르면 지움)"}`,
            onClick: readOnly ? undefined : () => remove(i),
          }))}
          onPick={
            readOnly
              ? undefined
              : (part, view, cell) => {
                  setMarks([...marks, { part, view, cell, kind }]);
                  changed();
                }
          }
        />
      </div>
      <div className="text-sm">
        {!readOnly && (
          <p className="mb-2 text-xs text-[var(--muted)]">
            기호를 고르고 그림에서 그 자리를 누르세요. 부위 안에서 누른 자리(위·아래, 앞·뒤)까지 기록됩니다. 잘못 찍은 표시는 다시 누르면 지워집니다. 수리할 곳은 O, 수리 범위 밖의 기존 손상은 D·S·C·R·W로 찍습니다. 위의 면 단추(앞·왼쪽·위·오른쪽·뒤)를 누르면 한 면을 크게 봅니다.
          </p>
        )}
        {marks.length ? (
          <ol className="space-y-1">
            {marks.map((m, i) => (
              <li key={i} className="flex items-center gap-2">
                <span className="grid size-5 shrink-0 place-items-center rounded-full text-xs font-bold text-white" style={{ background: MARK_KINDS[m.kind].color }}>
                  {m.kind}
                </span>
                <span>
                  {where(m)} · {MARK_KINDS[m.kind].label}
                  <span className="ml-1 text-xs text-[var(--muted)]">({VIEW_LABEL[m.view]})</span>
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
