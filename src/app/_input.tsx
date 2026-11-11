"use client";
// 입력도우미 부품. 모든 입력 칸은 이 부품으로 만들고 help 키(src/modules/help/fields.ts)를 꼭 넘긴다.
// 칸마다: 이름·필수 표시, ? 자세히, 한 줄 안내·예시, 한글 오류 안내, 불러온 값의 출처 표시.
// 값은 브라우저 폼이 그대로 보낸다(제어하지 않음). 그래야 서버 오류로 돌아왔을 때 _assist.tsx 가 값을 되살릴 수 있다.
import { useEffect, useId, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { FIELD_HELP, type FieldHelpKey } from "@/modules/help/fields";
import { HelpButton } from "./_help-drawer";
import { addDaysIso, dayLabel, koMoney, seoulToday } from "./_format";
import { applyShape, fieldTraits, numberWidth, selectWidth, textareaRows } from "./_field-traits";

const inputBox =
  "block w-full rounded-md border border-[var(--line-strong)] bg-[var(--surface)] px-3 text-base shadow-[var(--shadow)] outline-none transition-colors focus:border-[var(--accent)] focus:ring-3 focus:ring-[var(--accent)]/15 aria-[invalid=true]:border-[var(--danger)]";

type El = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

/** 브라우저 기본(영문·짧은) 검사 문구를 칸 이름을 넣은 한글 안내로 바꾼다 */
function koMessage(el: El, label: string, formatMsg?: string): string {
  const v = el.validity;
  if (v.valueMissing) return el instanceof HTMLSelectElement ? `'${label}'을(를) 골라 주세요` : `'${label}'을(를) 적어 주세요`;
  if (v.patternMismatch) return formatMsg ?? `'${label}' 형식을 확인해 주세요`;
  if (v.typeMismatch) return `'${label}' 형식을 확인해 주세요`;
  if (v.tooShort) return `'${label}'은(는) ${(el as HTMLInputElement).minLength}자 이상이어야 합니다`;
  if (v.tooLong) return `'${label}'은(는) ${(el as HTMLInputElement).maxLength}자까지입니다`;
  if (v.rangeUnderflow) return `'${label}'은(는) ${(el as HTMLInputElement).min} 이상이어야 합니다`;
  if (v.rangeOverflow) return `'${label}'은(는) ${(el as HTMLInputElement).max} 이하여야 합니다`;
  if (v.badInput) return `'${label}'에 올바른 값을 넣어 주세요`;
  return el.validationMessage;
}

/** 칸의 한글 오류 상태. 제출 시 invalid 이벤트에서 채우고, 고치면 지운다 */
function useKoValidity(label: string, formatMsg?: string, extra?: (el: El) => string | null) {
  const [error, setError] = useState<string | null>(null);
  const check = (el: El) => {
    el.setCustomValidity("");
    const custom = extra?.(el) ?? null;
    if (custom) el.setCustomValidity(custom);
    return custom ?? (el.validity.valid ? null : koMessage(el, label, formatMsg));
  };
  return {
    error,
    onInvalid: (e: React.FormEvent<El>) => {
      const el = e.currentTarget;
      const msg = check(el) ?? koMessage(el, label, formatMsg);
      el.setCustomValidity(msg);
      setError(msg);
    },
    /** 입력할 때마다: 이미 오류가 보이는 칸만 다시 검사해 바로 풀어 준다 */
    revalidate: (el: El) => {
      const msg = check(el);
      if (error) setError(msg);
    },
  };
}

export function Shell({
  id,
  helpKey,
  label,
  required,
  error,
  from,
  aside,
  children,
}: {
  id: string;
  helpKey: FieldHelpKey;
  label?: string;
  required?: boolean;
  error?: string | null;
  from?: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  const h = FIELD_HELP[helpKey];
  const name = label ?? h.label;
  return (
    <div className="block text-sm" data-help={helpKey}>
      <div className="mb-1.5 flex items-center gap-1.5">
        <label htmlFor={id} className="font-medium">
          {name}
        </label>
        <span className={`text-xs ${required ? "text-[var(--danger)]" : "text-[var(--muted)]"}`}>{required ? "필수" : "선택"}</span>
        <HelpButton topic={{ kind: "field", id: helpKey, label }} name={name} />
        {from && <span className="ml-auto rounded bg-[var(--accent-soft)] px-1.5 py-0.5 text-xs text-[var(--accent)]">{from}에서 불러옴</span>}
      </div>
      {children}
      {error ? (
        <p id={`${id}-msg`} role="alert" className="mt-1 text-xs font-medium text-[var(--danger)]">
          {error}
        </p>
      ) : (
        ("hint" in h || "example" in h) && (
          <p id={`${id}-msg`} className="mt-1 text-xs text-[var(--muted)]">
            {"hint" in h && h.hint}
            {"example" in h && h.example && <span className="ml-1">(예: {h.example})</span>}
          </p>
        )
      )}
      {aside}
    </div>
  );
}

type Common = { help: FieldHelpKey; name: string; label?: string; required?: boolean; from?: string };

/** 한 줄 글자 칸. suggestions 를 주면 칸을 누를 때 고를 목록이 뜬다(앞선 전표 번호 등) */
export function TextField({
  help,
  name,
  label,
  required,
  from,
  suggestions,
  lower,
  ...rest
}: Common & Omit<ComponentProps<"input">, "name" | "required"> & { suggestions?: { value: string; label?: string }[]; lower?: boolean }) {
  const id = useId();
  const h = FIELD_HELP[help];
  const fmt = "format" in h ? h.format : undefined;
  const v = useKoValidity(label ?? h.label, fmt?.message);
  // 칸 성격(폭·키패드·형식)은 help 키로 정한다. 화면에서 직접 준 속성이 이긴다
  const t = fieldTraits(help, h, rest.type);
  const prev = useRef(String(rest.defaultValue ?? rest.value ?? ""));
  return (
    <Shell id={id} helpKey={help} label={label} required={required} error={v.error} from={from}>
      <input
        id={id}
        name={name}
        required={required}
        {...t.attrs}
        placeholder={"example" in h ? h.example : undefined}
        pattern={fmt?.pattern}
        maxLength={"maxLength" in h ? h.maxLength : undefined}
        list={suggestions?.length ? `${id}-list` : undefined}
        aria-invalid={!!v.error}
        aria-describedby={`${id}-msg`}
        {...rest}
        onInvalid={v.onInvalid}
        onInput={(e) => {
          const el = e.currentTarget;
          const ne = e.nativeEvent as InputEvent;
          // 한글 조합 중에는 값을 건드리지 않는다(글자가 깨짐)
          const shape = lower ? "lower" : t.shape;
          if (shape && !ne.isComposing) applyShape(el, shape, ne.inputType ?? "", prev.current);
          prev.current = el.value;
          v.revalidate(el);
        }}
        style={t.maxWidth ? { maxWidth: t.maxWidth } : undefined}
        className={`h-11 ${inputBox}`}
      />
      {suggestions?.length ? (
        <datalist id={`${id}-list`}>
          {suggestions.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </datalist>
      ) : null}
    </Shell>
  );
}

/** 여러 줄 칸: 글자 수, 자주 쓰는 문구 넣기 */
export function TextAreaField({ help, name, label, required, from, defaultValue, rows }: Common & { defaultValue?: string; rows?: number }) {
  const id = useId();
  const h = FIELD_HELP[help];
  const ref = useRef<HTMLTextAreaElement>(null);
  const max = "maxLength" in h ? h.maxLength : undefined;
  const [count, setCount] = useState(String(defaultValue ?? "").length);
  const v = useKoValidity(label ?? h.label);
  useResync(ref, () => setCount(ref.current?.value.length ?? 0));
  const insert = (t: string) => {
    const el = ref.current;
    if (!el) return;
    const at = el.selectionStart ?? el.value.length;
    const before = el.value.slice(0, at);
    const glue = before && !before.endsWith("\n") ? "\n" : "";
    el.value = before + glue + t + el.value.slice(el.selectionEnd ?? at);
    const caret = (before + glue + t).length;
    el.focus();
    el.setSelectionRange(caret, caret);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  };
  const templates = "templates" in h ? h.templates : undefined;
  // 글자 수 상한으로 처음 높이를 정하고, 적는 만큼 늘어난다(최대 24줄쯤)
  const lines = rows ?? textareaRows(max);
  return (
    <Shell
      id={id}
      helpKey={help}
      label={label}
      required={required}
      error={v.error}
      from={from}
      aside={
        max ? (
          <p className={`mt-0.5 text-right text-xs ${count > max * 0.9 ? "text-[var(--warn)]" : "text-[var(--muted)]"}`}>
            {count.toLocaleString("ko-KR")} / {max.toLocaleString("ko-KR")}자
          </p>
        ) : null
      }
    >
      {templates && (
        <div className="mb-1.5 flex flex-wrap gap-1" aria-label="문구 넣기">
          <span className="self-center text-xs text-[var(--muted)]">문구 넣기:</span>
          {templates.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => insert(t)}
              className="min-h-8 rounded-full border border-[var(--line-strong)] px-2.5 text-xs hover:bg-[var(--surface-2)]"
            >
              {t.split("\n")[0].replace(/[:：]\s*$/, "").slice(0, 24) || t.slice(0, 24)}
            </button>
          ))}
        </div>
      )}
      <textarea
        ref={ref}
        id={id}
        name={name}
        required={required}
        defaultValue={defaultValue}
        rows={lines}
        maxLength={max}
        autoComplete="off"
        placeholder={"example" in h ? `예: ${h.example}` : undefined}
        aria-invalid={!!v.error}
        aria-describedby={`${id}-msg`}
        onInvalid={v.onInvalid}
        onInput={(e) => {
          setCount(e.currentTarget.value.length);
          v.revalidate(e.currentTarget);
        }}
        style={{ minHeight: `${lines * 1.5 + 1.1}em` }}
        className={`max-h-[36em] resize-y py-2 leading-6 [field-sizing:content] ${inputBox}`}
      />
    </Shell>
  );
}

