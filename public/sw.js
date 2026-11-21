// 직원 앱 서비스 워커(범위 /). 푸시는 내용 없이 오므로, 로그인 쿠키로 띄울 알림 글을 받아 띄운다(modules/platform/staff-push.ts).
// 앱이 화면에 열려 있으면 그 화면에 알려 클랙슨 소리를 내게 한다(_app-alerts.tsx).
// 화면 저장(오프라인 캐시)은 하지 않는다: 업무 기록은 늘 서버의 지금 값을 본다.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (e) => {
  e.waitUntil(
    (async () => {
      const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const w of wins) w.postMessage({ type: "staff-push" });
      let list = [];
      try {
        const r = await fetch("/api/staff/inbox", { credentials: "include", cache: "no-store" });
        if (r.ok) list = await r.json();
      } catch (_) {
        /* 아래 기본 글 */
      }
      if (!list.length) list = [{ title: "제이모터스", body: "새 알림이 있습니다. 눌러서 확인해 주세요.", url: "/notifications" }];
      for (const m of list) await self.registration.showNotification(m.title, { body: m.body, icon: "/icons/icon-192.png", badge: "/icons/icon-192.png", data: { url: m.url }, tag: m.id || "staff" });
    })(),
  );
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || "/notifications";
  e.waitUntil(
    (async () => {
      const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const w of wins) if (!new URL(w.url).pathname.startsWith("/my")) return w.navigate(url).then((x) => x && x.focus());
      return self.clients.openWindow(url);
    })(),
  );
});
