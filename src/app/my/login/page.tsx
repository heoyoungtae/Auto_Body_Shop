// 내 차 수첩 들어가기: 휴대폰 번호 → 문자 인증번호 6자리. 비밀번호 없음
import Link from "next/link";
import { getDb } from "@/db/runtime";
import { shopCard } from "@/modules/carbook/service";
import { OTP } from "@/modules/carbook/rules";
import { AssistForm } from "../../_assist";
import { TextField } from "../../_input";
import { SubmitButton } from "../../_submit";
import { ErrorBox, Notice, PageTitle } from "../../_ui";
import { requestCodeAction, verifyCodeAction } from "../actions";
import { mySession } from "../_session";
import { ShopFooter } from "../_parts";

export default async function MyLogin({ searchParams }: { searchParams: Promise<{ step?: string; error?: string; demo?: string; more?: string; next?: string; bye?: string; left?: string }> }) {
  const q = await searchParams;
  const shop = await shopCard(await getDb());
  const s = await mySession();
  const codeStep = q.step === "code";
  return (
    <div className="pt-2">
      <PageTitle help="my.login" sub={shop.name}>
        내 차 수첩
      </PageTitle>
      {!shop.enabled ? (
        <Notice>내 차 수첩을 잠시 쉬고 있습니다. 수리 문의는 정비소로 전화해 주세요.</Notice>
      ) : (
        <div className="space-y-4">
          {q.bye && <Notice>나갔습니다. 다음에는 문자 인증을 다시 하시면 됩니다.</Notice>}
          {q.left && <Notice>내 차 수첩을 그만 쓰도록 하고, 직접 적으신 기록을 모두 지웠습니다. 수리 기록과 서류는 정비소에 법정 기간 동안 남습니다. 다시 쓰시려면 문자 인증을 하시면 됩니다.</Notice>}
          {q.more && s?.scope === "link" && <Notice>지금은 알림톡 링크의 수리 한 건만 보입니다. 휴대폰 문자 인증을 한 번 하시면 모든 수리 기록과 서류가 보입니다.</Notice>}
          {!codeStep && !q.bye && !q.left && !q.more && (
            <p className="text-sm text-[var(--muted)]">우리 정비소에서 고친 내 차의 수리 기록·사진·견적서·명세서·보증 기간을 모아 보는 곳입니다. 아이디·비밀번호 없이 휴대폰 문자로 들어옵니다.</p>
          )}
          <ErrorBox message={q.error} />
          {!codeStep ? (
            <AssistForm id="my-phone" action={requestCodeAction} className="space-y-4">
              <p className="text-sm text-[var(--muted)]">정비소에 알려 주신 휴대폰 번호를 넣어 주세요. 숫자만 누르면 됩니다.</p>
              <TextField help="my.phone" name="phone" required autoComplete="tel" autoFocus placeholder="010-1234-5678" />
              <SubmitButton full>인증번호 받기</SubmitButton>
            </AssistForm>
          ) : (
            <AssistForm id="my-code" action={verifyCodeAction} className="space-y-4">
              <input type="hidden" name="next" value={q.next ?? ""} />
              <p className="text-sm">문자로 받은 숫자 {OTP.digits}자리를 {OTP.minutes}분 안에 넣어 주세요.</p>
              {q.demo && (
                <p className="rounded-md border border-[var(--warn)] bg-[var(--warn-soft)] px-3 py-2 text-sm">
                  시연 모드(문자 대행사 연결 전)라 실제 문자는 가지 않습니다. 인증번호: <b className="tracking-widest">{q.demo}</b>
                </p>
              )}
              <TextField help="my.code" name="code" required inputMode="numeric" autoComplete="one-time-code" autoFocus maxLength={7} placeholder="123456" />
              <SubmitButton full>들어가기</SubmitButton>
              <p className="text-center text-sm">
                <Link href="/my/login" className="text-[var(--accent)] underline">
                  번호를 잘못 넣었거나 문자가 안 오면 다시 받기
                </Link>
              </p>
            </AssistForm>
          )}
          {s && !q.more && (
            <p className="text-center text-sm">
              <Link href="/my" className="text-[var(--accent)] underline">
                이미 들어와 있습니다. 홈으로 →
              </Link>
            </p>
          )}
        </div>
      )}
      <ShopFooter shop={shop} />
    </div>
  );
}
