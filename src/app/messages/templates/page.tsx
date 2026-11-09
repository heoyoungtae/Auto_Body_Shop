import Link from "next/link";
import { getDb } from "@/db/runtime";
import { can } from "@/modules/auth/permissions";
import { listTemplates, SMS_PURPOSES, SMS_VARS } from "@/modules/messaging/bulk";
import { KAKAO_TEMPLATES } from "@/modules/messaging/kakao";
import { AssistForm } from "../../_assist";
import { RadioRow, TextAreaField, TextField } from "../../_input";
import { requireUser } from "../../_lib/session";
import { SubmitButton } from "../../_submit";
import { Badge, Card, ErrorBox, Notice, PageTitle } from "../../_ui";
import { removeTemplateAction, saveTemplateAction } from "../actions";

/** 문구 서식: 문자 발송에서 불러 쓰는 문구와, 고정된 알림톡 문구 */
export default async function SmsTemplatesPage({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string; edit?: string }> }) {
  const q = await searchParams;
  const user = await requireUser();
  const db = await getDb();
  const rows = await listTemplates(db);
  const edit = can(user, "consult.write");
  const purposeOpts = Object.entries(SMS_PURPOSES).map(([value, label]) => ({ value, label }));
  return (
    <>
      <PageTitle
        help="messages.templates"
        sub={`문자 발송에서 불러 쓰는 문구입니다. ${SMS_VARS.map((v) => `#{${v}}`).join(" ")} 칸은 보낼 때 고객마다 바뀝니다. 광고 문구에는 (광고)·무료수신거부가 보낼 때 저절로 붙습니다.`}
        actions={
          <Link href="/messages/send" className="text-sm text-[var(--accent)]">
            문자 발송 →
          </Link>
        }
      >
        문구 서식
      </PageTitle>
      <ErrorBox message={q.error} />
      {q.notice && <Notice>{q.notice}</Notice>}
      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="문자 서식" help={{ kind: "panel", id: "sms.tpl.list" }}>
          <ul className="space-y-3">
            {rows.map((t) => (
              <li key={t.id} className="rounded-md border border-[var(--line)] p-3">
                {edit && q.edit === t.id ? (
                  <AssistForm id={`tpl-${t.id}`} action={saveTemplateAction} className="space-y-2">
                    <input type="hidden" name="id" value={t.id} />
                    <TextField help="tpl.title" name="title" required defaultValue={t.title} />
                    <RadioRow help="tpl.purpose" name="purpose" required defaultValue={t.purpose} options={purposeOpts} />
                    <TextAreaField help="tpl.body" name="body" required rows={4} defaultValue={t.body} />
                    <SubmitButton>저장</SubmitButton>
                  </AssistForm>
                ) : (
                  <>
                    <p className="flex flex-wrap items-center gap-2 font-semibold">
                      {t.title} <Badge tone={t.purpose === "ad" ? "warn" : "neutral"}>{SMS_PURPOSES[t.purpose as keyof typeof SMS_PURPOSES]}</Badge>
                      <Link href={`/messages/send?purpose=${t.purpose}&t=${t.id}`} className="ml-auto text-sm font-normal text-[var(--accent)]">
                        이 문구로 보내기
                      </Link>
                    </p>
                    <p className="mt-1 text-sm whitespace-pre-wrap text-[var(--muted)]">{t.body}</p>
                    {edit && (
                      <div className="mt-2 flex gap-3 text-sm">
                        <Link href={`/messages/templates?edit=${t.id}`} className="text-[var(--accent)]">
                          고치기
                        </Link>
                        <form action={removeTemplateAction}>
                          <input type="hidden" name="id" value={t.id} />
                          <button className="text-[var(--danger)]">지우기</button>
                        </form>
                      </div>
                    )}
                  </>
                )}
              </li>
            ))}
            {!rows.length && <li className="text-sm text-[var(--muted)]">서식이 없습니다.</li>}
          </ul>
        </Card>
        <div className="space-y-4">
          {edit && (
            <Card title="새 서식" help={{ kind: "panel", id: "sms.tpl.new" }}>
              <AssistForm id="tpl-new" action={saveTemplateAction} className="space-y-3">
                <TextField help="tpl.title" name="title" required />
                <RadioRow help="tpl.purpose" name="purpose" required defaultValue="info" options={purposeOpts} />
                <TextAreaField help="tpl.body" name="body" required rows={4} />
                <SubmitButton>서식 더하기</SubmitButton>
              </AssistForm>
            </Card>
          )}
          <Card title="알림톡 문구(고정)" help={{ kind: "panel", id: "sms.kakao" }}>
            <ul className="space-y-2 text-sm">
              {Object.entries(KAKAO_TEMPLATES).map(([k, t]) => (
                <li key={k}>
                  <b>{t.title}</b> <span className="text-xs text-[var(--muted)]">· {t.usage}</span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-[var(--muted)]">
              알림톡 문구는 카카오 심사를 받은 그대로만 보낼 수 있어 여기서 고치지 않습니다. 전체 문구와 심사 코드는{" "}
              <Link href="/settings/kakao" className="text-[var(--accent)]">
                설정 › 카카오 알림톡
              </Link>
              에서 봅니다.
            </p>
          </Card>
        </div>
      </div>
    </>
  );
}
