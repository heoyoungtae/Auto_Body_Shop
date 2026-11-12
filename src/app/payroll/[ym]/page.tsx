import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/db/runtime";
import { can } from "@/modules/auth/permissions";
import { seoulDate } from "@/modules/platform/time";
import { BANKS, maskAccount } from "@/modules/purchase/rules";
import { loadPolicy } from "@/modules/platform/policy";
import { getRun, withholdingSummary } from "@/modules/staff/payroll";
import { RUN_STATUS, type RunStatus } from "@/modules/staff/payroll-rules";
import { AssistForm } from "../../_assist";
import { CheckGroup, DateField, SelectField, TextField } from "../../_input";
import { requireUser } from "../../_lib/session";
import { SubmitButton } from "../../_submit";
import { Badge, Card, ErrorBox, fmtTime, Notice, PageTitle } from "../../_ui";
import { payrollAction } from "../actions";
import { EmployerLines, SlipLines } from "../_lines";

const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;

/** 한 달 급여대장: 사람별 계산 내역·소득세 입력·승인·지급 */
export default async function PayrollRunPage({
  params,
  searchParams,
}: {
  params: Promise<{ ym: string }>;
  searchParams: Promise<{ notice?: string; error?: string }>;
}) {
  const { ym } = await params;
  const q = await searchParams;
  const user = await requireUser();
  if (!can(user, "payroll.view"))
    return (
      <p className="text-sm text-[var(--muted)]">
        급여대장은 대표·회계 담당만 봅니다.
      </p>
    );
  const db = await getDb();
  const data = await getRun(db, user, ym);
  if (!data) notFound();
  const pol = await loadPolicy(db, seoulDate());
  const { r, slips } = data;
  const prep = can(user, "payroll.prepare");
  const approve = can(user, "payroll.approve");
  const draft = r.status === "draft";
  const hidden = (intent: string) => (
    <>
      <input type="hidden" name="id" value={r.id} />
      <input type="hidden" name="ym" value={ym} />
      <input type="hidden" name="intent" value={intent} />
    </>
  );
  const warn = slips.reduce((n, x) => n + x.d.warnings.length, 0);
  const employerSum = slips.reduce((n, x) => n + (x.d.employerTotal ?? 0), 0);
  const wh = withholdingSummary(slips.map((x) => x.d));
  const [yy, mm] = ym.split("-").map(Number);
  const whDue = mm === 12 ? `${yy + 1}-01-10` : `${yy}-${String(mm + 1).padStart(2, "0")}-10`;
  // 두루누리: 10명 미만 사업장, 월 보수 기준 미만(새 가입자만 해당, 자격은 공단이 판단)
  const durunuri =
    slips.length < 10
      ? slips
          .filter((x) => x.d.insBase > 0 && x.d.insBase < pol["ins.durunuri_pay_cap"])
          .map((x) => x.d.name)
      : [];
  const noBank = slips.filter((x) => !x.d.bank?.account && x.d.net > 0).map((x) => x.d.name);
  return (
    <>
      <PageTitle
        help="payroll.run"
        sub={`${r.docNo} · ${slips.length}명 · 지급 총액 ${won(r.totalGross)} · 공제 ${won(r.totalDeduct)} · 실지급 ${won(r.totalNet)} · 회사 부담 ${won(employerSum)}(인건비 합계 ${won(r.totalGross + employerSum)}) · ${r.status === "paid" ? `${r.payDate} 지급` : `지급일 ${r.payDate}`}`}
        actions={
          <Link href="/payroll" className="text-sm text-[var(--accent)]">
            ← 급여대장
          </Link>
        }
      >
        {ym} 급여대장{" "}
        <Badge tone={r.status === "paid" ? "ok" : draft ? "neutral" : "warn"}>
          {RUN_STATUS[r.status as RunStatus]}
        </Badge>
      </PageTitle>
      <ErrorBox message={q.error} />
      {q.notice && <Notice>{q.notice}</Notice>}
      {r.returnReason && draft && (
        <Notice>대표가 돌려보냄: {r.returnReason}</Notice>
      )}

      <Card title="사람별 계산" help={{ kind: "panel", id: "pay.slips" }}>
        <ul className="divide-y divide-[var(--line)]">
          {slips.map(({ s, d }) => (
            <li key={s.id} className="py-2 text-sm">
              <details>
                <summary className="flex cursor-pointer flex-wrap items-center gap-2">
                  <span className="font-medium">{d.name}</span>
                  <span className="text-xs text-[var(--muted)]">
                    지급 {won(d.gross)} · 공제 {won(d.deductTotal)} · 실지급{" "}
                    <b>{won(d.net)}</b> · 통상시급 {won(d.hourly)}
                  </span>
                  {d.warnings.length > 0 && (
                    <Badge tone="warn">확인 {d.warnings.length}</Badge>
                  )}
                  {s.viewedAt && (
                    <span className="text-xs text-[var(--muted)]">
                      · {fmtTime(s.viewedAt)} 본인 열람
                    </span>
                  )}
                </summary>
                <div className="mt-2 grid gap-3">
                  {d.warnings.map((w) => (
                    <p
                      key={w}
                      className="rounded-md bg-[var(--warn-soft,#fff7e6)] px-2 py-1 text-xs"
                    >
                      {w}
                    </p>
                  ))}
                  {d.bank?.account && (
                    <p className="text-xs text-[var(--muted)]">
                      급여 계좌: {d.bank.name} {maskAccount(d.bank.account)}{" "}
                      {d.bank.holder}
                    </p>
                  )}
                  <SlipLines d={d} />
                  <EmployerLines d={d} />
                  <Link
                    href={`/payroll/slip/${s.id}`}
                    className="text-xs text-[var(--accent)]"
                  >
                    임금명세서 보기·인쇄
                  </Link>
                  {draft && prep && (
                    <AssistForm
                      id={`slip-${s.id}`}
                      action={payrollAction}
                      className="grid gap-3 rounded-md border border-[var(--line)] p-3 md:grid-cols-2"
                    >
                      {hidden("slip")}
                      <input type="hidden" name="slipId" value={s.id} />
                      <input type="hidden" name="who" value={d.name} />
                      <TextField
                        help="pay.family"
                        name="family"
                        type="number"
                        inputMode="numeric"
                        min={1}
                        max={11}
                        defaultValue={String(d.family)}
                      />
                      <TextField
                        help="pay.children"
                        name="children"
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={10}
                        defaultValue={String(d.children ?? 0)}
                      />
                      <SelectField
                        help="pay.withholdRate"
                        name="withholdRate"
                        defaultValue={String(d.withholdRate ?? 100)}
                        options={[
                          { value: "100", label: "100%(기본)" },
                          { value: "80", label: "80%" },
                          { value: "120", label: "120%" },
                        ]}
                      />
                      <TextField
                        help="pay.incomeTax"
                        name="incomeTax"
                        type="number"
                        inputMode="numeric"
                        min={0}
                        step={10}
                        placeholder="비우면 자동 계산"
                        defaultValue={
                          d.incomeTaxSource === "manual" ||
                          d.incomeTaxSource === "last"
                            ? String(d.incomeTax)
                            : ""
                        }
                        from={
                          d.incomeTaxSource === "last"
                            ? "지난달 직접 넣은 값"
                            : undefined
                        }
                      />
                      <CheckGroup
                        help="pay.production"
                        name="production"
                        options={[
                          { value: "1", label: "생산직(연장수당 비과세 대상)" },
                        ]}
                        defaultChecked={d.production ? ["1"] : []}
                      />
                      <TextField
                        help="pay.bank"
                        name="payBank"
                        defaultValue={d.bank?.name ?? ""}
                        suggestions={BANKS.map((b) => ({ value: b }))}
                      />
                      <TextField
                        help="pay.account"
                        name="payAccount"
                        inputMode="numeric"
                        placeholder={
                          d.bank?.account
                            ? `${maskAccount(d.bank.account)} (바꿀 때만)`
                            : "숫자만"
                        }
                      />
                      <TextField
                        help="pay.holder"
                        name="payHolder"
                        defaultValue={d.bank?.holder ?? ""}
                        placeholder={d.name}
                      />
                      <p className="text-xs text-[var(--muted)] md:col-span-2">
                        소득세는 과세 급여 {won(d.insBase)}, 공제 대상 가족{" "}
                        {d.family}명
                        {d.children ? `, 8~20세 자녀 ${d.children}명` : ""}
                        으로 근로소득 간이세액표 방식에 따라 앱이 계산합니다
                        {d.incomeTaxSource === "auto"
                          ? `(${won(d.incomeTax)})`
                          : ""}
                        . 가족 수·자녀 수·비율은 다음 달로 이어집니다.
                        국세청 표와 다르게 떼야 할 사정이 있을 때만 소득세 칸에
                        직접 넣으세요.
                      </p>
                      {[0, 1, 2].map((i) => {
                        if (i > 0 && !d.extras[i] && !d.extras[i - 1])
                          return null;
                        const e = d.extras[i];
                        return (
                          <div
                            key={i}
                            className="grid gap-2 md:col-span-2 md:grid-cols-4"
                          >
                            <SelectField
                              help="pay.extraKind"
                              name={`extraKind${i}`}
                              defaultValue={e?.kind ?? "pay"}
                              options={[
                                { value: "pay", label: "기타 지급" },
                                { value: "deduct", label: "기타 공제" },
                              ]}
                            />
                            <TextField
                              help="pay.extraName"
                              name={`extraName${i}`}
                              defaultValue={e?.name ?? ""}
                              suggestions={[
                                "성과급",
                                "포상금",
                                "지난달 정산",
                                "가불 공제",
                              ].map((v) => ({ value: v }))}
                            />
                            <TextField
                              help="pay.extraAmount"
                              name={`extraAmount${i}`}
                              type="number"
                              inputMode="numeric"
                              min={0}
                              defaultValue={e ? String(e.amount) : ""}
                            />
                            <TextField
                              help="pay.extraReason"
                              name={`extraReason${i}`}
                              defaultValue={e?.reason ?? ""}
                            />
                          </div>
                        );
                      })}
                      {d.extras.length < 3 && (
                        <p className="text-xs text-[var(--muted)] md:col-span-2">
                          기타 항목을 하나 넣고 저장하면 다음 줄이 생깁니다.
                        </p>
                      )}
                      <div className="md:col-span-2">
                        <SubmitButton variant="secondary">
                          {d.name} 저장
                        </SubmitButton>
                      </div>
                    </AssistForm>
                  )}
                </div>
              </details>
            </li>
          ))}
        </ul>
      </Card>

      <Card title="원천세 신고 자료" help={{ kind: "panel", id: "pay.withholding" }}>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm md:grid-cols-3">
          {(
            [
              ["인원", `${wh.count}명`],
              ["총지급액", won(wh.gross)],
              ["그중 비과세", won(wh.taxfree)],
              ["소득세", won(wh.incomeTax)],
              ["지방소득세", won(wh.localTax)],
              ["신고·납부 기한", `${whDue}(반기별 납부면 7월·1월 10일)`],
            ] as const
          ).map(([k, v]) => (
            <div key={k}>
              <dt className="text-xs text-[var(--muted)]">{k}</dt>
              <dd className="tabular-nums">{v}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-2 text-xs text-[var(--muted)]">
          홈택스 원천징수이행상황신고서의 &lsquo;근로소득 간이세액(A01)&rsquo;
          줄에 넣는 값입니다. 지방소득세는 위택스에 따로 냅니다. 비과세 중 식대
          등 일부는 신고서 총지급액에서 빠지므로 세무 대리인과 한 번 맞춰 보세요
          [확인 필요].
        </p>
        {durunuri.length > 0 && (
          <p className="mt-2 rounded-md bg-[var(--warn-soft,#fff7e6)] px-2 py-1 text-xs">
            두루누리 지원 대상일 수 있습니다: {durunuri.join(", ")}(월 보수{" "}
            {won(pol["ins.durunuri_pay_cap"])} 미만, 직원 10명 미만). 새로
            가입한 사람이면 국민연금·고용보험료 80%를 36개월 돌려받습니다.
            4대사회보험 정보연계센터에서 신청하세요.
          </p>
        )}
      </Card>

      {prep && (r.status === "approved" || r.status === "paid") && (
        <Card title="급여 이체 파일" help={{ kind: "panel", id: "pay.transfer" }}>
          <a
            href={`/payroll/${ym}/transfer`}
            className="text-sm text-[var(--accent)]"
          >
            이체 파일(CSV) 받기
          </a>
          {noBank.length > 0 && (
            <p className="mt-2 text-xs text-[var(--muted)]">
              급여 계좌가 없어 빠지는 사람: {noBank.join(", ")}. 계산 중일 때
              명세서에서 계좌를 넣으면 다음 달부터 이어집니다.
            </p>
          )}
        </Card>
      )}

      {draft && prep && (
        <Card title="마무리" help={{ kind: "panel", id: "pay.submit" }}>
          <div className="flex flex-wrap gap-2">
            <AssistForm
              id={`py-recalc-${r.id}`}
              action={payrollAction}
              guard={false}
            >
              {hidden("recalc")}
              <SubmitButton variant="secondary">
                다시 계산(근태·계약서 반영)
              </SubmitButton>
            </AssistForm>
            <AssistForm
              id={`py-submit-${r.id}`}
              action={payrollAction}
              guard={false}
            >
              {hidden("submit")}
              <SubmitButton>
                대표에게 승인 요청{warn ? `(확인 ${warn}건 남음)` : ""}
              </SubmitButton>
            </AssistForm>
          </div>
        </Card>
      )}

      {approve && (r.status === "submitted" || r.status === "approved") && (
        <Card title="승인" help={{ kind: "panel", id: "pay.approve" }}>
          {r.status === "submitted" && (
            <AssistForm
              id={`py-approve-${r.id}`}
              action={payrollAction}
              guard={false}
              className="mb-3"
            >
              {hidden("approve")}
              <SubmitButton>{won(r.totalNet)} 지급 승인</SubmitButton>
            </AssistForm>
          )}
          <AssistForm
            id={`py-return-${r.id}`}
            action={payrollAction}
            className="grid gap-2"
          >
            {hidden("return")}
            <TextField help="pay.returnReason" name="returnReason" required />
            <div>
              <SubmitButton variant="danger">돌려보내기</SubmitButton>
            </div>
          </AssistForm>
        </Card>
      )}

      {prep && r.status === "approved" && (
        <Card title="지급 기록" help={{ kind: "panel", id: "pay.paid" }}>
          <AssistForm
            id={`py-paid-${r.id}`}
            action={payrollAction}
            className="grid gap-3 md:grid-cols-2"
          >
            {hidden("paid")}
            <DateField
              help="pay.paidOn"
              name="paidOn"
              required
              defaultValue={r.payDate <= seoulDate() ? r.payDate : seoulDate()}
              quick={["today"]}
            />
            <div className="md:col-span-2">
              <SubmitButton>지급했습니다(명세서 보내기)</SubmitButton>
            </div>
          </AssistForm>
        </Card>
      )}
    </>
  );
}
