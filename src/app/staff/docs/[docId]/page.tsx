import Link from "next/link";
import { getDb } from "@/db/runtime";
import { can } from "@/modules/auth/permissions";
import { seoulDate } from "@/modules/platform/time";
import { CONTRACT_TYPES, DOC_KINDS, DOC_STATUS, fmtDays, INSURANCES, LEAVE_CHECKS, LEAVE_PLEDGE_TEXT, PAY_METHODS, PAY_TYPES, PLEDGE_JOIN_ITEMS, RULES_ACK_TEXT, WEEKDAYS, type ContractTerms, type DocKind, type PledgeTerms } from "@/modules/staff/contract-rules";
import { canWriteDocs, DELIVER_HOW, getDocument, type Party } from "@/modules/staff/documents";
import { AssistForm } from "../../../_assist";
import { CheckGroup, SelectField, TextAreaField, TextField } from "../../../_input";
import { SubmitButton } from "../../../_submit";
import { requireUser, userMessage } from "../../../_lib/session";
import { Badge, buttonClass, Card, ErrorBox, Notice, PageTitle } from "../../../_ui";
import { SignMark } from "../../../repairs/sign-mark";
import { SignaturePad } from "../../../repairs/signature-pad";
import { PrintButton } from "../../../repairs/[id]/estimate/[eid]/print/print-button";
import { docAction } from "../actions";

const ko = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return `${y}년 ${Number(m)}월 ${Number(d)}일`;
};
const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;
const box = (on: boolean) => (on ? "■" : "□");

