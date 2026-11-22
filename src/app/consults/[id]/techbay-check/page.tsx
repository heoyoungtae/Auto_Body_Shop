import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getDb } from "@/db/runtime";
import { rolesFor } from "@/modules/auth/permissions";
import { techbayCheckView } from "@/modules/partner/techbay-check";
import { requireUser } from "../../../_lib/session";
import { buttonClass, Card, ErrorBox, Notice, PageTitle } from "../../../_ui";
import { techbayCheckAction } from "./actions";
import { TechbayCheckForm } from "./check-form";

const STAFF = rolesFor("repair.write");

/** 테크베이 작업 내용 확인: 입고로 넘기기 전에 작업 항목을 줄마다 풀어 손상 부위로 나누고, 빠진 줄이 없는지 확인한다(대표 결정 2026-11-22) */
export default async function TechbayCheckPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; notice?: string }> }) {
  const { id } = await params;
  const { error, notice } = await searchParams;
  await requireUser([...STAFF]);
  const v = await techbayCheckView(await getDb(), id);
  if (!v) notFound();
  if (v.consult.result === "converted") redirect(`/consults/${id}`);
  return (
    <>
      <PageTitle
        help="consults.techbayCheck"
        std="STD-02 5절"
        sub={`${v.plateNo} · 상담 ${v.consult.docNo} · 테크베이 주문 ${v.order.extNo ?? v.order.extId}. 작업 항목을 줄마다 손상 부위로 나눴습니다. 확인 필요(△)·못 알아봄(✕) 줄을 모두 정리하면 입고가 시작됩니다.`}
        actions={
          <Link href={`/consults/${id}`} className={buttonClass("secondary")}>
            상담으로 돌아가기
          </Link>
        }
      >
        테크베이 작업 내용 확인
      </PageTitle>
      <div className="mb-4 space-y-2">
        <ErrorBox message={error} />
        {notice && <Notice>{notice}</Notice>}
      </div>
      {v.items.length ? (
        <TechbayCheckForm consultId={id} items={v.items} words={v.words} car={v.car} action={techbayCheckAction} />
      ) : (
        <Card title="작업 항목 없음" help={{ kind: "panel", id: "tb.check" }}>
          <p className="text-sm text-[var(--muted)]">이 주문에는 작업 항목이 없습니다. 상담에서 &lsquo;입고 시작&rsquo;을 누르면 바로 입고됩니다.</p>
        </Card>
      )}
    </>
  );
}
