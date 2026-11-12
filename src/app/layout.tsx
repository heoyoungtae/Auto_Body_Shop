import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { getDb } from "@/db/runtime";
import { ROLE_LABEL } from "@/modules/auth/roles";
import { unreadCount } from "@/modules/platform/notify";
import { currentUser } from "./_lib/session";
import { logoutAction } from "./login/actions";
import { HelpProvider } from "./_help-drawer";
import { TableCards } from "./_table-cards";
import { MenuButton, NavProvider, Sidebar, TabBar } from "./_sidebar";
import "./globals.css";

export const metadata: Metadata = {
  title: "외관수리 정비소 관리",
  description: "사내 표준서에 따라 상담부터 출고, 설비·품질까지 관리하는 정비소 업무 앱",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

/** 화면은 브라우저 폭을 다 쓴다(대표 지시 2026-11-08). 메뉴는 왼쪽, 도움말 창은 오른쪽 */
/** 머리줄 아이콘(선 그림 하나) */
const Icon = ({ d }: { d: string }) => (
  <svg aria-hidden viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const me = await currentUser();
  // 새 비밀번호를 정하기 전(임시 비밀번호로 들어옴)에는 메뉴·알림을 보이지 않는다
  const user = me?.mustChangePassword ? null : me;
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
                  <div className="ml-auto flex shrink-0 items-center gap-1 whitespace-nowrap text-sm">
                    <Link href="/notifications" className="relative inline-flex size-11 items-center justify-center rounded-md hover:bg-[var(--surface-2)]" aria-label={`알림 ${unread}건`} title="알림">
                      <Icon d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0" />
                      {unread > 0 && (
                        <span className="absolute top-1 right-1 min-w-5 rounded-full bg-[var(--danger)] px-1 text-center text-xs leading-5 font-semibold text-white">{unread > 99 ? "99+" : unread}</span>
                      )}
                    </Link>
                    <Link href="/help" className="inline-flex size-11 items-center justify-center rounded-md hover:bg-[var(--surface-2)]" aria-label="도움말 센터" title="도움말 센터">
                      <Icon d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01" />
                    </Link>
                    {/* 이름·역할·내 계정·로그아웃은 한 메뉴로 */}
                    <details className="relative">
                      <summary className="flex h-11 list-none items-center gap-2 rounded-md px-2 hover:bg-[var(--surface-2)] [&::-webkit-details-marker]:hidden" aria-label="내 계정 메뉴">
                        <span aria-hidden className="inline-flex size-8 items-center justify-center rounded-full bg-[var(--accent-soft)] font-semibold text-[var(--accent)]">
                          {user.name.slice(0, 1)}
                        </span>
                        <span className="hidden text-left leading-tight sm:block">
                          <span className="block font-medium">{user.name}</span>
                          <span className="block text-xs text-[var(--muted)]">{user.roles.map((r) => ROLE_LABEL[r]).join("·")}</span>
                        </span>
                      </summary>
                      <div className="absolute right-0 z-40 mt-1 w-48 rounded-lg border border-[var(--line)] bg-[var(--surface)] p-1 shadow-[var(--shadow-lg)]">
                        <p className="px-3 py-2 text-xs text-[var(--muted)] sm:hidden">
                          {user.name} · {user.roles.map((r) => ROLE_LABEL[r]).join("·")}
                        </p>
                        <Link href="/account" className="block rounded-md px-3 py-2.5 hover:bg-[var(--surface-2)]">
                          내 계정·비밀번호
                        </Link>
                        <form action={logoutAction}>
                          <button className="w-full rounded-md px-3 py-2.5 text-left text-[var(--danger)] hover:bg-[var(--danger-soft)]">로그아웃</button>
                        </form>
                      </div>
                    </details>
                  </div>
                )}
              </div>
            </header>
            <div className="flex">
              {user && <Sidebar roles={user.roles} unread={unread} />}
              <main className="min-w-0 flex-1 px-4 py-6 lg:px-6">{children}</main>
            </div>
            {user && <TabBar roles={user.roles} unread={unread} />}
            <TableCards />
          </NavProvider>
        </HelpProvider>
      </body>
    </html>
  );
}
