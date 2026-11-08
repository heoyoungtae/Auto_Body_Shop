import { redirect } from "next/navigation";
import { SubmitButton } from "../_submit";
import { ErrorBox, Field, Notice, PageTitle } from "../_ui";
import { currentUser } from "../_lib/session";
import { loginAction } from "./actions";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  if (await currentUser()) redirect("/home");
  const demo = process.env.DEMO_SEED === "1" || !process.env.DATABASE_URL;
  return (
    <div className="mx-auto max-w-sm">
      <PageTitle sub="대표·공장장·상담원·기술자·품질·안전환경·회계">직원 로그인</PageTitle>
      <form action={loginAction} className="space-y-4">
        <ErrorBox message={error} />
        <Field label="아이디" name="loginId" autoComplete="username" autoCapitalize="none" required />
        <Field label="비밀번호" name="password" type="password" autoComplete="current-password" required />
        <SubmitButton full>로그인</SubmitButton>
      </form>
      {demo && (
        <div className="mt-6">
          <Notice>
            시연 서버입니다. 아이디 owner(대표), manager(공장장), advisor(상담원), tech1·tech2(기술자), quality(품질), safety(안전환경), account(회계), 비밀번호는 모두 demo1234 입니다.
          </Notice>
        </div>
      )}
    </div>
  );
}
