"use client";
// 로그인 화면의 '홈 화면에 추가' 안내(대표 지시 2026-11-21). 직원 로그인·내 차 수첩 로그인에 쓴다.
// 브라우저는 사람이 직접 눌러야만 홈 화면에 앱을 넣게 막아 두었으므로, 완전 자동 설치는 안 되고 안내만 한다.
// - 홈 화면 앱으로 열었으면(standalone) 아무것도 보이지 않는다. 넓은 화면(PC)에도 보이지 않는다.
// - 안드로이드 크롬: [홈 화면에 설치] 단추 한 번(브라우저가 설치를 허락할 때)
// - 아이폰: 공유 단추 › 홈 화면에 추가 › 추가 순서를 그림으로. 아이폰은 홈 화면 앱에서만 알림이 된다(iOS 16.4 이상)
// - 카카오톡 안: 다른 브라우저로 여는 길
// '닫기'를 누르면 이 기기에서 7일 동안 다시 보이지 않는다.
import { useEffect, useState } from "react";
import { Button } from "./_ui";

type BIP = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
const KEY = "install-hint:closed";
const WEEK = 7 * 86_400_000;

/** 아이폰 사파리 공유 단추 모양(네모에 위 화살표) */
const ShareIcon = () => (
  <svg aria-hidden viewBox="0 0 24 24" className="inline size-6 align-[-6px] text-[#0a84ff]" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3v12M8 7l4-4 4 4M7 10H5v11h14V10h-2" />
  </svg>
);
/** '홈 화면에 추가' 줄의 더하기 네모 */
const AddIcon = ({ small }: { small?: boolean }) => (
  <svg aria-hidden viewBox="0 0 24 24" className={`inline shrink-0 ${small ? "size-4" : "size-6 align-[-6px]"}`} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <rect x="3.5" y="3.5" width="17" height="17" rx="4" />
    <path d="M12 8v8M8 12h8" />
  </svg>
);

/** 아이폰 순서 그림: 휴대폰 화면 3장 */
function IosSteps({ appName }: { appName: string }) {
  const phone = "flex h-36 flex-col overflow-hidden rounded-xl border-2 border-[var(--line-strong)] bg-[var(--surface)] text-[10px] leading-tight";
  return (
    <ol className="grid grid-cols-3 gap-2 text-center text-xs">
      <li>
        <div className={phone}>
          <div className="flex-1 bg-[var(--surface-2)]" />
          <div className="flex items-center justify-around border-t border-[var(--line)] py-1.5 text-[var(--muted)]">
            <span>‹</span>
            <span className="rounded-md ring-2 ring-[#0a84ff] ring-offset-1">
              <ShareIcon />
            </span>
            <span>⧉</span>
          </div>
        </div>
        <p className="mt-1.5">
          ① 아래 <b>공유</b> 단추
        </p>
      </li>
      <li>
        <div className={phone}>
          <div className="flex-1 bg-[var(--surface-2)]" />
          <div className="space-y-1 border-t border-[var(--line)] p-1.5 text-left">
            <div className="rounded bg-[var(--surface-2)] px-1 py-1 text-[var(--muted)]">복사</div>
            <div className="flex items-center justify-between gap-0.5 rounded bg-[var(--surface-2)] px-1 py-1 text-[9px] font-semibold whitespace-nowrap ring-2 ring-[#0a84ff]">
              홈 화면에 추가 <AddIcon small />
            </div>
          </div>
        </div>
        <p className="mt-1.5">
          ② 아래로 내려 <b>홈 화면에 추가</b>
        </p>
      </li>
      <li>
        <div className={phone}>
          <div className="flex items-center justify-between border-b border-[var(--line)] px-1.5 py-1.5">
            <span className="text-[var(--muted)]">취소</span>
            <span className="rounded px-1 font-semibold text-[#0a84ff] ring-2 ring-[#0a84ff]">추가</span>
          </div>
          <div className="flex flex-1 flex-col items-center justify-center gap-1 p-1">
            {/* eslint-disable-next-line @next/next/no-img-element -- 앱 아이콘 */}
            <img src="/icons/apple-180.png" alt="" className="size-9 rounded-lg" />
            <span className="truncate">{appName}</span>
          </div>
        </div>
        <p className="mt-1.5">
          ③ 오른쪽 위 <b>추가</b>
        </p>
      </li>
    </ol>
  );
}