/** 근로계약서·서약서 한 건: 내용 확인 → (대표 확인) → 서명 → 교부, 인쇄 */
export default async function StaffDocPage({ params, searchParams }: { params: Promise<{ docId: string }>; searchParams: Promise<{ error?: string; notice?: string }> }) {
  const { docId } = await params;
  const { error, notice } = await searchParams;
  const user = await requireUser();
  const db = await getDb();
  let v;
  try {
    v = await getDocument(db, user, docId);
  } catch (e) {
    return (
      <>
        <PageTitle help="staff.doc">직원 서류</PageTitle>
        <ErrorBox message={userMessage(e)} />
      </>
    );
  }
  const { d, party, shop, check } = v;
  const kind = d.kind as DocKind;
  const staff = canWriteDocs(user);
  const self = user.id === d.userId;
  const date = d.signedAt ? seoulDate(d.signedAt) : seoulDate();
  const tone = d.status === "signed" ? "ok" : d.status === "cancelled" ? "danger" : "warn";
  return (
    <div>
      <div className="no-print space-y-3">
        <PageTitle
          help="staff.doc"
          sub={
            <>
              {d.docNo} · {DOC_KINDS[kind].form} · <Badge tone={tone}>{DOC_STATUS[d.status as keyof typeof DOC_STATUS]}</Badge>
              {d.signedAt && ` · 서명 ${seoulDate(d.signedAt)}(${d.signedVia === "self" ? "본인 로그인" : "대면"})`}
              {d.deliveredAt && ` · 교부 ${seoulDate(d.deliveredAt)} ${DELIVER_HOW[d.deliveredHow as keyof typeof DELIVER_HOW] ?? ""}`}
            </>
          }
          actions={
            <>
              <Link href={staff ? `/staff/${d.userId}` : "/staff/docs"} className={buttonClass("secondary")}>
                {staff ? `${party.name} 명부` : "내 서류"}
              </Link>
              {d.status === "signed" && <PrintButton />}
            </>
          }
        >
          {party.name} {DOC_KINDS[kind].label}
        </PageTitle>
        <ErrorBox message={error} />
        {notice && <Notice>{notice}</Notice>}
        {d.status === "cancelled" && <p className="rounded-md border border-[var(--line)] px-3 py-2 text-sm">취소한 서류입니다. 사유: {d.cancelReason}</p>}
        {check && d.status !== "signed" && d.status !== "cancelled" && (check.errors.length > 0 || check.warnings.length > 0) && (
          <div className="rounded-md border border-[var(--warn)] bg-[var(--warn-soft)] px-3 py-2 text-sm">
            {check.errors.map((e) => (
              <p key={e}>
                <b>법 기준에 맞지 않음:</b> {e} (최저임금·정책값이 바뀌었을 수 있습니다. &lsquo;고치기&rsquo;로 다시 저장하세요)
              </p>
            ))}
            {check.warnings.map((w) => (
              <p key={w}>주의: {w}</p>
            ))}
          </div>
        )}

        <div className="grid gap-4 xl:grid-cols-2">
          {d.status === "draft" && (
            <Card title="대표 확인" help={{ kind: "panel", id: "sdoc.approve" }}>
              {can(user, "contract.approve") ? (
                <form action={docAction} className="flex flex-wrap items-center gap-2">
                  <input type="hidden" name="docId" value={d.id} />
                  <p className="flex-1 text-sm">아래 내용을 보고 맞으면 확인하세요. 확인하면 직인이 들어가고 직원에게 서명 요청이 갑니다.</p>
                  <SubmitButton name="intent" value="approve">
                    내용 확인
                  </SubmitButton>
                </form>
              ) : (
                <p className="text-sm text-[var(--muted)]">대표 확인을 기다립니다(대표에게 알림을 보냈습니다).</p>
              )}
            </Card>
          )}
          {d.status === "ready" && (self || staff) && (
            <Card title={self ? "서명" : "대면 서명 받기"} help={{ kind: "panel", id: "sdoc.sign" }}>
              {kind === "pledge_leave" && staff && (
                <form action={docAction} className="mb-4 space-y-2 border-b border-[var(--line)] pb-4">
                  <input type="hidden" name="docId" value={d.id} />
                  <CheckGroup help="pl.checks" name="checks" options={Object.entries(LEAVE_CHECKS).map(([value, label]) => ({ value, label }))} defaultChecked={(d.terms as PledgeTerms).checks ?? []} />
                  <TextAreaField help="pl.note" name="note" defaultValue={(d.terms as PledgeTerms).note ?? ""} rows={2} />
                  <SubmitButton name="intent" value="checks" variant="secondary">
                    확인 항목 저장
                  </SubmitButton>
                </form>
              )}
              {kind === "contract" && (!party.phone || !party.address) && (
                <p className="mb-2 rounded-md border border-[var(--warn)] bg-[var(--warn-soft)] px-3 py-2 text-sm">
                  근로자 명부에 {[!party.phone && "휴대폰", !party.address && "주소"].filter(Boolean).join("·")}이(가) 없습니다. 계약서 근로자 칸에 들어가므로{" "}
                  {staff ? (
                    <Link href={`/staff/${d.userId}`} className="font-semibold text-[var(--accent)]">
                      명부에서 먼저 채우세요
                    </Link>
                  ) : (
                    "회계 담당에게 명부를 채워 달라고 하세요"
                  )}
                  .
                </p>
              )}
              <form action={docAction} className="space-y-2">
                <input type="hidden" name="docId" value={d.id} />
                <p className="text-sm">{self ? "아래 내용을 끝까지 읽고 서명하세요. 서명하면 내용이 고정되고 고칠 수 없습니다." : `${party.name} 님이 이 화면 앞에서 내용을 읽은 뒤 직접 서명합니다.`}</p>
                <SignaturePad hint={`이 칸에 ${party.name} 님이 서명합니다`} />
                <SubmitButton name="intent" value="sign">
                  서명하고 고정
                </SubmitButton>
              </form>
            </Card>
          )}
          {d.status === "signed" && kind === "contract" && !d.deliveredAt && (self || staff) && (
            <Card title="교부" help={{ kind: "panel", id: "sdoc.deliver" }}>
              <form action={docAction} className="space-y-2">
                <input type="hidden" name="docId" value={d.id} />
                {self ? (
                  <p className="text-sm">계약서를 받았으면 &lsquo;받았습니다&rsquo;를 누르세요. 이 화면에서 언제든 다시 보고 인쇄할 수 있습니다.</p>
                ) : (
                  <SelectField help="doc.deliverHow" name="how" required defaultValue="print" options={Object.entries(DELIVER_HOW).filter(([k]) => k !== "app").map(([value, label]) => ({ value, label }))} />
                )}
                <SubmitButton name="intent" value="deliver">
                  {self ? "받았습니다" : "교부 기록"}
                </SubmitButton>
              </form>
            </Card>
          )}
          {staff && (d.status === "draft" || d.status === "ready") && (
            <Card title="고치기·취소" help={{ kind: "panel", id: "sdoc.cancel" }}>
              {kind === "contract" && (
                <Link href={`/staff/${d.userId}/docs/new?kind=contract&edit=${d.id}`} className={`${buttonClass("secondary")} mb-3`}>
                  계약 내용 고치기
                </Link>
              )}
              <AssistForm id={`cancel-${d.id}`} action={docAction} className="flex flex-wrap items-end gap-2">
                <input type="hidden" name="docId" value={d.id} />
                <div className="flex-1">
                  <TextField help="doc.cancelReason" name="reason" required />
                </div>
                <SubmitButton name="intent" value="cancel" variant="danger">
                  취소
                </SubmitButton>
              </AssistForm>
            </Card>
          )}
        </div>
      </div>

      <article className="mx-auto mt-6 max-w-[190mm] bg-white p-6 text-[13px] leading-relaxed text-black print:mt-0 print:max-w-none print:p-0">
        <p className="text-[11px]">
          {d.docNo} · {DOC_KINDS[kind].form}
        </p>
        {kind === "contract" ? <ContractBody t={d.terms as ContractTerms} party={party} shop={shop} date={date} signPath={d.signPath} seal={d.status === "signed" ? shop.sealPath : null} /> : <PledgeBody kind={kind} t={d.terms as PledgeTerms} party={party} shop={shop} date={date} signPath={d.signPath} />}
      </article>
    </div>
  );
}

