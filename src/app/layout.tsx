import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { getDb } from "@/db/runtime";
import { ROLE_LABEL } from "@/modules/auth/roles";
import { unreadCount } from "@/modules/platform/notify";
import { currentUser } from "./_lib/session";
import { logoutAction } from "./login/actions";
import { HelpProvider } from "./_help-drawer";
import { MenuButton, NavProvider, Sidebar } from "./_sidebar";
import "./globals.css";

export const metadata: Metadata = {
  title: "외관수리 정비소 관리",
  description: "사내 표준서에 따라 상담부터 출고, 설비·품질까지 관리하는 정비소 업무 앱",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

/** 화면은 브라우저 폭을 다 쓴다(대표 지시 2026-11-08). 메뉴는 왼쪽, 도움말 창은 오른쪽 */
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  const unread = user ? await unreadCount(await getDb(), user.id) : 0;
  return (
    <html lang="ko">
      <body className="min-h-screen">
        <HelpProvider>
          <NavProvider>
            <header id="site-header" className="sticky top-0 z-20 border-b border-[var(--line)] bg-[var(--surface)]">
              <div className="flex min-h-14 items-center gap-2 px-2 sm:px-4">
                {user && <MenuButton />}
                <Link href={user ? "/home" : "/login"} className="truncate font-semibold">
                  외관수리 정비소
                </Link>
                {user && (
                  <div className="ml-auto flex shrink-0 items-center gap-0.5 whitespace-nowrap text-sm">
                    <Link href="/notifications" className="relative rounded-md px-2.5 py-2 hover:bg-[var(--surface-2)]" aria-label={`알림 ${unread}건`}>
                      알림
                      {unread > 0 && <span className="ml-1 rounded-full bg-[var(--danger)] px-1.5 text-xs text-white">{unread}</span>}
                    </Link>
                    <Link href="/help" className="hidden rounded-md px-2.5 py-2 hover:bg-[var(--surface-2)] sm:inline">
                      도움말
                    </Link>
                    <Link href="/account" className="hidden rounded-md px-2.5 py-2 text-[var(--muted)] hover:bg-[var(--surface-2)] sm:inline">
                      {user.name} · {user.roles.map((r) => ROLE_LABEL[r]).join("·")}
                    </Link>
                    <form action={logoutAction}>
                      <button className="rounded-md px-2.5 py-2 text-[var(--muted)] hover:bg-[var(--surface-2)]">로그아웃</button>
                    </form>
                  </div>
                )}
              </div>
            </header>
            <div className="flex">
              {user && <Sidebar roles={user.roles} unread={unread} />}
              <main className="min-w-0 flex-1 px-4 py-6 lg:px-6">{children}</main>
            </div>
          </NavProvider>
        </HelpProvider>
      </body>
    </html>
  );
}
