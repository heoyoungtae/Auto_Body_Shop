// 홈페이지 견적 요청: ① 휴대폰 인증(처음 오는 손님도) ② 차·다친 곳(차 그림)·사진·수리비 방법·동의 ③ 보내면 상담 일지로 들어가고 내 차 수첩에서 답을 본다.
// 우리 고객이면 이름·차를 미리 채운다(다시 치지 않음). 이미 동의한 손님에게는 동의를 다시 묻지 않는다.
import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { getDb } from "@/db/runtime";
import { INSURANCE_PICK } from "@/modules/carbook/requests";
import { OTP } from "@/modules/carbook/rules";
import { CONSENT_TEXT } from "@/modules/customer/rules";
import { BODY_TYPES, carOf } from "@/modules/repair/body-map";
import { seoulDate } from "@/modules/platform/time";
import { knownVisitor } from "@/modules/site/service";
import { WEB_COOKIE, WEB_LIMIT } from "@/modules/site/rules";
import { AssistForm } from "../../_assist";
import { CheckGroup, DateField, RadioRow, SelectField, TextAreaField, TextField } from "../../_input";
import { SubmitButton } from "../../_submit";
import { Card, ErrorBox, Notice } from "../../_ui";
import { ConsultZones } from "../../consults/consult-zones";
import { ClaimPhotos } from "../../my/warranty/[id]/claim-photos";
import { siteBtn, siteData, SiteTitle } from "../_parts";
import { webCodeAction, webResetAction, webSubmitAction, webVerifyAction } from "./actions";

export const metadata: Metadata = { title: "견적 요청" };

const TIPS = ["다친 곳이 보이게 차 전체를 멀리서 한 장", "다친 곳을 가까이서 한두 장(그림자 없이)", "번호판이 보이는 사진 한 장이면 차 확인이 빠릅니다"];

