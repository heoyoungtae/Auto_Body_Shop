"use client";
// 폼 도우미: 서버가 오류로 돌려보내도 적은 값을 되살리고, 긴 양식은 이 기기에 임시 저장하고,
// 저장하지 않고 나가려 하면 묻는다. 비밀번호 칸은 어디에도 저장하지 않는다.
// fresh 를 주면(고치기 양식) 동시 수정을 확인한다(2026-11-20): 화면을 연 뒤 다른 사람이 같은 칸을 먼저 고쳤으면
// 서버가 저장하지 않고 돌려보내고(src/modules/platform/fresh.ts), 여기서 달라진 칸을 보여 주며
// 내가 안 고친 칸은 그 사람 값, 내가 고친 칸은 내 값으로 맞춰 둔다. '고치는 중' 표시도 붙인다(_presence.tsx).
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type ComponentProps } from "react";
import { FormBar } from "./_form-bar";
import { Presence } from "./_presence";

type Snapshot = Record<string, string[]>;

const SKIP = new Set(["password", "hidden", "submit", "button", "file"]);

function snapshot(form: HTMLFormElement): Snapshot {
  const out: Snapshot = {};
  for (const el of Array.from(form.elements)) {
    if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement)) continue;
    // 숫자 칸은 이름 있는 숨은 칸이 값을 들고 있으므로 data-raw-for 가 붙은 숨은 칸은 저장한다
    const hiddenRaw = el instanceof HTMLInputElement && el.type === "hidden" && el.dataset.rawFor;
    if (!el.name || (el instanceof HTMLInputElement && SKIP.has(el.type) && !hiddenRaw)) continue;
    if (el instanceof HTMLInputElement && (el.type === "checkbox" || el.type === "radio")) {
      out[el.name] ??= [];
      if (el.checked) out[el.name].push(el.value);
      continue;
    }
    (out[el.name] ??= []).push(el.value);
  }
  return out;
}

const nativeSetter = (el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, v: string) => {
  const proto = Object.getPrototypeOf(el);
  Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, v);
};

function restore(form: HTMLFormElement, snap: Snapshot) {
  const seen: Record<string, number> = {};
  for (const el of Array.from(form.elements)) {
    if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement)) continue;
    const vals = el.name ? snap[el.name] : undefined;
    if (!vals) continue;
    if (el instanceof HTMLInputElement && (el.type === "checkbox" || el.type === "radio")) {
      const on = vals.includes(el.value);
      if (el.checked !== on) {
        el.checked = on;
        el.dispatchEvent(new Event("change", { bubbles: true }));
      }
      continue;
    }
    const hiddenRaw = el instanceof HTMLInputElement && el.type === "hidden" && el.dataset.rawFor;
    if (el instanceof HTMLInputElement && SKIP.has(el.type) && !hiddenRaw) continue;
    const i = (seen[el.name] = (seen[el.name] ?? -1) + 1);
    if (vals[i] == null) continue;
    nativeSetter(el, vals[i]);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }
  // 고른 값에 따라 나중에 나타나는 칸(ShowWhen)도 되살릴 수 있게 남겨 둔다
  (form as HTMLFormElement & { assistSnap?: Snapshot }).assistSnap = snap;
  form.dispatchEvent(new Event("assist:restored"));
}

/** 나중에 나타난 칸에 되살린 값을 채운다(빈 칸만) */
export function restoreWithin(root: HTMLElement) {
  const form = root.closest("form") as (HTMLFormElement & { assistSnap?: Snapshot }) | null;
  const snap = form?.assistSnap;
  if (!snap) return;
  for (const el of Array.from(root.querySelectorAll("input,textarea,select"))) {
    if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) || !el.name) continue;
    const vals = snap[el.name];
    if (!vals) continue;
    if (el instanceof HTMLInputElement && (el.type === "checkbox" || el.type === "radio")) {
      el.checked = vals.includes(el.value);
      continue;
    }
    if (el instanceof HTMLInputElement && SKIP.has(el.type) && !el.dataset.rawFor) continue;
    if (el.value || vals[0] == null) continue;
    nativeSetter(el, vals[0]);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }
}


