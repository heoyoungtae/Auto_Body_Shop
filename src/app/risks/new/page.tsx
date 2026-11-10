import Link from "next/link";
import { getDb } from "@/db/runtime";
import { loadPolicy } from "@/modules/platform/policy";
import { AssistForm } from "../../_assist";
import { requireUser } from "../../_lib/session";
import { SubmitButton } from "../../_submit";
import { Card, ErrorBox, PageTitle } from "../../_ui";
import { createRiskAction } from "../actions";
import { RiskFields } from "../_form";

/** 리스크·기회 등록(Q.4): 누구나 */
export default async function NewRiskPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const q = await searchParams;
  await requireUser();
  const threshold = (await loadPolicy(await getDb()))["risk.owner_alert_score"];
  return (
    <>
      <PageTitle
        help="risks.new"
        sub="일어날 수 있는 나쁜 일(리스크)이나 잡으면 좋은 기회를 누구나 올립니다. 가능성과 영향을 1~3으로 매기면 점수가 나옵니다."
        actions={
          <Link href="/risks" className="text-sm text-[var(--accent)]">
            ← 리스크·기회
          </Link>
        }
      >
        리스크·기회 올리기
      </PageTitle>
      <ErrorBox message={q.error} />
      <Card
        title="리스크·기회(F-Q-03)"
        help={{ kind: "panel", id: "risk.info" }}
      >
        <AssistForm
          id="risk-new"
          action={createRiskAction}
          className="grid gap-3 md:grid-cols-2"
        >
          <RiskFields threshold={threshold} />
          <div className="md:col-span-2">
            <SubmitButton>올리기</SubmitButton>
          </div>
        </AssistForm>
      </Card>
    </>
  );
}
