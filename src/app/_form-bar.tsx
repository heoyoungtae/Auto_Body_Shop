"use client";
// 긴 양식의 아래 고정 줄(UI 개선 7·8, 2026-11-12).
// 양식이 화면보다 길고 원래 저장 단추가 화면 밖에 있을 때만 화면 아래에 붙는다.
// - 묶음 바로가기: 양식 안 묶음 제목(legend·h2)을 눌러 그 묶음으로 간다(묶음이 3개 이상일 때)
// - 빠진 칸: 아직 맞지 않는 칸 수. 누르면 첫 칸으로 간다
// - 저장: 원래 저장 단추를 대신 누른다(단추 이름·값, 필수 칸 검사, 두 번 누름 막기가 그대로 동작)
import { useEffect, useState, type RefObject } from "react";

type Section = { label: string; el: HTMLElement };

/** 저장 단추로 볼 것: 폼 안 마지막 submit 단추 가운데 검사를 건너뛰지 않는 것 */
function mainSubmit(form: HTMLFormElement): HTMLButtonElement | null {
  const list = Array.from(form.querySelectorAll<HTMLButtonElement>("button[type=submit]")).filter((b) => !b.formNoValidate && !b.closest("[data-form-bar]"));
  return list.at(-1) ?? null;
}

function invalidFields(form: HTMLFormElement): HTMLElement[] {
  const seen = new Set<string>();
  const out: HTMLElement[] = [];
  for (const el of Array.from(form.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>("input,select,textarea"))) {
    if (el.type === "hidden" || el.disabled || el.validity.valid) continue;
    const key = el.name || el.id;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(el);
  }
  return out;
}

function sectionsOf(form: HTMLFormElement): Section[] {
  return Array.from(form.querySelectorAll<HTMLElement>("fieldset > legend, h2"))
    .map((el) => ({ label: (el.textContent ?? "").replace(/\?/g, "").trim(), el: (el.tagName === "LEGEND" ? el.parentElement : el.closest("section")) ?? el }))
    .filter((s) => s.label && s.label.length <= 20 && s.el.offsetParent !== null);
}

export function FormBar({ formRef }: { formRef: RefObject<HTMLFormElement | null> }) {
  const [show, setShow] = useState(false);
  const [label, setLabel] = useState("저장");
  const [bad, setBad] = useState(0);
  const [sections, setSections] = useState<Section[]>([]);

  useEffect(() => {
    const form = formRef.current;
    if (!form) return;
    let submitVisible = true;
    let formVisible = false;
    const update = () => {
      const btn = mainSubmit(form);
      const long = form.offsetHeight > window.innerHeight * 1.3;
      setShow(!!btn && long && formVisible && !submitVisible);
      if (btn) setLabel((btn.textContent ?? "저장").trim() || "저장");
      setBad(invalidFields(form).length);
      setSections(sectionsOf(form));
    };
    const btn = mainSubmit(form);
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.target === form) formVisible = e.isIntersecting;
        else submitVisible = e.isIntersecting;
      }
      update();
    });
    io.observe(form);
    if (btn) io.observe(btn);
    let t: ReturnType<typeof setTimeout>;
    const later = () => {
      clearTimeout(t);
      t = setTimeout(update, 200);
    };
    form.addEventListener("input", later);
    form.addEventListener("change", later);
    window.addEventListener("resize", later);
    update();
    return () => {
      io.disconnect();
      clearTimeout(t);
      form.removeEventListener("input", later);
      form.removeEventListener("change", later);
      window.removeEventListener("resize", later);
    };
  }, [formRef]);

  if (!show) return null;
  const go = (el: HTMLElement) => {
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.focus({ preventScroll: true });
  };
  return (
    <div
      data-form-bar
      className="form-bar no-print fixed inset-x-0 z-10 border-t border-[var(--line)] bg-[var(--surface)]/95 px-3 py-2 shadow-[var(--shadow-lg)] backdrop-blur lg:left-64"
      style={{ bottom: "var(--tabbar-h, 0px)" }}
    >
      <div className="flex items-center gap-2">
        {sections.length >= 3 && (
          <nav aria-label="묶음 바로가기" className="flex min-w-0 flex-1 gap-1 overflow-x-auto">
            {sections.map((s) => (
              <button
                key={s.label}
                type="button"
                onClick={() => s.el.scrollIntoView({ behavior: "smooth", block: "start" })}
                className="min-h-9 shrink-0 rounded-full border border-[var(--line-strong)] px-3 text-xs hover:bg-[var(--surface-2)]"
              >
                {s.label}
              </button>
            ))}
          </nav>
        )}
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {bad > 0 && (
            <button
              type="button"
              onClick={() => {
                const first = formRef.current && invalidFields(formRef.current)[0];
                if (first) go(first);
              }}
              className="min-h-11 rounded-md px-2 text-sm font-medium text-[var(--warn)] hover:bg-[var(--warn-soft)]"
            >
              ⚠ 빠진 칸 {bad}
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              const form = formRef.current;
              const btn = form && mainSubmit(form);
              btn?.click();
            }}
            className="inline-flex h-11 items-center rounded-md bg-[var(--accent)] px-4 text-sm font-medium text-[var(--accent-fg)] shadow-[var(--shadow)] hover:brightness-110"
          >
            {label}
          </button>
        </div>
      </div>
    </div>
  );
}
