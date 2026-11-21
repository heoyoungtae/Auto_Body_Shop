// 누구나: 수리 이력 확인서의 확인 번호 넣기(QR 없이 번호만 받았을 때)
import { redirect } from "next/navigation";
import { cleanCertCode } from "@/modules/carbook/requests";
import { TextField } from "../_input";
import { SubmitButton } from "../_submit";
import { PageTitle } from "../_ui";

async function go(form: FormData) {
  "use server";
  redirect(`/verify/${cleanCertCode(String(form.get("code") ?? ""))}`);
}

export default function VerifyPage() {
  return (
    <div className="mx-auto max-w-xl space-y-4">
      <PageTitle help="public.verify">수리 이력 확인서 확인</PageTitle>
      <form action={go} className="space-y-4">
        <TextField help="verify.code" name="code" required placeholder="ABCDE-23456" />
        <SubmitButton full>확인</SubmitButton>
      </form>
    </div>
  );
}