export function InstallHint({ appName, what }: { appName: string; /** 알림 예: '결재·업무지시' */ what: string }) {
  const [env, setEnv] = useState<{ show: boolean; ios: boolean; kakao: boolean; android: boolean } | null>(null);
  const [bip, setBip] = useState<BIP | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const ua = navigator.userAgent;
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    const mobile = /Android|iPhone|iPad|iPod/i.test(ua) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(ua));
    let closed = false;
    try {
      closed = Date.now() - Number(localStorage.getItem(KEY) ?? 0) < WEEK;
    } catch {
      /* 보인다 */
    }
    setEnv({ show: mobile && !standalone && !closed, ios: /iPhone|iPad|iPod/i.test(ua) || /Macintosh/.test(ua), kakao: /KAKAOTALK/i.test(ua), android: /Android/i.test(ua) });
    const onBip = (e: Event) => {
      e.preventDefault();
      setBip(e as BIP);
    };
    const onInstalled = () => setDone(true);
    window.addEventListener("beforeinstallprompt", onBip);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBip);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (!env?.show) return null;
  const close = () => {
    try {
      localStorage.setItem(KEY, String(Date.now()));
    } catch {
      /* 이번만 닫힘 */
    }
    setEnv({ ...env, show: false });
  };
  const install = async () => {
    if (!bip) return;
    await bip.prompt();
    if ((await bip.userChoice).outcome === "accepted") setDone(true);
    setBip(null);
  };

  return (
    <section aria-label="홈 화면에 추가" className="mb-5 rounded-xl border border-[var(--accent)]/40 bg-[var(--accent-soft)] p-4 text-sm">
      <div className="flex items-start justify-between gap-2">
        <p className="font-semibold">📲 홈 화면에 {appName} 앱을 추가하세요</p>
        <button type="button" onClick={close} aria-label="안내 닫기(7일 동안 숨김)" className="-mt-2 -mr-2 inline-flex size-10 shrink-0 items-center justify-center rounded-md text-lg text-[var(--muted)] hover:bg-[var(--surface)]">
          ×
        </button>
      </div>
      <p className="mt-1 text-[var(--muted)]">아이콘을 눌러 앱처럼 바로 열고, {what} 알림을 휴대폰으로 받을 수 있습니다.</p>
      <div className="mt-3">
        {done ? (
          <p role="status" className="font-medium text-[var(--ok)]">
            홈 화면에 추가했습니다. 이제 홈 화면의 아이콘으로 열어 주세요.
          </p>
        ) : env.kakao ? (
          <p>
            카카오톡 안에서는 홈 화면에 추가할 수 없습니다. 오른쪽 아래 <b>⋮</b> › <b>다른 브라우저로 열기</b>를 누른 뒤 다시 해 주세요.
          </p>
        ) : bip ? (
          <Button onClick={install} className="w-full">
            홈 화면에 설치
          </Button>
        ) : env.ios ? (
          <>
            <IosSteps appName={appName} />
            <p className="mt-3 text-xs text-[var(--muted)]">아이폰은 홈 화면에 추가한 앱으로 열어야 알림을 받을 수 있습니다(iOS 16.4 이상). 처음 열 때 &lsquo;알림 받기&rsquo;를 눌러 주세요.</p>
          </>
        ) : (
          <p>
            브라우저 오른쪽 위 <b>⋮</b> 메뉴 › <b>홈 화면에 추가</b>(또는 <b>앱 설치</b>)를 눌러 주세요.
          </p>
        )}
      </div>
    </section>
  );
}