export default async function RequestPage({ searchParams }: { searchParams: Promise<{ step?: string; error?: string; demo?: string; sent?: string; due?: string }> }) {
  const q = await searchParams;
  const { shop, cfg } = await siteData();
  const [proof = "", phone = ""] = ((await cookies()).get(WEB_COOKIE)?.value ?? "").split(".");
  const who = proof && phone ? await knownVisitor(await getDb(), proof, phone) : null;
  const call = shop.phone ? (
    <a href={`tel:${shop.tel}`} className="text-[var(--accent)] underline">
      {shop.phone}
    </a>
  ) : (
    "정비소"
  );

  return (
    <div className="mx-auto max-w-2xl">
      <SiteTitle eyebrow="ESTIMATE" help="site.request" sub="사진 몇 장과 다친 곳을 알려 주시면 대략 금액과 기간을 답해 드립니다. 답은 요청하신 분만 보실 수 있습니다.">
        견적 요청
      </SiteTitle>
      <ErrorBox message={q.error} />
      {q.sent && (
        <Notice>
          보냈습니다(요청 번호 {q.sent}). {q.due ? `${q.due}까지` : "곧"} 답을 드리고 알림톡(또는 문자)으로 알려 드립니다. 답은 <Link href="/my/consult" className="underline">내 차 수첩</Link>에서 휴대폰 문자 인증 뒤 보실 수 있습니다.
        </Notice>
      )}
      {!cfg.requests ? (
        <Notice>지금은 홈페이지 견적 요청을 받지 않습니다. 전화 {call}로 연락해 주세요.</Notice>
      ) : !who ? (
        <Card title={q.step === "code" ? "② 인증번호 넣기" : "① 휴대폰 번호 확인"} help={{ kind: "panel", id: "site.verify" }}>
          {q.step !== "code" ? (
            <AssistForm id="web-phone" action={webCodeAction} className="space-y-4">
              <p className="text-sm text-[var(--muted)]">먼저 휴대폰 문자로 본인을 확인합니다. 회원가입은 없고, 이 번호로 답변을 알려 드립니다.</p>
              <TextField help="site.phone" name="phone" required autoComplete="tel" inputMode="tel" placeholder="010-1234-5678" />
              <SubmitButton full>인증번호 받기</SubmitButton>
            </AssistForm>
          ) : (
            <AssistForm id="web-code" action={webVerifyAction} className="space-y-4">
              <p className="text-sm">
                문자로 받은 숫자 {OTP.digits}자리를 {OTP.minutes}분 안에 넣어 주세요.
              </p>
              {q.demo && (
                <p className="rounded-md border border-[var(--warn)] bg-[var(--warn-soft)] px-3 py-2 text-sm">
                  시연 모드(문자 대행사 연결 전)라 실제 문자는 가지 않습니다. 인증번호: <b className="tracking-widest">{q.demo}</b>
                </p>
              )}
              <TextField help="site.code" name="code" required inputMode="numeric" autoComplete="one-time-code" autoFocus maxLength={7} placeholder="123456" />
              <SubmitButton full>확인</SubmitButton>
              <p className="text-center text-sm">
                <Link href="/request" className="text-[var(--accent)] underline">
                  번호를 잘못 넣었거나 문자가 안 오면 다시 받기
                </Link>
              </p>
            </AssistForm>
          )}
          <ul className="mt-5 space-y-1 border-t border-[var(--line)] pt-4 text-sm text-[var(--muted)]">
            <li>· 사진은 이렇게 찍어 주세요: {TIPS.join(" · ")}</li>
            <li>· 급하시면 전화 {call}가 빠릅니다.</li>
          </ul>
        </Card>
      ) : (
        <Card title="③ 차와 다친 곳" help={{ kind: "panel", id: "site.requestForm" }}>
          <AssistForm id="web-request" action={webSubmitAction} className="space-y-4">
            <p className="flex flex-wrap items-center justify-between gap-2 text-sm text-[var(--muted)]">
              <span>
                확인한 번호 <b className="text-[var(--fg)]">{who.phoneMasked}</b>
                {who.name && " · 우리 정비소 고객이시네요. 이름과 차를 불러왔습니다."}
              </span>
              <button formAction={webResetAction} formNoValidate className="text-[var(--accent)] underline">
                다른 번호로
              </button>
            </p>
            <TextField help="site.name" name="name" required defaultValue={who.name} autoComplete="name" />
            {who.cars.length > 0 && (
              <SelectField help="site.vehicle" name="vehicleId" options={[...who.cars.map((c) => ({ value: c.id, label: c.label })), { value: "", label: "다른 차(아래에 적기)" }]} defaultValue={who.cars[0].id} />
            )}
            <TextField help="site.plateNo" name="plateNo" required={!who.cars.length} placeholder="12가3456" />
            <TextField help="site.model" name="model" placeholder="예: 아반떼, 쏘렌토" />
            <RadioRow help="site.bodyType" name="bodyType" defaultValue="sedan" options={Object.entries(BODY_TYPES).map(([value, label]) => ({ value, label }))} />
            <ConsultZones initial={[]} cars={Object.fromEntries(who.cars.map((c) => [c.id, carOf(c)]))} car={who.cars[0] ? carOf(who.cars[0]) : carOf({ bodyType: "sedan", model: "", options: [] })} />
            <TextAreaField help="my.damageParts" name="damageParts" rows={2} />
            <ClaimPhotos max={WEB_LIMIT.photos} />
            <RadioRow help="my.insurance" name="insurance" required defaultValue="self" options={Object.entries(INSURANCE_PICK).map(([value, label]) => ({ value, label }))} />
            <TextField help="my.insurer" name="insurer" />
            <DateField help="my.wantDate" name="wantDate" min={seoulDate()} quick={["tomorrow", "week"]} />
            <TextField help="my.needs" name="needs" />
            {!who.consented && (
              <div className="space-y-2 rounded-lg border border-[var(--line)] p-3 text-sm">
                <p className="font-medium">{CONSENT_TEXT.required.title}</p>
                <p className="text-[var(--muted)]">{CONSENT_TEXT.required.body}</p>
                <RadioRow help="site.agree" name="agree" required options={[{ value: "1", label: "동의합니다" }]} />
              </div>
            )}
            <div className="space-y-2 rounded-lg border border-[var(--line)] p-3 text-sm">
              <p className="font-medium">{CONSENT_TEXT.marketing.title}</p>
              <p className="text-[var(--muted)]">{CONSENT_TEXT.marketing.body}</p>
              <CheckGroup help="site.marketing" name="marketing" options={[{ value: "1", label: "받겠습니다" }]} />
            </div>
            <p className="text-xs text-[var(--muted)]">
              자세한 내용은{" "}
              <Link href="/privacy" className="underline">
                개인정보 처리방침
              </Link>
              을 봐 주세요. 사진만 보고 드리는 답은 대략 금액이며, 정식 견적은 차를 직접 보고 드립니다.
            </p>
            <SubmitButton full>견적 요청 보내기</SubmitButton>
          </AssistForm>
        </Card>
      )}
      <p className="mt-6 text-center text-sm text-[var(--muted)]">
        이미 보내셨나요?{" "}
        <Link href="/my/consult" className={`${siteBtn("line")} ml-1 min-h-10 px-3 text-sm`}>
          내 차 수첩에서 답 보기
        </Link>
      </p>
    </div>
  );
}
