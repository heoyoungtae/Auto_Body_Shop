import Link from "next/link";
import { can } from "@/modules/auth/permissions";
import { ROLE_LABEL, ROLES } from "@/modules/auth/roles";
import { AssistForm } from "../../_assist";
import { CheckGroup, TextField } from "../../_input";
import { SubmitButton } from "../../_submit";
import { requireUser } from "../../_lib/session";
import { Card, ErrorBox, PageTitle } from "../../_ui";
import { registerStaffAction } from "../actions";
import { ProfileFields } from "../profile-fields";

/** 직원 등록: 로그인 계정과 근로자 명부(F-11-01)를 한 번에 */
export default async function StaffNewPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const user = await requireUser();
  if (!can(user, "staff.roster")) {
    return (
      <>
        <PageTitle help="staff.new">직원 등록</PageTitle>
        <ErrorBox message="직원 등록은 대표·회계 담당이 합니다." />
      </>
    );
  }
  const manage = can(user, "account.manage");
  return (
    <>
      <PageTitle help="staff.new" sub="로그인 계정과 근로자 명부를 한 번에 만듭니다." actions={<Link href="/staff" className="text-sm text-[var(--accent)]">← 직원 명부</Link>}>
        직원 등록
      </PageTitle>
      <ErrorBox message={error} />
      <AssistForm id="staff-new" action={registerStaffAction} className="mt-4 space-y-4" draft>
        <Card title="로그인 계정" help={{ kind: "panel", id: "staff.newAccount" }}>
          <div className="grid gap-3 md:grid-cols-2">
            <TextField help="user.name" name="name" required />
            <TextField help="user.loginId" name="loginId" required autoCapitalize="none" spellCheck={false} lower />
          </div>
          <p className="mt-2 text-sm text-[var(--muted)]">비밀번호는 앱이 임시로 만듭니다. 등록한 뒤 직원 화면에서 임시 비밀번호를 보고 알려 주거나 문자로 보냅니다. 직원은 처음 로그인할 때 새 비밀번호를 정합니다.</p>
          {manage ? (
            <div className="mt-3">
              <CheckGroup help="user.roles" name="roles" options={ROLES.map((r) => ({ value: r, label: ROLE_LABEL[r] }))} />
            </div>
          ) : (
            <p className="mt-3 rounded-md border border-[var(--line)] px-3 py-2 text-sm">역할은 대표가 정합니다. 등록하면 계정은 잠긴 채 만들어지고 대표에게 알림이 갑니다. 대표가 역할을 정하면 바로 로그인할 수 있습니다.</p>
          )}
        </Card>
        <Card title="근로자 명부" help={{ kind: "panel", id: "staff.profile" }}>
          <div className="space-y-4">
            <ProfileFields p={null} isNew />
          </div>
        </Card>
        <SubmitButton>직원 등록</SubmitButton>
      </AssistForm>
    </>
  );
}
