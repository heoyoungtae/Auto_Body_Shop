// 법정 서식 [별지 제89호의3 서식] 자동차점검ㆍ정비견적서(자동차관리법 시행규칙, 2023.6.9. 개정) 그대로 인쇄한다.
// 차량·사업자 칸은 발급할 때 고정한 값(snapshot)을 쓴다. 하단 안내 문구는 서식 원문이다.
import Link from "next/link";
import { getDb } from "@/db/runtime";
import { getEstimate } from "@/modules/repair/estimate";
import { EstimateSheet } from "../../../../estimate-sheet";
import { requireUser } from "../../../../../_lib/session";
import { buttonClass, PageTitle } from "../../../../../_ui";
import { PrintButton } from "./print-button";
import { listDamage } from "@/modules/repair/service";
import { carOf } from "@/modules/repair/body-map";
import { DamageSheet } from "../../../../damage-sheet";

type Snap = { plateNo: string; carName: string; shop: unknown };

export default async function EstimatePrint({ params }: { params: Promise<{ id: string; eid: string }> }) {
  const { id: roId, eid } = await params;
  await requireUser();
  const db = await getDb();
  const e = await getEstimate(db, eid);
  const used = new Set(e.lines.map((l) => l.damageId).filter(Boolean));
  const damages = (await listDamage(db, e.repairOrderId)).filter((d) => used.has(d.id));
  const s = e.snapshot as Partial<Snap>;
  const issued = !!e.issuedOn && !!s.shop;

  return (
    <div>
      <div className="no-print mb-4">
        <PageTitle
          help="repairs.estimatePrint"
          sub="법정 서식 별지 제89호의3. 2부를 뽑아 직인을 찍고 1부를 고객에게 드립니다."
          actions={
            <>
              <Link href={`/repairs/${roId}/estimate/${eid}`} className={buttonClass("secondary")}>
                견적으로 돌아가기
              </Link>
              {issued && <PrintButton />}
            </>
          }
        >
          견적서 인쇄 {e.docNo}
        </PageTitle>
        {!issued && <p className="rounded-md border border-[var(--warn)] bg-[var(--warn-soft)] px-3 py-2 text-sm">아직 발급하지 않은 견적입니다. 검토를 마치고 &lsquo;법정 견적서 발급&rsquo;을 누른 뒤 인쇄하세요.</p>}
      </div>
      {issued && (
        <EstimateSheet e={e} />
      )}
      {issued && <DamageSheet damages={damages} car={carOf(e.vehicle)} docNo={e.docNo} plateNo={s.plateNo ?? e.vehicle.plateNo} carName={s.carName ?? ""} kind="estimate" />}
    </div>
  );
}
