"use client";
// '고치는 중' 표시(대표 결정 2026-11-20). 같은 전표를 다른 사람이 열어 두었거나 고치고 있으면 알려 준다.
// 막지는 않는다. 같은 칸을 둘이 고치면 나중에 저장하는 쪽에 '먼저 고침' 확인이 뜬다(_assist.tsx).
// 한 화면에 같은 전표의 양식이 여럿이어도 알림은 한 번만(맨 처음 양식 위에) 보이고, 서버에도 한 번만 알린다.
import { useEffect, useState } from "react";

type Viewer = { name: string; role: string | null; editing: boolean; since: string; self: boolean };

const BEAT_MS = 20_000;
const owners = new Map<string, symbol>();
let tabId: string | null = null;

function myTab() {
  if (!tabId) tabId = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  return tabId;
}

const ago = (iso: string) => {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  return m < 1 ? "방금" : m < 60 ? `${m}분 전` : `${Math.floor(m / 60)}시간 전`;
};

export function Presence({ doc }: { doc: string }) {
  const [owner, setOwner] = useState(false);
  const [list, setList] = useState<Viewer[]>([]);

  // 같은 전표 열쇠로는 맨 먼저 그려진 것 하나만 일한다
  useEffect(() => {
    const me = Symbol(doc);
    if (!owners.has(doc)) {
      owners.set(doc, me);
      setOwner(true);
    }
    return () => {
      if (owners.get(doc) === me) owners.delete(doc);
    };
  }, [doc]);

  useEffect(() => {
    if (!owner) return;
    let editing = false;
    let stopped = false;
    const send = async (leave = false) => {
      const body = JSON.stringify({ doc, tab: myTab(), editing, leave });
      if (leave) {
        navigator.sendBeacon?.("/api/presence", body);
        return;
      }
      try {
        const r = await fetch("/api/presence", { method: "POST", body, headers: { "content-type": "application/json" }, cache: "no-store" });
        const j = (await r.json()) as { ok: boolean; viewers?: Viewer[] };
        if (!stopped && j.ok) setList(j.viewers ?? []);
      } catch {
        /* 서버가 잠깐 안 되면 다음 차례에 */
      }
    };
    // 칸을 처음 고치기 시작하면 바로 알린다(그 뒤로는 20초마다)
    const onInput = (e: Event) => {
      if (editing || !(e.target instanceof HTMLElement) || !e.target.closest("form")) return;
      editing = true;
      void send();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") void send();
    };
    const onHide = () => void send(true);
    void send();
    const t = setInterval(() => {
      if (document.visibilityState === "visible") void send();
    }, BEAT_MS);
    document.addEventListener("input", onInput, true);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pagehide", onHide);
    return () => {
      stopped = true;
      clearInterval(t);
      document.removeEventListener("input", onInput, true);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pagehide", onHide);
      void send(true);
    };
  }, [owner, doc]);

  if (!owner || !list.length) return null;
  const editors = list.filter((v) => v.editing);
  const who = (v: Viewer) => (v.self ? "내 다른 창" : `${v.name}${v.role ? `(${v.role})` : ""}님`);
  return (
    <div role="status" data-presence className="mb-3 flex flex-wrap items-start gap-2 rounded-md border border-[var(--warn)]/50 bg-[var(--warn-soft)] px-3 py-2 text-sm">
      <span aria-hidden className="mt-0.5 inline-block size-2.5 shrink-0 animate-pulse rounded-full bg-[var(--warn)]" />
      <span className="flex-1">
        {editors.length ? (
          <>
            <b>{editors.map(who).join(", ")}</b>
            {editors.length === 1 && editors[0].self ? "에서 이 전표를 고치는 중입니다" : "이 이 전표를 고치는 중입니다"} ({ago(editors[0].since)}부터).{" "}
          </>
        ) : (
          <>
            <b>{list.map(who).join(", ")}</b>
            {list.length === 1 && list[0].self ? "에서도 이 전표가 열려 있습니다. " : "도 이 전표를 보고 있습니다. "}
          </>
        )}
        <span className="text-[var(--muted)]">같은 칸을 둘이 고치면 나중에 저장하는 쪽에 &lsquo;먼저 고침&rsquo; 확인이 뜹니다.</span>
      </span>
    </div>
  );
}
