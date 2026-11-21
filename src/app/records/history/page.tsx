import Link from "next/link";
import { getDb } from "@/db/runtime";
import { can } from "@/modules/auth/permissions";
import { requireUser } from "../../_lib/session";
import { HistoryCard } from "../../_history-card";
import { buttonClass, ErrorBox, PageTitle } from "../../_ui";

/** 기록 한 건의 변경 이력(대표·품질 담당): 기록 보관함·대장에서 '이력'을 누르면 열린다 */
export default async function RecordHistoryPage({ searchParams }: { searchParams: Promise<{ k?: string | string[]; t?: string }> }) {
  const q = await searchParams;
  const user = await requireUser();
  const keys = (Array.isArray(q.k) ? q.k : q.k ? [q.k] : []).map((k) => k.trim()).filter(Boolean).slice(0, 4);
  return (
    <>
      <PageTitle
        help="records.history"
        sub="앱이 저장·결재 때마다 남긴 기록(누가·언제·무엇을)을 최근 순으로 보여 줍니다. 이 이력은 아무도 고치거나 지울 수 없습니다."
        actions={
          <Link href="/records" className={buttonClass("secondary")}>
            기록 보관함
          </Link>
        }
      >
        변경 이력{q.t ? `: ${q.t}` : ""}
      </PageTitle>
      {!can(user, "records.history") ? (
        <ErrorBox message="변경 이력은 대표·품질 담당이 봅니다(권한표 '기록의 변경 이력 보기')" />
      ) : !keys.length ? (
        <ErrorBox message="어느 기록의 이력인지 모릅니다. 기록 보관함에서 '이력'을 눌러 주세요" />
      ) : (
        <HistoryCard db={await getDb()} user={user} keys={keys} />
      )}
    </>
  );
}
