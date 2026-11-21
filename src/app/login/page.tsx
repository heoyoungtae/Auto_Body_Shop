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
import { APP_NAME, APP_SHORT_NAME } from "@/modules/platform/brand";
import { brandSize, brandUrl, loadBrand } from "@/modules/platform/brand-assets";
import { getDb } from "@/db/runtime";
import { InstallHint } from "../_install-hint";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  if (await currentUser()) redirect("/home");
  const demo = process.env.DEMO_SEED === "1" || !process.env.DATABASE_URL;
  // 로고는 설정 › 로고·앱 아이콘에 올린 그림(없으면 앱 기본 그림)
  const brand = await loadBrand(await getDb());
  const [lw, lh] = brandSize(brand, "logo-light");
  return (
    <div className="mx-auto max-w-sm">
      {/* 가로형 공식 로고: 밝은 화면용·어두운 화면용 두 장 */}
      <picture className="mb-5 block">
        <source media="(prefers-color-scheme: dark)" srcSet={brandUrl(brand, "logo-dark")} />
        {/* eslint-disable-next-line @next/next/no-img-element -- 정적 로고 그림 */}
        <img src={brandUrl(brand, "logo-light")} alt={APP_NAME} title={APP_NAME} width={lw} height={lh} className="h-auto w-full" />
      </picture>
      <PageTitle help="login" sub="대표·공장장·상담원·기술자·품질·안전환경·회계">
        직원 로그인
      </PageTitle>
      {/* 홈 화면 앱으로 연 게 아니면 '홈 화면에 추가' 안내(대표 지시 2026-11-21) */}
      <InstallHint appName={APP_SHORT_NAME} what="결재·업무지시·작업 배정" />
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
