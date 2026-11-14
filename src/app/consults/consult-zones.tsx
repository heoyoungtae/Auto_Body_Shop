"use client";
// 상담의 손상 부위 찍기: 손님 말을 들으며 차 그림에서 부위를 누른다. 찍은 것은 숨은 칸 damageZones(JSON)로 보내고,
// '손상 부위' 글 칸이 비어 있거나 앞서 저절로 채운 글이면 "왼쪽 앞도어(아래 뒤) 찌그러짐"처럼 다시 채운다(다시 적지 않게).
// 손상 유형 체크도 찍은 기호에 맞춰 켠다. 입고 때 이 부위들이 차체 도면의 수리 대상(O)으로 넘어간다.
import { useEffect, useId, useRef, useState } from "react";
import { Shell } from "../_input";
import { carOf, type CarLook, cellsLabel, isView, partLabel, type View } from "@/modules/repair/body-map";
import { CarMap } from "../repairs/car-map";

export type Zone = { part: string; view: View; cell: number; kind: ZoneKind };
type ZoneKind = "D" | "S" | "C" | "R" | "W";
/** 기호 → 상담의 손상 유형 이름(DAMAGE_TYPES) */
const KINDS: Record<ZoneKind, { label: string; type: string; color: string }> = {
  D: { label: "찌그러짐", type: "찌그러짐", color: "#dc2626" },
  S: { label: "긁힘", type: "긁힘", color: "#ea580c" },
  C: { label: "깨짐·크랙", type: "기타", color: "#7c3aed" },
  R: { label: "부식", type: "부식", color: "#92400e" },
  W: { label: "휠 긁힘", type: "긁힘", color: "#0f766e" },
};
const isKind = (k: string): k is ZoneKind => k in KINDS;

/** 찍은 부위 → 문장. 같은 부위·기호는 칸을 모아 한 번만 */
export function zonesText(zones: Zone[]): string {
  const groups = new Map<string, Zone[]>();
  for (const z of zones) groups.set(`${z.part}|${z.kind}|${z.view}`, [...(groups.get(`${z.part}|${z.kind}|${z.view}`) ?? []), z]);
  return [...groups.values()]
    .map((g) => {
      const cells = [...new Set(g.map((z) => z.cell))];
      const where = cellsLabel(g[0].view, cells);
      return `${partLabel(g[0].part)}${where === "전체" ? "" : `(${where})`} ${KINDS[g[0].kind].label}`;
    })
    .join(", ");
}

/** 폼에서 지금 고른 차량의 모양: 고른 차량(cars) → 새로 적는 차량 칸(차형·차종·사양) → 넘겨받은 것 */
function carInForm(form: HTMLFormElement, cars: Record<string, CarLook>, fallback?: CarLook): CarLook | undefined {
  const fd = new FormData(form);
  const vid = String(fd.get("vehicleId") ?? "");
  if (vid && cars[vid]) return cars[vid];
  if (fd.has("model")) return carOf({ bodyType: String(fd.get("bodyType") ?? ""), model: String(fd.get("model") ?? ""), options: fd.getAll("options").map(String) });
  return fallback;
}

