import { getDb } from "@/db/runtime";
import { giftOverview } from "@/modules/messaging/service";
import { AssistForm } from "../../_assist";
import { NumberField, TextField } from "../../_input";
import { SubmitButton } from "../../_submit";
import { requireUser } from "../../_lib/session";
import { Badge, Card, ErrorBox, fmtTime, Notice, PageTitle } from "../../_ui";
import { giftBalanceAction, saveGiftAction } from "../messaging-actions";
import { ProviderPicker } from "../provider-picker";

export default async function GiftSettingsPage({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string }> }) {
  const { error, notice } = await searchParams;
  const user = await requireUser();
  const owner = user.roles.includes("owner");
  const o = await giftOverview(await getDb());
  const cur = o.providers.find((p) => p.id === o.provider)!;
  return (
    <>
      <PageTitle help="settings.gift" sub="고객 감사·보상용 모바일 쿠폰 공급사를 연결합니다. 발송 화면은 2차 개발에서 열립니다.">
        기프티콘 공급사
      </PageTitle>
      <div className="mb-4 space-y-2">
        <ErrorBox message={error} />
        {notice && <Notice>{notice}</Notice>}
        <p className="flex flex-wrap items-center gap-2 text-sm">
          지금: <b>{cur.label}</b> {o.provider === "demo" ? <Badge tone="warn">데모 · 돈이 나가지 않음</Badge> : <Badge tone="ok">실제 발송</Badge>}
          {o.updatedAt && (
            <span className="text-xs text-[var(--muted)]">
              마지막 저장 {fmtTime(o.updatedAt)} · {o.updatedBy}
            </span>
          )}
        </p>
      </div>
      {owner ? (
        <AssistForm id="gift-settings" action={saveGiftAction} className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] xl:items-start">
          <Card title="공급사 연결" help={{ kind: "panel", id: "sms.guide" }}>
            <div className="space-y-4">
              <ProviderPicker providers={o.providers} current={o.provider} help="gift.provider" credHelp="gift.cred" checkHelp="gift.checklist" checked={o.checklist} />
              <TextField help="gift.callback" name="callback" defaultValue={o.callback} inputMode="numeric" />
            </div>
          </Card>
          <Card title="예산·중복 방지" help={{ kind: "panel", id: "gift.budget" }}>
            <div className="space-y-4">
              <NumberField help="gift.monthLimit" name="monthLimit" unit="원" defaultValue={o.monthLimit} min={0} />
              <NumberField help="gift.unitLimit" name="unitLimit" unit="원" defaultValue={o.unitLimit} min={0} />
              <NumberField help="gift.dupDays" name="dupDays" unit="일" defaultValue={o.dupDays} min={0} max={3650} />
            </div>
          </Card>
          <div className="xl:col-span-2">
            <SubmitButton>저장</SubmitButton>
          </div>
        </AssistForm>
      ) : (
        <Notice>기프티콘 설정은 대표만 바꿀 수 있습니다.</Notice>
      )}
      {owner && (
        <div className="mt-4">
          <Card title="연결 확인" help={{ kind: "panel", id: "gift.check" }}>
            <form action={giftBalanceAction}>
              <SubmitButton variant="secondary">비즈머니 조회</SubmitButton>
            </form>
          </Card>
        </div>
      )}
    </>
  );
}
