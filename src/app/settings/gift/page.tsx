import { can } from "@/modules/auth/permissions";
import { getDb } from "@/db/runtime";
import { giftOverview } from "@/modules/messaging/service";
import { AssistForm } from "../../_assist";
import { NumberField, TextAreaField, TextField } from "../../_input";
import { APP_NAME } from "@/modules/platform/brand";
import {
  DEMO_GOODS,
  GIFT_IMAGE_KINDS,
  GIFT_IMAGE_RULES,
} from "@/modules/messaging/gift";
import { GIFT_PURPOSES } from "@/modules/messaging/gift-send";
import { LiveGiftPreview } from "../../gifts/gift-preview";
import { GiftImageUpload } from "./gift-image-upload";
import { SubmitButton } from "../../_submit";
import { requireUser } from "../../_lib/session";
import { Badge, Card, ErrorBox, fmtTime, Notice, PageTitle } from "../../_ui";
import {
  giftBalanceAction,
  giftImageAction,
  saveGiftAction,
} from "../messaging-actions";
import { ProviderPicker } from "../provider-picker";

export default async function GiftSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const { error, notice } = await searchParams;
  const user = await requireUser();
  const owner = can(user, "settings.edit");
  const o = await giftOverview(await getDb());
  const cur = o.providers.find((p) => p.id === o.provider)!;
  const img = (k: (typeof GIFT_IMAGE_KINDS)[number]) => {
    const e = o.images?.[k];
    return e ? `/api/files/${e.path}` : undefined;
  };
  const look = {
    shop: APP_NAME,
    callback: o.callback,
    title: o.title,
    template: o.defaultMessage,
    bannerUrl: img("banner"),
    cardUrl: img("card"),
  };
  const sample = { ...DEMO_GOODS[0], brand: "보기 상품" };
  return (
    <>
      <PageTitle
        help="settings.gift"
        sub="고객 감사·보상용 모바일 쿠폰 공급사를 연결하고, 받는 사람에게 보이는 모양을 정합니다."
      >
        기프티콘 공급사
      </PageTitle>
      <div className="mb-4 space-y-2">
        <ErrorBox message={error} />
        {notice && <Notice>{notice}</Notice>}
        <p className="flex flex-wrap items-center gap-2 text-sm">
          지금: <b>{cur.label}</b>{" "}
          {o.provider === "demo" ? (
            <Badge tone="warn">데모 · 돈이 나가지 않음</Badge>
          ) : (
            <Badge tone="ok">실제 발송</Badge>
          )}
          {o.updatedAt && (
            <span className="text-xs text-[var(--muted)]">
              마지막 저장 {fmtTime(o.updatedAt)} · {o.updatedBy}
            </span>
          )}
        </p>
      </div>
      {owner ? (
        <AssistForm
          id="gift-settings"
          action={saveGiftAction}
          className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] xl:items-start"
        >
          <div className="space-y-4">
            <Card title="공급사 연결" help={{ kind: "panel", id: "sms.guide" }}>
              <div className="space-y-4">
                <ProviderPicker
                  providers={o.providers}
                  current={o.provider}
                  help="gift.provider"
                  credHelp="gift.cred"
                  checkHelp="gift.checklist"
                  checked={o.checklist}
                />
              </div>
            </Card>
            <Card
              title="받는 사람에게 보이는 모양"
              help={{ kind: "panel", id: "gift.look" }}
            >
              <div className="grid gap-4 md:grid-cols-2">
                <TextField
                  help="gift.callback"
                  name="callback"
                  defaultValue={o.callback}
                  inputMode="numeric"
                  required={o.provider !== "demo"}
                />
                <TextField
                  help="gift.title"
                  name="title"
                  defaultValue={o.title}
                  maxLength={20}
                  placeholder={`${APP_NAME} 선물`.slice(0, 20)}
                />
                <TextField
                  help="gift.templateId"
                  name="templateId"
                  defaultValue={o.templateId}
                  inputMode="numeric"
                  autoComplete="off"
                  spellCheck={false}
                />
                <TextField
                  help="gift.bannerId"
                  name="bannerId"
                  defaultValue={o.bannerId}
                  inputMode="numeric"
                  autoComplete="off"
                  spellCheck={false}
                />
                <div className="md:col-span-2">
                  <TextAreaField
                    help="gift.defaultMessage"
                    name="defaultMessage"
                    defaultValue={o.defaultMessage}
                    rows={3}
                  />
                </div>
              </div>
            </Card>
            <Card
              title="예산·중복 방지"
              help={{ kind: "panel", id: "gift.budget" }}
            >
              <div className="space-y-4">
                <NumberField
                  help="gift.monthLimit"
                  name="monthLimit"
                  unit="원"
                  defaultValue={o.monthLimit}
                  min={0}
                />
                <NumberField
                  help="gift.unitLimit"
                  name="unitLimit"
                  unit="원"
                  defaultValue={o.unitLimit}
                  min={0}
                />
                <NumberField
                  help="gift.dupDays"
                  name="dupDays"
                  unit="일"
                  defaultValue={o.dupDays}
                  min={0}
                  max={3650}
                />
              </div>
            </Card>
            <div>
              <SubmitButton>저장</SubmitButton>
            </div>
          </div>
          <div className="xl:sticky xl:top-4">
            <Card
              title="받는 사람 미리보기"
              help={{ kind: "panel", id: "gift.preview" }}
            >
              <LiveGiftPreview
                mode="settings"
                look={look}
                goods={[sample]}
                customer="홍길동"
                purposes={GIFT_PURPOSES}
              />
            </Card>
          </div>
        </AssistForm>
      ) : (
        <Notice>기프티콘 설정은 대표만 바꿀 수 있습니다.</Notice>
      )}
      {owner && (
        <div id="gift-images" className="mt-4">
          <Card
            title="카드·배너 그림(미리보기용)"
            help={{ kind: "panel", id: "gift.images" }}
          >
            <div className="grid gap-4 md:grid-cols-2">
              {GIFT_IMAGE_KINDS.map((k) => {
                const r = GIFT_IMAGE_RULES[k];
                const e = o.images?.[k];
                return (
                  <div
                    key={k}
                    className="space-y-2 rounded-md border border-[var(--line)] p-3"
                  >
                    <p className="text-sm font-medium">
                      {r.label}{" "}
                      <span className="text-xs font-normal text-[var(--muted)]">
                        · {r.where}
                      </span>
                    </p>
                    {e ? (
                      <div className="flex flex-wrap items-center gap-3">
                        {/* eslint-disable-next-line @next/next/no-img-element -- 올려 둔 그림 */}
                        <img
                          src={`/api/files/${e.path}`}
                          alt={r.label}
                          className="max-h-20 max-w-60 rounded border border-[var(--line)] object-contain"
                        />
                        <span className="text-xs text-[var(--muted)]">
                          {e.fileName} · {fmtTime(new Date(e.updatedAt))}
                        </span>
                        <form action={giftImageAction}>
                          <input type="hidden" name="kind" value={k} />
                          <input type="hidden" name="intent" value="remove" />
                          <SubmitButton variant="secondary">빼기</SubmitButton>
                        </form>
                      </div>
                    ) : (
                      <p className="text-xs text-[var(--muted)]">
                        아직 없음 · 미리보기에 기본 모양이 보입니다
                      </p>
                    )}
                    <form action={giftImageAction}>
                      <input type="hidden" name="kind" value={k} />
                      <GiftImageUpload kind={k} advice={r.advice} />
                    </form>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
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
