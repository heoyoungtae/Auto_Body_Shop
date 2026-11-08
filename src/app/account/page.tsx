import { redirect } from "next/navigation";
import { getDb } from "@/db/runtime";
import { ROLE_LABEL } from "@/modules/auth/roles";
import { changePassword } from "@/modules/auth/service";
import { AssistForm } from "../_assist";
import { PasswordField } from "../_input";
import { SubmitButton } from "../_submit";
import { errorUrl, noticeUrl, requireUser, userMessage } from "../_lib/session";
import { ErrorBox, Notice, PageTitle } from "../_ui";

async function changePasswordAction(form: FormData) {
  "use server";
  const user = await requireUser();
  const next = String(form.get("next") ?? "");
  if (next !== String(form.get("next2") ?? "")) redirect(errorUrl("/account", "새 비밀번호 두 칸이 서로 다릅니다"));
  try {
    await changePassword(await getDb(), user.id, String(form.get("current") ?? ""), next);
  } catch (e) {
    redirect(errorUrl("/account", userMessage(e)));
  }
  redirect(noticeUrl("/account", "비밀번호를 바꿨습니다"));
}

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string }> }) {
  const { error, notice } = await searchParams;
  const user = await requireUser();
  return (
    <div>
      <PageTitle help="account" sub={`${user.loginId} · ${user.roles.map((r) => ROLE_LABEL[r]).join("·")}`}>
        {user.name}
      </PageTitle>
      <AssistForm id="account" action={changePasswordAction} className="grid gap-4 md:grid-cols-3 md:items-start">
        <div className="space-y-2 md:col-span-3 empty:hidden">
          <ErrorBox message={error} />
          {notice && <Notice>{notice}</Notice>}
        </div>
        <PasswordField help="account.current" name="current" autoComplete="current-password" required />
        <PasswordField help="account.next" name="next" autoComplete="new-password" required rules />
        <PasswordField help="account.next2" name="next2" autoComplete="new-password" required matchName="next" />
        <div className="md:col-span-3">
          <SubmitButton>비밀번호 바꾸기</SubmitButton>
        </div>
      </AssistForm>
    </div>
  );
}
