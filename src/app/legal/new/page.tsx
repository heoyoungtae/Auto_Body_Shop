import Link from "next/link";
import { getDb } from "@/db/runtime";
import { can } from "@/modules/auth/permissions";
import { listUsers } from "@/modules/auth/service";
import { AssistForm } from "../../_assist";
import { requireUser } from "../../_lib/session";
import { SubmitButton } from "../../_submit";
import { Card, ErrorBox, PageTitle } from "../../_ui";
import { createLegalAction } from "../actions";
import { LegalFields } from "../_form";

/** 법규 항목 추가(Q.6 1): 부록 C에 없는 법령이나 새로 생긴 의무 */
export default async function NewLegalPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const q = await searchParams;
  const user = await requireUser();
  const users = (await listUsers(await getDb())).filter((u) => u.active);
  return (
    <>
      <PageTitle
        help="legal.new"
        sub="부록 C에 없는 법령이나 설비 증설·화학물질 추가·직원 수 변화로 새로 생긴 의무를 올립니다."
        actions={
          <Link href="/legal" className="text-sm text-[var(--accent)]">
            ← 법규 대장
          </Link>
        }
      >
        법규 항목 추가
      </PageTitle>
      <ErrorBox message={q.error} />
      {can(user, "legal.manage") ? (
        <Card
          title="법규 항목(F-Q-06)"
          help={{ kind: "panel", id: "legal.info" }}
        >
          <AssistForm
            id="legal-new"
            action={createLegalAction}
            className="grid gap-3 md:grid-cols-2"
          >
            <LegalFields users={users} />
            <div className="md:col-span-2">
              <SubmitButton>올리기</SubmitButton>
            </div>
          </AssistForm>
        </Card>
      ) : (
        <p className="text-sm text-[var(--muted)]">
          법규 대장은 안전환경 담당·대표가 관리합니다.
        </p>
      )}
    </>
  );
}
