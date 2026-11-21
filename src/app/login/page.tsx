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
      {/* 가로형 공식 로고: 확정 원본에서 심벌·글자를 그대로 오려 씀. 밝은 화면은 남색 판 위, 어두운 화면은 투명 바탕 */}
      <picture className="mb-5 block">
        <source media="(prefers-color-scheme: dark)" srcSet="/brand/logo-dark.png" />
        {/* eslint-disable-next-line @next/next/no-img-element -- 정적 로고 그림 */}
        <img src="/brand/logo-light.png" alt={APP_NAME} title={APP_NAME} width={1400} height={309} className="h-auto w-full" />
      </picture>
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
