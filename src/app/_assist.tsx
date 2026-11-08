"use client";
// 폼 도우미: 서버가 오류로 돌려보내도 적은 값을 되살리고, 긴 양식은 이 기기에 임시 저장하고,
// 저장하지 않고 나가려 하면 묻는다. 비밀번호 칸은 어디에도 저장하지 않는다.
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, type ComponentProps } from "react";

type Snapshot = Record<string, string[]>;

const SKIP = new Set(["password", "hidden", "submit", "button", "file"]);

function snapshot(form: HTMLFormElement): Snapshot {
  const out: Snapshot = {};
  for (const el of Array.from(form.elements)) {
    if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement)) continue;
    // 숫자 칸은 이름 있는 숨은 칸이 값을 들고 있으므로 data-raw-for 가 붙은 숨은 칸은 저장한다
    const hiddenRaw = el instanceof HTMLInputElement && el.type === "hidden" && el.dataset.rawFor;
    if (!el.name || (el instanceof HTMLInputElement && SKIP.has(el.type) && !hiddenRaw)) continue;
    if (el instanceof HTMLInputElement && el.type === "checkbox") {
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
    if (el instanceof HTMLInputElement && el.type === "checkbox") {
      el.checked = vals.includes(el.value);
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
    if (el instanceof HTMLInputElement && el.type === "checkbox") {
      el.checked = vals.includes(el.value);
      continue;
    }
    if (el instanceof HTMLInputElement && SKIP.has(el.type) && !el.dataset.rawFor) continue;
    if (el.value || vals[0] == null) continue;
    nativeSetter(el, vals[0]);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }
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
export function AssistForm({ id, draft = false, guard = true, children, ...props }: ComponentProps<"form"> & { id: string; draft?: boolean; guard?: boolean }) {
  const ref = useRef<HTMLFormElement>(null);
  const initial = useRef<Snapshot | null>(null);
  const submitting = useRef(false);
  const params = useSearchParams();
  const error = params.get("error");
  const query = params.toString();
  const [banner, setBanner] = useState<{ at: string; snap: Snapshot } | null>(null);
  const [restoredNote, setRestoredNote] = useState(false);
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
        restore(form, JSON.parse(raw) as Snapshot);
        setRestoredNote(true);
        const bad = form.querySelector<HTMLElement>("[aria-invalid=true]") ?? form.querySelector<HTMLElement>("input:not([type=hidden]),textarea,select");
        bad?.focus();
      } catch {
        /* 무시 */
      }
      ss?.removeItem(sKey);
    }, 30);
    return () => clearTimeout(t);
  }, [error, query, sKey, dKey, draft]);

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
      onSubmit={(e) => {
        const form = e.currentTarget;
        submitting.current = true;
        store("session")?.setItem(sKey, JSON.stringify(snapshot(form)));
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
      {restoredNote && (
        <p role="status" className="rounded-md border border-[var(--line)] bg-[var(--surface-2)] px-3 py-2 text-xs text-[var(--muted)]">
          적으셨던 내용을 그대로 되살렸습니다. 위 안내대로 고친 뒤 다시 보내 주세요.
        </p>
      )}
      {children}
    </form>
  );
}