/**
 * 숫자 칸: 쉼표를 넣어 보여 주고, 단위·범위·지금 값·제안값과 비교하고, 금액이면 한글로 읽어 준다.
 * 보이는 칸은 이름이 없고, 쉼표 뺀 숫자를 같은 name 의 숨은 칸이 보낸다.
 */
export function NumberField({
  help,
  name,
  label,
  required,
  from,
  defaultValue,
  unit,
  min,
  max,
  current,
  suggested,
}: Common & { defaultValue?: number | null; unit?: string; min?: number; max?: number; current?: number; suggested?: number }) {
  const id = useId();
  const h = FIELD_HELP[help];
  const shown = useRef<HTMLInputElement>(null);
  const raw = useRef<HTMLInputElement>(null);
  const [num, setNum] = useState<number | null>(defaultValue ?? null);
  const name_ = label ?? h.label;
  const rangeMsg = (n: number | null) => {
    if (n == null) return null;
    if (min != null && n < min) return `'${name_}'은(는) ${min.toLocaleString("ko-KR")} 이상이어야 합니다`;
    if (max != null && n > max) return `'${name_}'은(는) ${max.toLocaleString("ko-KR")} 이하여야 합니다`;
    return null;
  };
  const v = useKoValidity(name_, "숫자만 적어 주세요", (el) => rangeMsg(parse(el.value)));
  useResync(shown, (kind) => {
    // 되살릴 때는 숨은 칸에 들어간 값을, 폼을 비울 때는 처음 값을 쓴다
    const n = kind === "restored" ? parse(raw.current?.value ?? "") : (defaultValue ?? null);
    if (shown.current) shown.current.value = n == null ? "" : n.toLocaleString("ko-KR");
    setNum(n);
  });
  const money = unit?.includes("원");
  const live = rangeMsg(num);
  const width = numberWidth({ unit, max });
  return (
    <Shell
      id={id}
      helpKey={help}
      label={label}
      required={required}
      error={v.error}
      from={from}
      aside={
        <div className="mt-1 space-y-0.5 text-xs">
          {(min != null || max != null) && (
            <p className="text-[var(--muted)]">
              범위: {min != null ? min.toLocaleString("ko-KR") : "0"} ~ {max != null ? max.toLocaleString("ko-KR") : "제한 없음"}
            </p>
          )}
          {(current != null || suggested != null) && (
            <p className="text-[var(--muted)]">
              {current != null && <>지금 {current.toLocaleString("ko-KR")}</>}
              {current != null && suggested != null && " · "}
              {suggested != null && <>표준서 제안 {suggested.toLocaleString("ko-KR")}</>}
              {num != null && current != null && num !== current && (
                <b className="ml-1 text-[var(--fg)]">
                  → {num > current ? "+" : ""}
                  {(num - current).toLocaleString("ko-KR")}
                  {current !== 0 && ` (${num > current ? "+" : ""}${Math.round(((num - current) / current) * 100)}%)`}
                </b>
              )}
              {num != null && current != null && num === current && <b className="ml-1 text-[var(--warn)]">지금 값과 같음</b>}
            </p>
          )}
          {money && num != null && num > 0 && <p className="text-[var(--muted)]">읽기: {koMoney(num)}</p>}
          {live && !v.error && <p className="text-[var(--warn)]">{live}</p>}
        </div>
      }
    >
      <div className="flex items-center gap-2">
        <input
          ref={shown}
          id={id}
          inputMode="numeric"
          autoComplete="off"
          enterKeyHint="next"
          required={required}
          defaultValue={defaultValue == null ? "" : defaultValue.toLocaleString("ko-KR")}
          pattern="[0-9,\s]*"
          placeholder={"example" in h ? h.example : undefined}
          aria-invalid={!!v.error}
          aria-describedby={`${id}-msg`}
          onInvalid={v.onInvalid}
          onInput={(e) => {
            const el = e.currentTarget;
            const digits = el.value.replace(/[^\d]/g, "");
            const n = digits === "" ? null : Number(digits);
            const fromEnd = el.value.length - (el.selectionStart ?? el.value.length);
            el.value = n == null ? "" : n.toLocaleString("ko-KR");
            const caret = Math.max(0, el.value.length - fromEnd);
            el.setSelectionRange(caret, caret);
            setNum(n);
            v.revalidate(el);
          }}
          style={{ maxWidth: width }}
          className={`h-11 text-right tabular-nums ${inputBox}`}
        />
        {unit && <span className="shrink-0 text-sm text-[var(--muted)]">{unit}</span>}
      </div>
      {/* 숨은 칸은 브라우저가 value 를 속성으로 다뤄서, 상태로 묶어 두어야 다시 그려도 값이 지워지지 않는다 */}
      <input ref={raw} type="hidden" name={name} value={num == null ? "" : String(num)} data-raw-for={id} />
    </Shell>
  );
}