// ── 동시 수정(먼저 고친 사람이 있을 때) ──
type Stored = { v: 2; snap: Snapshot; base: Snapshot | null; fresh: string | null };
type Diff = { name: string; label: string; base: string; theirs: string; mine: string; theirsVals: string[]; mineVals: string[] };
type Conflict = { both: Diff[]; theirsOnly: Diff[] };

const freshHash = (token: string | null | undefined) => (token ? (token.split("|")[2] ?? "") : "");
const freshDoc = (token: string | null | undefined) => (token ? (token.split("|")[4] ?? "") : "");

function readStored(raw: string): Stored {
  const j = JSON.parse(raw) as Stored | Snapshot;
  return (j as Stored).v === 2 ? (j as Stored) : { v: 2, snap: j as Snapshot, base: null, fresh: null };
}

const clip = (s: string) => s.replace(/[?*]/g, "").replace(/\s+/g, " ").trim();

/** 칸 이름(양식 표의 이름 칸, 묶음 제목, 없으면 칸 name) */
function labelOf(form: HTMLFormElement, name: string): string {
  let el = form.querySelector<HTMLElement>(`[name="${CSS.escape(name)}"]`);
  if (el instanceof HTMLInputElement && el.dataset.rawFor) el = document.getElementById(el.dataset.rawFor) ?? el;
  const fld = el?.closest(".fld")?.querySelector(".fld-label label, .fld-label");
  if (fld?.textContent) return clip(fld.textContent);
  const legend = el?.closest("fieldset")?.querySelector("legend");
  if (legend?.textContent) return clip(legend.textContent);
  const aria = el?.getAttribute("aria-label") ?? el?.closest("[aria-label]")?.getAttribute("aria-label");
  return aria ? clip(aria) : name;
}

/** 사람이 읽을 값(고르기는 고른 이름, 체크는 이름들) */
function showOf(form: HTMLFormElement, name: string, vals: string[] | undefined): string {
  if (!vals || vals.every((v) => !v.trim())) return "(빈 칸)";
  const els = Array.from(form.querySelectorAll<HTMLElement>(`[name="${CSS.escape(name)}"]`));
  const first = els[0];
  if (first instanceof HTMLSelectElement) return vals.map((v) => Array.from(first.options).find((o) => o.value === v)?.text ?? v).join(", ");
  if (first instanceof HTMLInputElement && (first.type === "checkbox" || first.type === "radio")) {
    const text = (v: string) => clip(els.find((e) => (e as HTMLInputElement).value === v)?.closest("label")?.textContent ?? v);
    if (els.length === 1 && first.type === "checkbox") return vals.length ? "예" : "아니오";
    return vals.map(text).join(", ");
  }
  if (first instanceof HTMLInputElement && first.dataset.rawFor && /^\d+$/.test(vals[0])) return Number(vals[0]).toLocaleString("ko-KR");
  return vals.join(" / ");
}

const sameVals = (a: string[] | undefined, b: string[] | undefined) => JSON.stringify(a ?? []) === JSON.stringify(b ?? []);

/**
 * 세 값 맞추기: base(내가 화면을 열 때), mine(내가 보낸 값), theirs(지금 저장된 값).
 * 내가 안 고친 칸 → 그 사람 값 그대로. 내가 고친 칸 → 내 값. 둘 다 같은 칸을 다르게 고쳤으면 '겹침'.
 */
