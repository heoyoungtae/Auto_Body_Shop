"use client";
// 직원 앱 알림(대표 지시 2026-11-21).
// - 홈 화면에 둔 앱으로 처음 열면 '알림 받기'를 묻는다(아이폰은 손가락으로 눌러야만 허용 창이 뜨므로 단추로 묻는다).
// - 이미 허용했으면 이 기기를 저절로 등록해 둔다(앱을 지웠다 다시 깔아도).
// - 앱이 화면에 열려 있을 때 새 알림이 오면 클랙슨 소리를 내고 숫자를 새로 그린다.
//   서비스 워커가 푸시를 받으면 알려 주고, 푸시를 켜지 않은 기기(사무실 PC 등)는 1분마다 안 읽은 수를 묻는다.
// - 앱이 닫혀 있을 때 오는 푸시는 휴대폰 기본 알림음만 난다(웹 앱은 그 소리를 바꿀 수 없음).
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "./_ui";
import { hornOn, playHorn, setHornOn, unlockHorn } from "./_horn";
import { staffPushOffAction, staffPushOnAction, staffVapidAction } from "./_push-actions";

const fromB64u = (s: string) => {
  const b = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
};

export const isStandalone = () =>
  typeof window !== "undefined" &&
  (window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);
export const isIos = () => typeof navigator !== "undefined" && /iPhone|iPad|iPod/i.test(navigator.userAgent);
const pushable = () => typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

async function registration() {
  return navigator.serviceWorker.register("/sw.js", { scope: "/" });
}

/** 알림 허용을 묻고 이 기기를 등록한다. 결과 문장을 돌려준다 */
async function turnOn(): Promise<{ ok: boolean; msg: string }> {
  const perm = await Notification.requestPermission();
  if (perm !== "granted")
    return { ok: false, msg: "알림 허용을 누르지 않아 켜지 않았습니다. 휴대폰 설정 › 알림에서 제이모터스를 허용하면 됩니다." };
  return subscribe();
}

async function subscribe(): Promise<{ ok: boolean; msg: string }> {
  const key = await staffVapidAction();
  if (!key) return { ok: false, msg: "다시 로그인해 주세요." };
  const reg = await registration();
  await navigator.serviceWorker.ready;
  const s = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: fromB64u(key) }));
  const r = await staffPushOnAction(s.endpoint);
  if (r.error) return { ok: false, msg: r.error };
  return { ok: true, msg: "이 기기로 알림을 받습니다." };
}

const ASKED = "alert:asked";

/** 레이아웃에 한 번 둔다(로그인한 직원만) */
export function AppAlerts({ unread }: { unread: number }) {
  const router = useRouter();
  const last = useRef(unread);
  const [ask, setAsk] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // 서버가 그린 숫자가 바뀌면(읽음 처리 등) 기준을 맞춘다
  useEffect(() => {
    last.current = unread;
  }, [unread]);

  useEffect(() => {
    const unlock = () => unlockHorn();
    window.addEventListener("pointerdown", unlock, { once: true });
    const onNew = () => {
      playHorn();
      router.refresh();
    };
    const onMsg = (e: MessageEvent) => {
      if (e.data?.type === "staff-push") onNew();
    };
    if (pushable()) {
      navigator.serviceWorker.addEventListener("message", onMsg);
      // 이미 허용한 기기는 조용히 등록해 둔다. 홈 화면 앱으로 처음 열었고 아직 묻지 않았으면 단추로 묻는다
      if (Notification.permission === "granted") void subscribe().catch(() => undefined);
      else if (Notification.permission === "default" && isStandalone()) {
        let asked = false;
        try {
          asked = !!localStorage.getItem(ASKED);
        } catch {
          /* 묻는다 */
        }
        if (!asked) setAsk(true);
      }
    }
    // 열려 있는 동안 1분마다 안 읽은 수를 묻는다(푸시를 안 켠 기기도 소리가 나게)
    const tick = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const r = await fetch("/api/staff/unread", { cache: "no-store" });
        if (!r.ok) return;
        const { n } = (await r.json()) as { n: number };
        if (n > last.current) onNew();
        last.current = n;
      } catch {
        /* 다음에 다시 */
      }
    };
    const t = setInterval(tick, 60_000);
    return () => {
      clearInterval(t);
      window.removeEventListener("pointerdown", unlock);
      if (pushable()) navigator.serviceWorker.removeEventListener("message", onMsg);
    };
  }, [router]);

  const later = () => {
    setAsk(false);
    try {
      localStorage.setItem(ASKED, "later");
    } catch {
      /* 다음에 또 물음 */
    }
  };
  const yes = async () => {
    try {
      localStorage.setItem(ASKED, "yes");
    } catch {
      /* 괜찮음 */
    }
    try {
      const r = await turnOn();
      setMsg(r.msg);
    } catch {
      setMsg("이 기기에서는 알림을 켤 수 없었습니다. 알림 화면에서 다시 켤 수 있습니다.");
    }
    setAsk(false);
    setTimeout(() => setMsg(null), 6000);
  };

  if (!ask && !msg) return null;
  return (
    <div role="dialog" aria-label="알림 받기" className="no-print fixed inset-x-3 bottom-3 z-40 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4 shadow-[var(--shadow-lg)] sm:left-auto sm:w-96" style={{ marginBottom: "env(safe-area-inset-bottom)" }}>
      {ask ? (
        <>
          <p className="font-semibold">🔔 이 휴대폰으로 알림을 받을까요?</p>
          <p className="mt-1 text-sm text-[var(--muted)]">결재 차례·업무지시·작업 배정 같은 알림이 앱을 닫아 두어도 휴대폰에 뜹니다. 앱을 열어 둔 때는 클랙슨 소리로 알려 줍니다.</p>
          <div className="mt-3 flex gap-2">
            <Button onClick={yes} className="flex-1">
              알림 받기
            </Button>
            <Button variant="secondary" onClick={later}>
              나중에
            </Button>
          </div>
        </>
      ) : (
        <p role="status" className="text-sm">
          {msg}
        </p>
      )}
    </div>
  );
}

