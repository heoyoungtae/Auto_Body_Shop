// 내 차 수첩: 견적서 다시 보기(법정 서식 그대로, 직원 인쇄 화면과 같은 본문). 발급한 견적만
import { notFound } from "next/navigation";
import { getDb } from "@/db/runtime";
import { myEstimateDoc } from "@/modules/carbook/service";
import { getEstimate } from "@/modules/repair/estimate";
import { UserError } from "@/modules/platform/errors";
import { PageTitle } from "../../../../_ui";
import { EstimateSheet } from "../../../../repairs/estimate-sheet";
import { requireMy } from "../../../_session";
import { PrintBar } from "../../../print-bar";

export default async function MyEstimateDocPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await requireMy();
  const db = await getDb();
  let roId: string;
  try {
    roId = await myEstimateDoc(db, s, id);
  } catch (e) {
    if (e instanceof UserError) notFound();
    throw e;
  }
  const e = await getEstimate(db, id);
  return (
    <div className="pt-2">
      <div className="no-print">
        <PageTitle help="my.estimateDoc" sub={`${e.docNo}${e.validUntil ? ` · ${e.validUntil}까지 유효` : ""}`}>
          견적서
        </PageTitle>
      </div>
      <PrintBar back={`/my/repairs/${roId}`} />
      <p className="no-print mb-1 text-xs text-[var(--muted)] sm:hidden">서식이 넓어 옆으로 밀어 보실 수 있습니다. 인쇄·PDF 저장하면 한 장에 맞게 나옵니다.</p>
      <div className="overflow-x-auto">
        <div className="min-w-[640px]">
          <EstimateSheet e={e} fileBase="/api/my/file/" />
        </div>
      </div>
    </div>
  );
}
