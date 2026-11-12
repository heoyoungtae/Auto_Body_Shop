"use client";
// 주 거래 업체 찾기 칸: 이름·초성으로 찾아 고르고, 없으면 '+ 새 업체'로 옆 창에서 바로 등록한다(화면을 떠나지 않음).
// 새 업체 창은 품목 폼 밖(body)에 그려서 폼 안에 폼이 생기지 않게 하고, 적던 품목 내용은 그대로 둔다.
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { SUPPLIER_KINDS } from "@/modules/purchase/rules";
import { findIn, normalize } from "../_menu-search";
import { PAY_TERMS } from "@/modules/money/rules";
import { ShowWhen } from "../consults/show-when";
import { CheckGroup, NumberField, RadioRow, Shell, TextField } from "../_input";
import { buttonClass, Card } from "../_ui";
import { quickSupplierAction } from "./actions";

export type SupOpt = { id: string; name: string; status: string };

const STATUS: Record<string, string> = { candidate: "후보", proposed: "등록 제안" };
/** 품목 구분 → 업체 취급 분야 */
const KIND_TO_SUP: Record<string, string> = { paint: "paint", consumable: "consumable", part: "parts" };

export function SupplierPicker({ suppliers, defaultValue, canCreate }: { suppliers: SupOpt[]; defaultValue?: string | null; canCreate: boolean }) {
  const id = useId();
  const [list, setList] = useState(suppliers);
  const [value, setValue] = useState(defaultValue ?? "");
  const chosen = list.find((s) => s.id === value) ?? null;
  const [q, setQ] = useState(chosen?.name ?? "");
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [notice, setNotice] = useState("");
  const box = useRef<HTMLDivElement>(null);
  const hidden = useRef<HTMLInputElement>(null);

  // 폼 도우미가 값을 되살리면(서버 오류로 돌아옴) 숨은 칸 값으로 맞춘다
  useEffect(() => {
    const form = hidden.current?.form;
    if (!form) return;
    const sync = () => {
      const snap = (form as HTMLFormElement & { assistSnap?: Record<string, string[]> }).assistSnap;
      const v = snap?.supplierId?.[0];
      if (v != null) {
        setValue(v);
        setQ(list.find((s) => s.id === v)?.name ?? "");
      }
    };
    form.addEventListener("assist:restored", sync);
    return () => form.removeEventListener("assist:restored", sync);
  }, [list]);

  useEffect(() => {
    const close = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const hits = useMemo(() => {
    const n = normalize(q);
    if (!n || (chosen && q === chosen.name)) return list;
    return list.filter((s) => findIn(normalize(s.name), n) >= 0);
  }, [q, list, chosen]);

  const pick = (s: SupOpt | null) => {
    setValue(s?.id ?? "");
    setQ(s?.name ?? "");
    setOpen(false);
    hidden.current?.form?.dispatchEvent(new Event("input", { bubbles: true }));
  };

  const kindNow = () => {
    const form = hidden.current?.form;
    const k = form ? new FormData(form).get("kind") : null;
    return KIND_TO_SUP[String(k ?? "")] ?? "";
  };

  return (
    <div ref={box} className="relative">
      <Shell id={id} helpKey="st.supplierId">
        <div className="flex gap-2">
          <input
            id={id}
            type="search"
            role="combobox"
            aria-expanded={open}
            aria-controls={`${id}-list`}
            autoComplete="off"
            value={q}
            placeholder="업체 이름(초성 가능)"
            onFocus={() => setOpen(true)}
            onChange={(e) => {
              setQ(e.currentTarget.value);
              setOpen(true);
              if (!e.currentTarget.value) setValue("");
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (hits[0]) pick(hits[0]);
              } else if (e.key === "Escape") setOpen(false);
            }}
            className="block h-11 w-full rounded-md border border-[var(--line-strong)] bg-[var(--surface)] px-3 text-base shadow-[var(--shadow)] outline-none focus:border-[var(--accent)] focus:ring-3 focus:ring-[var(--accent)]/15"
          />
          {canCreate && (
            <button type="button" onClick={() => setAdding(true)} className={buttonClass("secondary")}>
              + 새 업체
            </button>
          )}
        </div>
        <input ref={hidden} type="hidden" name="supplierId" value={value} />
        {notice && <p className="mt-1 text-xs text-[var(--ok)]">{notice}</p>}
        {!value && q && !open && <p className="mt-1 text-xs text-[var(--warn)]">목록에서 업체를 고르지 않아 비어 있게 저장됩니다.</p>}
      </Shell>
      {open && (
        <ul id={`${id}-list`} role="listbox" className="absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-md border border-[var(--line)] bg-[var(--surface)] text-sm shadow-lg">
          <li>
            <button type="button" onClick={() => pick(null)} className="w-full px-3 py-2 text-left text-[var(--muted)] hover:bg-[var(--surface-2)]">
              업체 미정(비워 두기)
            </button>
          </li>
          {hits.map((s) => (
            <li key={s.id} role="option" aria-selected={s.id === value}>
              <button type="button" onClick={() => pick(s)} className={`flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-[var(--accent-soft)] ${s.id === value ? "font-semibold" : ""}`}>
                {s.name}
                {STATUS[s.status] && <span className="text-xs text-[var(--muted)]">({STATUS[s.status]})</span>}
              </button>
            </li>
          ))}
          {!hits.length && (
            <li className="px-3 py-2 text-[var(--muted)]">
              '{q}' 업체가 없습니다.
              {canCreate && (
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    setAdding(true);
                  }}
                  className="ml-1 font-medium text-[var(--accent)]"
                >
                  새 업체로 등록
                </button>
              )}
            </li>
          )}
        </ul>
      )}
      {adding && (
        <QuickSupplier
          initialName={chosen ? "" : q}
          kind={kindNow()}
          onClose={() => setAdding(false)}
          onDone={(s) => {
            const opt = { id: s.id, name: s.name, status: "candidate" };
            setList((l) => [...l, opt].sort((a, b) => a.name.localeCompare(b.name, "ko")));
            pick(opt);
            setAdding(false);
            setNotice(`${s.name}을(를) 후보 업체로 등록하고 골랐습니다. 정식 발주 전에 협력업체 화면에서 등록 평가를 하세요.`);
          }}
        />
      )}
    </div>
  );
}

