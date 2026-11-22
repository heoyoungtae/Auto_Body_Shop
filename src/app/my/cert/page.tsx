// 수리 이력 확인서(3단계): 차를 팔 때 우리 공업사에서 고친 내역을 한 장으로. 확인 번호로 사는 사람이 진위를 본다
import Link from "next/link";
import { getDb } from "@/db/runtime";
import { consultCars, fmtCertCode, myCerts } from "@/modules/carbook/requests";
import { seoulDate } from "@/modules/platform/time";
import { AssistForm } from "../../_assist";
import { CheckGroup, SelectField } from "../../_input";
import { SubmitButton } from "../../_submit";
import { Card, Empty, ErrorBox, PageTitle } from "../../_ui";
import { issueCertAction } from "../actions";
import { requireMy } from "../_session";

export default async function MyCertListPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const q = await searchParams;
  const s = await requireMy(true);
  const db = await getDb();
  const [cars, list] = await Promise.all([consultCars(db, s), myCerts(db, s)]);
  return (
    <div className="space-y-4 pt-2">
      <PageTitle help="my.cert">수리 이력 확인서</PageTitle>
      <ErrorBox message={q.error} />
      <Card title="새로 만들기" help={{ kind: "panel", id: "my.certNew" }}>
        {!cars.length ? (
          <Empty>내 차가 없습니다.</Empty>
        ) : (
          <AssistForm id="my-cert" action={issueCertAction} className="space-y-4">
            <p className="text-sm text-[var(--muted)]">우리 공업사에서 출고한 수리(날짜·작업·보증)를 한 장으로 만듭니다. 확인 번호가 붙어 사는 분이 진짜인지 볼 수 있습니다.</p>
            {cars.length > 1 ? <SelectField help="my.vehicle" name="vehicleId" required options={cars.map((c) => ({ value: c.id, label: c.label }))} defaultValue={cars[0].id} /> : <input type="hidden" name="vehicleId" value={cars[0].id} />}
            <CheckGroup help="my.certAmount" name="withAmount" options={[{ value: "yes", label: "수리 금액도 넣기" }]} />
            <SubmitButton full>확인서 만들기</SubmitButton>
          </AssistForm>
        )}
      </Card>
      {list.length > 0 && (
        <Card title="만든 확인서" help={{ kind: "panel", id: "my.certList" }}>
          <ul className="divide-y divide-[var(--line)] text-sm">
            {list.map((c) => (
              <li key={c.id}>
                <Link href={`/my/cert/${c.id}`} className="flex items-baseline justify-between gap-2 py-2 hover:underline">
                  <span>
                    {c.plateNo} <span className="text-xs text-[var(--muted)]">{seoulDate(c.createdAt)} · {c.docNo}</span>
                  </span>
                  <span className={`shrink-0 font-mono text-xs ${c.revokedAt ? "text-[var(--muted)] line-through" : ""}`}>{fmtCertCode(c.code)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
