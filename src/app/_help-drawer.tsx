"use client";
// 오른쪽 도움말 창. 화면 제목·패널 제목·입력 칸 이름 옆의 ? 를 누르면 여기에 그 도움말이 열린다.
// 창은 화면을 막지 않아서, 도움말을 보면서 계속 입력할 수 있다. 용어를 누르면 창 안에서 넘어가고 '뒤로'로 돌아온다.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { StdText } from "./_std-text";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { FIELD_HELP, type FieldHelpKey } from "@/modules/help/fields";
import { DELEGATION_HELP, GLOSSARY, POLICY_HELP } from "@/modules/help/glossary";
import { PAGE_HELP, type PageHelpKey } from "@/modules/help/pages";
import { PANEL_HELP, type PanelHelpKey } from "@/modules/help/panels";
import { PAY_ITEM_TAX, type PayItemKey, type PayItemTax } from "@/modules/help/pay-items";
import { helpForPath } from "@/modules/help/route-help";
import type { DelegationTask } from "@/modules/platform/delegation";
import type { PolicyKey } from "@/modules/platform/policy";

export type HelpTopic =
  | { kind: "page"; id: PageHelpKey }
  | { kind: "panel"; id: PanelHelpKey }
  | { kind: "field"; id: FieldHelpKey; label?: string }
  | { kind: "policy"; id: PolicyKey; title: string; note?: string }
  | { kind: "delegation"; id: DelegationTask; title: string }
  | { kind: "term"; id: string }
  /** 임금명세서 줄: 과세/비과세·한도·근거. limit 은 정책값을 채운 한도 글 */
  | { kind: "pay"; id: PayItemKey; limit?: string };

type Ctx = { show: (t: HelpTopic) => void; current: HelpTopic | null };
const HelpCtx = createContext<Ctx>({ show: () => {}, current: null });

const same = (a: HelpTopic | null, b: HelpTopic) => !!a && a.kind === b.kind && a.id === b.id;

