import { can } from "@/modules/auth/permissions";
import Link from "next/link";
import { getDb } from "@/db/runtime";
import { smsOverview } from "@/modules/messaging/service";
import { AssistForm } from "../../_assist";
import { TextField } from "../../_input";
import { SubmitButton } from "../../_submit";
import { requireUser } from "../../_lib/session";
import { Badge, Card, ErrorBox, fmtTime, Notice, PageTitle } from "../../_ui";
import { saveSmsAction, smsBalanceAction, smsTestAction } from "../messaging-actions";
import { ProviderPicker } from "../provider-picker";

export default async function SmsSettingsPage({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string }> }) {
  const { error, notice } = await searchParams;
  const user = await requireUser();
  const owner = can(user, "settings.edit");
  const o = await smsOverview(await getDb());
  const cur = o.providers.find((p) => p.id === o.current)!;
  return (
    <>
      <PageTitle help="settings.messaging" sub="예약·견적·출고 안내 문자를 보낼 대행사를 연결합니다. 알림톡은 이 연결(솔라피)을 통해 나갑니다.">
        문자 발송 서비스
      </PageTitle>
      <div className="mb-4 space-y-2">
        <ErrorBox message={error} />
        {notice && <Notice>{notice}</Notice>}
        <p className="flex flex-wrap items-center gap-2 text-sm">
          지금: <b>{cur.label}</b> {o.current === "demo" ? <Badge tone="warn">데모 모드 · 실제로 보내지 않음</Badge> : <Badge tone="ok">실제 발송</Badge>}
          {o.updatedAt && (
            <span className="text-xs text-[var(--muted)]">
              마지막 저장 {fmtTime(o.updatedAt)} · {o.updatedBy}
            </span>
          )}
          <Link href="/messages/log" className="text-[var(--accent)]">
            발송 이력 →
          </Link>
        </p>
      </div>
      {owner ? (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] xl:items-start">
          <Card title="연결 설정" help={{ kind: "panel", id: "sms.guide" }}>
            <AssistForm id="sms-settings" action={saveSmsAction} className="space-y-4">
              <ProviderPicker providers={o.providers} current={o.current} help="sms.provider" credHelp="sms.cred" checkHelp="sms.checklist" checked={o.checklist} />
              <div className="grid gap-4 md:grid-cols-2">
                <TextField help="sms.sender" name="sender" defaultValue={o.sender} inputMode="numeric" />
                <TextField help="sms.optout" name="optout" defaultValue={o.optout} inputMode="tel" />
              </div>
              <SubmitButton>저장</SubmitButton>
            </AssistForm>
          </Card>
          <Card title="연결 시험" help={{ kind: "panel", id: "sms.test" }}>
            <AssistForm id="sms-test" action={smsTestAction} guard={false} className="space-y-3">
              <TextField help="sms.testTo" name="to" required inputMode="tel" autoComplete="tel" />
              <SubmitButton variant="secondary">시험 발송</SubmitButton>
            </AssistForm>
            <form action={smsBalanceAction} className="mt-4 border-t border-[var(--line)] pt-4">
              <SubmitButton variant="secondary">잔액 조회</SubmitButton>
            </form>
          </Card>
        </div>
      ) : (
        <Notice>문자 발송 서비스는 대표만 바꿀 수 있습니다.</Notice>
      )}
    </>
  );
}