function Parties({ party, shop, signPath, seal, date }: { party: Party; shop: Record<string, string>; signPath: string | null; seal: string | null | undefined; date: string }) {
  return (
    <>
      <p className="my-6 text-center text-base">{ko(date)}</p>
      <div className="grid gap-4 sm:grid-cols-2 print:grid-cols-2">
        <div className="space-y-1">
          <p className="font-semibold">(사업주)</p>
          <p>사업체명: {shop.name} (전화: {shop.phone})</p>
          <p>주소: {shop.address}</p>
          <p>
            대표자: {shop.ceo} <SignMark path={seal} kind="seal" />
          </p>
        </div>
        <div className="space-y-1">
          <p className="font-semibold">(근로자)</p>
          <p>주소: {party.address}</p>
          <p>연락처: {party.phone}</p>
          <p>
            성명: {party.name} <SignMark path={signPath} />
          </p>
        </div>
      </div>
    </>
  );
}

function ContractBody({ t, party, shop, date, signPath, seal }: { t: ContractTerms; party: Party; shop: Record<string, string>; date: string; signPath: string | null; seal: string | null | undefined }) {
  const title = t.contractType === "regular" ? "표준근로계약서" : t.contractType === "fixed" ? "표준근로계약서(기간의 정함이 있는 경우)" : "단시간근로자 표준근로계약서";
  const allow = t.allowances.filter((a) => a.name);
  const li = "mt-2";
  return (
    <>
      <h1 className="my-6 text-center text-2xl font-bold tracking-[0.3em]">{title}</h1>
      <p>
        {shop.name || "(사업주)"}(이하 &ldquo;사업주&rdquo;라 함)과(와) {party.name}(이하 &ldquo;근로자&rdquo;라 함)은 다음과 같이 근로계약을 체결한다.
      </p>
      <ol className="mt-3">
        <li className={li}>
          1. 근로계약기간: {ko(t.startOn)}부터 {t.endOn ? `${ko(t.endOn)}까지` : "(기간의 정함 없음)"} <span className="text-[11px]">[{CONTRACT_TYPES[t.contractType]}]</span>
        </li>
        <li className={li}>2. 근무 장소: {t.place}</li>
        <li className={li}>3. 업무의 내용: {t.duties}</li>
        <li className={li}>
          4. 소정근로시간: {t.workStart}부터 {t.workEnd}까지 (휴게시간: {t.breakStart ? `${t.breakStart} ~ ${t.breakEnd}` : "없음"})
        </li>
        <li className={li}>
          5. 근무일/휴일: 매주 {fmtDays(t.workDays)} 근무, 주휴일 매주 {WEEKDAYS[t.holiday]}요일
        </li>
        <li className={li}>
          6. 임금
          <div className="ml-4">
            <p>
              - {PAY_TYPES[t.payType]}: {won(t.basePay)}
            </p>
            <p>
              - 상여금: {box(!!t.bonus)} 있음 {t.bonus && `(${t.bonus})`} {box(!t.bonus)} 없음
            </p>
            <p>
              - 기타 급여(제수당 등): {box(allow.length > 0)} 있음 {box(!allow.length)} 없음 {allow.map((a) => `${a.name} ${won(a.amount)}`).join(", ")}
            </p>
            <p>- 임금 지급일: 매월 {t.payDay}일(휴일의 경우는 전일 지급)</p>
            <p>
              - 지급 방법: {box(t.payMethod === "direct")} {PAY_METHODS.direct} {box(t.payMethod === "account")} {PAY_METHODS.account}
            </p>
            {t.contractType === "part" && <p>- 소정근로시간을 초과하여 근로하면 초과근로에 대하여 통상임금의 100분의 50 이상을 가산하여 지급함(기간제법 제6조)</p>}
          </div>
        </li>
        <li className={li}>7. 연차유급휴가: {t.annualText ?? "근로기준법에서 정하는 바에 따라 부여함"}</li>
        <li className={li}>
          8. 사회보험 적용 여부:{" "}
          {Object.entries(INSURANCES)
            .map(([k, l]) => `${box(t.insurances.includes(k))} ${l}`)
            .join("  ")}
        </li>
        <li className={li}>9. 근로계약서 교부: 사업주는 근로계약을 체결함과 동시에 본 계약서를 사본하여 근로자의 교부 요구와 관계없이 근로자에게 교부함(근로기준법 제17조 이행)</li>
        <li className={li}>10. 근로계약, 취업규칙 등의 성실한 이행 의무: 사업주와 근로자는 각자가 근로계약, 취업규칙, 단체협약을 지키고 성실하게 이행하여야 함</li>
        <li className={li}>11. 정보 보호: 근로자는 별도의 정보보호·비밀유지 서약서(F-13-02)에 따라 업무상 알게 된 개인정보와 회사 비밀을 지킴</li>
        <li className={li}>12. 기타: {t.extra ? `${t.extra}. ` : ""}이 계약에 정함이 없는 사항은 근로기준법령에 의함</li>
      </ol>
      <Parties party={party} shop={shop} signPath={signPath} seal={seal} date={date} />
    </>
  );
}

