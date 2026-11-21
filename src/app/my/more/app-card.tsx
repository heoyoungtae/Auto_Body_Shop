"use client";
// 홈 화면에 앱처럼 두기와 푸시 받기(3단계).
// - 안드로이드 크롬: '홈 화면에 추가' 단추(브라우저가 허락할 때), 아이폰 사파리: 공유 → 홈 화면에 추가 안내
// - 카카오톡 안: 크롬·사파리로 여는 길(카톡 안에서는 홈 화면 추가·푸시가 안 됨)
// - 푸시: 아이폰은 홈 화면에 둔 앱에서만 켤 수 있다(iOS 16.4+). 켜면 알림톡 대신 이 휴대폰으로 알림이 온다
import { useEffect, useState } from "react";
import { Button } from "../../_ui";
import { inAppEnv } from "../my-nav";
import { OpenOutside } from "../print-bar";
import { pushOffAction, pushOnAction } from "../actions";

type BIP = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

const fromB64u = (s: string) => {
  const b = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
};

export function AppCard({ vapid }: { vapid: string }) {
  const [env, setEnv] = useState({ kakao: false, android: false, ios: false, standalone: false, pushable: false });
  const [bip, setBip] = useState<BIP | null>(null);
  const [sub, setSub] = useState<PushSubscription | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    const e = inAppEnv();
    const ua = navigator.userAgent;
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    const pushable = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    setEnv({ ...e, ios: /iPhone|iPad|iPod/i.test(ua), standalone, pushable });
    const onBip = (ev: Event) => {
      ev.preventDefault();
      setBip(ev as BIP);
    };
    window.addEventListener("beforeinstallprompt", onBip);
    if (pushable)
      navigator.serviceWorker
        .register("/my/sw.js", { scope: "/my/" })
        .then((reg) => reg.pushManager.getSubscription())
        .then(setSub)
        .catch(() => undefined);
    return () => window.removeEventListener("beforeinstallprompt", onBip);
  }, []);

  const install = async () => {
    if (!bip) return;
    await bip.prompt();
    const r = await bip.userChoice;
    if (r.outcome === "accepted") setMsg("홈 화면에 추가했습니다.");
    setBip(null);
  };

  const pushOn = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setMsg("알림 허용을 누르지 않아 켜지 않았습니다. 휴대폰 설정 › 알림에서 허용할 수 있습니다.");
        return;
      }
      const reg = await navigator.serviceWorker.register("/my/sw.js", { scope: "/my/" });
      await navigator.serviceWorker.ready;
      const s = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: fromB64u(vapid) });
      const r = await pushOnAction(s.endpoint);
      if (r.error) {
        await s.unsubscribe();
        setMsg(r.error);
        return;
      }
      setSub(s);
      setMsg("이 휴대폰으로 알림을 받습니다.");
    } catch {
      setMsg("이 휴대폰에서는 알림을 켤 수 없었습니다. 잠시 뒤 다시 해 주세요.");
    } finally {
      setBusy(false);
    }
  };

  const pushOff = async () => {
    if (!sub) return;
    setBusy(true);
    try {
      await pushOffAction(sub.endpoint);
      await sub.unsubscribe();
      setSub(null);
      setMsg("푸시를 껐습니다. 알림은 카카오 알림톡(안 되면 문자)으로 갑니다.");
    } finally {
      setBusy(false);
    }
  };

  if (env.kakao) return <OpenOutside android={env.android} why="카카오톡 안에서는 홈 화면에 두기와 푸시 알림을 켤 수 없습니다. 크롬·사파리에서 열어 주세요." />;
  return (
    <div className="space-y-3 text-sm">
      {env.standalone ? (
        <p>홈 화면에 둔 &lsquo;내 차 수첩&rsquo;으로 보고 계십니다.</p>
      ) : bip ? (
        <Button onClick={install} className="w-full">
          홈 화면에 추가
        </Button>
      ) : env.ios ? (
        <p>
          사파리 아래 <b>공유</b> 단추(네모에 위 화살표) → <b>홈 화면에 추가</b>를 누르면 앱처럼 쓸 수 있습니다.
        </p>
      ) : (
        <p>
          브라우저 메뉴(⋮)에서 <b>홈 화면에 추가</b> 또는 <b>앱 설치</b>를 누르면 앱처럼 쓸 수 있습니다.
        </p>
      )}
      <div className="border-t border-[var(--line)] pt-3">
        {!env.pushable || (env.ios && !env.standalone) ? (
          <p className="text-[var(--muted)]">{env.ios ? "아이폰은 홈 화면에 추가한 뒤 그 아이콘으로 열어야 푸시 알림을 켤 수 있습니다." : "이 브라우저는 푸시 알림을 지원하지 않습니다. 알림은 카카오 알림톡(안 되면 문자)으로 갑니다."}</p>
        ) : sub ? (
          <div className="flex items-center justify-between gap-2">
            <span>이 휴대폰으로 푸시 알림을 받습니다.</span>
            <Button variant="secondary" onClick={pushOff} disabled={busy}>
              끄기
            </Button>
          </div>
        ) : (
          <div className="space-y-1">
            <Button onClick={pushOn} disabled={busy} className="w-full">
              이 휴대폰으로 푸시 알림 받기
            </Button>
            <p className="text-xs text-[var(--muted)]">켜면 검사·보증·소모품·보험 알림이 알림톡 대신 이 휴대폰에 바로 뜹니다. 알림 내용은 정비소 서버에서만 가져옵니다.</p>
          </div>
        )}
      </div>
      {msg && (
        <p role="status" className="text-[var(--accent)]">
          {msg}
        </p>
      )}
    </div>
  );
}