const parse = (s: string) => {
  const d = s.replace(/[^\d]/g, "");
  return d === "" ? null : Number(d);
};

/** 날짜 칸: 빠른 선택 단추, 요일·며칠 뒤 표시 */
export function DateField({ help, name, label, required, from, defaultValue, min, quick = ["today", "tomorrow", "week", "nextMonth"] }: Common & { defaultValue?: string; min?: string; quick?: ("today" | "tomorrow" | "week" | "nextMonth")[] }) {
  const id = useId();
  const h = FIELD_HELP[help];
  const ref = useRef<HTMLInputElement>(null);
  const [val, setVal] = useState(defaultValue ?? "");
  const [today, setToday] = useState<string | null>(null);
  useEffect(() => setToday(seoulToday()), []);
  const v = useKoValidity(label ?? h.label, undefined, (el) => (min && el.value && el.value < min ? `'${label ?? h.label}'은(는) ${min}부터 고를 수 있습니다` : null));
  useResync(ref, () => setVal(ref.current?.value ?? ""));
  const set = (d: string) => {
    const el = ref.current;
    if (!el) return;
    el.value = d;
    el.dispatchEvent(new Event("input", { bubbles: true }));
  };
  const chips = today
    ? {
        today: ["오늘", today],
        tomorrow: ["내일", addDaysIso(today, 1)],
        week: ["1주 뒤", addDaysIso(today, 7)],
        nextMonth: ["다음 달 1일", `${nextMonthFirst(today)}`],
      }
    : null;
  return (
    <Shell id={id} helpKey={help} label={label} required={required} error={v.error} from={from} aside={val && today ? <p className="mt-0.5 text-xs text-[var(--muted)]">{dayLabel(val, today)}</p> : null}>
      <input
        ref={ref}
        id={id}
        type="date"
        name={name}
        required={required}
        defaultValue={defaultValue}
        min={min}
        aria-invalid={!!v.error}
        aria-describedby={`${id}-msg`}
        onInvalid={v.onInvalid}
        onInput={(e) => {
          setVal(e.currentTarget.value);
          v.revalidate(e.currentTarget);
        }}
        onChange={(e) => {
          setVal(e.currentTarget.value);
          v.revalidate(e.currentTarget);
        }}
        style={{ maxWidth: "11em" }}
        className={`h-11 ${inputBox}`}
      />
      {chips && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {quick.map((q) => (
            <button key={q} type="button" onClick={() => set(chips[q][1])} className="min-h-8 rounded-full border border-[var(--line-strong)] px-2.5 text-xs hover:bg-[var(--surface-2)]">
              {chips[q][0]}
            </button>
          ))}
        </div>
      )}
    </Shell>
  );
}

