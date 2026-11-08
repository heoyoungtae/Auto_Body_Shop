import Link from "next/link";
import { getDb } from "@/db/runtime";
import { kakaoOverview } from "@/modules/messaging/service";
import { AssistForm } from "../../_assist";
import { CheckGroup, SelectField, TextField } from "../../_input";
import { SubmitButton } from "../../_submit";
import { requireUser } from "../../_lib/session";
import { Badge, Card, ErrorBox, Notice, PageTitle } from "../../_ui";
import { kakaoTestAction, saveKakaoAction } from "../messaging-actions";

export default async function KakaoSettingsPage({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string }> }) {
  const { error, notice } = await searchParams;
  const user = await requireUser();
  const owner = user.roles.includes("owner");
  const o = await kakaoOverview(await getDb());
  return (
    <>
      <PageTitle help="settings.kakao" sub="카카오가 승인한 고정 문구로만 보냅니다. 준비되지 않은 안내는 문자로 나갑니다.">
        카카오 알림톡
      </PageTitle>
      <div className="mb-4 space-y-2">
        <ErrorBox message={error} />
        {notice && <Notice>{notice}</Notice>}
        <p className="flex flex-wrap items-center gap-2 text-sm">
          {o.enabled ? <Badge tone="ok">사용 중</Badge> : <Badge>꺼짐</Badge>} 문자 서비스: <b>{o.providerLabel}</b>
          {!o.supported && (
            <span className="text-[var(--warn)]">
              이 서비스는 알림톡을 지원하지 않습니다.{" "}
              <Link className="text-[var(--accent)]" href="/settings/messaging">
                솔라피로 바꾸기 →
              </Link>
            </span>
          )}
        </p>
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] xl:items-start">
        <Card title="템플릿" help={{ kind: "panel", id: "kakao.templates" }}>
          <AssistForm id="kakao-settings" action={saveKakaoAction} className="space-y-4">
            {owner && (
              <div className="grid gap-4 md:grid-cols-2">
                <CheckGroup help="kakao.enabled" name="enabled" options={[{ value: "1", label: "알림톡 사용" }]} defaultChecked={o.enabled ? ["1"] : []} />
                <TextField help="kakao.pfId" name="pfId" defaultValue={o.pfId} spellCheck={false} />
              </div>
            )}
            <ul className="grid gap-3 lg:grid-cols-2">
              {o.templates.map((t) => (
                <li key={t.key} className="rounded-md border border-[var(--line)] p-3">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <b>{t.title}</b>
                    <span className="text-xs text-[var(--muted)]">{t.std}</span>
                    {t.ready ? <Badge tone="ok">준비됨</Badge> : <Badge>문자로 발송</Badge>}
                  </div>
                  <p className="mb-2 text-xs text-[var(--muted)]">쓰는 곳: {t.usage}</p>
                  <pre className="mb-2 whitespace-pre-wrap rounded bg-[var(--surface-2)] p-2 font-sans text-xs">{t.text}</pre>
                  {owner && <TextField help="kakao.code" name={`code.${t.key}`} label={`${t.title} 템플릿 코드`} defaultValue={t.code} spellCheck={false} />}
                </li>
              ))}
            </ul>
            {owner ? <SubmitButton>저장</SubmitButton> : <Notice>알림톡 설정은 대표만 바꿀 수 있습니다.</Notice>}
          </AssistForm>
        </Card>
        {owner && (
          <Card title="알림톡 시험" help={{ kind: "panel", id: "kakao.test" }}>
            <AssistForm id="kakao-test" action={kakaoTestAction} guard={false} className="space-y-3">
              <SelectField help="kakao.testKey" name="key" required options={o.templates.map((t) => ({ value: t.key, label: t.title }))} />
              <TextField help="sms.testTo" name="to" required inputMode="tel" autoComplete="tel" />
              <SubmitButton variant="secondary">시험 발송</SubmitButton>
            </AssistForm>
          </Card>
        )}
      </div>
    </>
  );
}
