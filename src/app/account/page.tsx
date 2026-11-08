import { redirect } from "next/navigation";
import { getDb } from "@/db/runtime";
import { ROLE_LABEL } from "@/modules/auth/roles";
import { changePassword } from "@/modules/auth/service";
import { SubmitButton } from "../_submit";
import { errorUrl, noticeUrl, requireUser, userMessage } from "../_lib/session";
import { ErrorBox, Field, Notice, PageTitle } from "../_ui";

async function changePasswordAction(form: FormData) {
  "use server";
  const user = await requireUser();
  try {
    await changePassword(await getDb(), user.id, String(form.get("current") ?? ""), String(form.get("next") ?? ""));
  } catch (e) {
    redirect(errorUrl("/account", userMessage(e)));
  }
  redirect(noticeUrl("/account", "비밀번호를 바꿨습니다"));
}

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string }> }) {
  const { error, notice } = await searchParams;
  const user = await requireUser();
  return (
    <div className="max-w-sm">
      <PageTitle sub={`${user.loginId} · ${user.roles.map((r) => ROLE_LABEL[r]).join("·")}`}>{user.name}</PageTitle>
      <form action={changePasswordAction} className="space-y-4">
        <ErrorBox message={error} />
        {notice && <Notice>{notice}</Notice>}
        <Field label="현재 비밀번호" name="current" type="password" autoComplete="current-password" required />
        <Field label="새 비밀번호" name="next" type="password" autoComplete="new-password" required hint="8자 이상, 영문+숫자" />
        <SubmitButton>비밀번호 바꾸기</SubmitButton>
      </form>
    </div>
  );
}