const nextMonthFirst = (iso: string) => {
  const [y, m] = iso.split("-").map(Number);
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
};

/** 비밀번호 칸: 보기 단추, Caps Lock 경고, (새 비밀번호면) 규칙 확인, (확인 칸이면) 일치 확인 */
export function PasswordField({ help, name, label, required, rules, matchName, autoComplete }: Common & { rules?: boolean; matchName?: string; autoComplete?: string }) {
  const id = useId();
  const h = FIELD_HELP[help];
  const [show, setShow] = useState(false);
  const [val, setVal] = useState("");
  const [caps, setCaps] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  // 규칙은 칸의 지금 값으로 검사한다(state 는 한 박자 늦어 마지막 글자를 놓친다)
  const rulesOf = (x: string) => [
    { ok: x.length >= 8, text: "8자 이상" },
    { ok: /[a-zA-Z]/.test(x), text: "영문 포함" },
    { ok: /\d/.test(x), text: "숫자 포함" },
  ];
  const checks = rulesOf(val);
  const other = () => (matchName ? (ref.current?.form?.elements.namedItem(matchName) as HTMLInputElement | null)?.value ?? "" : "");
  const v = useKoValidity(label ?? h.label, undefined, (el) => {
    if (rules && el.value && rulesOf(el.value).some((c) => !c.ok)) return "8자 이상, 영문과 숫자를 함께 넣어 주세요";
    if (matchName && el.value && el.value !== other()) return "위에 적은 새 비밀번호와 다릅니다";
    return null;
  });
  return (
    <Shell
      id={id}
      helpKey={help}
      label={label}
      required={required}
      error={v.error}
      aside={
        <>
          {caps && <p className="mt-0.5 text-xs font-medium text-[var(--warn)]">Caps Lock 이 켜져 있습니다</p>}
          {rules && (
            <ul className="mt-1 flex flex-wrap gap-x-3 text-xs" aria-label="비밀번호 규칙">
              {checks.map((c) => (
                <li key={c.text} className={c.ok ? "text-[var(--ok)]" : "text-[var(--muted)]"}>
                  {c.ok ? "✓" : "○"} {c.text}
                </li>
              ))}
            </ul>
          )}
          {matchName && val && <p className={`mt-0.5 text-xs ${val === other() ? "text-[var(--ok)]" : "text-[var(--warn)]"}`}>{val === other() ? "✓ 일치합니다" : "아직 다릅니다"}</p>}
        </>
      }
    >
      <div className="relative max-w-[20em]">
        <input
          ref={ref}
          id={id}
          name={name}
          type={show ? "text" : "password"}
          required={required}
          autoComplete={autoComplete}
          autoCapitalize="none"
          spellCheck={false}
          aria-invalid={!!v.error}
          aria-describedby={`${id}-msg`}
          onInvalid={v.onInvalid}
          onKeyUp={(e) => setCaps(e.getModifierState?.("CapsLock") ?? false)}
          onInput={(e) => {
            setVal(e.currentTarget.value);
            v.revalidate(e.currentTarget);
          }}
          className={`h-11 pr-16 ${inputBox}`}
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          aria-pressed={show}
          className="absolute inset-y-1 right-1 rounded px-2 text-xs text-[var(--muted)] hover:bg-[var(--surface-2)]"
        >
          {show ? "숨기기" : "보기"}
        </button>
      </div>
    </Shell>
  );
}

