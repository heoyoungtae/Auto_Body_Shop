import { redirect } from "next/navigation";
import { DEMO_PASSWORD, DEMO_USERS } from "@/db/seed";
import { ROLE_LABEL } from "@/modules/auth/roles";
import { AssistForm } from "../_assist";
import { PasswordField, TextField } from "../_input";
import { SubmitButton } from "../_submit";
import { ErrorBox, PageTitle } from "../_ui";
import { currentUser } from "../_lib/session";
import { loginAction } from "./actions";
import { DemoPick } from "./demo-pick";
import { APP_NAME } from "@/modules/platform/brand";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  if (await currentUser()) redirect("/home");
  const demo = process.env.DEMO_SEED === "1" || !process.env.DATABASE_URL;
  return (
    <div className="mx-auto max-w-sm">
      <div className="mb-4 flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element -- 작은 SVG 아이콘 */}
        <img src="/icon.svg" alt="" width={48} height={48} className="size-12 rounded-xl" />
        <p className="text-lg font-semibold">{APP_NAME}</p>
      </div>
      <PageTitle help="login" sub="대표·공장장·상담원·기술자·품질·안전환경·회계">
        직원 로그인
      </PageTitle>
      <AssistForm id="login" action={loginAction} guard={false} className="space-y-4">
        <ErrorBox message={error} />
        <TextField help="login.loginId" name="loginId" autoComplete="username" autoCapitalize="none" spellCheck={false} lower required />
        <PasswordField help="login.password" name="password" autoComplete="current-password" required />
        <SubmitButton full>로그인</SubmitButton>
        {demo && (
          <DemoPick
            password={DEMO_PASSWORD}
            users={DEMO_USERS.map((u) => ({ loginId: u.loginId, label: `${u.name} · ${u.roles.map((r) => ROLE_LABEL[r]).join("·")}` }))}
          />
        )}
      </AssistForm>
    </div>
  );
}
