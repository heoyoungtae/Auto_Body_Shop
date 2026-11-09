import Link from "next/link";
import { getDb } from "@/db/runtime";
import { can } from "@/modules/auth/permissions";
import { listUsers } from "@/modules/auth/service";
import { supplierOptions } from "@/modules/purchase/supplier";
import { loadPolicy } from "@/modules/platform/policy";
import { AssistForm } from "../../_assist";
import { requireUser } from "../../_lib/session";
import { SubmitButton } from "../../_submit";
import { Card, ErrorBox, PageTitle } from "../../_ui";
import { registerFixtureAction } from "../actions";
import { FixtureFields } from "../_form";

/** 비품 등록(9.2): 받은 날부터 3일 안에 */
export default async function NewFixturePage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const q = await searchParams;
  const user = await requireUser();
  const db = await getDb();
  const [users, sups, p] = await Promise.all([listUsers(db), supplierOptions(db), loadPolicy(db)]);
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
      {can(user, "fixture.manage") ? (
        <Card title="비품(F-07-04)" help={{ kind: "panel", id: "fx.info" }}>
          <AssistForm id="fx-new" action={registerFixtureAction} className="grid gap-3 md:grid-cols-2">
            <FixtureFields users={users.filter((u) => u.active)} suppliers={sups} assetMin={p["asset.register_min"]} />
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
