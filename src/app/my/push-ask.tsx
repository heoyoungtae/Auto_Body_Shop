"use client";
// 홈 화면에 둔 내 차 수첩을 처음 열면 '알림 받기'를 묻는다(대표 지시 2026-11-21).
// 아이폰은 손가락으로 눌러야만 허용 창이 뜨므로 단추로 묻는다. '나중에'를 누르면 다시 묻지 않고, 더보기 › 앱·알림에서 켤 수 있다.
// 푸시 등록은 3단계(app-card.tsx)와 같은 길(/my/sw.js, pushOnAction)을 쓴다.
import { useEffect, useState } from "react";
import { Button } from "../_ui";
import { pushOnAction } from "./actions";

const ASKED = "my:push-asked";
const fromB64u = (s: string) => {
  const b = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
};

export function MyPushAsk({ vapid }: { vapid: string }) {
  const [ask, setAsk] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    const pushable = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    let asked = false;
    try {
      asked = !!localStorage.getItem(ASKED);
    } catch {
      /* 묻는다 */
    }
    if (standalone && pushable && Notification.permission === "default" && !asked) setAsk(true);
  }, []);
  const remember = (v: string) => {
    try {
      localStorage.setItem(ASKED, v);
    } catch {
      /* 괜찮음 */
    }
  };
  const yes = async () => {
    remember("yes");
    try {
      if ((await Notification.requestPermission()) !== "granted") {
        setMsg("알림 허용을 누르지 않아 켜지 않았습니다. 더보기 › 앱·알림에서 다시 켤 수 있습니다.");
      } else {
        const reg = await navigator.serviceWorker.register("/my/sw.js", { scope: "/my/" });
        await navigator.serviceWorker.ready;
        const s = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: fromB64u(vapid) });
        const r = await pushOnAction(s.endpoint);
        if (r.error) {
          await s.unsubscribe();
          setMsg(r.error);
        } else setMsg("이 휴대폰으로 알림을 받습니다.");
      }
    } catch {
      setMsg("이 휴대폰에서는 알림을 켤 수 없었습니다. 더보기 › 앱·알림에서 다시 해 주세요.");
    }
    setAsk(false);
  };
  if (!ask && !msg) return null;
  return (
    <div className="rounded-xl border border-[var(--accent)]/40 bg-[var(--accent-soft)] p-4 text-sm">
      {ask ? (
        <>
          <p className="font-semibold">🔔 알림을 받으시겠어요?</p>
          <p className="mt-1 text-[var(--muted)]">수리 진행·견적 승인·검사·보증 만료 알림이 이 휴대폰에 바로 뜹니다.</p>
          <div className="mt-3 flex gap-2">
            <Button onClick={yes} className="flex-1">
              알림 받기
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                remember("later");
                setAsk(false);
              }}
            >
              나중에
            </Button>
          </div>
        </>
      ) : (
        <p role="status">{msg}</p>
      )}
    </div>
  );
}
