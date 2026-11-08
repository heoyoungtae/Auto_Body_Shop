import { redirect } from "next/navigation";
import { getDb } from "@/db/runtime";
import { ROLE_LABEL } from "@/modules/auth/roles";
import { changePassword } from "@/modules/auth/service";
import { UserError } from "@/modules/platform/errors";
import { saveUserSignature, userSignature } from "@/modules/auth/signature";
import { AssistForm } from "../_assist";
import { PasswordField } from "../_input";
import { SubmitButton } from "../_submit";
import { errorUrl, noticeUrl, requireUser, userMessage } from "../_lib/session";
import { Card, ErrorBox, Notice, PageTitle } from "../_ui";
import { SignaturePad } from "../repairs/signature-pad";
import { NeedImageNote, StampImageInput } from "../stamp-image";

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

const png = (v: FormDataEntryValue | null) => {
  const m = /^data:image\/png;base64,(.+)$/.exec(String(v ?? ""));
  return m ? new Uint8Array(Buffer.from(m[1], "base64")) : null;
};

async function signatureAction(form: FormData) {
  "use server";
  const user = await requireUser();
  const clear = form.get("intent") === "clear";
  try {
    const img = clear ? null : (png(form.get("signatureFile")) ?? png(form.get("signature")));
    if (!clear && !img) throw new UserError("서명을 그리거나 그림 파일을 골라 주세요");
    await saveUserSignature(await getDb(), user.id, img);
  } catch (e) {
    redirect(errorUrl("/account", userMessage(e)));
  }
  redirect(noticeUrl("/account", clear ? "서명을 지웠습니다. 앞으로 내는 서류의 작성자 칸은 비어 있게 됩니다" : "서명을 등록했습니다. 앞으로 내가 작성해 발급하는 견적서·정비명세서에 찍힙니다"));
}

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string }> }) {
  const { error, notice } = await searchParams;
  const user = await requireUser();
  const sign = await userSignature(await getDb(), user.id);
  return (
    <div className="space-y-4">
      <PageTitle help="account" sub={`${user.loginId} · ${user.roles.map((r) => ROLE_LABEL[r]).join("·")}`}>
        {user.name}
      </PageTitle>
      <div className="space-y-2 empty:hidden">
        <ErrorBox message={error} />
        {notice && <Notice>{notice}</Notice>}
      </div>

      <Card title="내 서명" help={{ kind: "panel", id: "account.signature" }}>
        <div className="grid gap-6 lg:grid-cols-[16rem_1fr]">
          <div>
            <p className="mb-1 text-sm font-medium">지금 등록된 서명</p>
            <div className="grid h-28 place-items-center rounded-md border border-[var(--line)] bg-white">
              {sign ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`/api/files/${sign}`} alt="등록된 내 서명" className="max-h-24 max-w-[14rem] object-contain" />
              ) : (
                <span className="text-sm text-[var(--muted)]">아직 없음</span>
              )}
            </div>
            {sign && (
              <form action={signatureAction} className="mt-2">
                <input type="hidden" name="intent" value="clear" />
                <SubmitButton variant="secondary">서명 지우기</SubmitButton>
              </form>
            )}
          </div>
          <AssistForm id="account-signature" action={signatureAction} guard={false} className="space-y-4">
            <div>
              <p className="mb-1 text-sm font-medium">여기에 그리기</p>
              <SignaturePad name="signature" trim hint="손가락·펜·마우스로 평소 서명을 크게 그립니다" />
            </div>
            <div>
              <p className="mb-1 text-sm font-medium">또는 서명·도장 그림 올리기</p>
              <StampImageInput name="signatureFile" label="그림 파일 고르기" hint="흰 종이에 쓴 서명이나 개인 도장을 찍은 사진(PNG·JPG). 흰 바탕은 저절로 지웁니다. 올린 그림이 있으면 그린 서명보다 먼저 씁니다." />
            </div>
            <NeedImageNote fields={["signature", "signatureFile"]} msg="서명을 그리거나 그림 파일을 골라야 저장됩니다." />
            <SubmitButton>{sign ? "서명 바꾸기" : "서명 등록"}</SubmitButton>
          </AssistForm>
        </div>
      </Card>

      <Card title="비밀번호 바꾸기" help={{ kind: "panel", id: "account.password" }}>
        <AssistForm id="account" action={changePasswordAction} className="grid gap-4 md:grid-cols-3 md:items-start">
          <PasswordField help="account.current" name="current" autoComplete="current-password" required />
          <PasswordField help="account.next" name="next" autoComplete="new-password" required rules />
          <PasswordField help="account.next2" name="next2" autoComplete="new-password" required matchName="next" />
          <div className="md:col-span-3">
            <SubmitButton>비밀번호 바꾸기</SubmitButton>
          </div>
        </AssistForm>
      </Card>
    </div>
  );
}
