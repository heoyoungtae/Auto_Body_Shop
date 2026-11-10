import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/db/runtime";
import { can } from "@/modules/auth/permissions";
import { seoulDate } from "@/modules/platform/time";
import { getRun } from "@/modules/staff/payroll";
import { RUN_STATUS, type RunStatus } from "@/modules/staff/payroll-rules";
import { AssistForm } from "../../_assist";
import { DateField, SelectField, TextField } from "../../_input";
import { requireUser } from "../../_lib/session";
import { SubmitButton } from "../../_submit";
import { Badge, Card, ErrorBox, fmtTime, Notice, PageTitle } from "../../_ui";
import { payrollAction } from "../actions";
import { SlipLines } from "../_lines";

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
  const data = await getRun(await getDb(), user, ym);
  if (!data) notFound();
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
  return (
    <>
      <PageTitle
        help="payroll.run"
        sub={`${r.docNo} · ${slips.length}명 · 지급 총액 ${won(r.totalGross)} · 공제 ${won(r.totalDeduct)} · 실지급 ${won(r.totalNet)} · ${r.status === "paid" ? `${r.payDate} 지급` : `지급일 ${r.payDate}`}`}
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
                  <SlipLines d={d} />
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
                        help="pay.incomeTax"
                        name="incomeTax"
                        type="number"
                        inputMode="numeric"
                        min={0}
                        step={10}
                        defaultValue={String(d.incomeTax)}
                        from={
                          d.incomeTaxSource === "last"
                            ? "지난달 명세서"
                            : undefined
                        }
                      />
                      <TextField
                        help="pay.family"
                        name="family"
                        type="number"
                        inputMode="numeric"
                        min={1}
                        max={11}
                        defaultValue={String(d.family)}
                      />
                      <p className="text-xs text-[var(--muted)] md:col-span-2">
                        과세 급여 {won(d.insBase)} · 공제 대상 가족 {d.family}
                        명으로 국세청 근로소득 간이세액표(
                        <a
                          href="https://www.nts.go.kr"
                          target="_blank"
                          rel="noreferrer"
                          className="text-[var(--accent)]"
                        >
                          국세청 ↗
                        </a>
                        )에서 찾은 소득세를 넣습니다.
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