function mergeThree(form: HTMLFormElement, base: Snapshot, mine: Snapshot, theirs: Snapshot): { keep: Snapshot; conflict: Conflict } {
  const keep: Snapshot = {};
  const both: Diff[] = [];
  const theirsOnly: Diff[] = [];
  for (const name of new Set([...Object.keys(base), ...Object.keys(mine), ...Object.keys(theirs)])) {
    const b = base[name];
    const m = mine[name];
    const t = theirs[name];
    const theyChanged = !sameVals(t, b);
    const iChanged = !sameVals(m, b);
    const diff = (): Diff => ({ name, label: labelOf(form, name), base: showOf(form, name, b), theirs: showOf(form, name, t), mine: showOf(form, name, m), theirsVals: t ?? [], mineVals: m ?? [] });
    if (iChanged && m) keep[name] = m;
    if (theyChanged && iChanged && !sameVals(t, m)) both.push(diff());
    else if (theyChanged && !iChanged) theirsOnly.push(diff());
  }
  return { keep, conflict: { both, theirsOnly } };
}

function ConflictPanel({ conflict, formRef, onReload, onClose }: { conflict: Conflict; formRef: React.RefObject<HTMLFormElement | null>; onReload: () => void; onClose: () => void }) {
  const [pick, setPick] = useState<Record<string, "mine" | "theirs">>({});
  const choose = (d: Diff, side: "mine" | "theirs") => {
    const form = formRef.current;
    if (!form) return;
    restore(form, { [d.name]: side === "mine" ? d.mineVals : d.theirsVals });
    setPick((p) => ({ ...p, [d.name]: side }));
  };
  const nothing = !conflict.both.length && !conflict.theirsOnly.length;
  return (
    <div role="alert" data-conflict className="grid gap-2 rounded-md border border-[var(--danger)]/50 bg-[var(--danger-soft)] px-3 py-2 text-sm">
      <p className="font-semibold">다른 사람이 먼저 고쳐서 아직 저장하지 않았습니다</p>
      {nothing && <p>이 양식의 칸 가운데 겹치는 것은 없습니다. 다른 곳만 바뀌었으니 그대로 다시 저장하면 됩니다.</p>}
      {conflict.both.length > 0 && (
        <>
          <p>
            <b>같은 칸을 둘 다 고쳤습니다.</b> 칸마다 남길 값을 고르세요(처음에는 내 값으로 되어 있습니다).
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[32rem] border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-[var(--line)] text-[var(--muted)]">
                  <th className="py-1 pr-2 font-medium">칸</th>
                  <th className="py-1 pr-2 font-medium">처음 값</th>
                  <th className="py-1 pr-2 font-medium">먼저 저장된 값</th>
                  <th className="py-1 pr-2 font-medium">내가 적은 값</th>
                  <th className="py-1 font-medium">남길 값</th>
                </tr>
              </thead>
              <tbody>
                {conflict.both.map((d) => {
                  const side = pick[d.name] ?? "mine";
                  return (
                    <tr key={d.name} className="border-b border-[var(--line)] align-top">
                      <td className="py-1.5 pr-2 font-medium">{d.label}</td>
                      <td className="py-1.5 pr-2 text-[var(--muted)] line-through">{d.base}</td>
                      <td className="py-1.5 pr-2">{d.theirs}</td>
                      <td className="py-1.5 pr-2">{d.mine}</td>
                      <td className="py-1.5">
                        <div className="flex gap-1">
                          {(["theirs", "mine"] as const).map((s) => (
                            <button
                              key={s}
                              type="button"
                              aria-pressed={side === s}
                              onClick={() => choose(d, s)}
                              className="min-h-8 rounded-md border border-[var(--line-strong)] px-2 aria-pressed:border-[var(--accent)] aria-pressed:bg-[var(--accent-soft)] aria-pressed:font-semibold"
                            >
                              {s === "theirs" ? "먼저 저장된 값" : "내 값"}
                            </button>
                          ))}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
      {conflict.theirsOnly.length > 0 && (
        <div>
          <p>내가 손대지 않은 칸은 먼저 저장된 값으로 바꿔 두었습니다:</p>
          <ul className="mt-1 list-disc pl-5 text-xs">
            {conflict.theirsOnly.map((d) => (
              <li key={d.name}>
                <b>{d.label}</b>: <span className="text-[var(--muted)] line-through">{d.base}</span> → {d.theirs}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="flex flex-wrap gap-2 pt-1">
        <button type="button" onClick={onReload} className="min-h-9 rounded-md border border-[var(--line-strong)] bg-[var(--surface)] px-3">
          내 것 버리고 먼저 저장된 값으로
        </button>
        <button type="button" onClick={onClose} className="min-h-9 rounded-md px-3 text-[var(--muted)] underline">
          이 안내 닫기
        </button>
        <span className="self-center text-xs text-[var(--muted)]">맞으면 아래 저장 단추를 다시 누르세요.</span>
      </div>
    </div>
  );
}

const isEmpty = (s: Snapshot) => Object.values(s).every((v) => v.every((x) => !x.trim()));
const same = (a: Snapshot, b: Snapshot) => JSON.stringify(a) === JSON.stringify(b);

function store(kind: "local" | "session") {
  try {
    return kind === "local" ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

/**
 * id: 이 폼을 구별하는 이름(같은 화면에 폼이 여럿이면 서로 달라야 함).
 * draft: 적는 중 내용을 이 기기에 임시 저장하고 다음에 되살리기를 묻는다(긴 양식).
 */
type AssistProps = ComponentProps<"form"> & {
  id: string;
  draft?: boolean;
  guard?: boolean;
  /** 긴 양식의 아래 고정 저장줄(_form-bar.tsx). 짧은 양식에서는 저절로 안 보인다 */
  bar?: boolean;
  /** 고치기 양식: freshToken(…)(src/modules/platform/fresh.ts). 주면 동시 수정 확인과 '고치는 중' 표시가 붙는다 */
  fresh?: string;
  /** 문서 안 form id. 양식 밖 단추가 form="…" 으로 이 양식을 함께 보낼 때(예: 견적 '검토 요청'이 머리 칸을 함께 저장) */
  domId?: string;
};

export function AssistForm(props: AssistProps) {
  // 저장된 값이 바뀌면(내가 저장했거나 다른 사람이 먼저 고쳐 돌아왔을 때) 양식을 새로 그려 새 값에서 시작한다
  return <AssistFormInner key={freshHash(props.fresh) || undefined} {...props} />;
}

function AssistFormInner({ id, draft = false, guard = true, bar = true, fresh, domId, children, ...props }: AssistProps) {
  const ref = useRef<HTMLFormElement>(null);
  const initial = useRef<Snapshot | null>(null);
  const submitting = useRef(false);
  const params = useSearchParams();
  const error = params.get("error");
  const query = params.toString();
  const [banner, setBanner] = useState<{ at: string; snap: Snapshot } | null>(null);
  const [restoredNote, setRestoredNote] = useState(false);
  const [conflict, setConflict] = useState<Conflict | null>(null);
  const theirsRef = useRef<Snapshot | null>(null);
  const sKey = `assist:submit:${id}`;
  const dKey = `assist:draft:${id}`;

  // 처음 열 때: 처음 값 기억, 임시 저장본이 있으면 되살리기 안내
  useEffect(() => {
    const form = ref.current;
    if (!form) return;
    initial.current = snapshot(form);
    if (!draft) return;
    const raw = store("local")?.getItem(dKey);
    if (!raw) return;
    try {
      const saved = JSON.parse(raw) as { at: string; snap: Snapshot };
      if (!isEmpty(saved.snap) && !same(saved.snap, initial.current)) setBanner(saved);
    } catch {
      /* 깨진 저장본은 무시 */
    }
  }, [draft, dKey]);

  // 서버가 오류로 돌려보냈을 때: 보냈던 값을 되살린다(React 가 폼을 비운 뒤에 채우도록 한 박자 늦춤)
  useEffect(() => {
    const form = ref.current;
    if (!form) return;
    const ss = store("session");
    const raw = ss?.getItem(sKey);
    if (!raw) return;
    if (!error) {
      // 성공해서 다시 온 경우: 보낸 값과 임시 저장본을 지운다
      ss?.removeItem(sKey);
      if (draft) store("local")?.removeItem(dKey);
      return;
    }
    const t = setTimeout(() => {
      try {
        const stored = readStored(raw);
        // 보낼 때의 지문과 지금 그려진 지문이 다르면 그사이 저장된 값이 바뀐 것: 세 값을 맞춘다
        if (fresh && stored.fresh && stored.base && freshHash(stored.fresh) !== freshHash(fresh)) {
          const theirs = initial.current ?? snapshot(form);
          theirsRef.current = theirs;
          const m = mergeThree(form, stored.base, stored.snap, theirs);
          restore(form, m.keep);
          setConflict(m.conflict);
          ss?.removeItem(sKey);
          return;
        }
        restore(form, stored.snap);
        setRestoredNote(true);
        const bad = form.querySelector<HTMLElement>("[aria-invalid=true]") ?? form.querySelector<HTMLElement>("input:not([type=hidden]),textarea,select");
        bad?.focus();
      } catch {
        /* 무시 */
      }
      ss?.removeItem(sKey);
    }, 30);
    return () => clearTimeout(t);
  }, [error, query, sKey, dKey, draft, fresh]);

  // 임시 저장(긴 양식)과 나가기 경고
  useEffect(() => {
    const form = ref.current;
    if (!form) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onInput = () => {
      if (!draft) return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        const snap = snapshot(form);
        if (isEmpty(snap) || (initial.current && same(snap, initial.current))) store("local")?.removeItem(dKey);
        else store("local")?.setItem(dKey, JSON.stringify({ at: new Date().toISOString(), snap }));
      }, 600);
    };
    const onUnload = (e: BeforeUnloadEvent) => {
      if (!guard || submitting.current || !initial.current) return;
      if (!same(snapshot(form), initial.current)) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    form.addEventListener("input", onInput);
    window.addEventListener("beforeunload", onUnload);
    return () => {
      clearTimeout(timer);
      form.removeEventListener("input", onInput);
      window.removeEventListener("beforeunload", onUnload);
    };
  }, [draft, guard, dKey]);

  return (
    <form
      ref={ref}
      {...props}
      id={domId}
      onSubmit={(e) => {
        const form = e.currentTarget;
        submitting.current = true;
        const sent: Stored = { v: 2, snap: snapshot(form), base: initial.current, fresh: fresh ?? null };
        store("session")?.setItem(sKey, JSON.stringify(sent));
        setRestoredNote(false);
        props.onSubmit?.(e);
      }}
      onInvalidCapture={() => {
        submitting.current = false;
      }}
    >
      {banner && (
        <div role="status" className="flex flex-wrap items-center gap-2 rounded-md border border-[var(--accent)]/40 bg-[var(--accent-soft)] px-3 py-2 text-sm">
          <span className="flex-1">
            이 기기에 임시 저장된 내용이 있습니다({new Date(banner.at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}).
          </span>
          <button
            type="button"
            className="min-h-9 rounded-md bg-[var(--accent)] px-3 text-[var(--accent-fg)]"
            onClick={() => {
              if (ref.current) restore(ref.current, banner.snap);
              setBanner(null);
            }}
          >
            되살리기
          </button>
          <button
            type="button"
            className="min-h-9 rounded-md border border-[var(--line-strong)] px-3"
            onClick={() => {
              store("local")?.removeItem(dKey);
              setBanner(null);
            }}
          >
            지우기
          </button>
        </div>
      )}
      {fresh && freshDoc(fresh) && <Presence doc={freshDoc(fresh)} />}
      {fresh && <input type="hidden" name="_fresh" value={fresh} readOnly />}
      {conflict && (
        <ConflictPanel
          conflict={conflict}
          formRef={ref}
          onReload={() => {
            if (ref.current && theirsRef.current) restore(ref.current, theirsRef.current);
            setConflict(null);
          }}
          onClose={() => setConflict(null)}
        />
      )}
      {restoredNote && (
        <p role="status" className="rounded-md border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2 text-xs text-[var(--muted)]">
          적으셨던 내용을 그대로 되살렸습니다. 위 안내대로 고친 뒤 다시 보내 주세요.
        </p>
      )}
      {children}
      {bar && <FormBar formRef={ref} />}
    </form>
  );
}
