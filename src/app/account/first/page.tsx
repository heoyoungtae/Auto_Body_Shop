import { redirect } from "next/navigation";
import { getDb } from "@/db/runtime";
import { setFirstPassword } from "@/modules/auth/service";
import { AssistForm } from "../../_assist";
import { PasswordField } from "../../_input";
import { SubmitButton } from "../../_submit";
import { currentUser, errorUrl, userMessage } from "../../_lib/session";
import { Card, ErrorBox, PageTitle } from "../../_ui";
import { logoutAction } from "../../login/actions";

async function firstPasswordAction(form: FormData) {
  "use server";
  const user = await currentUser();
  if (!user) redirect("/login");
  const next = String(form.get("next") ?? "");
  if (next !== String(form.get("next2") ?? "")) redirect(errorUrl("/account/first", "새 비밀번호 두 칸이 서로 다릅니다"));
  try {
    await setFirstPassword(await getDb(), user.id, next);
  } catch (e) {
    redirect(errorUrl("/account/first", userMessage(e)));
  }
  redirect(`/home?notice=${encodeURIComponent("비밀번호를 정했습니다. 다음부터는 이 비밀번호로 로그인합니다")}`);
}

/** 첫 로그인(임시 비밀번호): 새 비밀번호를 정해야 다른 화면을 쓸 수 있다 */
export default async function FirstPasswordPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const user = await currentUser();
  if (!user) redirect("/login");
  if (!user.mustChangePassword) redirect("/home");
  return (
    <div className="mx-auto max-w-xl space-y-4">
      <PageTitle help="account.first" sub="임시 비밀번호로 들어왔습니다. 나만 아는 비밀번호를 정해야 앱을 쓸 수 있습니다.">
        {user.name}님, 새 비밀번호를 정해 주세요
      </PageTitle>
      <ErrorBox message={error} />
      <Card title="새 비밀번호" help={{ kind: "panel", id: "account.first" }}>
        <AssistForm id="account-first" action={firstPasswordAction} className="space-y-4">
          <PasswordField help="account.next" name="next" autoComplete="new-password" required rules />
          <PasswordField help="account.next2" name="next2" autoComplete="new-password" required matchName="next" />
          <SubmitButton full>비밀번호 정하고 시작하기</SubmitButton>
        </AssistForm>
      </Card>
      <form action={logoutAction}>
        <button type="submit" className="text-sm text-[var(--muted)] underline">
          나중에 하기(로그아웃)
        </button>
      </form>
    </div>
  );
}
