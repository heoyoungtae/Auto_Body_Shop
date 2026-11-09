import Link from "next/link";
import { getDb } from "@/db/runtime";
import { can } from "@/modules/auth/permissions";
import { searchCustomers } from "@/modules/customer/service";
import { isSmsPurpose, listTemplates, MAX_RECIPIENTS, recipients, SAMPLE, SCOPES, SMS_PURPOSES, SMS_VARS, type Scope, type SmsPurpose } from "@/modules/messaging/bulk";
import { adBlockedAt } from "@/modules/messaging/rules";
import { formatPhone, SHOP_NAME, smsSenderInfo } from "@/modules/messaging/service";
import { maskPhone } from "@/modules/auth/crypto";
import { AssistForm } from "../../_assist";
import { RadioRow, SelectField, TextAreaField } from "../../_input";
import { requireUser } from "../../_lib/session";
import { SubmitButton } from "../../_submit";
import { Badge, buttonClass, Card, ErrorBox, PageTitle } from "../../_ui";
import { sendSmsAction } from "../actions";
import { SmsPreview } from "../sms-preview";

type Q = { scope?: string; purpose?: string; cid?: string; months?: string; t?: string; q?: string; error?: string };

/** 문자 발송: 받는 사람(한 명·출고 고객·전체)과 용도를 고르고, 서식을 불러와 고쳐 미리 본 뒤 보낸다 */
export default async function SendSmsPage({ searchParams }: { searchParams: Promise<Q> }) {
  const q = await searchParams;
  const user = await requireUser();
  const db = await getDb();
  const allowed = can(user, "consult.write");
  const kind = q.scope === "delivered" || q.scope === "all" ? q.scope : "one";
  const purpose: SmsPurpose = q.purpose && isSmsPurpose(q.purpose) ? q.purpose : "info";
  const months = [3, 6, 12, 24].includes(Number(q.months)) ? Number(q.months) : 6;
  const [templates, info, found] = await Promise.all([listTemplates(db), smsSenderInfo(db), kind === "one" && q.q ? searchCustomers(db, q.q, 20) : Promise.resolve([])]);
  const scope: Scope | null = kind === "one" ? (q.cid ? { kind: "one", customerId: q.cid } : null) : kind === "delivered" ? { kind: "delivered", months } : { kind: "all" };
  const r = scope ? await recipients(db, scope, purpose) : null;
  const tpl = templates.find((x) => x.id === q.t) ?? null;
  const first = r?.list[0];
  const phone = info.sender ? formatPhone(info.sender) : SAMPLE.업체전화;
  const vars = first ? { 고객명: first.name, 차량번호: first.plateNo, 업체명: SHOP_NAME, 업체전화: phone } : { ...SAMPLE, 업체전화: phone };
  const night = purpose === "ad" && adBlockedAt();
  const link = (extra: Record<string, string>) => `/messages/send?${new URLSearchParams({ scope: kind, purpose, months: String(months), ...(q.cid ? { cid: q.cid } : {}), ...(q.t ? { t: q.t } : {}), ...extra }).toString()}`;
  const tplOpts = templates.filter((x) => x.purpose === purpose).map((x) => ({ value: x.id, label: x.title }));
  return (
    <>
      <PageTitle
        help="messages.send"
        sub="고객에게 문자를 보냅니다. 정보성 안내는 개인정보 필수 동의 고객에게, 광고는 마케팅 동의 고객에게만 갑니다. 보내면 발송 이력에 남습니다."
        actions={
          <Link href="/messages/templates" className="text-sm text-[var(--accent)]">
            문구 서식 →
          </Link>
        }
      >
        문자 발송
      </PageTitle>
      <ErrorBox message={q.error} />
      {info.provider === "demo" && <p className="mb-3 rounded-md bg-[var(--warn-soft)] p-2 text-sm">문자 서비스가 데모 상태입니다. 보내도 실제로 나가지 않고 이력에만 남습니다(설정 › 문자 발송 서비스).</p>}
      <div className="grid gap-4 xl:grid-cols-2">
        <Card title="받는 사람·용도" help={{ kind: "panel", id: "sms.to" }}>
          <form method="get" className="space-y-3">
            {q.cid && <input type="hidden" name="cid" value={q.cid} />}
            <RadioRow help="sms.purpose" name="purpose" required defaultValue={purpose} options={Object.entries(SMS_PURPOSES).map(([value, label]) => ({ value, label, tone: value === "ad" ? ("warn" as const) : undefined }))} />
            <RadioRow help="sms.scope" name="scope" required defaultValue={kind} options={Object.entries(SCOPES).map(([value, label]) => ({ value, label }))} />
            {kind === "delivered" && <SelectField help="sms.months" name="months" defaultValue={String(months)} options={[3, 6, 12, 24].map((m) => ({ value: String(m), label: `최근 ${m}개월` }))} />}
            {kind === "one" && (
              <div className="flex gap-2">
                <input type="search" name="q" defaultValue={q.q ?? ""} placeholder="전화번호, 끝 4자리, 차량번호, 이름" aria-label="고객 찾기" className="h-11 min-w-0 flex-1 rounded-md border border-[var(--line-strong)] bg-[var(--surface)] px-3" />
              </div>
            )}
            <button className={buttonClass("secondary")}>{kind === "one" ? "찾기·바꾸기" : "받는 사람 보기"}</button>
          </form>
          {kind === "one" && found.length > 0 && (
            <ul className="mt-3 divide-y divide-[var(--line)] rounded-md border border-[var(--line)] text-sm">
              {found.map((c) => (
                <li key={c.id} className="px-3 py-2">
                  <Link href={link({ cid: c.id })} className="text-[var(--accent)]">
                    {c.name} {c.phone ?? "연락처 없음"} {c.vehicles.map((v) => v.plateNo).join(", ")}
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {r && (
            <div className="mt-3 text-sm">
              <p>
                <b>{r.list.length}명</b>에게 보냅니다.{" "}
                {r.excluded.consent + r.excluded.marketing + r.excluded.phone > 0 && (
                  <span className="text-[var(--muted)]">
                    뺀 고객: {[r.excluded.consent && `필수 동의 없음·철회 ${r.excluded.consent}`, r.excluded.marketing && `마케팅 동의 없음 ${r.excluded.marketing}`, r.excluded.phone && `연락처 없음 ${r.excluded.phone}`].filter(Boolean).join(" · ")}
                  </span>
                )}
              </p>
              {r.list.length > MAX_RECIPIENTS && <p className="text-[var(--danger)]">한 번에 {MAX_RECIPIENTS}명까지 보냅니다. 범위를 줄여 주세요.</p>}
              <p className="mt-1 text-xs text-[var(--muted)]">
                {r.list.slice(0, 12).map((x) => `${x.name}(${maskPhone(x.phone)})`).join(", ")}
                {r.list.length > 12 && ` 외 ${r.list.length - 12}명`}
              </p>
            </div>
          )}
        </Card>

        <Card title="내용" help={{ kind: "panel", id: "sms.body" }} actions={purpose === "ad" && <Badge tone="warn">광고</Badge>}>
          {tplOpts.length > 0 && (
            <form method="get" className="mb-3 flex items-end gap-2">
              <input type="hidden" name="scope" value={kind} />
              <input type="hidden" name="purpose" value={purpose} />
              <input type="hidden" name="months" value={String(months)} />
              {q.cid && <input type="hidden" name="cid" value={q.cid} />}
              <div className="flex-1">
                <SelectField help="sms.template" name="t" defaultValue={tpl?.id ?? ""} placeholder="직접 쓰기" options={tplOpts} />
              </div>
              <button className={buttonClass("secondary")}>불러오기</button>
            </form>
          )}
          {!allowed ? (
            <p className="text-sm text-[var(--muted)]">문자 발송은 상담원·공장장·대표가 합니다.</p>
          ) : (
            <AssistForm id={`sms-${kind}-${purpose}-${tpl?.id ?? "x"}`} action={sendSmsAction} className="space-y-3">
              <input type="hidden" name="scope" value={kind} />
              <input type="hidden" name="purpose" value={purpose} />
              <input type="hidden" name="months" value={String(months)} />
              <input type="hidden" name="cid" value={q.cid ?? ""} />
              <input type="hidden" name="t" value={q.t ?? ""} />
              <input type="hidden" name="expected" value={String(r?.list.length ?? 0)} />
              <TextAreaField help="sms.body" name="body" required rows={5} defaultValue={tpl?.body ?? ""} from={tpl ? `서식 '${tpl.title}'` : undefined} />
              <SmsPreview vars={vars} purpose={purpose} optout={info.optout} names={[...SMS_VARS]} />
              {purpose === "ad" && !info.optout && <p className="text-sm text-[var(--danger)]">광고 문자에는 무료수신거부 번호가 필요합니다. 설정 › 문자 발송 서비스에서 넣어 주세요.</p>}
              {night && <p className="text-sm text-[var(--danger)]">지금은 광고 문자를 보낼 수 없는 시간입니다(오후 9시~오전 8시).</p>}
              <SubmitButton disabled={!r?.list.length || night}>{r?.list.length ? `${r.list.length}명에게 보내기` : "받는 사람을 먼저 고르세요"}</SubmitButton>
            </AssistForm>
          )}
        </Card>
      </div>
    </>
  );
}
