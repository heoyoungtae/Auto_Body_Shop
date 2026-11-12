// 임시 비밀번호 상자: 직원이 새 비밀번호를 정하기 전까지 대표·회계에게 보인다(다시 알려 주기·문자 보내기·다시 발급)
import { getDb } from "@/db/runtime";
import { can } from "@/modules/auth/permissions";
import type { CurrentUser } from "@/modules/auth/service";
import { staffTempPassword } from "@/modules/staff/service";
import { SubmitButton } from "../_submit";
import { fmtTime } from "../_ui";
import { tempPasswordAction } from "./actions";

export async function TempPasswordBox({ user, userId, back, expiredOnly }: { user: CurrentUser; userId: string; back: string; expiredOnly?: boolean }) {
  const t = await staffTempPassword(await getDb(), user, userId);
  const owner = can(user, "account.manage");
  if (!t) return null;
  const expired = !!t.until && t.until < new Date();
  if (expiredOnly && !expired) return null;
  return (
    <div className={`rounded-md border p-3 text-sm ${expired ? "border-[var(--danger)] bg-[var(--danger-soft)]" : "border-[var(--warn)] bg-[var(--warn-soft)]"}`}>
      <p>
        임시 비밀번호{" "}
        <b className="rounded bg-[var(--surface)] px-2 py-0.5 font-mono text-base tracking-wider" aria-label="임시 비밀번호">
          {t.password}
        </b>{" "}
        {expired ? <span className="font-semibold text-[var(--danger)]">기한 지남({fmtTime(t.until)}) — 다시 발급해야 합니다</span> : <span className="text-[var(--muted)]">{fmtTime(t.until)}까지 · 직원이 처음 로그인할 때 새 비밀번호를 정합니다</span>}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {!expired && (
          <form action={tempPasswordAction}>
            <input type="hidden" name="userId" value={userId} />
            <input type="hidden" name="back" value={back} />
            <input type="hidden" name="op" value="sms" />
            <SubmitButton variant="secondary">명부 휴대폰으로 문자 보내기</SubmitButton>
          </form>
        )}
        {owner && (
          <form action={tempPasswordAction}>
            <input type="hidden" name="userId" value={userId} />
            <input type="hidden" name="back" value={back} />
            <input type="hidden" name="op" value="reissue" />
            <SubmitButton variant="secondary">다시 발급</SubmitButton>
          </form>
        )}
      </div>
    </div>
  );
}