/** 고르기 칸 */
export function SelectField({ help, name, label, required, from, defaultValue, options, placeholder }: Common & { defaultValue?: string; options: { value: string; label: string }[]; placeholder?: string }) {
  const id = useId();
  const h = FIELD_HELP[help];
  const v = useKoValidity(label ?? h.label);
  return (
    <Shell id={id} helpKey={help} label={label} required={required} error={v.error} from={from}>
      <select
        id={id}
        name={name}
        required={required}
        defaultValue={defaultValue ?? ""}
        aria-invalid={!!v.error}
        aria-describedby={`${id}-msg`}
        onInvalid={v.onInvalid}
        onChange={(e) => v.revalidate(e.currentTarget)}
        style={{ maxWidth: selectWidth([...(placeholder != null ? [placeholder] : []), ...options.map((o) => o.label)]) }}
        className={`h-11 pr-8 ${inputBox}`}
      >
        {placeholder != null && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Shell>
  );
}

/** 여러 개 고르기(체크 상자). 큰 누름 영역 */
export function CheckGroup({ help, name, options, defaultChecked = [], label }: { help: FieldHelpKey; name: string; options: { value: string; label: string }[]; defaultChecked?: string[]; label?: string }) {
  const id = useId();
  return (
    <Shell id={id} helpKey={help} label={label}>
      <div id={id} role="group" className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <label key={o.value} className="flex min-h-10 cursor-pointer items-center gap-1.5 rounded-md border border-[var(--line)] px-2.5 has-[:checked]:border-[var(--accent)] has-[:checked]:bg-[var(--accent-soft)]">
            <input type="checkbox" name={name} value={o.value} defaultChecked={defaultChecked.includes(o.value)} className="size-4" /> {o.label}
          </label>
        ))}
      </div>
    </Shell>
  );
}

