import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/runtime";
import { appUser, staffDocument, staffProfile } from "@/db/schema";
import { loadPolicy } from "@/modules/platform/policy";
import { DOC_KINDS, isDocKind, LEAVE_CHECKS, PLEDGE_JOIN_ITEMS, type ContractTerms } from "@/modules/staff/contract-rules";
import { canWriteDocs, contractDefaults } from "@/modules/staff/documents";
import { AssistForm } from "../../../../_assist";
import { CheckGroup, DateField, TextAreaField } from "../../../../_input";
import { SubmitButton } from "../../../../_submit";
import { requireUser } from "../../../../_lib/session";
import { Card, ErrorBox, PageTitle } from "../../../../_ui";
import { createPledgeAction, saveContractAction } from "../../../docs/actions";
import { ContractFields } from "../../../docs/contract-fields";

/** 근로계약서·서약서 쓰기(대표·회계). 계약서는 명부·사업장 설정·이전 계약서에서 값을 불러온다 */
export default async function NewStaffDocPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ kind?: string; edit?: string; error?: string }> }) {
  const { id } = await params;
  const { kind = "contract", edit, error } = await searchParams;
  const user = await requireUser();
  const db = await getDb();
  const [u] = await db.select({ name: appUser.name }).from(appUser).where(eq(appUser.id, id));
  if (!u || !isDocKind(kind) || kind === "rules_ack") notFound();
  const title = `${u.name} ${DOC_KINDS[kind].label}`;
  const back = (
    <Link href={`/staff/${id}`} className="text-sm text-[var(--accent)]">
      ← {u.name} 명부
    </Link>
  );
  if (!canWriteDocs(user)) {
    return (
      <>
        <PageTitle help="staff.docNew">{title}</PageTitle>
        <ErrorBox message="근로계약서·서약서는 대표·회계 담당이 준비합니다." />
      </>
    );
  }

  if (kind === "contract") {
    let terms: ContractTerms;
    let source: string;
    if (edit) {
      const [d] = await db.select().from(staffDocument).where(eq(staffDocument.id, edit));
      if (!d || d.userId !== id) notFound();
      terms = d.terms as ContractTerms;
      source = d.docNo;
    } else ({ terms, source } = await contractDefaults(db, user, id));
    const pol = await loadPolicy(db);
    return (
      <>
        <PageTitle help="staff.docNew" sub={`고용노동부 표준근로계약서 항목입니다. ${source}에서 값을 불러왔습니다. 저장하면 ${user.roles.includes("owner") ? "직원에게 서명 요청이 갑니다" : "대표가 확인한 뒤 직원이 서명합니다"}.`} actions={back}>
          {title} {edit ? "고치기" : "쓰기"}
        </PageTitle>
        <ErrorBox message={error} />
        <Card title="계약 내용" help={{ kind: "panel", id: "lc.form" }}>
          <AssistForm id={`contract-${id}`} draft action={saveContractAction} className="space-y-5">
            <input type="hidden" name="userId" value={id} />
            {edit && <input type="hidden" name="docId" value={edit} />}
            <ContractFields t={terms} source={source} minWage={pol["wage.minimum_hourly"]} legal5={pol["hr.headcount_5plus"] === 1} />
            <SubmitButton>저장</SubmitButton>
          </AssistForm>
        </Card>
      </>
    );
  }

  const [p] = await db.select({ leftOn: staffProfile.leftOn }).from(staffProfile).where(eq(staffProfile.userId, id));
  return (
    <>
      <PageTitle help="staff.docNew" sub={kind === "pledge_join" ? "입사할 때, 계정을 쓰기 전에 받습니다(STD-13 9.1)." : "퇴직할 때 자료 반납·삭제를 함께 확인하고 받습니다(STD-13 9.3)."} actions={back}>
        {title}
      </PageTitle>
      <ErrorBox message={error} />
      <Card title={kind === "pledge_join" ? "서약 내용" : "반납·삭제 확인"} help={{ kind: "panel", id: kind === "pledge_join" ? "pl.join" : "pl.leave" }}>
        <AssistForm id={`${kind}-${id}`} action={createPledgeAction} className="space-y-4">
          <input type="hidden" name="userId" value={id} />
          <input type="hidden" name="kind" value={kind} />
          {kind === "pledge_join" ? (
            <ol className="list-decimal space-y-1.5 pl-5 text-sm">
              {PLEDGE_JOIN_ITEMS.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ol>
          ) : (
            <>
              <DateField help="pl.leftOn" name="leftOn" required defaultValue={p?.leftOn ?? ""} quick={["today"]} from={p?.leftOn ? "근로자 명부" : undefined} />
              <CheckGroup help="pl.checks" name="checks" options={Object.entries(LEAVE_CHECKS).map(([value, label]) => ({ value, label }))} />
              <TextAreaField help="pl.note" name="note" rows={2} />
            </>
          )}
          <SubmitButton>서명 받을 준비</SubmitButton>
        </AssistForm>
      </Card>
    </>
  );
}
