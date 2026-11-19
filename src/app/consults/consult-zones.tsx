"use client";
// 상담의 손상 부위 찍기: 손님 말을 들으며 차 그림에서 부위를 누른다. 찍은 것은 숨은 칸 damageZones(JSON)로 보낸다.
// 그림과 '손상 부위' 글은 양쪽으로 맞춘다(대표 요청 2026-11-19, 규칙은 modules/repair/damage-text):
//  - 그림을 누르면 글에 "왼쪽 앞도어(아래 뒤) 찌그러짐"이 붙고, 찍은 곳을 지우면 그 조각만 글에서 빠진다(직접 적은 말은 그대로).
//  - 글에 부위 이름을 적으면 그림에 찍히고, 글에서 지우면 그림에서도 지워진다. 알아보지 못한 글은 글로만 남는다.
// 손상 유형 체크도 찍은 기호에 맞춰 켠다. 입고 때 이 부위들이 차체 도면의 수리 대상(O)으로 넘어간다.
// 기호마다 찍을 수 있는 부위가 정해져 있다(휠 긁힘=바퀴만, 유리·램프엔 찌그러짐·부식 없음: body-map kindFit).
import { useEffect, useId, useRef, useState } from "react";
import { Shell } from "../_input";
import { carOf, type CarLook, isView, kindFit, kindWhy, partLabel } from "@/modules/repair/body-map";
import { circled, parseDamageText, renumberText, textFromZones, type Zone, type ZoneKind, zoneNumbers, zonesFromText } from "@/modules/repair/damage-text";
import { CarMap, PinIcon, type PinShape } from "../repairs/car-map";

/** 기호 → 상담의 손상 유형 이름(DAMAGE_TYPES) */
// 표시: 글 줄과 같은 번호(①②), 색과 모양은 손상 종류(색을 못 구분해도 모양으로)
const KINDS: Record<ZoneKind, { label: string; type: string; color: string; shape: PinShape }> = {
  D: { label: "찌그러짐", type: "찌그러짐", color: "#dc2626", shape: "circle" },
  S: { label: "긁힘", type: "긁힘", color: "#ea580c", shape: "square" },
  C: { label: "깨짐·크랙", type: "기타", color: "#7c3aed", shape: "diamond" },
  R: { label: "부식", type: "부식", color: "#92400e", shape: "hexagon" },
  W: { label: "휠 긁힘", type: "긁힘", color: "#0f766e", shape: "rounded" },
};
/** 그림 표시들: 번호는 글 줄 번호, 글에 짝이 없으면 종류 글자 */
function pinsOf(zones: Zone[], text: string, body: CarLook["body"] | undefined, onRemove?: (i: number) => void) {
  const nums = zoneNumbers(text, zones, body);
  return zones.map((z, i) => ({
    key: String(i),
    part: z.part,
    view: z.view,
    cell: z.cell,
    color: KINDS[z.kind].color,
    shape: KINDS[z.kind].shape,
    text: nums[i] ? String(nums[i]) : z.kind,
    title: `${nums[i] ? `${circled(nums[i])} ` : ""}${partLabel(z.part)} · ${KINDS[z.kind].label}${onRemove ? " (누르면 지움)" : ""}`,
    onClick: onRemove ? () => onRemove(i) : undefined,
  }));
}
/** 범례: 쓴 종류만 */
function Legend({ zones, tail }: { zones: Zone[]; tail?: string }) {
  return (
    <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--muted)]">
      {(Object.keys(KINDS) as ZoneKind[])
        .filter((k) => zones.some((z) => z.kind === k))
        .map((k) => (
          <span key={k} className="inline-flex items-center gap-1">
            <PinIcon shape={KINDS[k].shape} color={KINDS[k].color} size={12} />
            {KINDS[k].label}
          </span>
        ))}
      {tail && <span>{tail}</span>}
    </p>
  );
}
const isKind = (k: string): k is ZoneKind => k in KINDS;

