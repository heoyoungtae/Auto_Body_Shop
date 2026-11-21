// 홈페이지 › 공지 한 건. 게시 기간이 끝났거나 공개를 끄면 '없는 공지'로 보인다
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/db/runtime";
import { noticeTitle, readNotice } from "@/modules/site/content";
import { SiteTitle, siteBtn } from "../../_parts";

export const metadata: Metadata = { title: "공지사항" };

export default async function NoticePage({ params }: { params: Promise<{ id: string }> }) {
  const n = await readNotice(await getDb(), (await params).id);
  if (!n) notFound();
  return (
    <article className="mx-auto max-w-3xl">
      <SiteTitle eyebrow="NOTICE" help="site.notice" sub={`${n.startsOn.replaceAll("-", ".")}${n.endsOn ? ` ~ ${n.endsOn.replaceAll("-", ".")}` : ""}`}>
        {noticeTitle(n)}
      </SiteTitle>
      <div className="whitespace-pre-line rounded-xl border border-[var(--line)] bg-[var(--surface)] p-6 leading-relaxed">{n.body}</div>
      {n.ad && <p className="mt-3 text-sm text-[var(--muted)]">광고 알림을 그만 받으려면 내 차 수첩 › 더보기에서 광고 수신을 끄세요.</p>}
      <div className="mt-6">
        <Link href="/notice" className={siteBtn("line")}>
          목록으로
        </Link>
      </div>
    </article>
  );
}
