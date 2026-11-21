import Link from "next/link";
import { getDb } from "@/db/runtime";
import { ACCOUNT_LABEL, domainView, type AccountKind } from "@/modules/platform/domain";
import { certDays, serverOpsView } from "@/modules/platform/server-ops";
import { requireUser } from "../../_lib/session";
import { DateField, CheckGroup, PasswordField, TextAreaField, TextField } from "../../_input";
import { SubmitButton } from "../../_submit";
import { Badge, buttonClass, Card, ErrorBox, Notice, PageTitle, fmtTime } from "../../_ui";
import { saveAccountAction, setExpiryAction, submitTokenAction } from "./actions";
import { Reveal } from "./_reveal";

/** 설정 › 도메인(대표 요청 2026-11-21): 앱 주소·등록 업체·클라우드플레어·토큰·인증서·주소 자동 고치기를 한곳에서 */
export default async function DomainPage({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string }> }) {
  await requireUser(["owner"]);
  const { error, notice } = await searchParams;
  const db = await getDb();
  const v = await domainView(db);
  const ops = await serverOpsView(db);
  const st = ops.status;
  const cd = certDays(st);
  const direct = st?.mode === "direct";
  const rows: [string, React.ReactNode][] = [
    ["앱 주소", st?.siteHost || "-"],
    ["본 도메인", v.info.apex || "-"],
    [
      "만료일",
      v.expiry ? (
        <>
          {v.expiry} ({v.expiryDays != null && v.expiryDays < 0 ? <b className="text-[var(--danger)]">만료됨</b> : `${v.expiryDays}일 남음`}){" "}
          <span className="text-xs text-[var(--muted)]">{v.info.expiry ? "공개 등록 정보에서 읽음" : "직접 적은 날"}</span>
        </>
      ) : (
        "모름(아래 '만료일 직접 적기')"
      ),
    ],
    ["자동 연장", v.accounts.registrar ? (v.accounts.registrar.autoRenew ? "켜짐(결제 수단 확인)" : "꺼짐: 만료 전에 직접 연장") : "-"],
    ["네임서버", v.info.ns.length ? <>{v.info.ns.join(", ")} {v.nsCloudflare ? <Badge tone="ok">클라우드플레어</Badge> : <Badge tone="warn">클라우드플레어 아님</Badge>}</> : "-"],
    ["접속 방식", direct ? "국내 직접 접속(집 공유기 443번 → 미니 PC)" : st ? "클라우드플레어 터널" : "-"],
    ["DNS 기록", v.info.record ? `${v.info.record.type} → ${v.info.record.content}${v.info.record.proxied ? " (클라우드플레어 경유)" : ""}` : "-"],
    ["서버 인터넷 주소", st?.publicIp ? `${st.publicIp}${st.dnsIp ? (st.dnsIp === st.publicIp ? " · 앱 주소와 맞음" : ` · 앱 주소는 ${st.dnsIp}(다름)`) : ""}` : "-"],
    ["인증서", cd != null ? `${st!.certUntil.slice(0, 10)}까지(${cd}일 남음, 30일 남으면 저절로 갱신)` : direct ? "-" : "클라우드플레어가 관리"],
    ["주소 자동 고치기", ops.ddns[0] ? `${ops.ddns[0].at} ${ops.ddns[0].kind === "changed" ? "바뀜·고침" : "실패"}: ${ops.ddns[0].message}` : direct ? "바뀐 적 없음(5분마다 확인)" : "-"],
    ["마지막 확인", v.info.checkedAt ? `${fmtTime(v.info.checkedAt)}(하루 한 번)` : "서버가 아직 확인하지 않았습니다"],
  ];
  const tok = v.info.token;
  return (
    <>
      <PageTitle
        help="settings.domain"
        sub="앱 주소(도메인)의 만료일, 등록 업체·클라우드플레어 계정, API 토큰, 인증서, 주소 자동 고치기를 한곳에서 봅니다."
        actions={
          <Link href="/settings/server" className={buttonClass("secondary")}>
            설정 › 서버
          </Link>
        }
      >
        도메인
      </PageTitle>
      <div className="mb-4 space-y-2">
        <ErrorBox message={error} />
        {notice && <Notice>{notice}</Notice>}
      </div>
      <div className="grid gap-4 xl:grid-cols-2 xl:items-start">
        <Card title="도메인 정보" help={{ kind: "panel", id: "domain.info" }}>
          <dl className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
            {rows.map(([k, val]) => (
              <div key={k} className="contents">
                <dt className="text-[var(--muted)]">{k}</dt>
                <dd className="break-words">{val}</dd>
              </div>
            ))}
          </dl>
          <details className="mt-3 border-t border-[var(--line)] pt-3 text-sm">
            <summary className="cursor-pointer">만료일 직접 적기</summary>
            <form action={setExpiryAction} className="mt-2 space-y-2">
              <DateField help="domain.expiry" name="expiry" defaultValue={v.info.expiryManual} quick={[]} />
              <SubmitButton>저장</SubmitButton>
            </form>
          </details>
        </Card>
        <Card title="클라우드플레어 API 토큰" help={{ kind: "panel", id: "domain.token" }}>
          <div className="space-y-3 text-sm">
            <p>
              {tok ? (
                <>
                  끝 <b className="font-mono">…{tok.last4}</b> · {tok.ok ? <Badge tone="ok">맞음</Badge> : <Badge tone="danger">맞지 않음({tok.status})</Badge>}
                  {tok.expiresOn && <> · {tok.expiresOn.slice(0, 10)}까지</>} · {fmtTime(tok.checkedAt)} 확인
                </>
              ) : (
                "서버에 토큰이 없거나 아직 확인하지 않았습니다."
              )}
            </p>
            <p className="text-xs text-[var(--muted)]">토큰은 미니 PC 의 설정 파일(.env, 관리자만 읽기)에만 있습니다. 앱에는 끝 4자리만 보입니다.</p>
            {v.tokenPending && <Notice>새 토큰(끝 …{v.tokenPending.last4})을 서버가 가져가기를 기다리는 중입니다({fmtTime(v.tokenPending.at)} 넣음).</Notice>}
            {v.tokenResult && (
              <p>
                마지막 바꾸기 {fmtTime(v.tokenResult.at)}: {v.tokenResult.ok ? <Badge tone="ok">저장됨</Badge> : <Badge tone="danger">실패</Badge>} {v.tokenResult.message}
              </p>
            )}
            <details className="border-t border-[var(--line)] pt-3">
              <summary className="cursor-pointer">새 토큰으로 바꾸기</summary>
              <form action={submitTokenAction} className="mt-2 space-y-2">
                <PasswordField help="domain.token" name="token" required autoComplete="off" />
                <SubmitButton>서버로 보내기</SubmitButton>
              </form>
            </details>
          </div>
        </Card>
      </div>
      <div className="mt-4 grid gap-4 xl:grid-cols-2 xl:items-start">
        {(["registrar", "cloudflare"] as AccountKind[]).map((k) => {
          const a = v.accounts[k];
          return (
            <Card key={k} title={`${ACCOUNT_LABEL[k]} 계정`} help={{ kind: "panel", id: "domain.account" }}>
              <div className="space-y-3 text-sm">
                {a ? (
                  <p>
                    {a.company && <b>{a.company}</b>} {a.loginId && <>· 아이디 <span className="font-mono">{a.loginId}</span></>} {a.email && <>· {a.email}</>} · 2단계 인증{" "}
                    {a.twoFactor ? <Badge tone="ok">켜짐</Badge> : <Badge tone="warn">꺼짐: 켜 두세요</Badge>}
                    {a.pwChangedOn && <> · 비밀번호 바꾼 날 {a.pwChangedOn}</>}
                    {a.recovery && <span className="block text-xs text-[var(--muted)]">복구 코드: {a.recovery}</span>}
                    {a.memo && <span className="block whitespace-pre-wrap text-xs text-[var(--muted)]">{a.memo}</span>}
                  </p>
                ) : (
                  <p className="text-[var(--muted)]">아직 적지 않았습니다.</p>
                )}
                {a?.hasPassword && (
                  <div className="border-t border-[var(--line)] pt-3">
                    <Reveal kind={k} />
                  </div>
                )}
                <details className="border-t border-[var(--line)] pt-3">
                  <summary className="cursor-pointer">{a ? "고치기" : "적기"}</summary>
                  <form action={saveAccountAction} className="mt-2 space-y-2">
                    <input type="hidden" name="kind" value={k} />
                    {k === "registrar" && <TextField help="domain.company" name="company" defaultValue={a?.company ?? ""} />}
                    <TextField help="domain.loginId" name="loginId" defaultValue={a?.loginId ?? ""} />
                    <TextField help="domain.email" name="email" type="email" defaultValue={a?.email ?? ""} />
                    <PasswordField help="domain.password" name="password" autoComplete="new-password" />
                    <DateField help="domain.pwChangedOn" name="pwChangedOn" defaultValue={a?.pwChangedOn ?? ""} quick={["today"]} />
                    <CheckGroup
                      help="domain.flags"
                      name="flags"
                      options={[{ value: "twoFactor", label: "2단계 인증 켜 둠" }, ...(k === "registrar" ? [{ value: "autoRenew", label: "자동 연장 켜 둠" }] : [])]}
                      defaultChecked={[...(a?.twoFactor ? ["twoFactor"] : []), ...(a?.autoRenew ? ["autoRenew"] : [])]}
                    />
                    <TextField help="domain.recovery" name="recovery" defaultValue={a?.recovery ?? ""} />
                    <TextAreaField help="domain.memo" name="memo" defaultValue={a?.memo ?? ""} rows={2} />
                    <SubmitButton>저장</SubmitButton>
                  </form>
                </details>
              </div>
            </Card>
          );
        })}
      </div>
    </>
  );
}