/** 폼에서 지금 고른 차량의 모양: 고른 차량(cars) → 새로 적는 차량 칸(차형·차종·사양) → 넘겨받은 것 */
function carInForm(form: HTMLFormElement, cars: Record<string, CarLook>, fallback?: CarLook): CarLook | undefined {
  const fd = new FormData(form);
  const vid = String(fd.get("vehicleId") ?? "");
  if (vid && cars[vid]) return cars[vid];
  if (fd.has("model")) return carOf({ bodyType: String(fd.get("bodyType") ?? ""), model: String(fd.get("model") ?? ""), options: fd.getAll("options").map(String) });
  return fallback;
}

const textArea = (form: HTMLFormElement | null | undefined) => form?.querySelector<HTMLTextAreaElement>('textarea[name="damageParts"]') ?? null;

/** 손상 유형 체크 → 그림에서 찍을 기호(도장 박리·기타는 짝이 없음) */
const TYPE_KIND: Record<string, ZoneKind> = { 찌그러짐: "D", 긁힘: "S", 부식: "R" };

export function ConsultZones({ initial, cars = {}, car: car0 }: { initial: { part: string; view: string; cell: number; kind: string }[]; cars?: Record<string, CarLook>; car?: CarLook }) {
  const [zones, setZones] = useState<Zone[]>(() => initial.filter((z): z is Zone => isView(z.view) && isKind(z.kind)));
  const [car, setCar] = useState<CarLook | undefined>(car0);
  const [kind, setKind] = useState<ZoneKind>("D");
  const [note, setNote] = useState<string>("");
  const [text, setText] = useState<string>("");
  const hidden = useRef<HTMLInputElement>(null);
  // 이벤트 처리기(한 번 붙임)가 늘 지금 값을 보도록
  const now = useRef({ zones, car, kind });
  now.current = { zones, car, kind };
  // 글을 고치는 도중 잠깐 빠졌다 돌아온 부위는 찍었던 자리를 되살린다
  const gone = useRef<Zone[]>([]);
  const writing = useRef(false);
  // 그림·글 때문에 저절로 켠 손상 유형(그 기호가 다 지워지면 끈다. 손으로 켠 것은 두기)
  const autoOn = useRef(new Set<string>());

  /**
   * 손상 유형 체크를 찍은 기호에 맞춘다(대표 요청 2026-11-19 "손상유형 체크도 자동으로 연동").
   * 찍은 기호의 유형은 켜고, 저절로 켰던 유형은 그 기호가 하나도 남지 않으면 끈다.
   */
  function syncTypes(form: HTMLFormElement, zones: Zone[]) {
    const used = new Set(zones.map((z) => KINDS[z.kind].type));
    for (const box of form.querySelectorAll<HTMLInputElement>('input[name="damageTypes"]')) {
      const want = used.has(box.value) ? true : autoOn.current.has(box.value) ? false : box.checked;
      if (want && !box.checked) autoOn.current.add(box.value);
      if (!want) autoOn.current.delete(box.value);
      if (want !== box.checked) {
        box.checked = want;
        writing.current = true;
        box.dispatchEvent(new Event("change", { bubbles: true }));
        writing.current = false;
      }
    }
  }
  const id = `cz-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;

  useEffect(() => {
    const form = hidden.current?.form;
    if (!form) return;
    const ta = textArea(form);
    setText(ta?.value ?? "");
    // 서버 오류로 돌아와 폼 값이 되살려지면 다시 그린다
    const sync = () =>
      setTimeout(() => {
        try {
          setZones(JSON.parse(hidden.current?.value || "[]") as Zone[]);
          setText(textArea(form)?.value ?? "");
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
    // 글 → 그림: 적다 멈추면(0.4초) 맞춘다
    let timer: ReturnType<typeof setTimeout> | undefined;
    const typed = (e: Event) => {
      if (e.target !== textArea(form) || writing.current) return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        const t = textArea(form)?.value ?? "";
        setText(t);
        const { zones: cur, car: c, kind: k } = now.current;
        const next = zonesFromText(t, [...cur, ...gone.current], c?.body, k);
        const keyOf = (z: Zone) => `${z.part}|${z.view}|${z.cell}|${z.kind}`;
        if (next.map(keyOf).join() === cur.map(keyOf).join()) return;
        const lost = cur.filter((z) => !next.some((n) => keyOf(n) === keyOf(z)));
        gone.current = [...gone.current.filter((g) => !next.some((n) => n.part === g.part)), ...lost].slice(-40);
        setZones(next);
        syncTypes(form, next);
        queueMicrotask(() => form.dispatchEvent(new Event("change", { bubbles: true })));
      }, 400);
    };
    form.addEventListener("input", typed);
    // 글 칸을 떠나면 한 줄에 하나씩, 앞에 ①②를 다시 붙인다
    const left = (e: Event) => {
      const ta = textArea(form);
      if (e.target !== ta || !ta) return;
      const t = renumberText(ta.value, now.current.car?.body);
      if (t !== ta.value) put(ta, t);
      setText(ta.value);
    };
    form.addEventListener("focusout", left);
    // 손상 유형을 손으로 켜면 그 기호로 찍을 준비, 그림에 그 기호가 남아 있으면 끄지 못하게 한다
    const ticked = (e: Event) => {
      const box = e.target as HTMLInputElement;
      if (writing.current || box?.name !== "damageTypes") return;
      autoOn.current.delete(box.value);
      if (box.checked) {
        const k = TYPE_KIND[box.value];
        if (k) {
          setKind(k);
          setNote(`그림에서 누르면 '${KINDS[k].label}'으로 찍힙니다`);
        }
        return;
      }
      const remain = now.current.zones.filter((z) => KINDS[z.kind].type === box.value);
      if (remain.length) {
        box.checked = true;
        autoOn.current.add(box.value);
        setNote(`그림에 '${box.value}' 표시가 ${remain.length}곳 남아 있어 끌 수 없습니다. 그림이나 글에서 먼저 지우면 저절로 꺼집니다.`);
      }
    };
    form.addEventListener("change", ticked);
    return () => {
      form.removeEventListener("focusout", left);
      form.removeEventListener("change", ticked);
      clearTimeout(timer);
      form.removeEventListener("assist:restored", sync);
      form.removeEventListener("change", look);
      form.removeEventListener("input", look);
      form.removeEventListener("input", typed);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** 글 칸에 값 넣기(글 → 그림 맞추기는 건너뜀) */
  function put(ta: HTMLTextAreaElement, t: string) {
    const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
    writing.current = true;
    set?.call(ta, ta.maxLength > 0 ? t.slice(0, ta.maxLength) : t);
    ta.dispatchEvent(new Event("input", { bubbles: true }));
    writing.current = false;
  }

  /** 그림 → 글 */
  const apply = (next: Zone[]) => {
    const prev = zones;
    setZones(next);
    gone.current = gone.current.filter((g) => !next.some((n) => n.part === g.part));
    const form = hidden.current?.form;
    if (!form) return;
    const ta = textArea(form);
    if (ta) {
      const t = renumberText(textFromZones(ta.value, prev, next, car?.body), car?.body);
      if (t !== ta.value) put(ta, t);
      setText(ta.value);
    }
    syncTypes(form, next);
    queueMicrotask(() => form.dispatchEvent(new Event("change", { bubbles: true })));
  };

  const pick = (part: string, view: Zone["view"], cell: number) => {
    const k = kindFit(part, kind) as ZoneKind | null;
    if (!k) {
      setNote(kindWhy(kind));
      return;
    }
    setNote(k !== kind ? `${partLabel(part)}은(는) 바퀴라서 '${KINDS[k].label}'으로 찍었습니다` : "");
    apply([...zones, { part, view, cell, kind: k }]);
  };

  // 글에서 그림에 넣지 못한 조각(입력 도우미)
  const segs = text.trim() ? parseDamageText(text, car?.body) : [];
  const onMap = [...new Set(segs.flatMap((s) => s.items.map((i) => partLabel(i.part))))];
  const offMap = segs.filter((s) => s.raw.trim() && s.issues.length);

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
            onClick={() => {
              setKind(k);
              setNote(k === "W" ? "휠 긁힘은 바퀴(휠)에만 찍을 수 있어 다른 곳은 흐리게 보입니다" : k === "D" || k === "R" ? `${KINDS[k].label}은 유리·램프에는 찍을 수 없습니다` : "");
            }}
            className={`flex min-h-9 items-center gap-1 rounded-md border px-2 text-sm ${kind === k ? "border-[var(--accent)] bg-[var(--accent-soft)] font-semibold" : "border-[var(--line)]"}`}
          >
            <PinIcon shape={KINDS[k].shape} color={KINDS[k].color} size={13} />
            {KINDS[k].label}
          </button>
        ))}
      </div>
      <div className="rounded-md border border-[var(--line)] bg-[var(--surface-2)] p-2">
        <CarMap
          label="손님이 말한 손상 부위(펼친 차 그림)"
          car={car}
          fills={zones.map((z) => ({ part: z.part, view: z.view, cells: [z.cell], color: KINDS[z.kind].color, strength: 0.3 }))}
          pins={pinsOf(zones, text, car?.body, (i) => apply(zones.filter((_, j) => j !== i)))}
          canPick={(part) => kindFit(part, kind) !== null}
          onPick={pick}
        />
      </div>
      {zones.length > 0 && <Legend zones={zones} />}
      {note && (
        <p className="text-xs font-medium text-[var(--warn)]" role="status">
          {note}
        </p>
      )}
      <p className="text-xs text-[var(--muted)]">
        {zones.length
          ? `${zones.length}곳 찍음 — 그림의 번호는 아래 '손상 부위' 글의 ①② 줄과 같습니다. 찍은 곳을 다시 누르거나 글에서 그 줄을 지우면 둘 다 지워지고 번호는 다시 매겨집니다.`
          : "손상 종류를 고르고 그림에서 손님이 말한 곳을 누르세요. 아래 글에 '본넷 찌그러짐', '운전석 앞도어 긁힘'처럼 적어도 그림에 찍힙니다."}
      </p>
      {offMap.length > 0 && (
        <div className="rounded-md border border-dashed border-[var(--line)] px-2 py-1.5 text-xs" aria-live="polite">
          {onMap.length > 0 && <p className="text-[var(--muted)]">글에서 그림에 찍은 부위: {onMap.join(", ")}</p>}
          <p className="font-medium">그림에 넣지 못한 글(글로만 저장됩니다):</p>
          <ul className="list-disc pl-4">
            {offMap.map((s, i) => (
              <li key={i}>
                &lsquo;{s.raw.trim()}&rsquo; — {s.issues.join(" · ")}
              </li>
            ))}
          </ul>
          <p className="text-[var(--muted)]">왼쪽·오른쪽(운전석·조수석)과 앞·뒤를 붙여 적으면 그림에 찍힙니다. 예: 조수석 뒤펜더 긁힘</p>
        </div>
      )}
    </div>
    </Shell>
  );
}

/** 상담 상세: 찍은 부위를 보기만. 번호는 저장된 '손상 부위' 글의 줄 번호 */
export function ConsultZonesView({ zones, car, text = "" }: { zones: { part: string; view: string; cell: number; kind: string }[]; car?: CarLook; text?: string | null }) {
  const list = zones.filter((z): z is Zone => isView(z.view) && isKind(z.kind));
  if (!list.length) return null;
  return (
    <div className="mt-3 space-y-1">
      <CarMap label="손님이 말한 손상 부위" car={car} fills={list.map((z) => ({ part: z.part, view: z.view, cells: [z.cell], color: KINDS[z.kind].color, strength: 0.3 }))} pins={pinsOf(list, text ?? "", car?.body)} />
      <Legend zones={list} tail="— 번호는 '부위' 글의 줄 번호, 입고 때 차체 도면으로 넘어갑니다" />
    </div>
  );
}
