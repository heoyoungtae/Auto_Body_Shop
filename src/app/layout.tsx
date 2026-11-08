import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { getDb } from "@/db/runtime";
import { ROLE_LABEL } from "@/modules/auth/roles";
import { unreadCount } from "@/modules/platform/notify";
import { currentUser } from "./_lib/session";
import { logoutAction } from "./login/actions";
import { HelpProvider } from "./_help-drawer";
import "./globals.css";

export const metadata: Metadata = {
  title: "외관수리 정비소 관리",
  description: "사내 표준서에 따라 상담부터 출고, 설비·품질까지 관리하는 정비소 업무 앱",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

const NAV: { href: string; label: string; owner?: boolean }[] = [
  { href: "/home", label: "내 할 일" },
  { href: "/approvals", label: "결재" },
  { href: "/notifications", label: "알림" },
  { href: "/settings", label: "설정" },
  { href: "/help", label: "도움말" },
];

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await currentUser();
  const unread = user ? await unreadCount(await getDb(), user.id) : 0;
  return (
    <html lang="ko">
      <body className="min-h-screen">
        <HelpProvider>
        <header className="border-b border-[var(--line)] bg-[var(--surface)]">
          <div className="mx-auto flex min-h-14 max-w-5xl flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2">
            <Link href={user ? "/home" : "/login"} className="font-semibold">
              외관수리 정비소
            </Link>
            {user && (
              <nav className="flex flex-wrap items-center gap-1 text-sm">
                {NAV.map((n) => (
                  <Link key={n.href} href={n.href} className="rounded-md px-2.5 py-2 hover:bg-[var(--surface-2)]">
                    {n.label}
                    {n.href === "/notifications" && unread > 0 && (
                      <span className="ml-1 rounded-full bg-[var(--danger)] px-1.5 text-xs text-white">{unread}</span>
                    )}
                  </Link>
                ))}
                <Link href="/account" className="rounded-md px-2.5 py-2 text-[var(--muted)] hover:bg-[var(--surface-2)]">
                  {user.name} · {user.roles.map((r) => ROLE_LABEL[r]).join("·")}
                </Link>
                <form action={logoutAction}>
                  <button className="rounded-md px-2.5 py-2 text-[var(--muted)] hover:bg-[var(--surface-2)]">로그아웃</button>
                </form>
              </nav>
            )}
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
        </HelpProvider>
      </body>
    </html>
  );
}