/** 하나 고르기(큰 단추 모양 라디오). 점검표 ○△×- 처럼 휴대폰에서 한 번에 누르는 칸 */
export function RadioRow({
  help,
  name,
  label,
  required,
  from,
  options,
  defaultValue,
}: Common & { options: { value: string; label: string; tone?: "ok" | "warn" | "danger" }[]; defaultValue?: string }) {
  const id = useId();
  const h = FIELD_HELP[help];
  const v = useKoValidity(label ?? h.label);
  const tone = { ok: "has-[:checked]:border-[var(--ok)] has-[:checked]:bg-[var(--ok-soft)]", warn: "has-[:checked]:border-[var(--warn)] has-[:checked]:bg-[var(--warn-soft)]", danger: "has-[:checked]:border-[var(--danger)] has-[:checked]:bg-[var(--danger-soft)]" };
  return (
    <Shell id={id} helpKey={help} label={label} required={required} error={v.error} from={from}>
      <div id={id} role="radiogroup" aria-describedby={`${id}-msg`} className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <label key={o.value} className={`flex min-h-11 min-w-12 cursor-pointer items-center justify-center gap-1.5 rounded-md border border-[var(--line)] px-3 has-[:checked]:font-semibold ${o.tone ? tone[o.tone] : "has-[:checked]:border-[var(--accent)] has-[:checked]:bg-[var(--accent-soft)]"}`}>
            <input type="radio" name={name} value={o.value} required={required} defaultChecked={defaultValue === o.value} onInvalid={v.onInvalid} onChange={(e) => v.revalidate(e.currentTarget)} className="size-4" /> {o.label}
          </label>
        ))}
      </div>
    </Shell>
  );
}

