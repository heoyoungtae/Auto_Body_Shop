import Link from "next/link";
import { getDb } from "@/db/runtime";
import { can } from "@/modules/auth/permissions";
import { listUsers } from "@/modules/auth/service";
import { supplierOptions } from "@/modules/purchase/supplier";
import { loadPolicy } from "@/modules/platform/policy";
import { expensePrefill, unlinkedAssetExpenses } from "@/modules/asset/service";
import { AssistForm } from "../../_assist";
import { requireUser } from "../../_lib/session";
import { SubmitButton } from "../../_submit";
import { Card, ErrorBox, PageTitle } from "../../_ui";
import { registerFixtureAction } from "../actions";
import { FixtureFields } from "../_form";

/** 비품 등록(9.2): 받은 날부터 3일 안에 */
export default async function NewFixturePage({ searchParams }: { searchParams: Promise<{ error?: string; exp?: string }> }) {
  const q = await searchParams;
  const user = await requireUser();
  const db = await getDb();
  const [users, sups, p, unlinked, pre] = await Promise.all([listUsers(db), supplierOptions(db), loadPolicy(db), unlinkedAssetExpenses(db), q.exp ? expensePrefill(db, q.exp) : Promise.resolve(null)]);
  const acct = users.filter((u) => u.active && u.roles.includes("accounting"));
  const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;
  return (
    <>
      <PageTitle
        help="fixtures.new"
        sub="비품을 받으면 3일 안에 등록합니다. 관리 번호(FX-)가 매겨지고, 사용자를 정하면 그 사람에게 수령 확인 요청이 갑니다."
        actions={
          <Link href="/fixtures" className="text-sm text-[var(--accent)]">
            ← 비품·자산
          </Link>
        }
      >
        비품 등록
      </PageTitle>
      <ErrorBox message={q.error} />
      {can(user, "fixture.manage") && (unlinked.length > 0 || pre) && (
        <div className="mb-4">
          <Card title="지출결의에서 불러오기" help={{ kind: "panel", id: "fx.fromExpense" }}>
            {pre ? (
              <p className="text-sm">
                <b>{pre.docNo}</b> {pre.payeeName} · 공급가 {won(pre.supplyWon)} · {pre.purpose} — 아래 칸을 채웠습니다. 등록하면 이 결의와 묶입니다.{" "}
                <Link href="/fixtures/new" className="text-[var(--accent)]">
                  빼기
                </Link>
              </p>
            ) : (
              <>
                <p className="mb-2 text-sm text-[var(--muted)]">대장에 아직 안 올린 설비·공구 결의입니다. 고르면 품명·구입일·금액·업체·결의 번호가 채워집니다.</p>
                <ul className="divide-y divide-[var(--line)] text-sm">
                  {unlinked.slice(0, 10).map((e) => (
                    <li key={e.id} className="flex flex-wrap items-center gap-2 py-1.5">
                      <Link href={`/fixtures/new?exp=${e.id}`} className="font-semibold text-[var(--accent)]">
                        {e.docNo}
                      </Link>
                      <span>{e.payeeName}</span>
                      <span>{won(e.supplyWon)}</span>
                      <span className="text-[var(--muted)]">{e.purpose}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-xs text-[var(--muted)]">설비(부스·리프트·컴프레서 등)는 설비 대장에서 등록합니다: <Link href="/equipment/new" className="text-[var(--accent)]">설비 등록</Link></p>
              </>
            )}
          </Card>
        </div>
      )}
      {can(user, "fixture.manage") ? (
        <Card title="비품(F-07-04)" help={{ kind: "panel", id: "fx.info" }}>
          <AssistForm id={pre ? `fx-new-${pre.expenseId}` : "fx-new"} action={registerFixtureAction} className="grid gap-3 md:grid-cols-2">
            {pre && <input type="hidden" name="expenseId" value={pre.expenseId} />}
            <FixtureFields
              users={users.filter((u) => u.active)}
              suppliers={sups}
              assetMin={p["asset.register_min"]}
              managers={{ managerId: acct[0]?.id }}
              pre={pre ? { from: `결의 ${pre.docNo}`, name: pre.purpose, purchasedOn: pre.on, priceWon: pre.supplyWon, supplierId: pre.supplierId, expenseRef: pre.docNo } : undefined}
            />
            <div className="md:col-span-2">
              <SubmitButton>등록</SubmitButton>
            </div>
          </AssistForm>
        </Card>
      ) : (
        <p className="text-sm text-[var(--muted)]">비품 등록은 회계 담당·대표가 합니다.</p>
      )}
    </>
  );
}
