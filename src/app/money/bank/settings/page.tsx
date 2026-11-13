import Link from "next/link";
import { getDb } from "@/db/runtime";
import { can } from "@/modules/auth/permissions";
import { appUrl } from "@/modules/customer/service";
import { accountLabel, BANKS, CARDS, companyLabel, TX_KINDS } from "@/modules/bank/rules";
import { feedView } from "@/modules/bank/service";
import { parseBankSms } from "@/modules/bank/sms-parse";
import { seoulDate } from "@/modules/platform/time";
import { AssistForm } from "../../../_assist";
import { CheckGroup, NumberField, RadioRow, SelectField, TextAreaField, TextField } from "../../../_input";
import { requireUser } from "../../../_lib/session";
import { SubmitButton } from "../../../_submit";
import { Badge, buttonClass, Card, Empty, ErrorBox, Notice, PageTitle, fmtTime } from "../../../_ui";
import { ShowWhen } from "../../../consults/show-when";
import { feedAction } from "../actions";
import { CopyButton } from "../copy-button";

const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;
const opts = (o: Record<string, { label: string }>) => Object.entries(o).map(([value, v]) => ({ value, label: v.label }));

/** 통장·카드 연동 설정: 사업용 통장·카드 등록, 문자 받는 주소, 받은 기록, 문자 시험 읽기 */
export default async function BankSettingsPage({ searchParams }: { searchParams: Promise<{ notice?: string; error?: string; edit?: string; test?: string }> }) {
  const q = await searchParams;
  const user = await requireUser();
  if (!can(user, "bank.view")) return <p className="text-sm text-[var(--muted)]">통장·카드 연동 설정은 대표(보기는 회계 담당)가 합니다.</p>;
  const db = await getDb();
  const { cfg, token, counts } = await feedView(db, user);
  const owner = can(user, "bank.setup");
  const url = token ? `${appUrl()}/api/bank-sms/${token}` : null;
  const edit = cfg.accounts.find((a) => a.id === q.edit);
  const test = q.test?.trim() ? parseBankSms(q.test, seoulDate()) : null;
  const countOf = (id: string, src: string) => counts.find((c) => c.accountId === id && c.source === src);
  return (
    <>
      <PageTitle
        help="bank.settings"
        sub="사업용 통장·카드를 등록하고, 대표 휴대폰의 문자 전달 앱(안드로이드)·단축어(아이폰)에 넣을 '문자 받는 주소'를 만듭니다. 등록하지 않은 계좌·카드의 문자는 내용을 버립니다."
        actions={
          <>
            <Link href="/money/bank" className={buttonClass("secondary")}>
              통장·카드 내역
            </Link>
            <Link href="/money/bank/guide" className={buttonClass("secondary")}>
              설명서(휴대폰 설정)
            </Link>
          </>
        }
      >
        통장·카드 연동 설정
      </PageTitle>
      <ErrorBox message={q.error} />
      {q.notice && <Notice>{q.notice}</Notice>}

      <Card title="1. 내 통장·카드" help={{ kind: "panel", id: "bank.accounts" }}>
        {cfg.accounts.length ? (
          <ul className="mb-3 divide-y divide-[var(--line)] text-sm">
            {cfg.accounts.map((a) => {
              const sms = countOf(a.id, "sms");
              const file = countOf(a.id, "file");
              return (
                <li key={a.id} className="flex flex-wrap items-center gap-2 py-2">
                  <Badge tone={a.kind === "bank" ? "ok" : "warn"}>{a.kind === "bank" ? "통장" : "카드"}</Badge>
                  <b>{accountLabel(a)}</b>
                  <span className="text-xs text-[var(--muted)]">
                    {companyLabel(a.company)}
                    {a.payDay ? ` · 결제일 ${a.payDay}일` : ""} · 문자 {a.sms ? "받음" : "안 받음(엑셀만)"}
                  </span>
                  <span className="text-xs text-[var(--muted)]">
                    문자 {sms?.n ?? 0}건{sms?.last ? `(마지막 ${sms.last})` : ""} · 엑셀 {file?.n ?? 0}건{file?.last ? `(마지막 ${file.last})` : ""}
                  </span>
                  {owner && (
                    <span className="ml-auto flex items-center gap-2">
                      <Link href={`/money/bank/settings?edit=${a.id}#account`} className="text-xs text-[var(--accent)]">
                        고치기
                      </Link>
                      <form action={feedAction}>
                        <input type="hidden" name="intent" value="remove" />
                        <input type="hidden" name="id" value={a.id} />
                        <button className="text-xs text-[var(--danger)] underline">지우기</button>
                      </form>
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <Empty>아직 등록한 통장·카드가 없습니다. 사업용 통장과 사업용(법인) 카드를 모두 등록하세요.</Empty>
        )}
        {owner ? (
          <div id="account" className="rounded-md border border-[var(--line)] p-3">
            <p className="mb-2 text-sm font-semibold">{edit ? `${accountLabel(edit)} 고치기` : "통장·카드 더하기"}</p>
            <AssistForm id={`bank-acc-${edit?.id ?? "new"}`} action={feedAction} className="grid gap-3 md:grid-cols-2">
              <input type="hidden" name="intent" value="account" />
              {edit && <input type="hidden" name="id" value={edit.id} />}
              <div className="md:col-span-2">
                <ShowWhen
                  field="kind"
                  initial={edit?.kind ?? "bank"}
                  cases={{
                    bank: <SelectField help="bank.bankCo" name="bankCo" required defaultValue={edit?.kind === "bank" ? edit.company : ""} placeholder="은행 고르기" options={opts(BANKS)} />,
                    card: (
                      <div className="flex flex-wrap gap-3">
                        <SelectField help="bank.cardCo" name="cardCo" required defaultValue={edit?.kind === "card" ? edit.company : ""} placeholder="카드사 고르기" options={opts(CARDS)} />
                        <NumberField help="bank.payDay" name="payDay" unit="일" min={1} max={31} defaultValue={edit?.payDay ?? null} />
                      </div>
                    ),
                  }}
                >
                  <RadioRow help="bank.kind" name="kind" required defaultValue={edit?.kind ?? "bank"} options={[{ value: "bank", label: "통장" }, { value: "card", label: "카드" }]} />
                </ShowWhen>
              </div>
              <TextField help="bank.name" name="name" defaultValue={edit?.name ?? ""} />
              <TextField help="bank.digits" name="digits" defaultValue={edit?.digits ?? ""} />
              <CheckGroup help="bank.sms" name="sms" options={[{ value: "1", label: "알림 문자로 받기" }]} defaultChecked={!edit || edit.sms ? ["1"] : []} />
              <div className="md:col-span-2 flex gap-2">
                <SubmitButton>{edit ? "고치기" : "등록"}</SubmitButton>
                {edit && (
                  <Link href="/money/bank/settings" className={buttonClass("secondary")}>
                    그만두기
                  </Link>
                )}
              </div>
            </AssistForm>
          </div>
        ) : (
          <p className="text-xs text-[var(--muted)]">통장·카드 등록은 대표가 합니다.</p>
        )}
      </Card>

      <div id="sms" className="mt-4">
        <Card title="2. 문자 받는 주소" help={{ kind: "panel", id: "bank.token" }}>
          {owner ? (
            <div className="space-y-2 text-sm">
              {url ? (
                <>
                  <p className="break-all rounded-md bg-[var(--surface-2)] px-3 py-2 font-mono text-xs">{url}</p>
                  <div className="flex flex-wrap items-center gap-2">
                    <CopyButton text={url} />
                    <a href={url} target="_blank" rel="noreferrer" className={buttonClass("secondary")}>
                      열어서 연결 확인
                    </a>
                    <form action={feedAction}>
                      <input type="hidden" name="intent" value="token" />
                      <SubmitButton variant="danger">새로 만들기(예전 주소 막기)</SubmitButton>
                    </form>
                  </div>
                  <p className="text-xs text-[var(--muted)]">만든 때 {cfg.tokenAt ? fmtTime(cfg.tokenAt) : "-"}. 이 주소가 곧 비밀번호입니다. 휴대폰 말고는 어디에도 붙여 두지 마세요.</p>
                </>
              ) : (
                <form action={feedAction}>
                  <input type="hidden" name="intent" value="token" />
                  <SubmitButton>문자 받는 주소 만들기</SubmitButton>
                </form>
              )}
              <p className="text-xs">
                이 주소를 넣는 방법:{" "}
                <Link href="/money/bank/guide#android" className="text-[var(--accent)]">
                  안드로이드
                </Link>{" "}
                ·{" "}
                <Link href="/money/bank/guide#iphone" className="text-[var(--accent)]">
                  아이폰
                </Link>
              </p>
            </div>
          ) : (
            <p className="text-sm text-[var(--muted)]">문자 받는 주소는 대표만 봅니다. {cfg.tokenHash ? "주소가 만들어져 있습니다." : "아직 주소가 없습니다."}</p>
          )}
        </Card>
      </div>

      <div id="failed" className="mt-4">
        <Card title="3. 받은 기록" help={{ kind: "panel", id: "bank.log" }}>
          <p className="text-sm">
            마지막으로 받은 문자: <b>{cfg.lastSmsAt ? fmtTime(cfg.lastSmsAt) : "아직 없음"}</b> · 지금까지 {cfg.smsCount ?? 0}통
          </p>
          {cfg.unknown.length > 0 && (
            <div className="mt-2">
              <p className="text-sm font-medium">등록 안 된 통장·카드 문자(내용은 버림)</p>
              <ul className="text-xs text-[var(--muted)]">
                {cfg.unknown.map((u) => (
                  <li key={u.at}>
                    {fmtTime(u.at)} · {u.hint}
                  </li>
                ))}
              </ul>
              <p className="text-xs">사업용이면 위에서 그 끝자리로 등록하세요. 개인 계좌면 그대로 두면 됩니다.</p>
            </div>
          )}
          {cfg.failed.length > 0 && (
            <div className="mt-2">
              <p className="text-sm font-medium text-[var(--danger)]">읽지 못한 문자</p>
              <ul className="space-y-1 text-xs">
                {cfg.failed.map((f) => (
                  <li key={f.at}>
                    {fmtTime(f.at)} · {f.reason} · <span className="text-[var(--muted)]">{f.text}</span>
                  </li>
                ))}
              </ul>
              <p className="text-xs">은행이 문자 모양을 바꿨을 수 있습니다. 그동안은 엑셀로 메우고, 관리자에게 이 문자 모양을 알려 주세요.</p>
            </div>
          )}
        </Card>
      </div>

      <div className="mt-4">
        <Card title="4. 문자 시험 읽기" help={{ kind: "panel", id: "bank.test" }}>
          <form action="/money/bank/settings" className="space-y-2">
            <TextAreaField help="bank.testSms" name="test" rows={4} defaultValue={q.test ?? ""} />
            <SubmitButton variant="secondary">읽어 보기(저장 안 함)</SubmitButton>
          </form>
          {test &&
            (test.ok ? (
              <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                <dt className="text-[var(--muted)]">종류</dt>
                <dd>{TX_KINDS[test.tx.kind]}</dd>
                <dt className="text-[var(--muted)]">회사·끝자리</dt>
                <dd>
                  {test.tx.company ? companyLabel(test.tx.company) : "모름"} {test.tx.digits ?? ""}
                </dd>
                <dt className="text-[var(--muted)]">날짜·시각</dt>
                <dd>
                  {test.tx.on} {test.tx.at ?? ""}
                </dd>
                <dt className="text-[var(--muted)]">금액</dt>
                <dd>{won(test.tx.amountWon)}</dd>
                <dt className="text-[var(--muted)]">잔액·누적</dt>
                <dd>{test.tx.balanceWon != null ? won(test.tx.balanceWon) : "-"}</dd>
                <dt className="text-[var(--muted)]">상대방</dt>
                <dd>{test.tx.party ?? "-"}</dd>
                <dt className="text-[var(--muted)]">어느 통장·카드</dt>
                <dd>
                  {(() => {
                    const card = test.tx.kind === "card" || test.tx.kind === "card_cancel";
                    const hit = cfg.accounts.filter((a) => (card ? a.kind === "card" : a.kind === "bank") && (a.company === test.tx.company || (card && a.company.replace("_card", "") === test.tx.company)));
                    return hit.length ? hit.map(accountLabel).join(", ") : "등록한 것과 안 맞음(이 문자는 버려짐)";
                  })()}
                </dd>
              </dl>
            ) : (
              <p className="mt-3 text-sm text-[var(--danger)]">읽지 못함: {test.reason}</p>
            ))}
        </Card>
      </div>
    </>
  );
}