export function HelpProvider({ children }: { children: ReactNode }) {
  const [stack, setStack] = useState<HelpTopic[]>([]);
  const current = stack[stack.length - 1] ?? null;
  const opener = useRef<HTMLElement | null>(null);
  const panel = useRef<HTMLElement>(null);

  // 같은 ? 를 다시 누르면 닫고, 다른 ? 를 누르면 그 도움말로 바꾼다
  const show = useCallback((t: HelpTopic) => {
    opener.current = document.activeElement as HTMLElement | null;
    setStack((s) => (same(s[s.length - 1] ?? null, t) ? [] : [t]));
  }, []);
  const push = (t: HelpTopic) => setStack((s) => [...s, t]);
  const close = useCallback(() => {
    setStack([]);
    opener.current?.focus();
  }, []);

  // 창이 열린 채 메뉴·링크로 다른 화면에 가면 그 화면의 도움말로 바꾼다(대표 요청 2026-11-20). 도움말이 없는 화면이면 그대로 둔다
  const pathname = usePathname();
  const lastPath = useRef(pathname);
  useEffect(() => {
    if (lastPath.current === pathname) return;
    lastPath.current = pathname;
    const key = helpForPath(pathname);
    if (key) setStack((s) => (s.length ? [{ kind: "page", id: key }] : s));
  }, [pathname]);

  useEffect(() => {
    document.documentElement.dataset.help = current ? "open" : "";
    if (current) panel.current?.focus();
  }, [current]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

  return (
    <HelpCtx.Provider value={{ show, current }}>
      {children}
      {current && (
        <aside
          ref={panel}
          tabIndex={-1}
          role="complementary"
          aria-label="도움말"
          id="help-drawer"
          className="fixed inset-y-0 right-0 z-40 flex w-[88vw] max-w-[400px] flex-col border-l border-[var(--line)] bg-[var(--surface)] shadow-[var(--shadow-lg)] outline-none"
        >
          <div className="flex min-h-14 items-center gap-1 border-b border-[var(--line)] px-2">
            {stack.length > 1 && (
              <button type="button" onClick={() => setStack((s) => s.slice(0, -1))} className="min-h-10 rounded-md px-2 text-sm text-[var(--accent)] hover:bg-[var(--surface-2)]">
                ← 뒤로
              </button>
            )}
            <span className="flex-1 truncate px-1 text-sm font-semibold">도움말</span>
            <button type="button" onClick={close} aria-label="도움말 닫기" className="inline-flex size-10 items-center justify-center rounded-md text-lg text-[var(--muted)] hover:bg-[var(--surface-2)]">
              ×
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-4 text-sm leading-relaxed">
            <Body topic={current} onTerm={(id) => push({ kind: "term", id })} />
          </div>
          <div className="border-t border-[var(--line)] px-4 py-3 text-xs">
            <Link href="/help" onClick={close} className="text-[var(--accent)]">
              도움말 센터에서 더 찾기 →
            </Link>
            <span className="ml-2 text-[var(--muted)]">Esc 로 닫기</span>
          </div>
        </aside>
      )}
    </HelpCtx.Provider>
  );
}

/** 제목·패널·칸 이름 옆에 붙이는 ? 단추 */
export function HelpButton({ topic, name }: { topic: HelpTopic; name: string }) {
  const { show, current } = useContext(HelpCtx);
  const on = same(current, topic);
  return (
    <button
      type="button"
      onClick={() => show(topic)}
      aria-pressed={on}
      aria-label={`${name} 도움말`}
      title={`${name} 도움말`}
      className="relative inline-flex size-6 shrink-0 items-center before:absolute before:-inset-2.5 before:content-[''] pointer-coarse:size-7 justify-center rounded-full border border-[var(--line-strong)] align-middle text-xs font-semibold text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--accent)] aria-pressed:border-[var(--accent)] aria-pressed:bg-[var(--accent)] aria-pressed:text-[var(--accent-fg)]"
    >
      ?
    </button>
  );
}

function H({ children }: { children: ReactNode }) {
  return <h3 className="mt-4 mb-1 text-xs font-semibold text-[var(--muted)]">{children}</h3>;
}

function Terms({ ids, onTerm }: { ids?: string[]; onTerm: (id: string) => void }) {
  if (!ids?.length) return null;
  return (
    <>
      <H>용어</H>
      <div className="flex flex-wrap gap-1">
        {ids.map((t) => (
          <button key={t} type="button" onClick={() => onTerm(t)} className="min-h-8 rounded-full border border-[var(--line-strong)] px-2.5 text-xs hover:bg-[var(--surface-2)]">
            {t}
          </button>
        ))}
      </div>
    </>
  );
}

function Body({ topic, onTerm }: { topic: HelpTopic; onTerm: (id: string) => void }) {
  switch (topic.kind) {
    case "page": {
      const h = PAGE_HELP[topic.id] as (typeof PAGE_HELP)[PageHelpKey] & { tips?: string[]; faq?: { q: string; a: string }[]; refs?: string[]; terms?: string[] };
      return (
        <>
          <p className="text-xs text-[var(--muted)]">화면</p>
          <h2 className="mb-2 text-base font-bold">{h.title}</h2>
          <p><StdText text={h.purpose} /></p>
          <p className="mt-1 text-xs text-[var(--muted)]">쓰는 사람: {h.who}</p>
          <H>순서</H>
          <ol className="list-decimal space-y-1 pl-5">
            {h.steps.map((s) => (
              <li key={s}><StdText text={s} /></li>
            ))}
          </ol>
          {h.tips && (
            <>
              <H>요령</H>
              <ul className="list-disc space-y-1 pl-5">
                {h.tips.map((s) => (
                  <li key={s}><StdText text={s} /></li>
                ))}
              </ul>
            </>
          )}
          {h.faq && (
            <>
              <H>자주 묻는 질문</H>
              <dl className="space-y-2">
                {h.faq.map((f) => (
                  <div key={f.q}>
                    <dt className="font-medium">Q. {f.q}</dt>
                    <dd className="text-[var(--muted)]">A. {f.a}</dd>
                  </div>
                ))}
              </dl>
            </>
          )}
          <Terms ids={h.terms} onTerm={onTerm} />
          {h.refs && (
            <p className="mt-4 text-xs text-[var(--muted)]">
              관련:{" "}
              {h.refs.map((r, i) => (
                <span key={r}>
                  {i > 0 && " · "}
                  <StdText text={r} />
                </span>
              ))}
            </p>
          )}
        </>
      );
    }
    case "panel": {
      const h = PANEL_HELP[topic.id] as { title: string; body: string; tips?: string[]; terms?: string[] };
      return (
        <>
          <p className="text-xs text-[var(--muted)]">패널</p>
          <h2 className="mb-2 text-base font-bold">{h.title}</h2>
          <p><StdText text={h.body} /></p>
          {h.tips && (
            <>
              <H>요령</H>
              <ul className="list-disc space-y-1 pl-5">
                {h.tips.map((s) => (
                  <li key={s}><StdText text={s} /></li>
                ))}
              </ul>
            </>
          )}
          <Terms ids={h.terms} onTerm={onTerm} />
        </>
      );
    }
    case "field": {
      const h = FIELD_HELP[topic.id] as { label: string; hint?: string; example?: string; detail?: string; format?: { message: string }; templates?: string[]; maxLength?: number };
      return (
        <>
          <p className="text-xs text-[var(--muted)]">입력 칸</p>
          <h2 className="mb-2 text-base font-bold">{topic.label ?? h.label}</h2>
          {h.hint && <p><StdText text={h.hint} /></p>}
          {h.detail && <p className="mt-2"><StdText text={h.detail} /></p>}
          {h.example && (
            <>
              <H>예시</H>
              <p className="rounded-md bg-[var(--surface-2)] px-2 py-1.5">{h.example}</p>
            </>
          )}
          {h.format && (
            <>
              <H>형식</H>
              <p>{h.format.message}</p>
            </>
          )}
          {h.maxLength && <p className="mt-2 text-xs text-[var(--muted)]">최대 {h.maxLength.toLocaleString("ko-KR")}자</p>}
          {h.templates && (
            <>
              <H>문구 넣기로 넣을 수 있는 말</H>
              <ul className="list-disc space-y-1 whitespace-pre-line pl-5">
                {h.templates.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </>
          )}
        </>
      );
    }
    case "policy":
      return (
        <>
          <p className="text-xs text-[var(--muted)]">정책값</p>
          <h2 className="mb-2 text-base font-bold">{topic.title}</h2>
          <p><StdText text={POLICY_HELP[topic.id]} /></p>
          {topic.note && <p className="mt-2 text-xs text-[var(--muted)]">{topic.note}</p>}
          <Terms ids={["정책값", "시행일", "개정요청 번호"]} onTerm={onTerm} />
        </>
      );
    case "delegation":
      return (
        <>
          <p className="text-xs text-[var(--muted)]">전결 업무</p>
          <h2 className="mb-2 text-base font-bold">{topic.title}</h2>
          <p><StdText text={DELEGATION_HELP[topic.id]} /></p>
          <Terms ids={["전결", "결재선"]} onTerm={onTerm} />
        </>
      );
    case "pay": {
      const h: PayItemTax = PAY_ITEM_TAX[topic.id];
      return (
        <>
          <p className="text-xs text-[var(--muted)]">급여 항목</p>
          <h2 className="mb-2 text-base font-bold">{h.title}</h2>
          <p>
            <b>{h.tax}</b>
            {(topic.limit ?? h.limit) && <> · 한도 {topic.limit ?? h.limit}</>}
          </p>
          {h.when && (
            <>
              <H>조건</H>
              <ul className="list-disc space-y-1 pl-5">
                {h.when.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            </>
          )}
          {h.note && <p className="mt-2">{h.note}</p>}
          <H>법적 근거</H>
          <p>{h.basis}</p>
          <p className="mt-3 text-xs text-[var(--muted)]">한도 금액은 정책값(설정 › 정책값 › 세무 한도)에서 옵니다. 세무사 검토 전 내용입니다.</p>
        </>
      );
    }
    case "term":
      return (
        <>
          <p className="text-xs text-[var(--muted)]">용어</p>
          <h2 className="mb-2 text-base font-bold">{topic.id}</h2>
          <p>{GLOSSARY[topic.id] ?? "용어집에 없는 말입니다."}</p>
        </>
      );
  }
}