function QuickSupplier({ initialName, kind, onClose, onDone }: { initialName: string; kind: string; onClose: () => void; onDone: (s: { id: string; name: string }) => void }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const first = useRef<HTMLDivElement>(null);
  useEffect(() => {
    first.current?.querySelector("input")?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label="새 업체 간이 등록" className="h-full w-full max-w-md overflow-y-auto bg-[var(--bg)] p-3 shadow-xl">
        <Card title="새 업체 간이 등록" help={{ kind: "panel", id: "stock.quickSupplier" }}>
          <form
            className="grid gap-3"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              const r = await quickSupplierAction(new FormData(e.currentTarget));
              setBusy(false);
              if (r.ok) onDone(r);
              else setError(r.error);
            }}
          >
            <div ref={first}>
              <TextField help="sup.name" name="name" required defaultValue={initialName} />
            </div>
            <CheckGroup help="sup.kinds" name="kinds" defaultChecked={kind ? [kind] : []} options={Object.entries(SUPPLIER_KINDS).map(([value, label]) => ({ value, label }))} />
            <TextField help="sup.items" name="items" />
            <TextField help="sup.contactName" name="contactName" />
            <TextField help="sup.phone" name="phone" type="tel" />
            <TextField help="sup.bizNo" name="bizNo" inputMode="numeric" />
            <ShowWhen field="payTerm" initial="next_end" cases={{ next_day: <NumberField help="sup.payDay" name="payDay" unit="일" min={1} max={31} required defaultValue={10} /> }}>
              <RadioRow help="sup.payTerm" name="payTerm" required defaultValue="next_end" options={Object.entries(PAY_TERMS).map(([value, label]) => ({ value, label }))} />
            </ShowWhen>
            <p className="text-xs text-[var(--muted)]">입금 계좌·서류는 저장한 뒤 협력업체 화면에서 넣습니다.</p>
            {error && (
              <p role="alert" className="text-sm font-medium text-[var(--danger)]">
                {error}
              </p>
            )}
            <div className="flex gap-2">
              <button type="submit" disabled={busy} className={buttonClass()}>
                {busy ? "등록 중…" : "등록하고 고르기"}
              </button>
              <button type="button" onClick={onClose} className={buttonClass("secondary")}>
                닫기
              </button>
            </div>
          </form>
        </Card>
      </div>
    </div>,
    document.body,
  );
}
