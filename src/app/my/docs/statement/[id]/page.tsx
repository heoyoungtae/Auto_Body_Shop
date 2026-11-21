// 내 차 수첩: 정비명세서 다시 보기(법정 서식 그대로, 직원 인쇄 화면과 같은 본문). [id]=수리 건
import { notFound } from "next/navigation";
import { getDb } from "@/db/runtime";
import { myStatementRo } from "@/modules/carbook/service";
import { statementOf } from "@/modules/repair/inspect";
import { UserError } from "@/modules/platform/errors";
import { PageTitle } from "../../../../_ui";
import { StatementSheet, type StatementSnap } from "../../../../repairs/statement-sheet";
import { requireMy } from "../../../_session";
import { PrintBar } from "../../../print-bar";

export default async function MyStatementPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await requireMy();
  const db = await getDb();
  try {
    await myStatementRo(db, s, id);
  } catch (e) {
    if (e instanceof UserError) notFound();
    throw e;
  }
  const st = (await statementOf(db, id))!;
  return (
    <div className="pt-2">
      <div className="no-print">
        <PageTitle help="my.statement" sub={st.docNo}>
          정비명세서
        </PageTitle>
      </div>
      <PrintBar back={`/my/repairs/${id}`} />
      <p className="no-print mb-1 text-xs text-[var(--muted)] sm:hidden">서식이 넓어 옆으로 밀어 보실 수 있습니다. 인쇄·PDF 저장하면 한 장에 맞게 나옵니다.</p>
      <div className="overflow-x-auto">
        <div className="min-w-[640px]">
          <StatementSheet st={st} s={st.snapshot as StatementSnap} fileBase="/api/my/file/" />
        </div>
      </div>
    </div>
  );
}
