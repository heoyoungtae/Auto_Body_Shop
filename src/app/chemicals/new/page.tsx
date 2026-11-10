import Link from "next/link";
import { getDb } from "@/db/runtime";
import { can } from "@/modules/auth/permissions";
import { lastLocations } from "@/modules/safety/chemical";
import { AssistForm } from "../../_assist";
import { requireUser } from "../../_lib/session";
import { SubmitButton } from "../../_submit";
import { Card, ErrorBox, PageTitle } from "../../_ui";
import { createChemicalAction } from "../actions";
import { ChemicalFields } from "../_form";
import { MsdsInput } from "../msds-input";

/** 화학물질 등록(F-09-02): 반입 전에 MSDS를 받아 올린다 */
export default async function NewChemicalPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const q = await searchParams;
  const user = await requireUser();
  const locations = await lastLocations(await getDb());
  return (
    <>
      <PageTitle
        help="chemicals.new"
        sub="도료·시너·경화제·퍼티·탈지제·접착제는 반입 전에 MSDS를 받아 등록합니다. 분류를 고르면 필요한 보호구가 골라집니다."
        actions={
          <Link href="/chemicals" className="text-sm text-[var(--accent)]">
            ← 화학물질·MSDS
          </Link>
        }
      >
        화학물질 등록
      </PageTitle>
      <ErrorBox message={q.error} />
      {can(user, "safety.manage") ? (
        <Card
          title="화학물질(F-09-02)"
          help={{ kind: "panel", id: "chem.info" }}
        >
          <AssistForm
            id="chem-new"
            action={createChemicalAction}
            className="grid gap-3 md:grid-cols-2"
          >
            <ChemicalFields locations={locations} />
            <div className="md:col-span-2">
              <MsdsInput />
            </div>
            <div className="md:col-span-2">
              <SubmitButton>등록</SubmitButton>
            </div>
          </AssistForm>
        </Card>
      ) : (
        <p className="text-sm text-[var(--muted)]">
          화학물질 등록은 안전환경 담당·대표가 합니다.
        </p>
      )}
    </>
  );
}