/** 알림 화면·내 계정의 '이 기기 알림' 설정: 푸시 켜고 끄기, 클랙슨 소리 켜고 끄기·들어보기 */
export function DeviceAlerts() {
  const [env, setEnv] = useState({ ready: false, pushable: false, ios: false, standalone: false });
  const [sub, setSub] = useState<PushSubscription | null>(null);
  const [horn, setHorn] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    setEnv({ ready: true, pushable: pushable(), ios: isIos(), standalone: isStandalone() });
    setHorn(hornOn());
    if (pushable())
      void navigator.serviceWorker
        .getRegistration("/")
        .then((reg) => reg?.pushManager.getSubscription() ?? null)
        .then((s) => setSub(s ?? null))
        .catch(() => undefined);
  }, []);

  const on = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await turnOn();
      setMsg(r.msg);
      if (r.ok) setSub((await (await navigator.serviceWorker.getRegistration("/"))?.pushManager.getSubscription()) ?? null);
    } catch {
      setMsg("이 기기에서는 알림을 켤 수 없었습니다. 잠시 뒤 다시 해 주세요.");
    } finally {
      setBusy(false);
    }
  };
  const off = async () => {
    if (!sub) return;
    setBusy(true);
    try {
      await staffPushOffAction(sub.endpoint);
      await sub.unsubscribe();
      setSub(null);
      setMsg("이 기기로 오는 푸시 알림을 껐습니다. 알림은 앱의 알림 화면에 계속 쌓입니다.");
    } finally {
      setBusy(false);
    }
  };

  if (!env.ready) return null;
  return (
    <div className="space-y-3 text-sm">
      <div>
        <p className="font-medium">휴대폰 푸시 알림</p>
        {!env.pushable || (env.ios && !env.standalone) ? (
          <p className="mt-1 text-[var(--muted)]">
            {env.ios
              ? "아이폰은 홈 화면에 추가한 앱으로 열어야 알림을 켤 수 있습니다(iOS 16.4 이상). 사파리 아래 공유 단추 › 홈 화면에 추가를 누른 뒤, 홈 화면의 제이모터스 아이콘으로 열어 주세요."
              : "이 브라우저는 푸시 알림을 지원하지 않습니다. 크롬으로 열어 주세요."}
          </p>
        ) : sub ? (
          <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
            <span>이 기기로 알림을 받습니다.</span>
            <Button variant="secondary" onClick={off} disabled={busy}>
              끄기
            </Button>
          </div>
        ) : (
          <div className="mt-1 space-y-1">
            <Button onClick={on} disabled={busy}>
              이 기기로 알림 받기
            </Button>
            <p className="text-xs text-[var(--muted)]">결재 차례·업무지시·작업 배정 알림이 앱을 닫아 두어도 뜹니다. 알림 내용은 정비소 서버에서만 가져옵니다.</p>
          </div>
        )}
      </div>
      <div className="border-t border-[var(--line)] pt-3">
        <label className="flex min-h-11 cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            data-assist="preview"
            checked={horn}
            onChange={(e) => {
              setHorn(e.target.checked);
              setHornOn(e.target.checked);
              if (e.target.checked) playHorn(true);
            }}
          />
          <span>앱을 열어 둔 때 새 알림이 오면 클랙슨 소리 내기</span>
        </label>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <Button variant="secondary" onClick={() => playHorn(true)}>
            소리 들어보기
          </Button>
          <span className="text-xs text-[var(--muted)]">이 기기에만 적용됩니다. 앱이 닫혀 있을 때 오는 푸시는 휴대폰 기본 알림음이 납니다.</span>
        </div>
      </div>
      {msg && (
        <p role="status" className="text-[var(--accent)]">
          {msg}
        </p>
      )}
    </div>
  );
}
