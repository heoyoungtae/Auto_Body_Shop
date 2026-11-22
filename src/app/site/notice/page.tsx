// 홈페이지 › 공지사항(손님 읽기 전용): 게시 기간 안의 공지만, 고정 먼저.
import type { Metadata } from "next";
import Link from "next/link";
import { getDb } from "@/db/runtime";
import { noticeTitle, publicNotices } from "@/modules/site/content";
import { SiteTitle } from "../_parts";

export const metadata: Metadata = { title: "공지사항", description: "휴무·영업시간·이벤트 등 제이모터스 소식" };

export default async function NoticeListPage() {
  const rows = await publicNotices(await getDb());
  return (
    <div className="mx-auto max-w-3xl">
      <SiteTitle eyebrow="NOTICE" help="site.notice">
        공지사항
      </SiteTitle>
      {!rows.length ? (
        <p className="rounded-xl bg-[var(--surface-2)] p-6 text-center text-[var(--muted)]">지금 올라온 공지가 없습니다.</p>
      ) : (
        <ul className="divide-y divide-[var(--line)] rounded-xl border border-[var(--line)] bg-[var(--surface)]">
          {rows.map((n) => (
            <li key={n.id}>
              <Link href={`/notice/${n.id}`} className="flex items-center gap-3 px-4 py-4 hover:bg-[var(--surface-2)]">
                {n.pinned && <span className="shrink-0 rounded bg-[var(--red)] px-2 py-0.5 text-xs font-semibold text-white">공지</span>}
                <span className="min-w-0 flex-1 font-medium">{noticeTitle(n)}</span>
                <span className="shrink-0 text-sm text-[var(--muted)]">{n.startsOn.replaceAll("-", ".")}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
