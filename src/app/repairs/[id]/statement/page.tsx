// 법정 서식 [별지 제89호의2서식] 자동차점검ㆍ정비명세서(자동차관리법 시행규칙, 2025.2.14. 개정)를 인쇄한다.
// 차량·사업자·정비 내역은 발급할 때 고정한 값(snapshot)을 쓴다. 하단 안내는 서식의 안내 사항이다.
// [확인 필요] 표 배치는 서식 원문 글자에서 되살린 것이다. 실제 서식 PDF와 한 번 맞춰 본다.
import Link from "next/link";
import { getDb } from "@/db/runtime";
import { statementOf } from "@/modules/repair/inspect";
import { StatementSheet, type StatementSnap } from "../../statement-sheet";
import { requireUser } from "../../../_lib/session";
import { buttonClass, PageTitle } from "../../../_ui";
import { PrintButton } from "../estimate/[eid]/print/print-button";
import { and, eq } from "drizzle-orm";
import { estimate, estimateLine, repairOrder, vehicle } from "@/db/schema";
import { listDamage } from "@/modules/repair/service";
import { carOf } from "@/modules/repair/body-map";
import { DamageSheet } from "../../damage-sheet";

type Snap = StatementSnap;

export default async function StatementPrint({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireUser();
  const db = await getDb();
  const st = await statementOf(db, id);
  // 손상 부위도: 승인해서 고친 진단 줄만(승인 안 한 부위는 빼고)
  const done = st ? await db.select({ damageId: estimateLine.damageId }).from(estimateLine).innerJoin(estimate, eq(estimate.id, estimateLine.estimateId)).where(and(eq(estimate.repairOrderId, id), eq(estimateLine.approved, true))) : [];
  const fixed = new Set(done.map((x) => x.damageId).filter(Boolean));
  const damages = st ? (await listDamage(db, id)).filter((d) => fixed.has(d.id)) : [];
  const [ro] = st ? await db.select({ vehicleId: repairOrder.vehicleId }).from(repairOrder).where(eq(repairOrder.id, id)) : [];
  const [veh] = ro ? await db.select().from(vehicle).where(eq(vehicle.id, ro.vehicleId)) : [];
  const s = (st?.snapshot ?? null) as Snap | null;

  return (
    <div>
      <div className="no-print mb-4">
        <PageTitle
          help="repairs.statement"
          sub="법정 서식 별지 제89호의2. 2부를 뽑아 직인을 찍고 1부를 고객에게 드립니다. 1부는 1년 이상 보관합니다."
          actions={
            <>
              <Link href={`/repairs/${id}/delivery`} className={buttonClass("secondary")}>
                출고로 돌아가기
              </Link>
              {s && <PrintButton />}
            </>
          }
        >
          정비명세서 인쇄 {st?.docNo ?? ""}
        </PageTitle>
        {!s && <p className="rounded-md border border-[var(--warn)] bg-[var(--warn-soft)] px-3 py-2 text-sm">아직 발급하지 않았습니다. 출고 화면에서 &lsquo;정비명세서 발급&rsquo;을 누르세요.</p>}
      </div>
      {st && s && (
        <StatementSheet st={st} s={s} />
      )}
      {st && s && <DamageSheet damages={damages} car={carOf(veh)} docNo={st.docNo} plateNo={s.plateNo} carName={s.carName} kind="statement" />}
    </div>
  );
}