export function ConsultZones({ initial, cars = {}, car: car0 }: { initial: { part: string; view: string; cell: number; kind: string }[]; cars?: Record<string, CarLook>; car?: CarLook }) {
  const [zones, setZones] = useState<Zone[]>(() => initial.filter((z): z is Zone => isView(z.view) && isKind(z.kind)));
  const [car, setCar] = useState<CarLook | undefined>(car0);
  const [kind, setKind] = useState<ZoneKind>("D");
  const hidden = useRef<HTMLInputElement>(null);
  const lastAuto = useRef(zonesText(zones));
  const id = `cz-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;

  // 서버 오류로 돌아와 폼 값이 되살려지면 다시 그린다
  useEffect(() => {
    const form = hidden.current?.form;
    if (!form) return;
    const sync = () =>
      setTimeout(() => {
        try {
          const z = JSON.parse(hidden.current?.value || "[]") as Zone[];
          setZones(z);
          lastAuto.current = zonesText(z);
        } catch {
          /* 무시 */
        }
      }, 0);
    form.addEventListener("assist:restored", sync);
    // 차량을 고르거나 차종·차형·사양을 바꾸면 그림도 바꾼다
    const look = () => setTimeout(() => setCar(carInForm(form, cars, car0)), 0);
    look();
    form.addEventListener("change", look);
    form.addEventListener("input", look);
    return () => {
      form.removeEventListener("assist:restored", sync);
      form.removeEventListener("change", look);
      form.removeEventListener("input", look);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const apply = (next: Zone[]) => {
    setZones(next);
    const form = hidden.current?.form;
    if (!form) return;
    // 글 칸: 비었거나 저절로 채운 그대로면 새 문장으로
    const ta = form.querySelector<HTMLTextAreaElement>('textarea[name="damageParts"]');
    const text = zonesText(next);
    if (ta && (!ta.value.trim() || ta.value === lastAuto.current)) {
      const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
      set?.call(ta, text);
      ta.dispatchEvent(new Event("input", { bubbles: true }));
    }
    lastAuto.current = text;
    // 손상 유형: 찍은 기호의 유형을 켠다(끄지는 않음)
    for (const z of next) {
      const box = form.querySelector<HTMLInputElement>(`input[name="damageTypes"][value="${KINDS[z.kind].type}"]`);
      if (box && !box.checked) box.click();
    }
    queueMicrotask(() => form.dispatchEvent(new Event("change", { bubbles: true })));
  };

  return (
    <Shell id={id} helpKey="consult.damageZones">
    <div className="space-y-2">
      <input ref={hidden} type="hidden" name="damageZones" value={JSON.stringify(zones)} />
      <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="찍을 손상">
        {(Object.keys(KINDS) as ZoneKind[]).map((k) => (
          <button
            key={k}
            id={k === "D" ? id : undefined}
            type="button"
            role="radio"
            aria-checked={kind === k}
            onClick={() => setKind(k)}
            className={`flex min-h-9 items-center gap-1 rounded-md border px-2 text-sm ${kind === k ? "border-[var(--accent)] bg-[var(--accent-soft)] font-semibold" : "border-[var(--line)]"}`}
          >
            <span className="size-3 rounded-full" style={{ background: KINDS[k].color }} />
            {KINDS[k].label}
          </button>
        ))}
      </div>
      <div className="rounded-md border border-[var(--line)] bg-[var(--surface-2)] p-2">
        <CarMap
          label="손님이 말한 손상 부위(펼친 차 그림)"
          car={car}
          fills={zones.map((z) => ({ part: z.part, view: z.view, cells: [z.cell], color: KINDS[z.kind].color, strength: 0.3 }))}
          pins={zones.map((z, i) => ({
            key: String(i),
            part: z.part,
            view: z.view,
            cell: z.cell,
            color: KINDS[z.kind].color,
            text: z.kind,
            title: `${partLabel(z.part)} · ${KINDS[z.kind].label} (누르면 지움)`,
            onClick: () => apply(zones.filter((_, j) => j !== i)),
          }))}
          onPick={(part, view, cell) => apply([...zones, { part, view, cell, kind }])}
        />
      </div>
      <p className="text-xs text-[var(--muted)]">
        {zones.length ? `${zones.length}곳 찍음 — 아래 '손상 부위' 글이 저절로 채워집니다. 찍은 곳을 다시 누르면 지워집니다.` : "손상 종류를 고르고 그림에서 손님이 말한 곳을 누르세요. 사진을 받았거나 모르면 비워 두고 글로만 적어도 됩니다."}
      </p>
    </div>
    </Shell>
  );
}

/** 상담 상세: 찍은 부위를 보기만 */
export function ConsultZonesView({ zones, car }: { zones: { part: string; view: string; cell: number; kind: string }[]; car?: CarLook }) {
  const list = zones.filter((z): z is Zone => isView(z.view) && isKind(z.kind));
  if (!list.length) return null;
  return (
    <div className="mt-3">
      <CarMap
        label="손님이 말한 손상 부위"
        car={car}
        fills={list.map((z) => ({ part: z.part, view: z.view, cells: [z.cell], color: KINDS[z.kind].color, strength: 0.3 }))}
        pins={list.map((z, i) => ({ key: String(i), part: z.part, view: z.view, cell: z.cell, color: KINDS[z.kind].color, text: z.kind, title: `${partLabel(z.part)} · ${KINDS[z.kind].label}` }))}
      />
      <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--muted)]">
        {(Object.keys(KINDS) as ZoneKind[])
          .filter((k) => list.some((z) => z.kind === k))
          .map((k) => (
            <span key={k} className="inline-flex items-center gap-1">
              <span className="size-2.5 rounded-full" style={{ background: KINDS[k].color }} />
              {k} {KINDS[k].label}
            </span>
          ))}
        <span>— 입고 때 차체 도면으로 넘어갑니다</span>
      </p>
    </div>
  );
}
