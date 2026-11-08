import { getDb } from "@/db/runtime";
import { consentRequestView } from "@/modules/customer/service";
import { CONSENT_TEXT } from "@/modules/customer/rules";
import { SHOP_NAME } from "@/modules/messaging/service";
import { CheckGroup } from "../../_input";
import { SubmitButton } from "../../_submit";
import { ErrorBox, Notice, PageTitle } from "../../_ui";
import { acceptConsentAction } from "./actions";

/** 고객용: 문자·알림톡으로 받은 링크에서 개인정보 동의(F-13-01). 로그인 없이 열린다 */
export default async function ConsentPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ error?: string; done?: string }> }) {
  const [{ token }, q] = await Promise.all([params, searchParams]);
  const view = q.done ? null : await consentRequestView(await getDb(), token);
  return (
    <div className="mx-auto max-w-xl">
      <PageTitle help="public.consent" sub={SHOP_NAME}>
        개인정보 수집·이용 동의
      </PageTitle>
      {q.done === "yes" && <Notice>동의해 주셔서 감사합니다. 상담 내용대로 연락드리겠습니다. 이 창은 닫으셔도 됩니다.</Notice>}
      {q.done === "no" && <Notice>필수 항목에 동의하지 않으셔서 연락처를 저장하지 않고 지웠습니다. 다시 상담을 원하시면 정비소로 연락해 주세요.</Notice>}
      {view && view.state !== "open" && (
        <Notice>{view.state === "used" ? "이미 답해 주신 링크입니다." : view.state === "expired" ? "링크 기한이 지났습니다. 정비소에 다시 요청해 주세요." : "올바르지 않은 링크입니다."}</Notice>
      )}
      {view?.state === "open" && (
        <form action={acceptConsentAction} className="space-y-4">
          <ErrorBox message={q.error} />
          <input type="hidden" name="token" value={token} />
          <p className="text-sm">{view.name} 고객님, 아래 내용을 읽고 동의하실 항목을 골라 주세요.</p>
          <div className="space-y-3 rounded-lg border border-[var(--line)] bg-[var(--surface)] p-4 text-sm">
            {(["required", "photo", "marketing"] as const).map((k) => (
              <div key={k}>
                <p className="font-semibold">{CONSENT_TEXT[k].title}</p>
                <p className="mt-0.5 text-[var(--muted)]">{CONSENT_TEXT[k].body}</p>
              </div>
            ))}
            <p className="text-xs text-[var(--muted)]">{CONSENT_TEXT.notice}</p>
          </div>
          <CheckGroup
            help="consent.self"
            name="consent"
            options={[
              { value: "required", label: "[필수] 수리 상담·연락에 동의" },
              { value: "photo", label: "[선택] 사진 홍보에 동의" },
              { value: "marketing", label: "[선택] 이벤트·기프티콘·광고 문자 받기" },
            ]}
            defaultChecked={["required"]}
          />
          <SubmitButton full>보내기</SubmitButton>
        </form>
      )}
    </div>
  );
}