function PledgeBody({ kind, t, party, shop, date, signPath }: { kind: DocKind; t: PledgeTerms; party: Party; shop: Record<string, string>; date: string; signPath: string | null }) {
  return (
    <>
      <h1 className="my-6 text-center text-2xl font-bold tracking-[0.2em]">{DOC_KINDS[kind].label}</h1>
      {kind === "rules_ack" ? (
        <>
          <p>{RULES_ACK_TEXT}</p>
          <p className="mt-2">
            확인한 취업규칙: {shop.name || "회사"} 취업규칙({t.version}) —{" "}
            <Link href="/rules" className="text-[var(--accent)] print:text-black">
              앱 › 취업규칙
            </Link>
          </p>
        </>
      ) : kind === "pledge_join" ? (
        <>
          <p>본인은 {shop.name || "회사"}에서 일하는 동안과 퇴직한 뒤에 다음 사항을 지킬 것을 서약합니다.</p>
          <ol className="mt-3 list-decimal space-y-2 pl-5">
            {PLEDGE_JOIN_ITEMS.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ol>
        </>
      ) : (
        <>
          <p>본인은 {t.leftOn ? ko(t.leftOn) : ""} 퇴직하면서 다음 사항을 확인합니다.</p>
          <ul className="mt-3 space-y-2">
            {Object.entries(LEAVE_CHECKS).map(([k, l]) => (
              <li key={k}>
                {box(!!t.checks?.includes(k))} {l}
              </li>
            ))}
          </ul>
          {t.note && <p className="mt-2">비고: {t.note}</p>}
          <p className="mt-4">{LEAVE_PLEDGE_TEXT}</p>
        </>
      )}
      <p className="mt-2 text-[11px]">근거: 사내 표준서 {t.version} · 개인정보 보호법 제28조 · 부정경쟁방지 및 영업비밀보호에 관한 법률</p>
      <p className="my-6 text-center text-base">{ko(date)}</p>
      <div className="space-y-1 text-right text-base">
        <p>
          서약자 성명: {party.name} <SignMark path={signPath} />
        </p>
        {party.birth && <p>생년월일: {ko(party.birth)}</p>}
      </div>
      <p className="mt-8 text-lg font-semibold">{shop.name} 대표 귀하</p>
    </>
  );
}