/** 금액이 붙은 고르기 목록(견적 승인 등). 고른 것의 합계를 바로 보여 준다 */
export function AmountChecklist({
  help,
  name,
  options,
  defaultChecked,
  totalLabel = "고른 금액",
}: {
  help: FieldHelpKey;
  name: string;
  options: { value: string; label: string; sub?: string; amount: number }[];
  defaultChecked?: string[];
  totalLabel?: string;
}) {
  const id = useId();
  const [on, setOn] = useState<string[]>(defaultChecked ?? options.map((o) => o.value));
  const sum = options.filter((o) => on.includes(o.value)).reduce((s, o) => s + o.amount, 0);
  const all = on.length === options.length;
  const allRef = useRef<HTMLInputElement>(null);
  useResync(allRef, (kind) => {
    const form = allRef.current?.form;
    if (!form) return;
    if (kind === "reset") return setOn(defaultChecked ?? options.map((o) => o.value));
    setOn([...form.querySelectorAll<HTMLInputElement>(`input[name="${name}"]`)].filter((i) => i.checked).map((i) => i.value));
  });
  return (
    <Shell id={id} helpKey={help}>
      <div id={id} role="group" className="divide-y divide-[var(--line)] rounded-md border border-[var(--line)]">
        <label className="flex min-h-10 cursor-pointer items-center gap-2 bg-[var(--surface-2,transparent)] px-3 py-2 text-xs text-[var(--muted)]">
          <input ref={allRef} type="checkbox" checked={all} onChange={() => setOn(all ? [] : options.map((o) => o.value))} className="size-4" /> 모두 {all ? "빼기" : "고르기"}
        </label>
        {options.map((o) => (
          <label key={o.value} className="flex min-h-12 cursor-pointer items-start gap-2 px-3 py-2 has-[:checked]:bg-[var(--accent-soft)]">
            <input
              type="checkbox"
              name={name}
              value={o.value}
              checked={on.includes(o.value)}
              onChange={(e) => setOn((p) => (e.target.checked ? [...p, o.value] : p.filter((x) => x !== o.value)))}
              className="mt-0.5 size-4 shrink-0"
            />
            <span className="min-w-0 flex-1">
              <span className="font-medium">{o.label}</span>
              {o.sub && <span className="block text-xs text-[var(--muted)]">{o.sub}</span>}
            </span>
            <span className="shrink-0 tabular-nums">{o.amount.toLocaleString("ko-KR")}원</span>
          </label>
        ))}
        <div className="flex items-center justify-between px-3 py-2 font-semibold">
          <span>
            {totalLabel} ({on.length}/{options.length})
          </span>
          <span className="tabular-nums">
            {sum.toLocaleString("ko-KR")}원<span className="block text-right text-xs font-normal text-[var(--muted)]">{koMoney(sum)}</span>
          </span>
        </div>
      </div>
    </Shell>
  );
}

/** 폼이 reset 되거나 _assist.tsx 가 값을 되살렸을 때 화면 상태를 다시 맞춘다 */
function useResync(ref: React.RefObject<HTMLElement | null>, sync: (kind: "reset" | "restored") => void) {
  const fn = useRef(sync);
  fn.current = sync;
  useEffect(() => {
    const form = (ref.current as HTMLInputElement | null)?.form;
    if (!form) return;
    const onReset = () => setTimeout(() => fn.current("reset"), 0);
    const onRestored = () => setTimeout(() => fn.current("restored"), 0);
    form.addEventListener("reset", onReset);
    form.addEventListener("assist:restored", onRestored);
    return () => {
      form.removeEventListener("reset", onReset);
      form.removeEventListener("assist:restored", onRestored);
    };
  }, [ref]);
}

// ── 주소 찾기(카카오 다음 우편번호 서비스) ──
// 무료·키 없음. 단추를 누를 때만 스크립트를 불러오고, 찾기 창은 칸 아래에 펼친다(팝업 차단 걱정 없음).
type DaumAddr = { zonecode: string; roadAddress: string; jibunAddress: string; autoJibunAddress?: string; bname: string; buildingName: string; apartment: "Y" | "N"; userSelectedType: "R" | "J" };
type DaumPostcode = new (o: { oncomplete: (d: DaumAddr) => void; width?: string; height?: string }) => { embed: (el: HTMLElement, o?: { autoClose?: boolean }) => void };
const POSTCODE_SRC = "https://t1.daumcdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js";
let postcodeLoading: Promise<DaumPostcode> | null = null;
function loadPostcode(): Promise<DaumPostcode> {
  const w = window as unknown as { daum?: { Postcode?: DaumPostcode } };
  if (w.daum?.Postcode) return Promise.resolve(w.daum.Postcode);
  postcodeLoading ??= new Promise((ok, fail) => {
    const s = document.createElement("script");
    s.src = POSTCODE_SRC;
    s.async = true;
    s.onload = () => (w.daum?.Postcode ? ok(w.daum.Postcode) : fail(new Error("no postcode")));
    s.onerror = () => {
      postcodeLoading = null;
      fail(new Error("load failed"));
    };
    document.head.appendChild(s);
  });
  return postcodeLoading;
}

/** 고른 결과를 서류에 쓰는 도로명 주소 한 줄로: 도로명 + (법정동, 건물명) */
export function daumRoadLine(d: DaumAddr): string {
  if (d.userSelectedType === "J") return d.jibunAddress || d.autoJibunAddress || d.roadAddress;
  const extra = [/[동로가]$/.test(d.bname) ? d.bname : "", d.buildingName && d.apartment === "Y" ? d.buildingName : ""].filter(Boolean).join(", ");
  return `${d.roadAddress}${extra ? ` (${extra})` : ""}`;
}

/** 우편번호·주소·상세주소 세 칸. '주소 찾기'로 우편번호와 도로명 주소를 채우고 상세주소로 넘어간다 */
export function AddressField({
  help,
  names = { zip: "zip", address: "address", detail: "addressDetail" },
  defaults = {},
  required,
  from,
}: {
  help: { zip: FieldHelpKey; address: FieldHelpKey; detail: FieldHelpKey };
  names?: { zip: string; address: string; detail: string };
  defaults?: { zip?: string; address?: string; detail?: string };
  required?: boolean;
  from?: string;
}) {
  const root = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const field = (n: string) => root.current?.querySelector<HTMLInputElement>(`input[name="${n}"]`) ?? null;
  const put = (n: string, v: string) => {
    const el = field(n);
    if (!el) return;
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(el, v);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  };

  useEffect(() => {
    if (!open) {
      setMsg(null);
      return;
    }
    let alive = true;
    setMsg("주소 찾기 창을 여는 중…");
    loadPostcode()
      .then((Postcode) => {
        if (!alive || !box.current) return;
        setMsg(null);
        box.current.innerHTML = "";
        new Postcode({
          width: "100%",
          height: "100%",
          oncomplete: (d) => {
            put(names.zip, d.zonecode);
            put(names.address, daumRoadLine(d));
            setOpen(false);
            setTimeout(() => field(names.detail)?.focus(), 0);
          },
        }).embed(box.current, { autoClose: false });
      })
      .catch(() => alive && setMsg("주소 찾기 창을 불러오지 못했습니다(인터넷 연결 확인). 우편번호와 주소를 직접 적어도 됩니다."));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <div ref={root} className="space-y-3" data-assist-address>
      <div className="grid gap-3 sm:grid-cols-[12rem_auto_1fr] sm:items-end">
        <TextField help={help.zip} name={names.zip} required={required} from={from} defaultValue={defaults.zip} inputMode="numeric" />
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="h-11 rounded-md border border-[var(--accent)] px-4 text-sm font-medium text-[var(--accent)] hover:bg-[var(--accent-soft)]"
          aria-expanded={open}
        >
          {open ? "찾기 닫기" : "🔍 주소 찾기"}
        </button>
        <p className="text-xs text-[var(--muted)] sm:pb-3">도로명·건물명·지번으로 찾으면 우편번호와 주소가 저절로 들어갑니다.</p>
      </div>
      {(open || msg) && (
        <div className="rounded-md border border-[var(--line-strong)] bg-[var(--surface)]">
          {msg && <p className="px-3 py-2 text-sm text-[var(--muted)]">{msg}</p>}
          {open && <div ref={box} className="h-[440px] w-full" />}
        </div>
      )}
      <TextField help={help.address} name={names.address} required={required} from={from} defaultValue={defaults.address} />
      <TextField help={help.detail} name={names.detail} from={from} defaultValue={defaults.detail} />
    </div>
  );
}
